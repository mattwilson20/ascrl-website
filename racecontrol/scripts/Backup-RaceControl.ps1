param([switch]$Setup, [switch]$UpdateDatabasePassword, [switch]$Decrypt, [string]$BackupFile, [string]$RecoveryDirectory)
$ErrorActionPreference = 'Stop'
$rcApp = Split-Path $PSScriptRoot -Parent
$rcWorkspace = Split-Path $rcApp -Parent
$rcPrivate = Join-Path $env:USERPROFILE '.ascrl-backup'
$rcCredentialsPath = Join-Path $rcPrivate 'credentials.xml'
$rcOutput = Join-Path $env:OneDrive 'Documents\ASCRL Race Control Backups'
$rcNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
function Reveal-ForProcess([Security.SecureString]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ($UpdateDatabasePassword) {
  $rcSavedCredentials = Import-Clixml -LiteralPath $rcCredentialsPath
  Write-Host 'Use the database password saved when ASCRL Race Control was created in Supabase.'
  Write-Host 'Your backup recovery passphrase will stay unchanged.'
  $rcSavedCredentials.DatabasePassword = Read-Host 'Supabase project DATABASE password' -AsSecureString
  if ($rcSavedCredentials.DatabasePassword.Length -eq 0) { throw 'Database password is required' }
  $rcSavedCredentials | Export-Clixml -LiteralPath $rcCredentialsPath
}
if ($Setup) {
  Write-Host 'ASCRL encrypted backup setup. Enter secrets here, never in chat.'
  Write-Host 'The database password is saved with Windows user encryption on this PC.'
  Write-Host 'Save the recovery passphrase in your password manager: it is required on another computer.'
  $rcDatabasePassword = Read-Host 'Existing Supabase DATABASE password' -AsSecureString
  $rcRecoveryPassword = Read-Host 'New backup recovery passphrase (16+ characters)' -AsSecureString
  $rcRecoveryConfirm = Read-Host 'Repeat backup recovery passphrase' -AsSecureString
  if ($rcDatabasePassword.Length -eq 0 -or $rcRecoveryPassword.Length -lt 16) { throw 'Password missing or recovery passphrase too short' }
  if ((Reveal-ForProcess $rcRecoveryPassword) -cne (Reveal-ForProcess $rcRecoveryConfirm)) { throw 'Recovery passphrases did not match' }
  [IO.Directory]::CreateDirectory($rcPrivate) | Out-Null
  $rcIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $rcPrivate /inheritance:r /grant:r "${rcIdentity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict private credential directory' }
  [pscustomobject]@{ DatabasePassword=$rcDatabasePassword; RecoveryPassphrase=$rcRecoveryPassword } | Export-Clixml -LiteralPath $rcCredentialsPath
}
try {
  if ($Decrypt -and !(Test-Path -LiteralPath $rcCredentialsPath)) {
    $rcRecoverySecret = Read-Host 'Backup recovery passphrase' -AsSecureString
    $env:RC_BACKUP_PASSPHRASE = Reveal-ForProcess $rcRecoverySecret
  } else {
    $rcCredentials = Import-Clixml -LiteralPath $rcCredentialsPath
    $env:RC_BACKUP_PASSPHRASE = Reveal-ForProcess $rcCredentials.RecoveryPassphrase
  }
  $env:RC_POSTGRES_BIN = Join-Path $rcWorkspace '.backup-tools\pgsql\bin'
  if ($Decrypt) {
    if (!$BackupFile -or !$RecoveryDirectory) { throw 'Specify BackupFile and RecoveryDirectory' }
    $env:RC_BACKUP_OUTPUT = $RecoveryDirectory
    & $rcNode (Join-Path $PSScriptRoot 'backup.mjs') decrypt $BackupFile
  } else {
    $env:PGPASSWORD = Reveal-ForProcess $rcCredentials.DatabasePassword
    $env:PGHOST = 'aws-0-us-east-1.pooler.supabase.com'
    $env:PGPORT = '5432'
    $env:PGUSER = 'postgres.ixchlspfwllsmwjxqipr'
    $env:PGDATABASE = 'postgres'
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = Join-Path $rcWorkspace '.backup-tools\supabase-ca.crt'
    $env:PGCONNECT_TIMEOUT = '20'
    $env:RC_BACKUP_OUTPUT = $rcOutput
    & $rcNode (Join-Path $PSScriptRoot 'backup.mjs') backup
  }
  if ($LASTEXITCODE -ne 0) { throw 'Backup operation failed; no successful backup recorded' }
} finally {
  'PGPASSWORD','RC_BACKUP_PASSPHRASE' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
