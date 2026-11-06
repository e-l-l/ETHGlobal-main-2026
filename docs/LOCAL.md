# Local development playbook

This playbook runs the whole DripMoney stack on your own machine (macOS, Windows or Linux) with **no real keys**:
- an anvil devnet with the contracts deployed and seeded
- the agents API and worker
- the Business Pass issuer
- the demo seller portal
- the web app

The EC2 deployment is a separate topic, covered in [deploy/README.md](../deploy/README.md).

**Which path?**

| | Path A: Docker (quickest) | Path B: native |
|---|---|---|
| You install | git + Docker Desktop (or Docker Engine) | Node, pnpm, uv, Foundry, Noir, bb |
| Start | one command | one terminal per service |
| First start | 10–20 min (image builds), then about 1 min | about 5 min after installing the tools |
| Disk / RAM | about 10 GB of images, 6 GB+ for Docker | about 3 GB, 8 GB RAM |
| Best for | trying the stack, demos, the default scene | changing code with hot reload |
| Windows | Docker Desktop + WSL2, from PowerShell | inside **WSL2 Ubuntu** |

Each path has three modes:

| Mode | What runs | Use it for |
|---|---|---|
| **mock** | the web app only, with built-in demo data; no chain, no backend | UI work |
| **local** | everything on this machine on anvil (chain 31337), with a time warp for the default scene | the full product, offline |
| **Sepolia** | the web app and your own agents API against the live Sepolia contracts | checking real-network behaviour (needs the team's keys) |

Contents:
- [URLs and ports](#urls-and-ports)
- [0. Get the code](#0-get-the-code)
- [Path A: Docker](#path-a-docker)
- [Path B: native](#path-b-native)
- [The three modes](#the-three-modes)
- [Env files](#env-files)
- [The demo walkthrough](#the-demo-walkthrough)
- [Troubleshooting](#troubleshooting)

## URLs and ports

`@repo/sdk` expects these ports in `local` mode: API `:8000`, issuer `:8787`, RPC `:8545`. Both paths use them, so the defaults need no URLs.

| Service | Path A (Docker) | Path B (native) | Health check |
|---|---|---|---|
| Web app (`apps/web`) | http://localhost:3000/home | http://localhost:3001/home | the page loads |
| Agents API (FastAPI) | http://localhost:8000 | http://localhost:8000 | `curl localhost:8000/health` → `{"status":"ok"}` |
| Issuer (Business Pass, mock zkTLS) | http://localhost:8787 | http://localhost:8787 | `curl localhost:8787/health` → `"mode":"mock"` |
| Demo seller portal (`demo/portal`) | http://localhost:3001 | http://localhost:3000 (optional) | `curl localhost:3001/api/health` |
| Chain (anvil, id 31337) | http://127.0.0.1:8545 | http://127.0.0.1:8545 | `cast chain-id` → `31337` |

The two paths swap the web app and portal ports: `pnpm dev` pins the web app to 3001, and `docker-compose.local.yml` already used 3000/3001. Path A binds everything to `127.0.0.1` only.

Chain check without Foundry:

```sh
curl -s -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545
# {"jsonrpc":"2.0","id":1,"result":"0x7a69"}      (0x7a69 = 31337)
```

## 0. Get the code

```sh
git clone <repo-url> dripmoney && cd dripmoney
git submodule update --init --recursive      # contracts/lib (forge-std, uniswap-hooks); dev-up does it too
```

**Windows: line endings.** `.gitattributes` forces LF for `*.sh`, `*.py`, Dockerfiles and the env templates. Docker bind-mounts some of these into Linux containers, and a CRLF there fails with `$'\r': command not found`.
- If you cloned *before* `.gitattributes` existed, or `scripts\doctor.ps1` reports CRLF, re-checkout once. Commit or stash your work first:

  ```powershell
  git config --global core.autocrlf input
  git rm -rq --cached . ; git reset --hard
  ```
- **Where to clone.** For Path B, clone **inside WSL** (`~/code/dripmoney`, not `/mnt/c/...`). The Linux filesystem is much faster for `node_modules`, and file watching works. For Path A either works. A WSL clone is reachable from Windows at `\\wsl$\Ubuntu\home\<you>\code\dripmoney`.
- Avoid paths with spaces, and OneDrive-synced folders such as `C:\Users\<you>\OneDrive\...`.

**Toolchain pins** (`scripts/doctor.sh` / `scripts\doctor.ps1` checks all of them):

| Tool | Version | Used by |
|---|---|---|
| Node.js | **24.x** works. `package.json` says `>= 26.13`, but 24 is what CI images and the Dockerfiles use | apps/web, packages/sdk, issuer, portal |
| pnpm | **12.16.1** (`packageManager`) | the workspace |
| uv + Python | uv any, **Python 3.12** (`agents/.python-version`, uv installs it) | agents |
| Foundry (forge, anvil, cast) | **v1.2.2** | contracts, the devnet |
| Noir (nargo) | **1.0.0-rc.3** | circuits, seeding (one real proof) |
| Barretenberg (bb) | **6.0.0** | proving and verification keys |
| Docker Compose | **2.24+** | Path A |

## Path A: Docker

One command builds the images and starts the stack:
- anvil, with the contracts deployed and seeded by the same scripts the EC2 devnet uses
- the agents API and worker, using the public anvil keys
- the issuer, in mock zkTLS mode
- the demo portal
- `apps/web` in `local` mode, pointed at the devnet

It uses `deploy/docker-compose.yml` plus the overlay [`deploy/docker-compose.dev.yml`](../deploy/docker-compose.dev.yml), under its own compose project `mra-dev`. No Caddy, no domain, no TLS, and nothing touches an EC2-style `mra` project on the same machine.

### Prerequisites

| | |
|---|---|
| **macOS** | [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) (`brew install --cask docker`). Settings → Resources: **Memory 6–8 GB**, disk 30 GB+. Apple Silicon is fine (see [Apple Silicon vs x86](#apple-silicon-vs-x86-images)). |
| **Windows 10/11** | [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) with the **WSL 2 backend** (`winget install --id Docker.DockerDesktop -e`). Give the WSL VM memory: create `%UserProfile%\.wslconfig` with the block below, then run `wsl --shutdown` and restart Docker Desktop. |
| **Linux** | Docker Engine + the compose plugin (`docker compose version` ≥ 2.24). Add your user to the `docker` group (`sudo usermod -aG docker $USER`, then log in again), because the scripts never use `sudo`. |

```ini
# %UserProfile%\.wslconfig   (Windows)
[wsl2]
memory=8GB
swap=4GB
```

Check everything:

```sh
scripts/doctor.sh                 # macOS / Linux / WSL
```
```powershell
.\scripts\doctor.ps1              # Windows PowerShell
```

### Start

```sh
scripts/dev-up.sh                 # macOS / Linux / WSL
```
```powershell
.\scripts\dev-up.ps1              # Windows PowerShell
# If script execution is disabled:
powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1
```

What it does. It's safe to re-run: env files are never overwritten, and the chain survives restarts.

1. Checks Docker, Compose ≥ 2.24, the daemon, memory and free disk, and fetches the contract submodules if they're missing.
2. Creates any missing env files, with generated secrets and **only the public anvil keys** (see [Env files](#env-files)). It refuses to start if a devnet env file holds any other private key.
3. Builds the images one at a time: agents, devnet tools (Foundry + nargo + bb, with contracts and the circuit compiled in), issuer, portal.
4. Starts `anvil`, then the one-shot `devnet-deployer`, which runs:
   - `agents/scripts/devnet.sh` to deploy the contracts
   - `seed_demo.py`: 3 shops, about 300 sales, and the ghost-shop advance with a real Noir proof
   - `seed_devnet.py`: a junior LP position, the v4 swap router and pool activity

   This takes 1–3 minutes on the first boot. Later boots take seconds.
5. Reads the devnet's contract addresses and builds the web app with them (`NEXT_PUBLIC_MRA_DEPLOYMENT`; see [why](#the-app-reads-the-wrong-contracts--chain_read_failed)).
6. Starts the API, worker, issuer, portal and app, waits for every health check, then prints the URLs.

Flags (bash `--flag`, PowerShell `-Flag`):

| | |
|---|---|
| `--mock` / `-Mock` | only the web app, in **mock** mode (no chain, no backend) |
| `--no-app` / `-NoApp` | skip the web app image and run `apps/web` natively instead (`pnpm dev`, see Path B, terminal 5) |
| `--no-build` / `-NoBuild` | reuse the images you already built (fast restart) |
| `--reset` / `-Reset` | delete this stack's volumes first: a fresh chain and DB |
| `--native-env` (bash only) | only create the Path B env files, then exit |

Host ports can be changed with `DEV_RPC_PORT`, `DEV_API_PORT`, `DEV_ISSUER_PORT`, `DEV_APP_PORT` and `DEV_PORTAL_PORT`, set in the environment before `dev-up`. Changing the API, issuer or RPC port rebuilds the app, because those URLs are baked into the browser bundle.

### Day to day

| Task | macOS / Linux / WSL | Windows PowerShell |
|---|---|---|
| Status, chain time vs wall clock | `scripts/dev-devnet.sh status` | `.\scripts\dev-devnet.ps1 status` |
| Logs | `scripts/dev-compose.sh logs -f agents-api-devnet` | `.\scripts\dev-compose.ps1 logs -f agents-api-devnet` |
| Time warp | `scripts/dev-devnet.sh warp 31d` | `.\scripts\dev-devnet.ps1 warp 31d` |
| Default scene, dry run | `scripts/dev-devnet.sh scene` | `.\scripts\dev-devnet.ps1 scene` |
| Default scene, run it | `scripts/dev-devnet.sh scene --execute` | `.\scripts\dev-devnet.ps1 scene --execute` |
| Reset the scene (soft) | `scripts/dev-devnet.sh reset` | `.\scripts\dev-devnet.ps1 reset` |
| Contract addresses | `scripts/dev-devnet.sh manifest` | `.\scripts\dev-devnet.ps1 manifest` |
| Rebuild one service | `scripts/dev-compose.sh up -d --build issuer-devnet` | `.\scripts\dev-compose.ps1 up -d --build issuer-devnet` |
| Stop (keeps the chain) | `scripts/dev-down.sh` | `.\scripts\dev-down.ps1` |
| Stop and wipe the chain + DB | `scripts/dev-down.sh --reset` | `.\scripts\dev-down.ps1 -Reset` |
| Start again quickly | `scripts/dev-up.sh --no-build` | `.\scripts\dev-up.ps1 -NoBuild` |

`dev-down` never deletes volumes unless you pass `--reset`, and it never deletes env files or images. To reclaim disk, run `docker image rm mra-app:dev mra-agents:local mra-devnet-tools:local mra-issuer:local mra-demo-portal:local` and `docker builder prune`.

**What's different from EC2's devnet.**
- anvil is published on `127.0.0.1:8545` with no allowlist, because it's your own chain and the time warp is part of local work.
- There's a worker (`agents-worker-devnet`: Risk agent + keeper loops).
- There's an issuer on the devnet (`issuer-devnet`, `ISSUER_MOCK=1`, anvil key 4, registry read from the manifest).
- The demo faucet (`DEMO_FAUCET=1`) gives the browser's burner wallet anvil ETH and MockUSDC.
- The EC2 files (`docker-compose.yml`, `docker-compose.local.yml`, `local.sh`, `deploy.sh`) are unchanged. `deploy/local.sh` is still the demo-day fallback, which uses a host anvil plus your Sepolia `agents.env`.

### Windows notes (Path A)

- Run the `.ps1` scripts from PowerShell in the repo folder. Docker Desktop must show **Engine running**.
- **Volumes and paths:** the stack bind-mounts a few files (`deploy/devnet/*.sh`, `deploy/devnet/rpc_proxy.py`, `deploy/agents/worker_entry.py`). They must be LF (see [0. Get the code](#0-get-the-code)); `dev-up.ps1` checks and stops with the fix. State lives in named volumes (`mra-dev_anvil-state`, ...), not in your folder, so Windows file permissions never matter.
- Repos on `C:\` work with the WSL 2 backend. If you use the legacy Hyper-V backend, add the repo folder under Settings → Resources → File sharing.
- The bash scripts also work inside WSL (`bash scripts/dev-up.sh`) against the same Docker Desktop, if you prefer one set of commands.

## Path B: native

Every service runs in its own terminal with hot reload. On **Windows, use WSL2 Ubuntu** for everything below: Foundry, nargo and bb are Linux/macOS-first, and the seed scripts call them. Set it up with `wsl --install -d Ubuntu` in an admin PowerShell, reboot, then open "Ubuntu". Only **mock mode** runs well natively on Windows (Node + pnpm, see [mock](#mock-ui-only)).

### Install the toolchain

**macOS (Homebrew):**

```sh
brew install node@24 uv jq
brew link --overwrite node@24
corepack enable && corepack prepare pnpm@12.16.1 --activate
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup -i v1.2.2
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash && ~/.nargo/bin/noirup -v 1.0.0-rc.3
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash && ~/.bb/bbup -v 6.0.0
```

**Linux / WSL2 Ubuntu (curl installers, no sudo needed after the first line):**

```sh
sudo apt update && sudo apt install -y build-essential curl git jq unzip   # once, for the system packages
curl -fsSL https://fnm.vercel.app/install | bash && exec $SHELL            # Node version manager
fnm install 24 && fnm default 24
corepack enable && corepack prepare pnpm@12.16.1 --activate
curl -LsSf https://astral.sh/uv/install.sh | sh
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup -i v1.2.2
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash && ~/.nargo/bin/noirup -v 1.0.0-rc.3
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash && ~/.bb/bbup -v 6.0.0
```

Then make sure the installers' folders are on `PATH`. `seed_demo.py` and the scene shell out to `nargo` and `bb`, and `doctor.sh` warns when they're installed but not on `PATH`:

```sh
echo 'export PATH="$HOME/.foundry/bin:$HOME/.nargo/bin:$HOME/.bb:$PATH"' >> ~/.zshrc   # or ~/.bashrc
exec $SHELL && scripts/doctor.sh
```

### Install the repo (once)

```sh
git submodule update --init --recursive
pnpm install                          # web app + SDK workspace
pnpm --filter @repo/sdk build         # the web app needs the built SDK (prover + Anon-RPC entry points)
(cd agents && uv sync)                # Python 3.12 venv
(cd issuer && npm ci)
(cd demo/portal && npm ci)            # optional: the web app also has the portal screens built in
scripts/dev-up.sh --native-env        # creates the Path B env files (below); never overwrites
```

### Run (local devnet): one terminal each

**Terminal 1: chain.** `--state` keeps the chain across restarts (read [anvil clock after a restart](#anvil-clock-after-a-restart)).

```sh
anvil --chain-id 31337 --state agents/data/anvil-state.json
```

**Terminal 2: deploy + seed (once per fresh chain), then the agents API.**

```sh
bash agents/scripts/devnet.sh                     # contracts -> agents/deployments/local.json + agents/.env.devnet
cd agents
set -a; . ./.env.devnet; . ./.env.devnet.local; set +a
uv run python scripts/seed_demo.py                # chai-stall, wash-trader, ghost-shop (+ one real proof); about 10 s
uv run python scripts/seed_devnet.py              # junior LP, v4 swap router (PoolSwapTest), pool activity
uv run uvicorn mra_agents.api:app --port 8000     # leave running
```

`seed_demo.py` refuses to run twice on one chain. After it ran once, restarting terminal 2 means only the `set -a ...` line and `uvicorn`.

**Terminal 3 (optional): worker.** These are the Risk agent and keeper loops. Skip it if you want the scene to do the write-off itself.

```sh
cd agents && set -a; . ./.env.devnet; . ./.env.devnet.local; set +a
uv run python ../deploy/agents/worker_entry.py
```

**Terminal 4: issuer (mock zkTLS).**

```sh
cd issuer && set -a; . ./.env; set +a
export REGISTRY_ADDRESS="$(node -p "require('../agents/deployments/local.json').BusinessPassRegistry")"
npm run dev                                       # :8787
```

**Terminal 5: web app (local mode).** The devnet's addresses go in `NEXT_PUBLIC_MRA_DEPLOYMENT`:

```sh
cd apps/web
NEXT_PUBLIC_MRA_DEPLOYMENT="$(node -p "JSON.stringify(require('../../agents/deployments/local.json'))")" pnpm dev
# http://localhost:3001/home
```

**Terminal 6 (optional): demo portal.** `cd demo/portal && npm run dev` serves http://localhost:3000.

Health checks:

```sh
curl -s localhost:8000/health; echo                   # {"status":"ok"}
curl -s localhost:8000/risk/status | head -c 200; echo
curl -s localhost:8787/health; echo                   # {"ok":true,"mode":"mock","chainId":31337,...}
cast chain-id                                         # 31337
```

Time warp and the default scene, natively:

```sh
cast rpc evm_increaseTime 2678400 && cast rpc evm_mine     # +31 days
cd agents && set -a; . ./.env.devnet; set +a
uv run python scripts/demo_default_scene.py                # dry run
uv run python scripts/demo_default_scene.py --execute      # every pending step (it warps by itself)
```

Starting over on a fresh chain: stop anvil, delete `agents/data/anvil-state.json`, `agents/deployments/local.json` and `agents/deployments/scene-state.json`, then repeat terminals 1–2. Then [reset the browser](#indexeddb--burner-wallet-reset).

## The three modes

### mock (UI only)

There's no chain, no backend and no env, and it works on every OS, including Windows natively:

```sh
pnpm install && pnpm dev          # http://localhost:3001/home
```

In Docker: `scripts/dev-up.sh --mock` (http://localhost:3000/home). For simulated latency, so spinners show, set `NEXT_PUBLIC_MRA_MOCK_LATENCY_MS=400` in `apps/web/.env.local`.

### local devnet

Path A (`scripts/dev-up.sh`) or Path B above. Everything runs on chain 31337 with the public anvil keys, and you need no accounts or keys anywhere. The one exception is the advance offer: it calls an LLM, and without a key the offer ends as `error` (see the [walkthrough](#3-advance)). Everything else, including the default scene, works keyless; the Risk agent uses its deterministic −25% cut.

### Sepolia

This points the web app at the live Sepolia contracts (`agents/deployments/sepolia.json`). Writes are signed by the **team's** role keys (offer signer, relayer, risk manager, Business Pass issuer); their addresses are fixed on chain. So this mode needs those keys from the team's secret store ([deploy/secrets-howto.md](../deploy/secrets-howto.md)), plus an LLM key. Never put them in a `*.example` file or a devnet env file.

1. **Agents API on Sepolia.**

   ```sh
   cd agents && cp .env.example .env          # fill the keys + LLM; .env is git-ignored
   set -a; . ./.env; . scripts/sepolia.env; set +a
   uv run python scripts/smoke_sepolia.py     # read-only check, sends nothing: must end with SMOKE PASS
   CORS_ALLOW_ORIGINS=http://localhost:3001 uv run uvicorn mra_agents.api:app --port 8000
   ```
2. **Issuer on Sepolia** (optional, for onboarding). Keep it in a separate file:

   ```sh
   cd issuer && cp .env.example .env.sepolia   # set CHAIN_ID=11155111, the registry's ISSUER_PRIVATE_KEY + ISSUER_PEPPER
   set -a; . ./.env.sepolia; set +a
   export REGISTRY_ADDRESS="$(node -p "require('../agents/deployments/sepolia.json').BusinessPassRegistry")"
   CORS_ALLOW_ORIGINS=http://localhost:3001 npm run dev
   ```

   `ISSUER_MOCK=1` is allowed on Sepolia (it's refused only on chain 1).
3. **Web app.** In `apps/web/.env.local`:

   ```sh
   NEXT_PUBLIC_MRA_MODE=sepolia
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_ISSUER_URL=http://localhost:8787
   NEXT_PUBLIC_ANON_RPC=0          # direct reads; set 1 to test the Anon-RPC path (slower)
   ```

   Then run `pnpm dev`. Leave `NEXT_PUBLIC_MRA_DEPLOYMENT` empty, because the SDK bundles the Sepolia addresses.

To use the **hosted** EC2 API instead of your own, set `NEXT_PUBLIC_API_URL=https://api.<suffix>` and `NEXT_PUBLIC_ISSUER_URL=https://issuer.<suffix>`. That only works if the box's `CORS_ALLOW_ORIGINS` lists `http://localhost:3001`; ask whoever runs the box.

## Env files

All of these are git-ignored. Path A's `scripts/dev-up.sh` / `dev-up.ps1` creates the Docker ones; `scripts/dev-up.sh --native-env` creates the native ones. Neither ever overwrites an existing file. The devnet files hold **only anvil's public keys** (the "test test … junk" mnemonic, accounts 1–5), and the scripts refuse to start if a devnet file holds any other private key.

| File | Used by | Created from | Generated values |
|---|---|---|---|
| `deploy/env/agents-devnet.env` | A: `agents-api-devnet`, `agents-worker-devnet` (and `scene --llm`) | `deploy/env/agents-devnet.env.example` | `PAYER_HASH_KEY`, `BUSINESS_PEPPER`, `AGENT_KEY_ENCRYPTION_KEY` |
| `deploy/env/issuer-devnet.env` | A: `issuer-devnet` | `deploy/env/issuer-devnet.env.example` | `ISSUER_PEPPER` (= `BUSINESS_PEPPER`) |
| `deploy/env/demo-portal.env` | A: `demo-portal` | `deploy/env/demo-portal.env.example` | `SESSION_SECRET` |
| `agents/.env.devnet` | B: agents, seeds, scene | written by `agents/scripts/devnet.sh` on every run | keys + `RPC_URL`, `DEPLOYMENTS_FILE` |
| `agents/.env.devnet.local` | B: agents API / worker (sourced after `.env.devnet`) | `--native-env` | `AGENT_KEY_ENCRYPTION_KEY`, `BUSINESS_PEPPER`; plus `CORS_ALLOW_ORIGINS`, `DEMO_FAUCET=1`, `WORLD_MOCK=1` |
| `issuer/.env` | B: issuer | `--native-env` (template: `issuer/.env.example`) | `ISSUER_PEPPER`; anvil key 4, `ISSUER_MOCK=1`, `CHAIN_ID=31337`, CORS, `PORT=8787` |
| `apps/web/.env.local` | B: web app | `--native-env` (template: `apps/web/.env.example`) | none: `NEXT_PUBLIC_MRA_MODE=local`, `NEXT_PUBLIC_ANON_RPC=0` |
| `demo/portal/.env.local` | B: portal | `--native-env` | `SESSION_SECRET` |
| `agents/.env`, `deploy/env/agents.env`, `issuer/.env.sepolia` | Sepolia only | `*.example` by hand | **real keys** (team secrets) |

To use an LLM locally (optional: only the advance offer needs it), add your provider to `deploy/env/agents-devnet.env` (Path A) or `agents/.env.devnet.local` (Path B):

```sh
LLM_PROVIDER=anthropic          # or bedrock / bedrock-converse (see docs/integration-keys.md)
ANTHROPIC_API_KEY=...
```

Then restart: `scripts/dev-compose.sh up -d agents-api-devnet agents-worker-devnet` (Path A), or terminal 2 (Path B).

**Making secrets by hand.** One per value, never reused across machines. The two issuers must share the pepper, and the scripts handle that. Use plain hex **without** `0x` for the pepper, so the Python and Node issuers derive the same key bytes.

| Value | macOS / Linux / WSL | Windows PowerShell |
|---|---|---|
| 32-byte hex (`PAYER_HASH_KEY`, peppers, `AGENT_KEY_ENCRYPTION_KEY`) | `openssl rand -hex 32` | `$b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b \| % { $_.ToString('x2') })` |
| `SESSION_SECRET`, `RECOVERY_PEPPER` (32+ chars) | `openssl rand -base64 48 \| tr -d '\n/+='` | `$b=[byte[]]::new(48); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) -replace '[+/=]',''` |
| Without openssl | `python3 -c "import secrets; print(secrets.token_hex(32))"` | `py -c "import secrets; print(secrets.token_hex(32))"` |

**CORS origins.** The agents API and the issuer both read `CORS_ALLOW_ORIGINS`, a comma list with no `*`. The local templates allow `http://localhost:3000`, `:3001` and `:3002`, plus the `127.0.0.1` variants. A web app on any other port needs its origin added (see [troubleshooting](#cors-errors-when-the-web-app-runs-on-another-port)).

## The demo walkthrough

These steps follow [docs/submission/DEMO_SCRIPT.md](submission/DEMO_SCRIPT.md), on your machine, in `local` mode. URLs are for Path A (web app on `:3000`). On Path B use `:3001`.

Before you start: open the app in **one** browser profile, and keep the same origin for the whole run. The merchant's session, passes and burner wallet live in that origin's IndexedDB. The burner wallet funds itself on the first write from the API's `/demo/faucet` (anvil ETH + 50 MockUSDC).

| # | Step | Where | What should happen |
|---|---|---|---|
| 0 | Pick a role | http://localhost:3000/home | merchant, lender or public dashboard |
| 1 | **Onboarding: Business Pass** | `/onboarding` → Prove business | The issuer's `/mock/proof` stands in for Reclaim (zkTLS), and logs in as the demo portal account **donpepe** (Kiosco Don Pepe, Argentina, band 2) by default. The same issuer rejects `newshop` ("too new") and `suspended` ("not active"), as in the live flow. The app makes a **real** Noir proof in the browser, and the pass is issued on chain. The explorer (`/explorer`) shows only `BusinessPassIssued`. |
| 2 | **Agent: set up once** | `/merchant/agent/setup` → approve | World Agent Pass is mocked (`WORLD_MOCK=1`): approve gives you an attestation and `registerMandate` on chain. Try deny once: no mandate, so no draws. |
| 3 | <a id="3-advance"></a>**Advance** | `/merchant/advance`, the agent log at `/merchant/agent` | The agent asks `/offers`: the Underwriter proposes, the Critic reviews, code clamps, the offer is signed and relayed (`drawFirst` / `drawByMandate`). **Needs an LLM key** (see [Env files](#env-files)). Without one, the decision is `error` and no advance opens. The seeded ghost-shop advance still shows on the lender and protocol screens. |
| 4 | **Pay** | `/pay/corner-kiosk` (also the merchant QR, `/merchant/qr`) | The customer's burner wallet gets faucet USDC, approves, and pays. 8% repays the active advance; without an advance there is no holdback. Watch the merchant home (`/merchant`): the balance falls. |
| 5 | **Swap (DripCoin, DRIP)** | `/dripcoin/trade` (`/dripcoin`, `/dripcoin/mint`) | Buy or sell DripCoin (DRIP) on the Uniswap v4 junior/USDC pool through `PoolSwapTest`, with `RiskHook` taking its fee. Lenders: `/earn`, `/earn/deposit`, `/earn/position`. |
| 6 | **Default scene** | `scripts/dev-devnet.sh scene --execute` (Path B: `demo_default_scene.py --execute`), then `/risk`, `/protocol`, `/junior`, `/explorer` | **setup** → **stop** → **warp** +31 days → **writeoff** (the junior vault pays, senior untouched) → **sell** (junior pool price −15%) → **twap** (1h/24h ≈ 0.86 < 0.90) → **risk** (`lowerLimits`: caps 250/500 → 187.5/375, maxExposure 100k → 75k) → **summary**. |

Scene tips:
- It's a dry run without `--execute`, and it's resumable: re-running continues where it stopped.
- To go step by step on stage, use `--step setup|stop|warp|writeoff|sell|twap|risk|summary`.
- `reset` restores the pool price and caps and starts a new merchant.
- `--llm` lets the Risk agent ask your LLM instead of applying the deterministic cut.
- The Docker worker (Risk agent + keeper) also acts on a warped chain. For a clean on-stage write-off, stop it first with `scripts/dev-compose.sh stop agents-worker-devnet`. Either way the scene checks the chain and only does what's still pending.

Also try:
- the wash trader being rejected: `/offers` for `wash-trader` fires the circular-funding red line, with no LLM needed
- the "What the world sees" panel (`/merchant/world-view`)
- the in-app portal (`/portal/login`)

## Troubleshooting

### Ports in use

`scripts/doctor.sh` lists busy ports and their owners. Find the owner yourself:
- macOS / Linux: `lsof -nP -iTCP:8545 -sTCP:LISTEN`
- Windows: `Get-NetTCPConnection -LocalPort 8545 -State Listen | Select OwningProcess`, then `Get-Process -Id <pid>`

Then either stop that process or move the stack:
- **Path A:** `DEV_RPC_PORT=18545 DEV_API_PORT=18000 DEV_ISSUER_PORT=18787 DEV_APP_PORT=3010 DEV_CORS_ORIGINS=http://localhost:3010 scripts/dev-up.sh` (PowerShell: set `$env:DEV_API_PORT='18000'` etc. first). The app is rebuilt with the new URLs.
- **Path B:** `anvil --port 18545`, `uvicorn ... --port 18000`, `PORT=18787 npm run dev`, `pnpm exec next dev --port 3011`. Then pass the URLs to the web app: `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:18545 NEXT_PUBLIC_API_URL=http://localhost:18000 NEXT_PUBLIC_ISSUER_URL=http://localhost:18787`. Also export `RPC_URL=http://127.0.0.1:18545` before `devnet.sh` and the seeds, and add the new web origin to both `CORS_ALLOW_ORIGINS`.

A leftover anvil from `devnet.sh` is a common culprit. It starts one in the background when none is running.

### Node version mismatch

`package.json` says `engines.node >= 26.13`, but **Node 24 works**: the Dockerfile uses `node:24` and the whole web app builds and runs on it. On Node 24, pnpm prints an "Unsupported engine" warning; that's fine. Older Node versions (20, 22) are untested, and `doctor` flags anything below 24.
- macOS: `brew install node@24 && brew link --overwrite node@24`, or `nvm install 24 && nvm use 24`.
- Linux / WSL: `fnm install 24 && fnm use 24`.
- If pnpm refuses outright: `pnpm install --config.engine-strict=false`.
- `which -a node` (or `where.exe node`) shows when an old Node sits earlier on `PATH`.

### pnpm "Ignored build scripts"

pnpm 10+ only runs dependency install scripts that are allow-listed (`allowBuilds` in `pnpm-workspace.yaml`). `msgpackr-extract` is deliberately `false`: it's an optional native speed-up, and the pure-JS path is used. If pnpm lists something else and that package then fails at runtime, run `pnpm approve-builds`, or add it to `allowBuilds`, then `pnpm install`. Use pnpm 12.16.1 (`corepack prepare pnpm@12.16.1 --activate`); an older global pnpm uses a different store and settings.

### IndexedDB / burner wallet reset

The app keeps the merchant's session, passes and **burner wallet key** in the origin's IndexedDB. After a chain reset (`dev-down --reset`, a new anvil, `seed_demo` re-run), that state points at things the chain no longer has: nonce errors, "already registered", a missing pass. Clear the site's data:
- **Chrome / Edge:** DevTools (F12) → Application → Storage → **Clear site data**, for `http://localhost:3000` (and `:3001` if you used it).
- **Firefox:** padlock → Clear cookies and site data.
- **Safari:** Settings → Privacy → Manage Website Data → `localhost` → Remove.

Each port is its own origin, with its own burner wallet. A private window is a quick clean slate.

### anvil clock after a restart

The default scene moves the chain clock 31+ days ahead (seeding itself moves it about 30 days). anvil does **not** save its time offset. After a restart it would stamp the next block with wall-clock time, *before* the warped head. Time going backwards breaks the AdvanceBook default clock and the RiskHook TWAP.
- **Path A** handles it: `deploy/devnet/anvil-entry.sh` moves the clock to head + 1 before the node reports healthy. Check with `scripts/dev-devnet.sh status`: chain time ≥ the last block is fine.
- **Path B** with `--state`: after restarting anvil, run once:

  ```sh
  cast rpc evm_setTime $(( $(cast block latest --field timestamp) + 1 )) && cast rpc evm_mine
  ```

  Without `--state` the chain is simply gone, so redeploy (terminal 2) and reset the browser.

### CORS errors when the web app runs on another port

The browser console shows `blocked by CORS policy` on `localhost:8000` or `:8787`. Add your origin to `CORS_ALLOW_ORIGINS` (exact scheme + host + port, comma-separated, no `*`), then restart:
- **Path A:** `DEV_CORS_ORIGINS="http://localhost:3000,http://localhost:3010" scripts/dev-compose.sh up -d agents-api-devnet issuer-devnet`. Set the same `DEV_CORS_ORIGINS` on later `dev-up` runs.
- **Path B:** edit `agents/.env.devnet.local` and `issuer/.env`, then restart terminals 2 and 4.

`localhost` and `127.0.0.1` are different origins. The templates list both.

### Slow Anon-RPC

In `sepolia` mode, chain reads go through the Anon-RPC mixnet by default, at 0.5–30 s each. For local work, turn it off in `apps/web/.env.local` and restart `pnpm dev` (`NEXT_PUBLIC_*` is read at start/build time):

```sh
NEXT_PUBLIC_ANON_RPC=0
```

`local` mode already defaults to off, because the mixnet's exits can't reach anvil on your laptop. The Docker app is built with `0`.

### Apple Silicon vs x86 images

Every image used here is multi-arch:
- `node`, `python`, `ghcr.io/foundry-rs/foundry:v1.2.2` and `caddy` pull natively on arm64
- the devnet tools image downloads the matching nargo/bb build for `TARGETARCH`

If a pull fails with `no matching manifest for linux/arm64`, or a binary crashes with `exec format error`, force x86 with Rosetta. In Docker Desktop, enable Settings → General → "Use Rosetta for x86_64/amd64 emulation", then run:

```sh
DOCKER_DEFAULT_PLATFORM=linux/amd64 scripts/dev-up.sh
```

This is slower, especially the proof in `seed_demo.py`. Don't mix architectures between builds. If you switch, run `scripts/dev-down.sh --reset` and rebuild. The reverse also holds: x86 Windows and Linux machines pull amd64, and nothing needs emulation.

### The app reads the wrong contracts / `chain_read_failed`

A fresh devnet gets different addresses from the copy bundled in the SDK (`packages/sdk/src/deployments/local.json`, taken from an older deploy). The web app must be told the real ones through `NEXT_PUBLIC_MRA_DEPLOYMENT`, the JSON of the manifest:
- Path A sets it at build time.
- Path B passes it on the `pnpm dev` line (terminal 5).

If you redeploy on a chain that already has other transactions, the addresses change: restart terminal 5, or rerun `dev-up` (which rebuilds the app). A fresh anvil + `devnet.sh` always gives the same addresses.

### More

| Symptom | Fix |
|---|---|
| `devnet-deployer exited 1` | `scripts/dev-compose.sh logs devnet-deployer`. A half-finished first seed can't be resumed: `scripts/dev-up.sh --reset`. |
| Docker hangs or `docker info` never returns | Docker Desktop → Troubleshoot → Restart. Check free disk, both on the host and in Settings → Resources → disk image. |
| Build killed / exit 137 | Out of memory: give Docker 6–8 GB. Builds already run one at a time. |
| `$'\r': command not found` in a container | CRLF checkout, see [0. Get the code](#0-get-the-code). |
| `env file ... not found` | Run `dev-up` (it creates the env files). Don't run `docker compose` on the dev overlay directly; use `scripts/dev-compose.sh`. |
| `seed_demo.py` refuses to run | It ran on this chain already. Fresh chain: Path A `--reset`; Path B, see [starting over](#run-local-devnet-one-terminal-each). |
| `/offers` returns `error` | No LLM key (see [Env files](#env-files)), or the key is wrong: check the API logs. |
| `prover_not_configured` in onboarding | The SDK wasn't built before `pnpm dev`: run `pnpm --filter @repo/sdk build`, then restart the web app. |
| PowerShell: "running scripts is disabled" | `powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
