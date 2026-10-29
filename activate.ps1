# Active l'environnement local du projet (Node portable dans .env\).
# Usage :  . .\activate.ps1      (le point au début est obligatoire)
$root = $PSScriptRoot
$envDir = Join-Path $root '.env'
$env:AGRICOMPTE_ENV = $envDir
$env:PATH = "$(Join-Path $envDir 'node');$(Join-Path $envDir 'npm-global');$env:PATH"
$env:npm_config_cache = Join-Path $envDir 'npm-cache'
$env:npm_config_prefix = Join-Path $envDir 'npm-global'
$env:EXPO_NO_TELEMETRY = '1'
function global:deactivate {
  $envDir = $env:AGRICOMPTE_ENV
  $env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike "$envDir*" }) -join ';'
  Remove-Item Env:npm_config_cache, Env:npm_config_prefix, Env:AGRICOMPTE_ENV, Env:EXPO_NO_TELEMETRY -ErrorAction SilentlyContinue
  Remove-Item Function:\deactivate
}
Write-Host "AgriCompte env actif - node $(node --version)" -ForegroundColor Green
