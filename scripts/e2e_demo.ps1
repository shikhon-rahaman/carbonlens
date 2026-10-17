$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$contracts = Join-Path $root "contracts"
$apiDirectory = Join-Path $root "api"
$webDirectory = Join-Path $root "web"
$metadataPath = Join-Path $root "shared\contract.json"
$metadataDirectory = Split-Path $metadataPath -Parent
$runDirectory = Join-Path $env:TEMP ("carbonlens-e2e-" + [guid]::NewGuid().ToString("N"))
$databasePath = Join-Path $runDirectory "carbonlens-e2e.db"
$apiLog = Join-Path $runDirectory "api.log"
$webLog = Join-Path $runDirectory "web.log"
$chainLog = Join-Path $runDirectory "chain.log"
$chainErrorLog = Join-Path $runDirectory "chain-error.log"
$apiErrorLog = Join-Path $runDirectory "api-error.log"
$webErrorLog = Join-Path $runDirectory "web-error.log"
$originalMetadata = $null
$hadOriginalMetadata = Test-Path -LiteralPath $metadataPath
$startedProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$results = [System.Collections.Generic.List[object]]::new()
$environmentNames = @(
  "ENV", "ALLOWED_ORIGINS", "DATABASE_URL", "TURNSTILE_DEV_BYPASS",
  "TURNSTILE_SECRET", "CACHED_DEMO_MODE", "PINATA_JWT", "LLM_PROVIDER",
  "LLM_API_KEY", "RPC_URL", "CHAIN_ID",
  "CONTRACT_ADDRESS", "VERIFIER_PRIVATE_KEY", "VERIFIER_ADDRESS", "LOCAL_RPC_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_CACHED_DEMO_MODE", "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "E2E_BASE_URL"
)
$originalEnvironment = @{}
foreach ($name in $environmentNames) {
  $item = Get-Item "Env:$name" -ErrorAction SilentlyContinue
  $originalEnvironment[$name] = if ($item) { $item.Value } else { $null }
}

function Add-Result([string]$name, [string]$expected, [string]$actual, [bool]$passed) {
  $script:results.Add([pscustomobject]@{
    Check = $name
    Expected = $expected
    Actual = $actual
    Result = if ($passed) { "PASS" } else { "FAIL" }
  })
}

function Wait-ForPort([int]$port, [System.Diagnostics.Process]$process, [string]$label) {
  $deadline = [datetime]::UtcNow.AddSeconds(60)
  while ([datetime]::UtcNow -lt $deadline) {
    if ($process.HasExited) {
      throw "$label exited before port $port became ready. See $runDirectory."
    }
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($listener) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "$label did not open port $port within 60 seconds."
}

function Wait-ForHttp([string]$uri, [System.Diagnostics.Process]$process, [string]$label) {
  $deadline = [datetime]::UtcNow.AddSeconds(60)
  while ([datetime]::UtcNow -lt $deadline) {
    if ($process.HasExited) {
      throw "$label exited before $uri became ready. See $runDirectory."
    }
    try {
      $null = Invoke-RestMethod -Uri $uri -TimeoutSec 2
      return
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  throw "$label did not respond at $uri within 60 seconds."
}

function Get-RpcResult([string]$method, [object[]]$parameters) {
  $body = @{
    jsonrpc = "2.0"
    method = $method
    params = $parameters
    id = 1
  } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post `
    -ContentType "application/json" -Body $body -TimeoutSec 5
  if ($response.error) { throw "Local chain RPC call failed." }
  return $response.result
}

function Submit-Scenario([string]$name, [object]$polygon, [string]$scenario) {
  $payload = @{
    name = $name
    claimed_hectares = 40
    geojson = $polygon
    turnstile_token = "local-development-bypass"
  }
  if ($scenario) { $payload.demo_scenario = $scenario }
  $body = $payload | ConvertTo-Json -Depth 80 -Compress
  return Invoke-RestMethod -Uri "http://127.0.0.1:8000/verify" -Method Post `
    -Headers @{ Origin = "http://127.0.0.1:3000" } `
    -ContentType "application/json" -Body $body -TimeoutSec 90
}

function Assert-NoChainSpend([string]$name, [scriptblock]$check) {
  $nonceBefore = Get-RpcResult "eth_getTransactionCount" @($env:VERIFIER_ADDRESS, "latest")
  $balanceBefore = Get-RpcResult "eth_getBalance" @($env:VERIFIER_ADDRESS, "latest")
  $response = & $check
  $nonceAfter = Get-RpcResult "eth_getTransactionCount" @($env:VERIFIER_ADDRESS, "latest")
  $balanceAfter = Get-RpcResult "eth_getBalance" @($env:VERIFIER_ADDRESS, "latest")
  $noSpend = $nonceBefore -eq $nonceAfter -and $balanceBefore -eq $balanceAfter
  return [pscustomobject]@{ Response = $response; NoSpend = $noSpend }
}

try {
  New-Item -ItemType Directory -Path $runDirectory | Out-Null
  if ($hadOriginalMetadata) {
    $originalMetadata = [System.IO.File]::ReadAllBytes($metadataPath)
  }

  foreach ($port in @(3000, 8000, 8545)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      throw "Port $port is already in use. Stop the existing service before running this demo."
    }
  }

  $node = (Get-Command node -ErrorAction Stop).Source
  $python = (Get-Command python -ErrorAction Stop).Source
  $hardhatCli = Join-Path $contracts "node_modules\hardhat\internal\cli\cli.js"
  $nextCli = Join-Path $webDirectory "node_modules\next\dist\bin\next"
  if (-not (Test-Path -LiteralPath $hardhatCli) -or -not (Test-Path -LiteralPath $nextCli)) {
    throw "Install the contracts and web dependencies before running this demo."
  }

  $env:LOCAL_RPC_URL = "http://127.0.0.1:8545"
  $chainProcess = Start-Process -FilePath $node `
    -ArgumentList @($hardhatCli, "node", "--hostname", "127.0.0.1", "--port", "8545") `
    -WorkingDirectory $contracts -PassThru -NoNewWindow `
    -RedirectStandardOutput $chainLog -RedirectStandardError $chainErrorLog
  $startedProcesses.Add($chainProcess)
  Wait-ForPort 8545 $chainProcess "Hardhat node"

  Push-Location $contracts
  try {
    npm.cmd run deploy:local
    if ($LASTEXITCODE -ne 0) { throw "Local contract deployment failed." }
  } finally {
    Pop-Location
  }

  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  if ([int]$metadata.chainId -ne 31337) { throw "Local deployment metadata has the wrong chain ID." }

  $env:ENV = "development"
  $env:ALLOWED_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
  $env:DATABASE_URL = "sqlite:///" + $databasePath.Replace("\", "/")
  $env:TURNSTILE_SECRET = ""
  $env:TURNSTILE_DEV_BYPASS = "true"
  $env:CACHED_DEMO_MODE = "true"
  $env:PINATA_JWT = ""
  $env:LLM_PROVIDER = "none"
  $env:LLM_API_KEY = ""
  $env:RPC_URL = "http://127.0.0.1:8545"
  $env:CHAIN_ID = "31337"
  $env:CONTRACT_ADDRESS = $metadata.address
  $env:VERIFIER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  $env:VERIFIER_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
  $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
  $env:NEXT_PUBLIC_CACHED_DEMO_MODE = "true"
  $env:NEXT_PUBLIC_TURNSTILE_SITE_KEY = ""
  $env:E2E_BASE_URL = "http://127.0.0.1:3000"

  $apiProcess = Start-Process -FilePath $python `
    -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory $apiDirectory -PassThru -NoNewWindow `
    -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog
  $startedProcesses.Add($apiProcess)
  Wait-ForHttp "http://127.0.0.1:8000/health" $apiProcess "CarbonLens API"

  Push-Location $webDirectory
  try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Web production build failed." }
  } finally {
    Pop-Location
  }

  $webProcess = Start-Process -FilePath $node -ArgumentList @(
    $nextCli, "start", "--hostname", "127.0.0.1", "--port", "3000"
  ) -WorkingDirectory $webDirectory -PassThru -NoNewWindow `
    -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog
  $startedProcesses.Add($webProcess)
  Wait-ForHttp "http://127.0.0.1:3000/verify" $webProcess "CarbonLens web app"

  Push-Location $webDirectory
  try {
    npx.cmd playwright test tests/e2e-smoke.spec.ts
    $smokeExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  Add-Result "Playwright desktop + mobile flow" "2 viewport passes" "$smokeExit" ($smokeExit -eq 0)

  $healthy = Get-Content -LiteralPath (Join-Path $root "data\forest_healthy.geojson") -Raw |
    ConvertFrom-Json
  $deforested = Get-Content -LiteralPath (Join-Path $root "data\forest_deforested.geojson") -Raw |
    ConvertFrom-Json
  $overlap = Get-Content -LiteralPath (Join-Path $root "data\forest_overlap.geojson") -Raw |
    ConvertFrom-Json

  $healthyResponse = $null
  try {
    $healthyResponse = Submit-Scenario "E2E healthy forest" $healthy $null
    $receipt = Get-RpcResult "eth_getTransactionReceipt" @($healthyResponse.tx_hash)
    $passed = $healthyResponse.status -eq "verified" -and
      $healthyResponse.data_source -eq "cached" -and
      $healthyResponse.tx_hash -match "^0x[0-9a-fA-F]{64}$" -and
      $receipt.status -eq "0x1"
    Add-Result "Healthy -> verified + mined tx" "verified, cached, successful receipt" `
      "$($healthyResponse.status), $($healthyResponse.tx_hash), receipt $($receipt.status)" $passed
  } catch {
    Add-Result "Healthy -> verified + mined tx" "verified + successful receipt" $_.Exception.Message $false
  }

  $before = Get-RpcResult "eth_getTransactionCount" @($env:VERIFIER_ADDRESS, "latest")
  try {
    $response = Submit-Scenario "E2E deforested sample" $deforested "deforested"
    $after = Get-RpcResult "eth_getTransactionCount" @($env:VERIFIER_ADDRESS, "latest")
    $passed = $response.status -eq "rejected" -and $null -eq $response.tx_hash -and $before -eq $after
    Add-Result "Deforested -> rejected" "rejected, no transaction" `
      "$($response.status), tx=$($response.tx_hash), nonce $before->$after" $passed
  } catch {
    Add-Result "Deforested -> rejected" "rejected, no transaction" $_.Exception.Message $false
  }

  try {
    $checked = Assert-NoChainSpend "overlap" {
      Submit-Scenario "E2E overlapping sample" $overlap $null
    }
    $passed = $checked.Response.status -eq "duplicate" -and $checked.NoSpend
    Add-Result "Overlapping -> duplicate, no gas" "duplicate; balance and nonce unchanged" `
      "$($checked.Response.status), no-spend=$($checked.NoSpend)" $passed
  } catch {
    Add-Result "Overlapping -> duplicate, no gas" "duplicate; no gas spent" $_.Exception.Message $false
  }

  $shifted = $healthy | ConvertTo-Json -Depth 80 -Compress | ConvertFrom-Json
  foreach ($point in $shifted.geometry.coordinates[0]) {
    $point[0] = [math]::Round(([double]$point[0] + 0.0001), 6)
    $point[1] = [math]::Round(([double]$point[1] + 0.0001), 6)
  }
  try {
    $checked = Assert-NoChainSpend "shifted overlap" {
      Submit-Scenario "E2E shifted healthy sample" $shifted $null
    }
    $passed = $checked.Response.status -eq "duplicate" -and $checked.NoSpend
    Add-Result "Shifted overlap -> duplicate, no gas" "duplicate via off-chain overlap" `
      "$($checked.Response.status), no-spend=$($checked.NoSpend)" $passed
  } catch {
    Add-Result "Shifted overlap -> duplicate, no gas" "duplicate via off-chain overlap" $_.Exception.Message $false
  }

  if ($healthyResponse) {
    try {
      $checked = Assert-NoChainSpend "idempotent resubmit" {
        Submit-Scenario "E2E healthy forest" $healthy $null
      }
      $passed = $checked.Response.project_id -eq $healthyResponse.project_id -and
        $checked.Response.tx_hash -eq $healthyResponse.tx_hash -and
        $checked.Response.status -eq "verified" -and $checked.NoSpend
      Add-Result "Identical resubmit -> idempotent" "existing project and tx; no gas" `
        "$($checked.Response.status), project=$($checked.Response.project_id), no-spend=$($checked.NoSpend)" $passed
    } catch {
      Add-Result "Identical resubmit -> idempotent" "existing project; no gas spent" $_.Exception.Message $false
    }
  } else {
    Add-Result "Identical resubmit -> idempotent" "existing project; no gas spent" "Skipped: healthy request failed." $false
  }

  Write-Host "`nEnd-to-end demo results"
  foreach ($result in $results) {
    Write-Host ("{0}: {1} | expected={2} | actual={3}" -f `
      $result.Check, $result.Result, $result.Expected, $result.Actual)
  }
  if (@($results | Where-Object Result -eq "FAIL").Count -gt 0) {
    throw "One or more end-to-end checks failed."
  }
} catch {
  Write-Error $_
  if (Test-Path -LiteralPath $apiLog) {
    Write-Host "API log (secrets are not printed by the application): $apiLog"
    Get-Content -LiteralPath $apiLog -Tail 30
  }
  if (Test-Path -LiteralPath $chainLog) {
    Write-Host "Local chain log: $chainLog"
    Get-Content -LiteralPath $chainLog -Tail 20
  }
  exit 1
} finally {
  foreach ($process in $startedProcesses) {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    }
  }
  foreach ($port in @(3000, 8000, 8545)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($listener -and $listener.OwningProcess -in @($startedProcesses | ForEach-Object Id)) {
      Stop-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    }
  }
  if ($hadOriginalMetadata -and $null -ne $originalMetadata) {
    [System.IO.File]::WriteAllBytes($metadataPath, $originalMetadata)
  } elseif (Test-Path -LiteralPath $metadataPath) {
    Remove-Item -LiteralPath $metadataPath
    if ((Test-Path -LiteralPath $metadataDirectory) -and
      -not (Get-ChildItem -LiteralPath $metadataDirectory -Force | Select-Object -First 1)) {
      Remove-Item -LiteralPath $metadataDirectory
    }
  }
  foreach ($name in $environmentNames) {
    if ($null -eq $originalEnvironment[$name]) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$name" $originalEnvironment[$name]
    }
  }
  if (Test-Path -LiteralPath $runDirectory) {
    Remove-Item -LiteralPath $runDirectory -Recurse -Force
  }
}
