# Zet automatisch je LAN-IP zodat de QR niet exp://127.0.0.1 wordt (fout op een echte telefoon).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
  $_.IPAddress -notlike "127.*" -and
  $_.IPAddress -notlike "169.254.*" -and
  $_.PrefixOrigin -ne "WellKnown"
}

$lan = $candidates | Where-Object {
  $_.IPAddress -match "^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)"
} | Sort-Object InterfaceMetric | Select-Object -First 1

if (-not $lan) {
  $lan = $candidates | Sort-Object InterfaceMetric | Select-Object -First 1
}

if (-not $lan) {
  Write-Host "Kon geen LAN IPv4 vinden. Voer je IPv4 handmatig in (zoals ipconfig):"
  $ip = Read-Host "IPv4"
} else {
  $ip = $lan.IPAddress
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip
$env:EXPO_PACKAGER_HOSTNAME = $ip

Write-Host ""
Write-Host ">>> Metro host voor je telefoon: $ip"
Write-Host ">>> Gebruik in Expo Go (als QR nog 127.0.0.1 toont): exp://${ip}:<poort uit terminal>"
Write-Host ""

$cli = Join-Path $root "node_modules\expo\bin\cli"
if (-not (Test-Path $cli)) {
  Write-Host "node_modules ontbreekt. Voer eerst uit: npm.cmd install"
  exit 1
}

& node $cli start --lan --clear