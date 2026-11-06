# Deploying the demo on one EC2 instance

> **Running locally instead?** Use [docs/LOCAL.md](../docs/LOCAL.md). `scripts/dev-up.sh` (or `.\scripts\dev-up.ps1`) runs the same compose file with the dev overlay `docker-compose.dev.yml`: no Caddy, no domain, an anvil devnet with the contracts deployed and seeded, and only public anvil keys. This page is about the EC2 box.

Everything runs on one EC2 box in **ap-south-1 (Mumbai)**, under Docker Compose. **Caddy** sits in front and gets HTTPS certificates automatically. We have no domain, so hostnames come from [sslip.io](https://sslip.io): `app.13-233-45-67.sslip.io` resolves to `13.233.45.67`.

| URL | Service | Container port |
|---|---|---|
| `https://app.<suffix>` | Merchant app (Next.js), `app/`, **optional**: built by the frontend team; deployed automatically once `app/Dockerfile` exists | `app:3000` |
| `https://api.<suffix>` | Agents API (FastAPI), `agents/` | `agents-api:8787` |
| `https://portal.<suffix>` | Demo seller portal (Next.js), `demo/portal/`. Reclaim's zkTLS attestors fetch it | `demo-portal:3000` |
| `https://issuer.<suffix>` | Issuer (Node TS), `issuer/` | `issuer:${ISSUER_PORT:-4000}` |
| (no URL) | `agents-worker`: Risk agent, keeper and managed merchant agents | |
| `https://rpc.<suffix>` | **Public devnet RPC** (anvil, chain 31337) behind a JSON-RPC allowlist proxy. Only with `DEVNET=1` | `rpc-proxy:8546` |
| `https://api-devnet.<suffix>` | Agents API on the devnet (public anvil keys, own DB). Only with `DEVNET=1` | `agents-api-devnet:8787` |

Here `<suffix>` is `<ip-with-dashes>.sslip.io`. Only Caddy publishes ports (80 and 443). All other services sit on the private compose network.

```
deploy/
  docker-compose.yml        services, healthchecks, volumes, network
  docker-compose.local.yml  laptop fallback overlay (no Caddy, localhost ports, host anvil)
  docker-compose.dev.yml    local dev overlay: devnet in Docker, web app in local mode (scripts/dev-up.sh, docs/LOCAL.md)
  Caddyfile                 hostnames from {$HOST_SUFFIX}, HTTPS, security headers
  bootstrap-ec2.sh          one-time host setup (Docker, compose, swap, clone)
  deploy.sh                 pull, build, up -d, health checks, print URLs (also how you update)
  compose.sh                `docker compose` with the right files/env:  ./deploy/compose.sh ps
  logs.sh                   ./deploy/logs.sh [service...]
  local.sh                  laptop fallback:  ./deploy/local.sh [--mock]
  merge-secrets.sh          copy keys between env files without printing them
  secrets-howto.md          how secrets get onto the box
  agents/worker_entry.py    agents-worker entrypoint (see "Worker" below)
  devnet.sh                 public devnet admin over SSH: status | warp 31d | scene | reset [--hard] | rpc | logs
  devnet/                   anvil-entry.sh (anvil + clock fix), bootstrap.sh (deploy + seed), rpc_proxy.py
                            (public RPC allowlist) + tests/, Dockerfile (devnet tools image)
  env/*.env.example         templates; the real *.env files are git-ignored
                            (issuer-devnet.env.example: the local dev stack's issuer, public anvil key 4)
```

## Instance sizing

**Use a t3.medium at minimum (2 vCPU, 4 GiB RAM), with 30 GiB gp3. Pick t3.large (8 GiB) if the budget allows.**

Why:

- **`next build` is the peak.** The merchant app bundles the Noir/Barretenberg prover (`@aztec-foundation/bb.js`, `@noir-lang/noir_js`), Reclaim, World IDKit and viem. Its production build takes 1.5–2.5 GB of RAM. `deploy.sh` builds images one at a time, and the bootstrap adds 2 GB of swap when RAM is under 4 GiB. A t3.small (2 GiB) gets OOM-killed during the build.
- **Steady state is about 1.5–2 GB:** two `next start` servers (200–400 MB each), the FastAPI API and the worker (web3 + boto3, 150–300 MB each), the issuer (about 100 MB), and Caddy (about 30 MB). The compose `mem_limit`s total about 3.8 GB. They're ceilings, not reservations. With `DEVNET=1`, steady state grows by about 300–450 MB: anvil, the proxy and the devnet API. The one-shot deployer adds a peak during its first boot.
- **CPU:** t3 instances are burstable. Builds burn credits, but the default *unlimited* mode keeps them from being throttled. Everything at runtime is I/O-bound (RPC and LLM calls).
- **Disk:** images and build cache take about 4–6 GB. 30 GiB leaves room for rebuilds. 8 GiB fills up after a few builds.
- **Use x86_64,** not Graviton (t4g). It avoids surprises with npm packages that ship prebuilt binaries.

## Security group (inbound)

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22/tcp | **My IP** only (re-add the venue IP on demo day) | admin |
| HTTP | 80/tcp | 0.0.0.0/0 (and ::/0) | ACME HTTP-01 challenge plus the redirect to HTTPS. **Required for certificates** |
| HTTPS | 443/tcp | 0.0.0.0/0 (and ::/0) | the apps |
| Custom UDP | 443/udp | 0.0.0.0/0 (optional) | HTTP/3 |

Open nothing else. Outbound stays the default (all). The services need to reach Sepolia RPC, Bedrock/Anthropic, Reclaim, World, Let's Encrypt, GitHub, Docker Hub and npm/PyPI.

## Zero to live URLs

### On AWS (console, ap-south-1)

1. **Key pair:** EC2 → Key Pairs → Create, name `mra-demo`, type ED25519, format `.pem`. Then on your laptop: `mv ~/Downloads/mra-demo.pem ~/.ssh/ && chmod 400 ~/.ssh/mra-demo.pem`.
2. **Security group:** EC2 → Security Groups → Create `mra-demo-sg` with the rules above.
3. **Launch the instance:** AMI **Amazon Linux 2023** (or Ubuntu 24.04), x86_64, **t3.medium**, key `mra-demo`, SG `mra-demo-sg`, 30 GiB gp3 root volume, auto-assign public IP on. Under Advanced, keep IMDSv2 required. The default hop limit is fine, because only the host reads metadata.
4. **Elastic IP:** EC2 → Elastic IPs → Allocate, then Associate it with the instance. **Do this before you configure anything else.** The sslip.io hostname *is* the IP. Without an EIP, a stop/start changes every URL, which breaks the Reclaim provider config, World redirect URIs and the printed QR codes.

### Repo access (private repo)

On the box, create a read-only deploy key:

```bash
ssh -i ~/.ssh/mra-demo.pem ec2-user@<eip>
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
```

On GitHub, go to the repo → Settings → Deploy keys → Add, paste the key, and leave write access **off**. Then `ssh -T git@github.com` once to accept the host key. A public repo can use the HTTPS URL and skip this.

### Bootstrap and deploy

```bash
# laptop
scp -i ~/.ssh/mra-demo.pem deploy/bootstrap-ec2.sh ec2-user@<eip>:
ssh -i ~/.ssh/mra-demo.pem ec2-user@<eip> \
  'REPO_URL=git@github.com:<org>/ethglobal-mumbai.git BRANCH=main bash bootstrap-ec2.sh'

# laptop: build the env files and scp them (details in secrets-howto.md)
scp -i ~/.ssh/mra-demo.pem deploy/env/{compose,agents,app,demo-portal,issuer}.env \
  ec2-user@<eip>:~/ethglobal-mumbai/deploy/env/

# box (log out and in once after the bootstrap so the docker group applies)
ssh -i ~/.ssh/mra-demo.pem ec2-user@<eip>
~/ethglobal-mumbai/deploy/deploy.sh
```

`deploy.sh` does the following:

- checks the env files (it refuses to run if a required key is empty, and generates `SESSION_SECRET` if `demo-portal.env` is missing)
- checks that `agents/deployments/<DEPLOYMENTS_NAME>.json` exists (default `sepolia.json`)
- derives `HOST_SUFFIX` from the public IP
- builds each image in turn, then runs `up -d`
- waits for every container healthcheck, then checks the public HTTPS endpoints
- prints the URLs

The first run takes 5–10 minutes (npm installs and Next builds). Certificates take a few seconds per hostname.

### After the first deploy

- **Reclaim:** use the portal's paste-ready config at `https://portal.<suffix>/api/reclaim/provider-config?band=2`. Its login URL is `https://portal.<suffix>/login` and its request URL is `https://portal.<suffix>/api/me/summary`. Put the provider ID in `app.env` (`RECLAIM_PROVIDER_ID`) and redeploy.
- **World:** register `https://app.<suffix>` as the app origin. The OIDC redirect URI is `https://app.<suffix>/api/agent-pass/callback`.
- **Flip the app to real modes** in `compose.env` (`NEXT_PUBLIC_*_MODE=real`), then run `./deploy/deploy.sh --no-pull`. That rebuilds the app, because these values are inlined at build time.

### Worker

`agents-worker` uses the same image as the API. Its command is `python /srv/deploy/worker_entry.py`, which works like this:

- If **`mra_agents.worker` exists**, it runs that, exactly like `python -m mra_agents.worker`. That is the intended entrypoint: the Risk agent loop, the keeper loop and `MerchantAgentRunner`. *The agents owner still has to create `agents/src/mra_agents/worker.py`.*
- If it doesn't exist yet, it runs a **fallback** loop: `RiskAgent.tick()` every `RISK_LOOP_SECONDS` (300) and `Keeper.tick()` every `KEEPER_LOOP_SECONDS` (60), one after the other on one thread. The fallback does **not** run the managed merchant agents.

The worker and API share the SQLite volume `agents-data` (`/srv/agents/data/agents.sqlite`). `agents/deployments/` is bind-mounted read-only, so a contract redeploy only needs a new `<name>.json` and a restart, not a rebuild.

## Public devnet (the default scene)

The default scene needs **30 days with no repaying sale** before `writeOff`, so it can't happen live on Sepolia. It runs instead on an anvil chain that we host on the same box and that anyone can use: judges, the app, scripts and Anon-RPC workers. Sepolia stays the main deployment. The devnet is an extra, under the compose profile `devnet`.

| URL | What |
|---|---|
| `https://rpc.<suffix>` | JSON-RPC, chain id **31337**. Standard `eth_*` / `net_*` / `web3_*` only. `GET /devnet.json` returns the contract addresses, `GET /health` checks the chain, and `GET /` lists the allowed methods |
| `https://api-devnet.<suffix>` | The agents API pointed at the devnet (`/health`, `/risk/status`, `/offers`, ...) |

### Enable it

1. In `deploy/env/compose.env`, set `DEVNET=1`.
2. Make sure the contract submodules are present: `git submodule update --init --recursive`. The bootstrap already does this.
3. Run `./deploy/deploy.sh`.

On the first run, `deploy.sh` does the following:

- Creates `deploy/env/agents-devnet.env` from `agents-devnet.env.example`:
  - the **public anvil keys**
  - fresh random `PAYER_HASH_KEY`, `BUSINESS_PEPPER` and `AGENT_KEY_ENCRYPTION_KEY`
  - only the LLM settings copied over from `agents.env`
- **Refuses to start** if any key in it equals a Sepolia key in `agents.env`.
- Builds `mra-devnet-tools`, which contains:
  - foundry v1.2.2, nargo 1.0.0-rc.3 and bb 6.0.0
  - the agents package
  - the contracts and the Business Pass circuit, compiled at build time (about 1 GB, built once)
- Starts the four services:

| Service | Role | Memory cap |
|---|---|---|
| `anvil` | `ghcr.io/foundry-rs/foundry:v1.2.2`. State lives on the `anvil-state` volume (`--state`, dumped every 30 s and on stop), so a restart keeps the chain. **Not published, and not reachable from Caddy.** | 512 MB (actual use is about 100–200 MB) |
| `devnet-deployer` | One-shot. Only on the first boot, it runs the existing local scripts: `agents/scripts/devnet.sh` (Poseidon2, both verifiers, `DeployLocal.s.sol`: MockUSDC, registry, PoolManager, vaults, AdvanceBook, RiskHook, the v4 pool plus liquidity), then `seed_demo.py` (3 shops, 300 sales, the ghost-shop advance with a real proof), then `seed_devnet.py` (a junior LP position, a v4 swap router, pool activity). It writes `devnet.json` to the `devnet-data` volume. Later boots check the chain and exit in seconds. It shares anvil's network namespace. | 1.5 GB cap, first boot only |
| `rpc-proxy` | The only public path to anvil (see the security model below). It reuses the agents image. | 128 MB |
| `agents-api-devnet` | The agents image with `DEPLOYMENTS_FILE=devnet.json`, its own SQLite volume and the public anvil keys. | 384 MB |

`deploy.sh` also health-checks `https://rpc.<suffix>/health` and `https://api-devnet.<suffix>/health`, plus a live self-test: `eth_chainId` must return 31337, and `anvil_setBalance` must be refused.

To turn the devnet off, set `DEVNET=` and run `./deploy/compose.sh stop anvil rpc-proxy agents-api-devnet`. The volumes stay.

### Run the default scene

Run these on the box, over SSH. The scene runs in the tools image, next to anvil, and **is a dry run unless you pass `--execute`**.

```bash
./deploy/devnet.sh scene                          # status + plan, sends nothing
./deploy/devnet.sh scene --execute                # every pending step, narrated
./deploy/devnet.sh scene --execute --step sell    # one step at a time on stage:
#   setup -> stop -> warp -> writeoff -> sell -> twap -> risk -> summary
./deploy/devnet.sh scene --execute --llm          # Risk agent asks the configured LLM
```

What each step does:

- **setup**: A merchant registers. The devnet issuer issues a Business Pass, a real Noir/bb proof is generated, and `drawFirst` opens a 50 USDC advance. Three customer sales follow, and the 10% holdback repays part of the advance.
- **stop**: Shows the last repaying sale.
- **warp**: Moves the clock 31 days forward with `evm_increaseTime`.
- **writeoff**: `Keeper.tick()` calls `writeOff`. The junior vault pays the loss, the junior share price falls and the senior share price is untouched.
- **sell**: A junior LP sells on the v4 pool with a price limit, which moves the pool price **−15%**.
- **twap**: One more hour passes. The 1h TWAP is now at the new price while the 24h TWAP lags, so the ratio is about 0.86. The trigger needs < 0.90.
- **risk**: `RiskAgent.tick()` sees `junior_twap_drop`, plus `write_offs_7d` if there were 2 or more write-offs in 7 days. It calls `lowerLimits` (down only), and the cap change is printed.
- **summary**: Prints a before/after table.

Without `--llm`, the Risk agent applies its documented deterministic −25% cut on tiers 2–3 and maxExposure: caps go from 200/300 to 150/225 and maxExposure from 100k to 75k.

The scene is **idempotent and resumable**. Each step checks the chain and `scene-state.json` (on the devnet volume), so re-running the same command continues from where it stopped. A finished step only prints its result.

### Reset

- `./deploy/devnet.sh reset` (soft, about 10 s): buys the junior back to the starting pool price, restores the tier caps with the owner's `setLimits`, and starts a new merchant (`kiosco-2`, ...). Then run `scene --execute` again. The chain clock only moves forward, so earlier write-offs stay in history and drop out of the 7-day window. In later runs the TWAP trigger fires on its own.
- `./deploy/devnet.sh reset --hard` (1–5 min): deletes the `anvil-state`, `devnet-data` and `agents-devnet-data` volumes, then redeploys and reseeds. The contract addresses stay the same, because the deploy is deterministic.
- Other admin commands: `./deploy/devnet.sh status | manifest | warp 31d | mine 5 | rpc anvil_nodeInfo | logs`.

### Security model of the public RPC

A raw public anvil lets anyone mint ETH and tokens (`anvil_setBalance`, `anvil_setStorageAt`), impersonate any account, replace code, warp or revert time, or sign with anvil's 10 unlocked accounts. The defences:

1. **Anvil is never exposed.** It publishes no port, and Caddy only proxies to `rpc-proxy`.
2. **Method allowlist** (`deploy/devnet/rpc_proxy.py`, `ALLOWED_METHODS`). Only standard reads are forwarded: chain, fee, state, block, transaction, receipt, log and filter methods, `eth_call` and `eth_estimateGas`. The only write is **`eth_sendRawTransaction`**, which the client signs itself.
   - Everything else gets JSON-RPC error `-32601` locally and never reaches anvil: `anvil_*`, `evm_*`, `hardhat_*`, `debug_*`, `trace_*`, `ots_*`, `txpool_*`, `personal_*`, `admin_*`, `miner_*`, and also `eth_sendTransaction`, `eth_sign*` and `eth_signTransaction`, which would sign with the unlocked accounts.
   - `eth_accounts` returns `[]`.
   - Matching is exact and case-sensitive.
3. **Batches** are checked call by call. Only the allowed calls are forwarded, and request ids are rewritten and mapped back. The batch size cap is 50.
4. **Per-IP rate limits**, as token buckets. Each call in a batch costs one token.
   - Defaults: 15 calls/s with a burst of 60, and 30 raw transactions per minute with a burst of 10.
   - The IP comes from Caddy's `X-Forwarded-For`, and Caddy overwrites any client-sent value. IPv6 is bucketed per /64.
   - Tune them in `compose.env` with `DEVNET_RPC_*`.
5. **Body limits:** 256 KiB at the proxy (a proof-carrying tx is about 30–60 KB) and 512 KB at Caddy.
6. **CORS `*`** on every response, and the `OPTIONS` preflight is answered with 204. That means plain HTTPS POST works from browsers and from **Anon-RPC workers**.
7. **Admin only over SSH:** `deploy/devnet.sh` runs `cast rpc` inside the anvil container (`docker compose exec`).
8. **The proxy container is read-only** and runs as non-root (uid 10001).

**What's still possible, by design:** the devnet's role keys are anvil's well-known public keys (owner, offer signer, risk manager, relayer, issuer). Anyone can sign transactions with them, for example to raise caps as the owner or race the relayer's nonce. Treat the devnet as a shared sandbox: it has no real value, and `reset` / `reset --hard` fix any griefing. **Never put a real key on it**, and `deploy.sh` enforces that for Sepolia keys. A time warp is global, so it affects everyone on the devnet.

### Using it from elsewhere

- Add a wallet network: RPC `https://rpc.<suffix>`, chain id 31337, currency ETH. Fund a new key from a public anvil account; anvil account 9 is a good choice because the scene doesn't use it. Sign locally, since the proxy refuses `eth_sendTransaction`.
- Contract addresses: `curl https://rpc.<suffix>/devnet.json`. The file also includes `PoolSwapTest`, the v4 swap router for the junior/USDC pool.
- Anon-RPC: point the worker's upstream at `https://rpc.<suffix>`. It is a plain JSON-RPC POST endpoint.

## Updating

| Change | Command |
|---|---|
| New commits on the branch | `./deploy/deploy.sh` (pull, rebuild, recreate the changed containers) |
| One service only | `./deploy/compose.sh up -d --build app` |
| Env change (`agents.env`, `app.env`, ...) | `./deploy/deploy.sh --no-pull --no-build` |
| `NEXT_PUBLIC_*` change in `compose.env` | `./deploy/deploy.sh --no-pull` (rebuilds the app) |
| New contract addresses | update `agents/deployments/<name>.json`, then `./deploy/compose.sh restart agents-api agents-worker app` |
| Roll back | `git -C ~/ethglobal-mumbai checkout <good-sha> && ./deploy/deploy.sh --no-pull` |
| Different branch | `BRANCH=demo-day ./deploy/deploy.sh` |

Other useful commands:

- `./deploy/logs.sh agents-worker`
- `./deploy/compose.sh ps`
- `./deploy/compose.sh exec agents-api sh`
- `docker system prune -f` (when the disk is full; it keeps named volumes)

Never delete the `caddy-data` volume. It holds the certificates, and re-issuing them can run into Let's Encrypt rate limits. Caddy falls back to ZeroSSL on its own, but don't rely on that.

## Switching from sslip.io to a real domain

1. In DNS, add A records `app`, `api`, `portal` and `issuer` under `demo.example.com`, all pointing at the Elastic IP. A wildcard `*.demo.example.com` also works.
2. On the box, set `HOST_SUFFIX=demo.example.com` in `deploy/env/compose.env`.
3. Run `./deploy/deploy.sh --no-pull`. The rebuild matters because `NEXT_PUBLIC_API_URL` defaults to `https://api.<suffix>`. Caddy gets the new certificates on its own.
4. Update everything that has the old URL baked in: the Reclaim provider's login and request URLs, World app origins and redirect URIs, `NEXT_PUBLIC_API_URL` if you set it explicitly, and the printed QR codes.
5. Optional: set `email you@example.com` in the Caddyfile's global block to get certificate-expiry mail.

Don't add `includeSubDomains` or `preload` to HSTS while you're on sslip.io. It's a shared domain.

## Simulator

Judges run real merchant stories on the devnet from the web app. `agents-api-devnet` (profile `devnet`) mounts
`/sim` when `CHAIN_ID=31337` and `SIMULATOR_ENABLED=1`; the Sepolia `agents-api` never has these routes.

| Endpoint | |
|---|---|
| `GET /sim/archetypes` | `honest_kiosk`, `slow_week`, `wash_ring`, `defaulter`, `repeat_borrower` |
| `POST /sim/runs {archetype}` | `{run_id}`; 429 past 6 runs/hour per IP or 50/hour in total |
| `GET /sim/runs/{id}` | status (`queued`/`running`/`done`/`failed`, `ahead` = runs before yours), steps, ledger |
| `GET /sim/state` | global ledger (cached 3 s) + the 10 latest runs |

- **Real work only:** devnet txs, the production pipeline (red lines, Underwriter and Critic LLMs, signer),
  real UltraHonk proofs (about 7.6 KB, 0.2 s), the Keeper and the Risk agent. Only customers are simulated.
- **Fee model:** offers read "0.5%/week, max 3%"; sales repay fee first until `owedOf` is zero. `slow_week`
  checks the accrued fee against the published schedule (no late fee). Tier caps are $50/$100/$200/$300.
- **Keys:** public anvil keys only. Signer, relayer and risk keys come from the anvil mnemonic, whatever
  `agents-devnet.env` says. That file only needs the LLM provider and key (`LLM_PROVIDER`, `BEDROCK_API_KEY`).
- **One run at a time:** a worker thread runs each one in a spawned child process. It has a 210 s budget and is killed at 240 s.
  Runs take 30–60 s. A run that was going when the server restarted is marked failed.
- **Shared chain:** every run moves anvil's clock forward 30–60 days. `defaulter` restores the tier caps and the
  junior pool price at the end, even when it fails.
- **Wiring:** `devnet-deployer` copies the runtime artifacts into the `devnet-data` volume (read-only in the
  API): `circuits/<c>/{<c>.json,vk}`, `tools/{noir-execute,bb}` and the PoolSwapTest ABI. The API image stays
  the stock agents image. Run history lives in `agents-devnet-data` (`sim.sqlite`).
- **CORS** (only on `/sim`): `https://app.<HOST_SUFFIX>` and `http://localhost:*`.
- **Check:** `curl https://api-devnet.<suffix>/sim/archetypes`. On a failed run, `done_reason` names the stage
  (`Failed during proving (FileNotFoundError)` = the tools are missing from the volume: rebuild `mra-devnet-tools`).

## Demo-day checklist

**Evening before**

- [ ] The Elastic IP is attached. The URLs printed by `deploy.sh` match the QR codes and the Reclaim provider config.
- [ ] `./deploy/deploy.sh` ends with every line `ok` and every container `healthy`.
- [ ] From a phone **on mobile data**, not the venue Wi-Fi: `https://app.<suffix>` loads with a valid padlock, and the full flow works end to end.
- [ ] Reclaim real mode: a proof against `https://portal.<suffix>` succeeds. The attestors must reach it publicly.
- [ ] The wallets have Sepolia ETH: relayer, risk manager, and the demo customer if `/api/demo/pay` is used. The LLM key works. `POST /offers` returns a decision through the app.
- [ ] `free -m` shows headroom and `df -h /` is under 70%.
- [ ] Devnet (`DEVNET=1`): `./deploy/devnet.sh status` shows every service running or healthy. A dry run of `./deploy/devnet.sh scene` shows run N with every step pending. If the last rehearsal finished, run `./deploy/devnet.sh reset` first.
- [ ] **Freeze:** no deploys within 2 hours of judging unless something is broken.
- [ ] The laptop fallback is pre-built: run `./deploy/local.sh --mock` once so all images are cached locally, plus anvil, `devnet.sh` and `seed_demo.py`. Then `./deploy/local.sh down`.
- [ ] Record a screen capture of the full happy path as the last-resort backup.

**30 minutes before**

```bash
ssh -i ~/.ssh/mra-demo.pem ec2-user@<eip>       # add the venue IP to the SG's port-22 rule first
cd ~/ethglobal-mumbai
./deploy/compose.sh ps                           # all running / healthy
S=$(./deploy/compose.sh config 2>/dev/null | sed -n 's/^ *HOST_SUFFIX: //p' | head -1); echo "$S"
curl -fsS https://api.$S/health && echo
curl -fsS https://portal.$S/api/health && echo   # "session_secret_configured":true
curl -fsS https://api.$S/risk/status | head -c 300; echo
curl -fsS -o /dev/null -w 'app %{http_code}\n' https://app.$S/
NOFOLLOW=1 TAIL=50 ./deploy/logs.sh agents-worker   # recent risk/keeper ticks, no tracebacks
```

**If something breaks during the demo**

- One service is misbehaving: `./deploy/compose.sh restart <service>`. Containers restart on their own (`unless-stopped`), and the whole stack comes back after an instance reboot.
- The real integrations are flaky (Reclaim, World, RPC, LLM): open the app's **Demo menu** and switch that integration to `mock`. The override lives in localStorage and needs no redeploy. Every mode defaults to mock when unset.
- The box is down: run the laptop fallback below.

### Backup plan: Wi-Fi or EC2 fails, run everything on the laptop

For a fully self-contained laptop stack with no Sepolia keys and the devnet in Docker, `scripts/dev-up.sh` ([docs/LOCAL.md](../docs/LOCAL.md)) is the simpler option. The steps below are the older fallback: a host anvil plus your Sepolia `agents.env`.

It uses the same compose file with `docker-compose.local.yml` layered on top. That overlay drops Caddy, publishes plain HTTP on localhost, and points the agents at **anvil** on the host.

```bash
# prerequisites on the laptop: Docker Desktop, foundry (anvil/forge/cast), uv; deploy/env/*.env present
anvil --chain-id 31337 &                                   # or let devnet.sh start it
bash agents/scripts/devnet.sh                              # deploys contracts, writes agents/deployments/local.json + agents/.env.devnet
(cd agents && uv run python scripts/seed_demo.py)          # chai-stall, wash-trader, ghost-shop
./deploy/local.sh --mock      # every app integration in mock mode: needs no network at all
# or ./deploy/local.sh        # modes from compose.env (needs internet for LLM/Reclaim/World)
```

- App: `http://localhost:3000`. API: `http://localhost:8787/health`. Portal: `http://localhost:3001`.
- The agents use the public anvil keys from `agents/.env.devnet`, which override the Sepolia keys. The LLM key still comes from `deploy/env/agents.env`. With no internet the underwriter can't call the LLM, so stay on `NEXT_PUBLIC_API_MODE=mock`.
- Present from the **laptop browser**. Phones can't reach `localhost`, and over a LAN IP over plain HTTP they lose the secure context the app needs (IndexedDB secrets, WebCrypto, the prover). If you have a phone hotspot with data, the EC2 deployment is the better choice anyway.
- Stop with `./deploy/local.sh down`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Browser certificate error, `caddy` logs show ACME failures | Port 80 is not open to 0.0.0.0/0, or the IP changed (no EIP). Check the SG, then `./deploy/compose.sh restart caddy`. |
| 502 on one hostname | That container is down or unhealthy: `./deploy/logs.sh <service>`. On `issuer.*` it is expected until `issuer/Dockerfile` exists. |
| `demo-portal` unhealthy | `SESSION_SECRET` is missing or shorter than 32 characters (`/api/health` returns 503). |
| `agents-api` returns 500 on `/offers` | Bad keys or RPC in `agents.env`, or the deployments JSON doesn't match the chain. Check `./deploy/logs.sh agents-api`. |
| Build killed / exit 137 | Out of memory. Check that swap is on (`swapon --show`) and use t3.large. Builds already run one at a time. |
| App still shows the old API URL or mode | `NEXT_PUBLIC_*` is build-time. Run `./deploy/deploy.sh --no-pull` to rebuild. |
| `devnet-deployer` exited 1 | `./deploy/devnet.sh logs devnet-deployer`. `seed_demo.py` refuses to run twice on one chain, so after a half-finished first boot run `./deploy/devnet.sh reset --hard`. |
| Devnet RPC returns 429 | The per-IP rate limit. Raise `DEVNET_RPC_RATE_PER_SEC` / `DEVNET_RPC_RATE_BURST` in `compose.env`, then run `./deploy/compose.sh up -d rpc-proxy`. |
| The scene says "waits for: ..." | It runs in order. Run the named step first, or run `scene --execute` without `--step`. |
