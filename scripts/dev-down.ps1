<#
.SYNOPSIS
  Stop the local Docker stack (docs/LOCAL.md, Path A). Windows (Docker Desktop + WSL2).

.DESCRIPTION
  .\scripts\dev-down.ps1          stop and remove the containers. Keeps the volumes: chain, manifest, agents DB.
  .\scripts\dev-down.ps1 -Reset   ALSO delete this stack's volumes (project mra-dev only): the next dev-up
                                  redeploys and reseeds a fresh chain. Env files and built images are always kept.
#>
param([switch]$Reset)
$ErrorActionPreference = 'Continue' # see dev-up.ps1: failures are checked through $LASTEXITCODE
. (Join-Path $PSScriptRoot 'lib\DevCommon.ps1')

if (-not (Test-Command docker)) { Write-Err 'docker not found'; exit 1 }
if ($Reset) {
  Write-Warn2 '-Reset: deleting the mra-dev volumes (anvil state, devnet manifest, agents DB)'
  Invoke-Dc down -v --remove-orphans
  Write-Ok 'stopped and wiped. .\scripts\dev-up.ps1 starts a fresh chain.'
} else {
  Invoke-Dc down --remove-orphans
  Write-Ok 'stopped. The chain and the DB are kept on volumes; .\scripts\dev-up.ps1 -NoBuild brings them back.'
}
Write-Host 'Images stay cached. To free their disk space:'
Write-Host '  docker image rm mra-app:dev mra-agents:local mra-devnet-tools:local mra-issuer:local mra-demo-portal:local'
Write-Host '  docker builder prune'
