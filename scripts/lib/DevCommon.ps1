# Shared helpers for scripts\dev-*.ps1 (local dev stack, docs/LOCAL.md). Dot-source it; do not run it.
# Works in Windows PowerShell 5.1 and PowerShell 7+. Never prints secret values: generated secrets go straight
# into git-ignored files.

$script:RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:DeployDir = Join-Path $script:RepoDir 'deploy'
$script:EnvDir = Join-Path $script:DeployDir 'env'
$script:ComposeBase = @(
  'compose',
  '-f', (Join-Path $script:DeployDir 'docker-compose.yml'),
  '-f', (Join-Path $script:DeployDir 'docker-compose.dev.yml')
)

# The dev stack: its own compose project, so its volumes never touch an EC2-style "mra" project.
$env:COMPOSE_PROJECT_NAME = 'mra-dev'
$env:COMPOSE_PROFILES = 'devnet,ui'
if (-not $env:HOST_SUFFIX) { $env:HOST_SUFFIX = 'localhost' } # docker-compose.yml requires it for Caddy (off here)

function Write-Info([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok([string]$m) { Write-Host " ok $m" -ForegroundColor Green }
function Write-Warn2([string]$m) { Write-Host " !! $m" -ForegroundColor Yellow }
function Write-Err([string]$m) { Write-Host "ERR $m" -ForegroundColor Red }

function Test-Command([string]$name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Get-RelPath([string]$p) {
  if ($p.StartsWith($script:RepoDir)) { return $p.Substring($script:RepoDir.Length).TrimStart('\', '/') }
  return $p
}

# docker compose on the dev stack. Simple functions (no [Parameter] attributes) on purpose: compose flags such as
# -d or -T then reach docker as plain strings instead of binding to PowerShell's common parameters (-Debug ...).
function Invoke-Dc {
  & docker @script:ComposeBase @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit $LASTEXITCODE)" }
}
# Same, but leaves $LASTEXITCODE to the caller.
function Invoke-DcSoft { & docker @script:ComposeBase @args }

# Run an executable with a time limit. Returns the exit code, or 124 on timeout. Output is discarded.
function Invoke-WithTimeout([string]$exe, [string[]]$argList, [int]$seconds) {
  $out = [IO.Path]::GetTempFileName(); $err = [IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $argList -NoNewWindow -PassThru `
      -RedirectStandardOutput $out -RedirectStandardError $err
    $null = $p.Handle # cache the handle so ExitCode is available after the wait
    if (-not $p.WaitForExit($seconds * 1000)) { try { $p.Kill() } catch { }; return 124 }
    return $p.ExitCode
  } finally { Remove-Item $out, $err -ErrorAction SilentlyContinue }
}

# ------------------------------------------------------------------------------------------------ secrets
function New-RandomBytes([int]$n) {
  $b = New-Object byte[] $n
  $rng = [Security.Cryptography.RNGCryptoServiceProvider]::Create()
  try { $rng.GetBytes($b) } finally { $rng.Dispose() }
  return , $b
}
# 32 random bytes as 64 hex chars (no 0x): same as `openssl rand -hex 32`.
function New-RandHex { -join ((New-RandomBytes 32) | ForEach-Object { $_.ToString('x2') }) }
# About 64 URL-safe random chars (SESSION_SECRET needs 32+).
function New-RandB64 { ([Convert]::ToBase64String((New-RandomBytes 48))) -replace '[+/=]', '' }

# UTF-8 without BOM, LF line endings: docker compose and bash read these files too.
function Write-TextLF([string]$path, [string[]]$lines) {
  $text = (($lines -join "`n") + "`n")
  [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))
}

# Value of KEY in an env file (last assignment wins; inline " # comment" and quotes stripped). Never print it.
function Get-EnvVal([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return '' }
  $val = ''
  foreach ($line in [IO.File]::ReadAllLines($file)) {
    if ($line -match "^\s*$([regex]::Escape($key))=(.*)$") {
      $val = ($Matches[1] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'")
    }
  }
  return $val
}

# Copy a template to DST, setting each listed KEY that is empty in the template. Never overwrites DST.
function New-FromTemplate([string]$src, [string]$dst, [hashtable]$values) {
  if (Test-Path $dst) { Write-Ok "kept existing $(Get-RelPath $dst)"; return }
  if (-not (Test-Path $src)) { throw "template missing: $(Get-RelPath $src)" }
  $out = foreach ($line in [IO.File]::ReadAllLines($src)) {
    $l = $line.TrimEnd("`r"); $hit = $false
    foreach ($k in $values.Keys) { if ($l -eq "$k=") { "$k=$($values[$k])"; $hit = $true; break } }
    if (-not $hit) { $l }
  }
  Write-TextLF $dst $out
  Write-Ok "created $(Get-RelPath $dst) (generated: $(($values.Keys | Sort-Object) -join ' '))"
}

# Refuse to run the devnet with anything but the public anvil keys from the template.
function Test-PublicKeys([string]$file, [string]$template) {
  if (-not (Test-Path $file)) { return }
  $bad = $false
  foreach ($line in [IO.File]::ReadAllLines($template)) {
    if ($line -match '^([A-Z_]*_PRIVATE_KEY)=0x') {
      $k = $Matches[1]; $v = Get-EnvVal $file $k
      if ($v -and $v -ne (Get-EnvVal $template $k)) {
        Write-Err "$(Get-RelPath $file): $k is not the public anvil key from $(Get-RelPath $template)."; $bad = $true
      }
    }
  }
  if ($bad) { throw 'The local devnet only runs with anvil''s public keys. Copy those lines from the template and retry.' }
}

# Path A (Docker): deploy\env\{agents-devnet,issuer-devnet,demo-portal}.env
function Initialize-DockerEnv {
  $agents = Join-Path $script:EnvDir 'agents-devnet.env'
  $issuer = Join-Path $script:EnvDir 'issuer-devnet.env'
  $pepper = Get-EnvVal $agents 'BUSINESS_PEPPER'
  if (-not $pepper) { $pepper = Get-EnvVal $issuer 'ISSUER_PEPPER' }
  if (-not $pepper) { $pepper = New-RandHex }
  New-FromTemplate (Join-Path $script:EnvDir 'agents-devnet.env.example') $agents @{
    PAYER_HASH_KEY = (New-RandHex); BUSINESS_PEPPER = $pepper; AGENT_KEY_ENCRYPTION_KEY = (New-RandHex)
  }
  New-FromTemplate (Join-Path $script:EnvDir 'issuer-devnet.env.example') $issuer @{ ISSUER_PEPPER = $pepper }
  New-FromTemplate (Join-Path $script:EnvDir 'demo-portal.env.example') (Join-Path $script:EnvDir 'demo-portal.env') @{
    SESSION_SECRET = (New-RandB64)
  }
  Test-PublicKeys $agents (Join-Path $script:EnvDir 'agents-devnet.env.example')
  Test-PublicKeys $issuer (Join-Path $script:EnvDir 'issuer-devnet.env.example')
}
