param()
$ErrorActionPreference='Stop'
$rcOutput=Join-Path $env:OneDrive 'Documents\ASCRL Race Control Backups'
$rcStatusPath=Join-Path $rcOutput 'latest-status.json'
if (!(Test-Path -LiteralPath $rcStatusPath)) { throw 'Create and verify the first encrypted backup before scheduling.' }
$rcStatus=Get-Content -Raw -LiteralPath $rcStatusPath | ConvertFrom-Json
if (!$rcStatus.success -or !(Test-Path -LiteralPath $rcStatus.file)) { throw 'No verified backup is available.' }
$rcShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$rcScript=Join-Path $PSScriptRoot 'Run-BackupScheduled.ps1'
$rcUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$rcAction=New-ScheduledTaskAction -Execute $rcShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $rcScript + '"') -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$rcTriggers=@((New-ScheduledTaskTrigger -Daily -At '03:00'),(New-ScheduledTaskTrigger -AtLogOn -User $rcUser))
$rcSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$rcPrincipal=New-ScheduledTaskPrincipal -UserId $rcUser -LogonType Interactive -RunLevel Limited
$rcExisting=Get-ScheduledTask -TaskName 'ASCRL Race Control encrypted backup' -ErrorAction SilentlyContinue
if ($rcExisting -and $rcExisting.Actions.Arguments -notmatch '(Backup-RaceControl|Run-BackupScheduled)\.ps1') { throw 'Existing task has an unexpected action; inspect it before replacing.' }
Register-ScheduledTask -TaskName 'ASCRL Race Control encrypted backup' -Description 'Encrypted Supabase logical export to OneDrive at 3 AM and sign-in. Requires this Windows account to be signed in; missed runs start when available.' -Action $rcAction -Trigger $rcTriggers -Settings $rcSettings -Principal $rcPrincipal -Force | Select-Object TaskName,State
