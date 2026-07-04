# Start Expo with .env.staging (Kwaapo checkout smoke tests - NOT production).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root ".env.staging"
if (-not (Test-Path $envFile)) {
  Write-Host "[STAGING] Missing .env.staging - copy .env.staging.example and fill EXPO_PUBLIC_SUPABASE_ANON_KEY."
  exit 1
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($name) {
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}

# Prevent Expo from loading production `.env` over staging shell env.
$env:EXPO_NO_DOTENV = "1"
$env:NODE_ENV = "development"

$required = @{
  "EXPO_PUBLIC_STAGING" = "1"
  "EXPO_PUBLIC_SUPABASE_URL" = "xwezgyelwovczuqyyqwu"
  "EXPO_PUBLIC_KWAAPO_WORKER_BASE" = "kwaapo-staging-checkout.n-vandullemen.workers.dev"
}

foreach ($key in $required.Keys) {
  $val = [Environment]::GetEnvironmentVariable($key, "Process")
  if (-not $val) {
    Write-Host ("[STAGING] FAIL: " + $key + " is not set in .env.staging")
    exit 1
  }
  $expectedFragment = $required[$key]
  if ($expectedFragment -ne "1" -and $val -notmatch [regex]::Escape($expectedFragment)) {
    Write-Host ("[STAGING] FAIL: " + $key + " does not match staging target (expected fragment: " + $expectedFragment + ")")
    exit 1
  }
}

if ($env:EXPO_PUBLIC_SUPABASE_URL -match "mvngamvkdtcprgiizcvk") {
  Write-Host "[STAGING] FAIL: .env.staging points at PRODUCTION Supabase."
  exit 1
}
if ($env:EXPO_PUBLIC_KWAAPO_WORKER_BASE -match "wild-mountain-072a") {
  Write-Host "[STAGING] FAIL: .env.staging points at PRODUCTION Worker."
  exit 1
}

$supabaseHost = $env:EXPO_PUBLIC_SUPABASE_URL -replace "^https?://", "" -replace "/$", ""

Write-Host "[STAGING] EXPO_NO_DOTENV=1 (production .env ignored)"
Write-Host "[STAGING] Preflight OK"
Write-Host ("[STAGING] EXPO_PUBLIC_STAGING=" + $env:EXPO_PUBLIC_STAGING)
Write-Host ("[STAGING] Supabase host: " + $supabaseHost)
Write-Host ("[STAGING] Worker base: " + $env:EXPO_PUBLIC_KWAAPO_WORKER_BASE)
Write-Host "[STAGING] In Metro logs: look for [Supabase env], [Supabase] URL used, [Stripe] POST"
Write-Host ""

$candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
  $_.IPAddress -notlike "127.*" -and
  $_.IPAddress -notlike "169.254.*" -and
  $_.PrefixOrigin -ne "WellKnown"
}

$lan = $candidates | Where-Object {
  $_.IPAddress -match "^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)"
} | Sort-Object InterfaceMetric | Select-Object -First 1

$lanIp = $null
if ($lan) {
  $lanIp = $lan.IPAddress
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanIp
  $env:EXPO_PACKAGER_HOSTNAME = $lanIp
  Write-Host ("[STAGING] Phone / Expo Go host: " + $lanIp)
}

node scripts/staging-env-preflight.mjs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$cli = Join-Path $root "node_modules\expo\bin\cli"
if (-not (Test-Path $cli)) {
  Write-Host "[STAGING] node_modules missing. Run: npm install"
  exit 1
}

$port = 8081
try {
  $portInUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($portInUse) {
    $port = 8082
  }
} catch {
  # Ignore; default 8081
}
Write-Host ("[STAGING] Metro port: " + $port)
if ($lanIp) {
  Write-Host ("[STAGING] Expo Go URL: exp://" + $lanIp + ":" + $port)
  Write-Host ("[STAGING] Mobile browser: http://" + $lanIp + ":" + $port)
} else {
  Write-Host "[STAGING] Expo Go URL: check terminal QR (no LAN IP detected)"
}

& node $cli start --lan --clear --port $port
