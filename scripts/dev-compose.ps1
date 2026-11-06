<#
.SYNOPSIS
  docker compose on the local dev stack (project mra-dev, deploy\docker-compose.yml + docker-compose.dev.yml).

.DESCRIPTION
  .\scripts\dev-compose.ps1 ps
  .\scripts\dev-compose.ps1 logs -f agents-api-devnet
  .\scripts\dev-compose.ps1 restart issuer-devnet
  .\scripts\dev-compose.ps1 exec anvil cast block latest --rpc-url http://127.0.0.1:8545
#>
# No param() block on purpose: every argument (including -f, -T, --tail) goes to docker compose untouched.
# Copied before dot-sourcing the helpers, which would otherwise reset the automatic $args.
$argv = @($args)
. (Join-Path $PSScriptRoot 'lib\DevCommon.ps1')
if ($argv.Count -eq 0) { Get-Help $PSCommandPath -Detailed; exit 2 }
& docker @ComposeBase @argv
exit $LASTEXITCODE
