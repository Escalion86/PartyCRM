$ErrorActionPreference = 'Stop'
$resultPath = Join-Path $PSScriptRoot 'mongo-replica-service-result.json'
$configPath = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg'
try {
  $configText = Get-Content -LiteralPath $configPath -Raw
  if ($configText -match '(?m)^replication:') { throw 'An active replication section already exists.' }
  $backupPath = $configPath + '.before-party-demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak'
  Copy-Item -LiteralPath $configPath -Destination $backupPath
  $updatedText = $configText + "`r`nreplication:`r`n  replSetName: localrs`r`n"
  [System.IO.File]::WriteAllText($configPath, $updatedText, [System.Text.UTF8Encoding]::new($false))
  try {
    Restart-Service -Name MongoDB
    (Get-Service MongoDB).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  } catch {
    Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
    Start-Service MongoDB -ErrorAction SilentlyContinue
    throw
  }
  @{ success = $true; backupPath = $backupPath; status = (Get-Service MongoDB).Status.ToString() } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
} catch {
  @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
  exit 1
}
