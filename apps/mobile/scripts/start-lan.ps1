$ErrorActionPreference = "Stop"

$configuration = Get-NetIPConfiguration |
  Where-Object {
    $_.IPv4DefaultGateway -ne $null -and
    $_.NetAdapter.Status -eq "Up" -and
    $_.IPv4Address.IPAddress
  } |
  Select-Object -First 1

if (-not $configuration) {
  throw "Could not find an active network adapter with an IPv4 gateway."
}

$ipAddress = $configuration.IPv4Address.IPAddress
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ipAddress
$env:EXPO_PUBLIC_API_URL = "http://${ipAddress}:3000/api/v1"

Write-Host "Expo LAN host: $ipAddress"
Write-Host "Metro status URL: http://${ipAddress}:8081/status"
Write-Host "Backend API URL: $env:EXPO_PUBLIC_API_URL"
Write-Host "Phone check:     http://${ipAddress}:3000/api/v1/health"

# EXPO_PUBLIC_* values are inlined into the bundle when it is built, so a bundle
# cached from a previous network still points at that network's IP. Forwarding
# extra arguments lets `pnpm mobile:start -- --clear` rebuild from scratch.
pnpm exec expo start --host lan @args
