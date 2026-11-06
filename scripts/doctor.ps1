<#
.SYNOPSIS
  Check the local toolchain against the versions DripMoni pins (docs/LOCAL.md). Windows PowerShell 5.1 / pwsh 7.

.DESCRIPTION
  Read-only: installs nothing and only prints versions and fix hints.
  On Windows, Path A (Docker Desktop) runs from PowerShell. Path B (native) is meant for WSL2 Ubuntu: Foundry,
  nargo and bb are Linux/macOS-first, so inside WSL run `bash scripts/doctor.sh` instead.

  .\scripts\doctor.ps1            report
  .\scripts\doctor.ps1 -Strict    exit 1 if a required tool is missing (for CI)
#>
param([switch]$Strict)
$ErrorActionPreference = 'Continue'
$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$IsWin = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($env:OS -eq 'Windows_NT')
$script:Fail = 0; $script:Warn = 0

function Row([string]$st, [string]$name, [string]$found, [string]$want, [string]$hint) {
  $color = 'Green'
  if ($st -eq 'warn') { $color = 'Yellow'; $script:Warn++ } elseif ($st -ne 'ok') { $color = 'Red'; $script:Fail++ }
  if ($found.Length -gt 30) { $found = $found.Substring(0, 30) }
  Write-Host ('{0,-5} ' -f $st) -ForegroundColor $color -NoNewline
  Write-Host ('{0,-15} {1,-30} {2}' -f $name, $found, $want)
  if ($st -ne 'ok' -and $hint) { Write-Host "      fix: $hint" }
}
function Find-Tool([string]$name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source } else { return $null }
}
function Test-VersionGe([string]$a, [string]$b) {
  $pa = ($a -replace '^v', '' -replace '[^0-9.].*$', '').Split('.'); $pb = $b.Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $x = 0; $y = 0
    if ($i -lt $pa.Count -and $pa[$i]) { $x = [int]$pa[$i] }
    if ($i -lt $pb.Count -and $pb[$i]) { $y = [int]$pb[$i] }
    if ($x -gt $y) { return $true }; if ($x -lt $y) { return $false }
  }
  return $true
}
function First-Line($cmdOutput) { "$(@($cmdOutput) | Select-Object -First 1)".Trim() }

Write-Host "DripMoni doctor  (PowerShell $($PSVersionTable.PSVersion), repo $RepoDir)"
Write-Host ''
Write-Host ('{0,-5} {1,-15} {2,-30} {3}' -f '', 'tool', 'found', 'wanted')

# ------------------------------------------------------------------------------------------------ both paths
if (Find-Tool git) {
  Row ok git ((First-Line (& git --version)) -replace 'git version ', '') any ''
  $ac = First-Line (& git config --get core.autocrlf 2>$null)
  if ($ac -eq 'true') {
    Row warn 'git autocrlf' 'true' 'input or false' 'git config --global core.autocrlf input   (.gitattributes keeps *.sh LF anyway; re-checkout old clones, see docs/LOCAL.md)'
  }
  $probe = Join-Path $RepoDir 'deploy\devnet\anvil-entry.sh'
  if ((Test-Path $probe) -and [IO.File]::ReadAllText($probe).Contains("`r")) {
    Row FAIL 'line endings' '*.sh checked out as CRLF' 'LF' 'commit/stash your work, then: git rm -rq --cached . ; git reset --hard'
  } else { Row ok 'line endings' '*.sh are LF' 'LF' '' }
} else { Row FAIL git missing any 'winget install --id Git.Git -e' }

if ($IsWin) {
  $env:WSL_UTF8 = '1' # wsl.exe prints UTF-16 otherwise
  if (Find-Tool wsl) {
    $list = @(& wsl.exe -l -v 2>$null) | ForEach-Object { "$_" -replace "`0", '' } | Where-Object { $_ -match '\S' }
    $v2 = @($list | Select-Object -Skip 1 | Where-Object { $_ -match '\s2\s*$' })
    if ($v2.Count -gt 0) { Row ok WSL2 ("$($v2.Count) distro(s) on WSL 2") 'WSL 2' '' }
    else { Row warn WSL2 'no WSL 2 distro' 'WSL 2 + Ubuntu' 'wsl --install -d Ubuntu   (admin PowerShell, then reboot)' }
  } else { Row FAIL WSL2 missing 'WSL 2 + Ubuntu' 'wsl --install -d Ubuntu   (admin PowerShell, then reboot)' }
  $wslcfg = Join-Path $env:USERPROFILE '.wslconfig'
  if ((Test-Path $wslcfg) -and ((Get-Content $wslcfg -Raw) -match '(?im)^\s*memory\s*=\s*(\S+)')) {
    Row ok '.wslconfig' "memory=$($Matches[1])" '>= 6GB' ''
  } else {
    Row warn '.wslconfig' 'no memory= set' '>= 6GB' "add [wsl2] memory=8GB (and swap=4GB) to $wslcfg, then: wsl --shutdown"
  }
}

# ------------------------------------------------------------------------------------------------ Path A
Write-Host ''; Write-Host 'Path A (Docker)'
if (Find-Tool docker) {
  Row ok docker ((First-Line (& docker --version)) -replace 'Docker version ', '' -replace ',.*$', '') any ''
  $cv = First-Line (& docker compose version --short 2>$null)
  if (-not $cv) { Row FAIL compose missing '>= 2.24' 'update Docker Desktop' }
  elseif (Test-VersionGe $cv '2.24') { Row ok compose $cv '>= 2.24' '' }
  else { Row FAIL compose $cv '>= 2.24' 'update Docker Desktop' }
  $out = [IO.Path]::GetTempFileName()
  $p = Start-Process docker -ArgumentList @('info', '--format', '"{{.ServerVersion}} {{.MemTotal}} {{.Architecture}}"') `
    -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError ([IO.Path]::GetTempFileName())
  $null = $p.Handle
  if (-not $p.WaitForExit(15000)) {
    try { $p.Kill() } catch { }
    Row FAIL daemon 'no answer in 15 s' running 'Docker Desktop > Troubleshoot > Restart; check free disk space'
  } elseif ($p.ExitCode -eq 0) {
    $f = (Get-Content $out -Raw).Trim().Trim('"').Split(' ')
    Row ok daemon "$($f[0]) ($($f[2]))" running ''
    [int64]$mem = 0; [void][int64]::TryParse($f[1], [ref]$mem)
    if ($mem -ge 6GB) { Row ok 'docker memory' ("{0:N1} GB" -f ($mem / 1GB)) '>= 6 GB' '' }
    elseif ($mem -gt 0) { Row warn 'docker memory' ("{0:N1} GB" -f ($mem / 1GB)) '>= 6 GB' '%UserProfile%\.wslconfig: [wsl2] memory=8GB, then wsl --shutdown' }
  } else { Row FAIL daemon 'not running' running 'start Docker Desktop and wait for "Engine running"' }
  Remove-Item $out -ErrorAction SilentlyContinue
} else { Row FAIL docker missing 'Docker Desktop' 'winget install --id Docker.DockerDesktop -e   (WSL 2 backend)' }
try {
  $free = (Get-Item $RepoDir).PSDrive.Free
  if ($free) {
    $gb = [math]::Floor($free / 1GB)
    if ($gb -ge 15) { Row ok 'disk free' "$gb GB" '>= 15 GB' '' }
    elseif ($gb -ge 5) { Row warn 'disk free' "$gb GB" '>= 15 GB' 'the images need about 10 GB: docker system prune, or use Path B in WSL' }
    else { Row FAIL 'disk free' "$gb GB" '>= 15 GB' 'free disk space first' }
  }
} catch { }

# ------------------------------------------------------------------------------------------------ Path B
Write-Host ''; Write-Host 'Native tools (mock mode works natively on Windows; the full Path B belongs in WSL2)'
if (Find-Tool node) {
  $nv = (First-Line (& node --version)) -replace '^v', ''
  if (Test-VersionGe $nv '24') { Row ok node $nv '>= 24 (pin: >= 26.13)' '' }
  else { Row FAIL node $nv '>= 24 (pin: >= 26.13)' 'winget install OpenJS.NodeJS.LTS   (or fnm: winget install Schniz.fnm; fnm install 24)' }
} else { Row FAIL node missing '>= 24 (pin: >= 26.13)' 'winget install OpenJS.NodeJS.LTS' }
if (Find-Tool pnpm) {
  $pv = First-Line (@(& pnpm --version 2>$null) | Select-Object -Last 1)
  if ($pv -eq '12.16.1') { Row ok pnpm $pv '12.16.1' '' }
  else { Row warn pnpm $pv '12.16.1' 'corepack enable; corepack prepare pnpm@12.16.1 --activate' }
} else { Row FAIL pnpm missing '12.16.1' 'corepack enable; corepack prepare pnpm@12.16.1 --activate   (or: npm i -g pnpm@12.16.1)' }
if (Find-Tool uv) { Row ok uv ((First-Line (& uv --version)) -replace '^uv ', '') any '' }
else { Row warn uv missing 'any (WSL)' 'in WSL: curl -LsSf https://astral.sh/uv/install.sh | sh   (Windows: winget install astral-sh.uv)' }
foreach ($t in @('forge', 'anvil', 'nargo', 'bb')) {
  if (Find-Tool $t) { Row ok $t (First-Line (& $t --version 2>$null)) 'see doctor.sh' '' }
  elseif ($IsWin) { Row warn $t 'not on Windows' 'in WSL2' 'install it inside WSL2 Ubuntu and run: bash scripts/doctor.sh' }
  else { Row FAIL $t missing 'see doctor.sh' 'run scripts/doctor.sh for the install hint' }
}
if (Test-Path (Join-Path $RepoDir 'contracts\lib\forge-std\src\Test.sol')) { Row ok submodules 'contracts/lib present' initialized '' }
else { Row warn submodules 'contracts/lib empty' initialized 'git submodule update --init --recursive   (dev-up does it)' }

# ------------------------------------------------------------------------------------------------ ports
Write-Host ''; Write-Host 'Ports (Path A publishes 8545 8000 8787 3000 3001)'
$busy = @()
foreach ($port in @(8545, 8000, 8787, 3000, 3001)) {
  $c = New-Object Net.Sockets.TcpClient
  try { $ar = $c.BeginConnect('127.0.0.1', $port, $null, $null); if ($ar.AsyncWaitHandle.WaitOne(300) -and $c.Connected) { $busy += $port } }
  catch { } finally { $c.Close() }
}
if ($busy.Count -eq 0) { Row ok ports 'all free' free '' }
else {
  $hint = 'stop those processes, or set $env:DEV_APP_PORT etc. before dev-up (docs/LOCAL.md)'
  if ($IsWin) { $hint = "find the owner: Get-NetTCPConnection -LocalPort $($busy[0]) -State Listen | Select OwningProcess; then $hint" }
  Row warn ports ("in use: " + ($busy -join ' ')) free $hint
}

Write-Host ''
if ($script:Fail -eq 0 -and $script:Warn -eq 0) { Write-Host 'All good.' -ForegroundColor Green }
else { Write-Host "$($script:Fail) missing/failing, $($script:Warn) warnings. Path A needs only git + Docker Desktop." }
if ($Strict -and $script:Fail -gt 0) { exit 1 }
exit 0
