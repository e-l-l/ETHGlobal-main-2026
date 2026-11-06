<#
.SYNOPSIS
  Start the whole DripMoni stack locally in Docker (docs/LOCAL.md, Path A). Windows (Docker Desktop + WSL2).

.DESCRIPTION
  env files (if missing) -> build -> anvil + deploy + seed -> API, worker, issuer, portal, web app in local mode
  -> health checks -> URLs. Safe to re-run: env files are never overwritten, the chain lives on a volume, and the
  deployer is idempotent. Needs no real keys (anvil's public keys; secrets are generated locally).

  .\scripts\dev-up.ps1            everything
  .\scripts\dev-up.ps1 -Mock      only the web app, in mock mode (UI only, no chain)
  .\scripts\dev-up.ps1 -NoApp     everything except the web app image (run apps/web natively instead)
  .\scripts\dev-up.ps1 -NoBuild   reuse the images you already built
  .\scripts\dev-up.ps1 -Reset     delete this stack's volumes first (fresh chain, fresh DB), then start

  If PowerShell refuses to run scripts: powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1
#>
param([switch]$Mock, [switch]$NoApp, [switch]$NoBuild, [switch]$Reset)
# 'Continue', not 'Stop': in Windows PowerShell 5.1, 'Stop' turns any stderr line of a native command redirected
# with 2>$null into a terminating error (docker prints progress on stderr). Failures are checked via $LASTEXITCODE
# (Invoke-Dc throws on a non-zero exit), and throw always ends the script.
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib\DevCommon.ps1')

function Get-PortOr([string]$name, [string]$default) {
  $v = [Environment]::GetEnvironmentVariable($name); if ($v) { return $v } else { return $default }
}
$RpcPort = Get-PortOr 'DEV_RPC_PORT' '8545'; $ApiPort = Get-PortOr 'DEV_API_PORT' '8000'
$IssuerPort = Get-PortOr 'DEV_ISSUER_PORT' '8787'; $AppPort = Get-PortOr 'DEV_APP_PORT' '3000'
$PortalPort = Get-PortOr 'DEV_PORTAL_PORT' '3001'

# ------------------------------------------------------------------------------------------ prerequisites
Write-Info 'checking prerequisites (scripts\doctor.ps1 shows every tool)'
if (-not (Test-Command docker)) {
  Write-Err 'docker not found. Install Docker Desktop (https://docs.docker.com/desktop/install/windows-install/), WSL2 backend.'
  exit 1
}
$cv = (& docker compose version --short 2>$null)
if (-not $cv) { Write-Err "'docker compose' (v2) not found. Update Docker Desktop."; exit 1 }
$cvParts = ($cv -replace '^v', '' -replace '[^0-9.].*$', '').Split('.')
if ([int]$cvParts[0] -lt 2 -or ([int]$cvParts[0] -eq 2 -and [int]$cvParts[1] -lt 24)) {
  Write-Err "docker compose $cv is too old: 2.24+ is needed. Update Docker Desktop."; exit 1
}
if ((Invoke-WithTimeout 'docker' @('info') 20) -ne 0) {
  Write-Err 'the Docker daemon is not answering. Start Docker Desktop and wait for "Engine running", then retry.'
  Write-Err 'If it hangs: Docker Desktop > Troubleshoot > Restart, and check free disk space.'
  exit 1
}
Write-Ok "docker compose $cv, daemon up"

[int64]$mem = 0; [void][int64]::TryParse((& docker info --format '{{.MemTotal}}' 2>$null), [ref]$mem)
if ($mem -gt 0 -and $mem -lt 6000000000) {
  Write-Warn2 "Docker has $([math]::Round($mem / 1GB, 1)) GB of memory. Give it 6 GB or more: in %UserProfile%\.wslconfig"
  Write-Warn2 "set [wsl2] memory=8GB, then run 'wsl --shutdown' and restart Docker Desktop."
}

try {
  $free = (Get-Item $RepoDir).PSDrive.Free
  if ($free) {
    $freeGb = [math]::Floor($free / 1GB)
    if (-not $NoBuild -and $freeGb -lt 6 -and $env:DEV_SKIP_DISK_CHECK -ne '1') {
      Write-Err "only $freeGb GB free on this drive; the images need about 10 GB. Free space (docker system prune)."
      Write-Err 'DEV_SKIP_DISK_CHECK=1 skips this check.'
      exit 1
    }
    if ($freeGb -lt 15) { Write-Warn2 "$freeGb GB free: the first build needs about 10 GB." }
  }
} catch { }

# The bind-mounted shell scripts must have LF endings, or bash/sh in the containers fail on "\r".
$probe = Join-Path $DeployDir 'devnet\anvil-entry.sh'
if ([IO.File]::ReadAllText($probe).Contains("`r")) {
  Write-Err 'deploy\devnet\anvil-entry.sh has CRLF line endings: the containers cannot run it.'
  Write-Err 'Fix (commit or stash your changes first): git rm -rq --cached . ; git reset --hard'
  Write-Err '(.gitattributes forces LF for *.sh on checkout; see docs/LOCAL.md, "Windows: line endings").'
  exit 1
}

if (-not (Test-Path (Join-Path $RepoDir 'contracts\lib\forge-std\src\Test.sol')) -or
    -not (Test-Path (Join-Path $RepoDir 'contracts\lib\uniswap-hooks\src'))) {
  Write-Info "fetching the contracts' git submodules (forge-std, uniswap-hooks)"
  & git -C $RepoDir submodule update --init --recursive
  if ($LASTEXITCODE -ne 0) { throw 'git submodule update failed' }
}

# ---------------------------------------------------------------------------------------------- env files
Write-Info 'env files (existing files are never overwritten)'
Initialize-DockerEnv

if ($Reset) {
  Write-Warn2 '-Reset: removing the mra-dev containers and volumes (chain, manifest, agents DB)'
  Invoke-Dc down -v --remove-orphans
}

# -------------------------------------------------------------------------------------------- mock only
if ($Mock) {
  $env:DEV_MRA_MODE = 'mock'
  Write-Info 'web app in mock mode (no chain, no backend)'
  if ($NoBuild) { Invoke-Dc up -d --no-build --no-deps app } else { Invoke-Dc up -d --build --no-deps app }
  Write-Host ''
  Write-Host "app  http://localhost:$AppPort/home   (mock data; run again without -Mock for local mode)"
  exit 0
}
Remove-Item Env:\DEV_MRA_MODE -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------------------------- build
if (-not $NoBuild) {
  # One image at a time: parallel Next/forge builds can run the WSL2 VM out of memory.
  foreach ($svc in @('agents-api-devnet', 'devnet-deployer', 'issuer-devnet', 'demo-portal')) {
    Write-Info "building $svc"
    Invoke-Dc build $svc
  }
}

# --------------------------------------------------------------------------- chain: deploy + seed (one-shot)
Write-Info 'starting anvil and the deployer (first boot: deploy + seed, about 1-3 minutes)'
Invoke-Dc up -d --no-build anvil devnet-deployer
$deadline = (Get-Date).AddMinutes(15); $last = ''
while ($true) {
  $state = (Invoke-DcSoft ps -a --format '{{.State}}' devnet-deployer 2>$null | Select-Object -First 1)
  if ($state -eq 'exited') { break }
  if ((Get-Date) -gt $deadline) {
    Write-Err 'the deployer is still running after 15 minutes'; Invoke-DcSoft logs --tail 40 devnet-deployer; exit 1
  }
  $line = (Invoke-DcSoft logs --tail 1 --no-log-prefix devnet-deployer 2>$null | Select-Object -Last 1)
  if ($line -and $line -ne $last) { Write-Host "   $line"; $last = $line }
  Start-Sleep -Seconds 3
}
$code = (Invoke-DcSoft ps -a --format '{{.ExitCode}}' devnet-deployer | Select-Object -First 1)
if ("$code".Trim() -ne '0') {
  Write-Err "devnet-deployer exited with $code. Last lines:"
  Invoke-DcSoft logs --tail 40 devnet-deployer
  Write-Err 'A half-finished first boot cannot be resumed (seed_demo.py refuses a second run): .\scripts\dev-up.ps1 -Reset'
  exit 1
}
Write-Ok 'devnet deployed and seeded'

# The devnet's contract addresses for the web app's build (NEXT_PUBLIC_MRA_DEPLOYMENT). The -c code has no spaces
# and no double quotes, so PowerShell passes it to docker unchanged.
$py = "import json;d=json.load(open('/work/agents/deployments/devnet/devnet.json'));print(json.dumps(d,separators=(',',':')))"
$manifest = (Invoke-DcSoft run --rm --no-deps -T --entrypoint /work/agents/.venv/bin/python devnet-deployer -c $py |
  Select-Object -Last 1)
if (-not $manifest -or -not "$manifest".StartsWith('{')) { Write-Err 'could not read the devnet manifest'; exit 1 }
$env:DEV_MRA_DEPLOYMENT = "$manifest".Trim()

# ------------------------------------------------------------------------------------------- services
$services = @('agents-api-devnet', 'agents-worker-devnet', 'issuer-devnet', 'rpc-proxy', 'demo-portal')
if (-not $NoApp) {
  $services += 'app'
  if (-not $NoBuild) {
    Write-Info 'building app (apps/web, local mode, about 3-6 minutes the first time)'
    Invoke-Dc build app
  }
}
Write-Info "starting $($services -join ' ')"
Invoke-Dc up -d --no-build @services

Write-Info 'waiting for health checks (up to 5 minutes)'
$deadline = (Get-Date).AddMinutes(5)
while ($true) {
  $pending = @()
  foreach ($row in (Invoke-DcSoft ps -a --format '{{.Service}}|{{.Health}}|{{.State}}' @services 2>$null)) {
    $f = "$row".Split('|'); if ($f.Count -lt 3 -or -not $f[0]) { continue }
    if ($f[2] -ne 'running') { $pending += "$($f[0])($($f[2]))" }
    elseif ($f[1] -and $f[1] -ne 'healthy') { $pending += "$($f[0])($($f[1]))" }
  }
  if ($pending.Count -eq 0) { break }
  if ((Get-Date) -gt $deadline) {
    Write-Err "not healthy after 5 minutes: $($pending -join ' ')"
    Write-Err 'logs: .\scripts\dev-compose.ps1 logs --tail 50 <service>'
    exit 1
  }
  Start-Sleep -Seconds 5
}
Write-Ok 'all services healthy'

# ------------------------------------------------------------------------------------------ smoke checks
function Test-Url([string]$name, [string]$url, [string]$body) {
  try {
    if ($body) {
      $null = Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10
    } else { $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 }
    Write-Ok "$name $url"
  } catch { Write-Warn2 "$name $url did not answer (yet)" }
}
Write-Host ''
Test-Url 'rpc   ' "http://127.0.0.1:$RpcPort" '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
Test-Url 'api   ' "http://localhost:$ApiPort/health"
Test-Url 'issuer' "http://localhost:$IssuerPort/health"
Test-Url 'portal' "http://localhost:$PortalPort/api/health"
if (-not $NoApp) { Test-Url 'app   ' "http://localhost:$AppPort/home" }

Write-Host @"

DripMoni local stack is up (compose project mra-dev).

  web app      http://localhost:$AppPort/home
  agents API   http://localhost:$ApiPort/health
  issuer       http://localhost:$IssuerPort/health   (mock zkTLS)
  portal       http://localhost:$PortalPort
  chain RPC    http://127.0.0.1:$RpcPort      (chain id 31337)

  default scene   .\scripts\dev-devnet.ps1 scene            (dry run)   then: .\scripts\dev-devnet.ps1 scene --execute
  time warp       .\scripts\dev-devnet.ps1 warp 31d         chain status: .\scripts\dev-devnet.ps1 status
  logs            .\scripts\dev-compose.ps1 logs -f agents-api-devnet
  stop            .\scripts\dev-down.ps1          (keeps the chain)   .\scripts\dev-down.ps1 -Reset   (wipes it)

Walkthrough: docs/LOCAL.md
"@
