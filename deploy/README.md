# Deploying the demo on one EC2 instance

Everything runs on one EC2 box in **ap-south-1 (Mumbai)**, under Docker Compose. **Caddy** sits in front and gets HTTPS certificates automatically. We have no domain, so hostnames come from [sslip.io](https://sslip.io): `app.13-233-45-67.sslip.io` resolves to `13.233.45.67`.

| URL | Service | Container port |
|---|---|---|
| `https://app.<suffix>` | Merchant app (Next.js), `app/`, **optional**: built by the frontend team; deployed automatically once `app/Dockerfile` exists | `app:3000` |
| `https://api.<suffix>` | Agents API (FastAPI), `agents/` | `agents-api:8787` |
| `https://portal.<suffix>` | Demo seller portal (Next.js), `demo/portal/`. Reclaim's zkTLS attestors fetch it | `demo-portal:3000` |
| `https://issuer.<suffix>` | Issuer (Node TS), `issuer/` | `issuer:${ISSUER_PORT:-4000}` |
| (no URL) | `agents-worker`: Risk agent, keeper and managed merchant agents | |

Here `<suffix>` is `<ip-with-dashes>.sslip.io`. Only Caddy publishes ports (80 and 443). All other services sit on the private compose network.

```
deploy/
  docker-compose.yml        services, healthchecks, volumes, network
  docker-compose.local.yml  laptop fallback overlay (no Caddy, localhost ports, host anvil)
  Caddyfile                 hostnames from {$HOST_SUFFIX}, HTTPS, security headers
  bootstrap-ec2.sh          one-time host setup (Docker, compose, swap, clone)
  deploy.sh                 pull, build, up -d, health checks, print URLs (also how you update)
  compose.sh                `docker compose` with the right files/env:  ./deploy/compose.sh ps
  logs.sh                   ./deploy/logs.sh [service...]
  local.sh                  laptop fallback:  ./deploy/local.sh [--mock]
  merge-secrets.sh          copy keys between env files without printing them
  secrets-howto.md          how secrets get onto the box
  agents/worker_entry.py    agents-worker entrypoint (see "Worker" below)
  env/*.env.example         templates; the real *.env files are git-ignored
```

## Instance sizing

**Use a t3.medium at minimum (2 vCPU, 4 GiB RAM), with 30 GiB gp3. Pick t3.large (8 GiB) if the budget allows.**

Why:

- **`next build` is the peak.** The merchant app bundles the Noir/Barretenberg prover (`@aztec-foundation/bb.js`, `@noir-lang/noir_js`), Reclaim, World IDKit and viem. Its production build takes 1.5–2.5 GB of RAM. `deploy.sh` builds images one at a time, and the bootstrap adds 2 GB of swap when RAM is under 4 GiB. A t3.small (2 GiB) gets OOM-killed during the build.
- **Steady state is about 1.5–2 GB:** two `next start` servers (200–400 MB each), the FastAPI API and the worker (web3 + boto3, 150–300 MB each), the issuer (about 100 MB), and Caddy (about 30 MB). The compose `mem_limit`s total about 3.8 GB. They're ceilings, not reservations.
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

## Demo-day checklist

**Evening before**

- [ ] The Elastic IP is attached. The URLs printed by `deploy.sh` match the QR codes and the Reclaim provider config.
- [ ] `./deploy/deploy.sh` ends with every line `ok` and every container `healthy`.
- [ ] From a phone **on mobile data**, not the venue Wi-Fi: `https://app.<suffix>` loads with a valid padlock, and the full flow works end to end.
- [ ] Reclaim real mode: a proof against `https://portal.<suffix>` succeeds. The attestors must reach it publicly.
- [ ] The wallets have Sepolia ETH: relayer, risk manager, and the demo customer if `/api/demo/pay` is used. The LLM key works. `POST /offers` returns a decision through the app.
- [ ] `free -m` shows headroom and `df -h /` is under 70%.
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
