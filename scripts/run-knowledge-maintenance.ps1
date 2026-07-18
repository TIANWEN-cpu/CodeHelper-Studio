[CmdletBinding()]
param(
  [ValidateSet('plan', 'backup', 'apply', 'verify')]
  [string]$Stage = 'plan',
  [string]$DatabasePath = (Join-Path $env:APPDATA 'CodeHelper\codehelper.db'),
  [string]$ImportBatches = 'D:\coderhelperresource\import-batches',
  [string]$OutputDirectory = '',
  [string]$RemoteStatus = '',
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$previousOutputEncoding = [Console]::OutputEncoding
$previousPythonIoEncoding = $env:PYTHONIOENCODING
[Console]::OutputEncoding = $utf8NoBom
$env:PYTHONIOENCODING = 'utf-8'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot 'output\knowledge-maintenance'
}
if (-not $RemoteStatus) {
  $RemoteStatus = Join-Path $repoRoot 'codehelper-knowledge-remote-status.json'
}
$tool = Join-Path $PSScriptRoot 'knowledge_maintenance.py'
$rules = Join-Path $PSScriptRoot 'knowledge-maintenance-rules.json'
$audit = Join-Path $OutputDirectory 'audit.json'
$plan = Join-Path $OutputDirectory 'plan.json'
$backupResult = Join-Path $OutputDirectory 'backup-result.json'
$applyResult = Join-Path $OutputDirectory 'apply-result.json'
$verifyResult = Join-Path $OutputDirectory 'verify.json'

New-Item -ItemType Directory -Force $OutputDirectory | Out-Null

function Read-MaintenanceJson {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Invoke-MaintenanceCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 wraps native stderr as ErrorRecord. Keep it
    # non-terminating long enough to capture the complete Python traceback.
    $ErrorActionPreference = 'Continue'
    $lines = (& py $tool @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $text = ($lines | ForEach-Object { [string]$_ }) -join "`n"
  if ($exitCode -ne 0) {
    throw "Knowledge maintenance command failed with exit code $exitCode`n$text"
  }
  return $text
}

function Invoke-MaintenanceJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$ResultPath
  )

  $text = Invoke-MaintenanceCommand -Arguments $Arguments
  [System.IO.File]::WriteAllText($ResultPath, $text, $utf8NoBom)
  return $text | ConvertFrom-Json
}

Push-Location $repoRoot
try {
  switch ($Stage) {
    'plan' {
      Invoke-MaintenanceCommand -Arguments @(
        'audit', '--db', $DatabasePath, '--import-batches', $ImportBatches,
        '--rules', $rules, '--output', $audit
      ) | Out-Null
      Invoke-MaintenanceCommand -Arguments @(
        'dry-run', '--db', $DatabasePath, '--audit', $audit,
        '--import-batches', $ImportBatches, '--rules', $rules,
        '--remote-status', $RemoteStatus, '--output', $plan
      ) | Out-Null
      $result = Read-MaintenanceJson -Path $plan
      $result | Select-Object plan_sha256, action_counts, deletion_reason_counts, counts_before, counts_after
    }
    'backup' {
      if (-not (Test-Path $plan)) { throw "Plan not found: $plan" }
      $backupDirectory = Join-Path (Split-Path $DatabasePath) 'backups'
      $result = Invoke-MaintenanceJson -Arguments @(
        'backup', '--db', $DatabasePath, '--plan', $plan,
        '--backup-directory', $backupDirectory
      ) -ResultPath $backupResult
      $result | Select-Object status, backup_path, manifest_path, fingerprint
    }
    'apply' {
      if (-not $ConfirmApply) {
        throw 'Apply requires the explicit -ConfirmApply switch'
      }
      if (-not (Test-Path $plan)) { throw "Plan not found: $plan" }
      if (-not (Test-Path $backupResult)) { throw "Backup result not found: $backupResult" }
      $backup = Read-MaintenanceJson -Path $backupResult
      $result = Invoke-MaintenanceJson -Arguments @(
        'apply', '--db', $DatabasePath, '--plan', $plan,
        '--backup-manifest', ([string]$backup.manifest_path), '--yes'
      ) -ResultPath $applyResult
      $result | Select-Object status, documents, chunks, metadata_rows, link_audit_rows, fingerprint
    }
    'verify' {
      if (-not (Test-Path $plan)) { throw "Plan not found: $plan" }
      Invoke-MaintenanceCommand -Arguments @(
        'verify', '--db', $DatabasePath, '--plan', $plan, '--output', $verifyResult
      ) | Out-Null
      Read-MaintenanceJson -Path $verifyResult
    }
  }
} finally {
  Pop-Location
  [Console]::OutputEncoding = $previousOutputEncoding
  $env:PYTHONIOENCODING = $previousPythonIoEncoding
}
