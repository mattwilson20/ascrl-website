$ErrorActionPreference='Stop'
$rcLog=Join-Path $env:USERPROFILE '.ascrl-backup\last-scheduled-run.log'
try {
  & (Join-Path $PSScriptRoot 'Backup-RaceControl.ps1') *> $rcLog
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  exit 0
} catch {
  # Backup scripts redact credentials before reporting errors.
  $_.Exception.Message | Add-Content -LiteralPath $rcLog
  exit 1
}
