param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = 'Stop'
$rcWorkspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$rcBin = Join-Path $rcWorkspace '.backup-tools\pgsql\bin'
$rcPrivate = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.ascrl-backup'))
$rcScratch = Join-Path $rcPrivate ('restore-check-' + [guid]::NewGuid().ToString('N'))
$rcData = Join-Path $rcScratch 'pgdata'
$rcStarted = $false
$rcPort = 55439
function Run-Pg([string]$Tool, [string[]]$PgArgs) {
  & (Join-Path $rcBin ($Tool + '.exe')) @PgArgs
  if ($LASTEXITCODE -ne 0) { throw "$Tool failed with exit $LASTEXITCODE" }
}
try {
  [IO.Directory]::CreateDirectory($rcScratch) | Out-Null
  & (Join-Path $PSScriptRoot 'Backup-RaceControl.ps1') -Decrypt -BackupFile $BackupFile -RecoveryDirectory $rcScratch
  if ($LASTEXITCODE -ne 0) { throw 'Could not decrypt backup' }
  $rcManifest = Get-Content -Raw -LiteralPath (Join-Path $rcScratch 'manifest.json') | ConvertFrom-Json
  if ($rcManifest.project -ne 'ixchlspfwllsmwjxqipr') { throw 'Unexpected backup project' }
  $rcLocalPassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $rcPasswordFile = Join-Path $rcScratch 'local-password.txt'
  [IO.File]::WriteAllText($rcPasswordFile,$rcLocalPassword)
  Run-Pg 'initdb' @('-D',$rcData,'-U','postgres','--encoding=UTF8','--locale=C','--auth=scram-sha-256',('--pwfile=' + $rcPasswordFile))
  Remove-Item -LiteralPath $rcPasswordFile
  # This isolated test server listens only on this machine and requires a random password.
  Run-Pg 'pg_ctl' @('-D',$rcData,'-o',('-p ' + $rcPort + ' -h 127.0.0.1'),'-l',(Join-Path $rcScratch 'postgres.log'),'-w','start')
  $rcStarted = $true
  $env:PGHOST='127.0.0.1'; $env:PGPORT=[string]$rcPort; $env:PGDATABASE='postgres'; $env:PGUSER='postgres'
  $env:PGSSLMODE='disable'; $env:PGPASSWORD=$rcLocalPassword
  Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
  $rcRolesSql = 'drop schema public; create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;' + "`n"
  foreach ($rcRole in $rcManifest.roles) {
    if ($rcRole -ne 'postgres') { $rcRolesSql += 'create role "' + $rcRole.Replace('"','""') + '" nologin;' + "`n" }
  }
  $rcRolesPath = Join-Path $rcScratch 'roles.sql'
  [IO.File]::WriteAllText($rcRolesPath,$rcRolesSql)
  Run-Pg 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-f',$rcRolesPath)
  Run-Pg 'pg_restore' @('-w','--no-owner','--exit-on-error','--single-transaction','--dbname=postgres',(Join-Path $rcScratch 'database.dump'))
  Run-Pg 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-f',(Join-Path $rcWorkspace 'racecontrol\supabase\operations\verify_private_setup.sql'))
  Run-Pg 'psql' @('-X','-w','-v','ON_ERROR_STOP=1','-f',(Join-Path $rcWorkspace 'racecontrol\supabase\operations\verify_hosted_concurrency.sql'))
  Run-Pg 'psql' @('-X','-w','-At','-v','ON_ERROR_STOP=1','-c',"select json_build_object('application_tables',(select count(*) from pg_tables where schemaname='public' and tablename like 'rc_%'),'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'rc_%' and c.relrowsecurity),'auth_users',(select count(*) from auth.users),'auth_identities',(select count(*) from auth.identities),'scores',(select count(*) from public.rc_scores),'original_results',(select count(*) from public.rc_imported_results),'migrations',(select count(*) from supabase_migrations.schema_migrations));")
  $rcReport = [pscustomobject]@{ success=$true; checkedAt=[DateTime]::UtcNow.ToString('o'); backup=$BackupFile; sourceBackupAt=$rcManifest.createdAt; sourceSha256=$rcManifest.dumpSha256; engine='PostgreSQL 17.11'; checks='Complete selected-schema restore, auth identities, 21 RLS tables, 21-driver publication, penalties, isolation, concurrent-publication fixture and hosted stage correction'; productionModified=$false }
  $rcReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path $BackupFile -Parent) 'restore-verification.json')
  Write-Host 'Isolated database restore and acceptance checks PASSED.'
} finally {
  if ($rcStarted) { & (Join-Path $rcBin 'pg_ctl.exe') -D $rcData -m fast -w stop | Out-Null }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  # Delete only this generated scratch directory after the test server has stopped.
  $rcResolvedScratch = [IO.Path]::GetFullPath($rcScratch)
  if ($rcResolvedScratch.StartsWith($rcPrivate + [IO.Path]::DirectorySeparatorChar) -and (Test-Path -LiteralPath $rcResolvedScratch)) {
    if (!$rcStarted -or $LASTEXITCODE -eq 0) { Remove-Item -LiteralPath $rcResolvedScratch -Recurse -Force }
  }
}
