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

Write-Host "Expo LAN host: $ipAddress"
Write-Host "Metro status URL: http://${ipAddress}:8081/status"
Write-Host "Backend API URL should be: http://${ipAddress}:3000/api/v1"

pnpm exec expo start --host lan
