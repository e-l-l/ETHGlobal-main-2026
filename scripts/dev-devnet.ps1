<#
.SYNOPSIS
  Admin for the LOCAL Docker devnet (docs/LOCAL.md). The same commands as deploy/devnet.sh on EC2.

.DESCRIPTION
  .\scripts\dev-devnet.ps1 status                chain head, chain time vs wall clock, containers
  .\scripts\dev-devnet.ps1 warp 31d              evm_increaseTime + mine (units d h m s; plain number = seconds)
  .\scripts\dev-devnet.ps1 mine [n]              mine n blocks (default 1)
  .\scripts\dev-devnet.ps1 scene [args]          the default scene; a dry run unless --execute, e.g.
                                                   scene --execute               every pending step
                                                   scene --execute --step sell   one step
                                                   scene --execute --llm         the Risk agent asks your LLM
  .\scripts\dev-devnet.ps1 reset                 soft: pool price + caps back, a new merchant
  .\scripts\dev-devnet.ps1 manifest              the devnet's contract addresses (devnet.json)
  .\scripts\dev-devnet.ps1 rpc <method> [args]   raw JSON-RPC through cast, e.g. rpc anvil_nodeInfo
  Full wipe: .\scripts\dev-down.ps1 -Reset; .\scripts\dev-up.ps1 (the deploy is deterministic: same addresses).
#>
# No param() block: arguments such as --execute must reach the scene script untouched.
$ErrorActionPreference = 'Continue' # see dev-up.ps1
$argv = @($args) # copied before dot-sourcing the helpers, which would otherwise reset the automatic $args
. (Join-Path $PSScriptRoot 'lib\DevCommon.ps1')

$AnvilRpc = 'http://127.0.0.1:8545' # inside the anvil container
$Scene = '/work/agents/scripts/demo_default_scene.py'
$Py = '/work/agents/.venv/bin/python'

function Invoke-CastIn { $a = @('exec', '-T', 'anvil', 'cast') + $args + @('--rpc-url', $AnvilRpc); Invoke-DcSoft @a }
function Invoke-CastRpc { $a = @('exec', '-T', 'anvil', 'cast', 'rpc', '--rpc-url', $AnvilRpc) + $args; Invoke-DcSoft @a }
function ConvertTo-Seconds([string]$v) {
  if ($v -notmatch '^(\d+)([dhms]?)$') { Write-Err "bad duration '$v' (use e.g. 31d, 2h, 90m, 3600)"; exit 2 }
  $n = [int64]$Matches[1]
  switch ($Matches[2]) { 'd' { $n * 86400 } 'h' { $n * 3600 } 'm' { $n * 60 } default { $n } }
}
function Get-ChainTime {
  $t = [int64]("$(Invoke-CastIn block latest --field timestamp)".Trim())
  '{0} ({1:yyyy-MM-dd HH:mm:ss} UTC)' -f $t, ([DateTimeOffset]::FromUnixTimeSeconds($t).UtcDateTime)
}

$cmd = 'status'; $rest = @()
if ($argv.Count -ge 1) { $cmd = "$($argv[0])"; if ($argv.Count -gt 1) { $rest = @($argv[1..($argv.Count - 1)]) } }
switch ($cmd) {
  'status' {
    Invoke-DcSoft ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}'
    Write-Host ''
    Write-Host "block      $(Invoke-CastIn block-number)"
    Write-Host "chain time $(Get-ChainTime)"
    $now = [DateTimeOffset]::UtcNow
    Write-Host ('wall clock {0} ({1:yyyy-MM-dd HH:mm:ss} UTC)' -f $now.ToUnixTimeSeconds(), $now.UtcDateTime)
  }
  'warp' {
    if ($rest.Count -lt 1) { Write-Err 'usage: dev-devnet.ps1 warp <duration>  (e.g. 31d)'; exit 2 }
    $s = ConvertTo-Seconds $rest[0]; $before = Get-ChainTime
    $null = Invoke-CastRpc evm_increaseTime "$s"
    $null = Invoke-CastRpc evm_mine
    Write-Ok "warped +${s}s: $before -> $(Get-ChainTime)"
  }
  'mine' {
    $n = '1'; if ($rest.Count -ge 1) { $n = "$($rest[0])" }
    if ($n -notmatch '^\d+$') { Write-Err 'usage: dev-devnet.ps1 mine [n]'; exit 2 }
    $null = Invoke-CastRpc anvil_mine $n
    Write-Ok "mined $n block(s): head $(Invoke-CastIn block-number)"
  }
  'scene' {
    $a = @('run', '--rm', '--no-deps', '--entrypoint', $Py, 'devnet-deployer', $Scene) + $rest
    Invoke-DcSoft @a
    exit $LASTEXITCODE
  }
  'reset' {
    if ($rest -contains '--hard') { Write-Err 'full wipe: .\scripts\dev-down.ps1 -Reset; .\scripts\dev-up.ps1'; exit 2 }
    Invoke-DcSoft run --rm --no-deps --entrypoint $Py devnet-deployer $Scene --execute --reset
    exit $LASTEXITCODE
  }
  'manifest' { Invoke-DcSoft run --rm --no-deps -T --entrypoint cat devnet-deployer /work/agents/deployments/devnet/devnet.json }
  'rpc' {
    if ($rest.Count -lt 1) { Write-Err 'usage: dev-devnet.ps1 rpc <method> [params...]'; exit 2 }
    Invoke-CastRpc @rest; Write-Host ''
  }
  { $_ -in 'help', '-h', '--help' } { Get-Help $PSCommandPath -Detailed }
  default { Write-Err "unknown command: $cmd"; Get-Help $PSCommandPath -Detailed; exit 2 }
}
