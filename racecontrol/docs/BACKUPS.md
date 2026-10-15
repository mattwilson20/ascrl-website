# Encrypted backups on the Free plan

The Free Supabase plan does not include managed daily backups. This setup uses PostgreSQL 17.11 logical exports, encrypted locally before writing them into OneDrive. It adds no hosting subscription.

## What is protected

`scripts/Backup-RaceControl.ps1` uses the saved database password through a process environment variable. Windows DPAPI encrypts the credential file for this Windows user at `%USERPROFILE%/.ascrl-backup/credentials.xml`; its directory permits only the user and SYSTEM. This location is outside OneDrive and avoids the app's redirected AppData storage, which the Windows scheduled process cannot see. Credentials and plaintext database dumps are never committed to Git.

`scripts/backup.mjs` calls `pg_dump --format=custom` for `public`, `rc_private`, `auth`, `storage` and `supabase_migrations`. The archive preserves application data, originals, audit history, functions, policies, grants, login identities and migration history. A single pg_dump supplies a consistent database snapshot. It uses TLS with hostname and certificate verification against Supabase's downloaded CA certificate.

The dump and manifest are encrypted using AES-256-GCM with a random salt and IV. The key is derived from the recovery passphrase with scrypt. Each export is authenticated, decrypted in memory and checksum-verified before its temporary file is renamed into a successful backup. Altered ciphertext fails authentication. Plaintext exports are not written into OneDrive.

Encrypted files are stored in `%OneDrive%/Documents/ASCRL Race Control Backups`. Save the recovery passphrase in a password manager independently of this PC. OneDrive synchronization must be enabled and healthy; writing a file locally does not itself prove it reached the cloud. The DPAPI credential file cannot substitute for the recovery passphrase after losing this Windows installation.

The exporter refuses to claim a complete recovery set when it detects Storage files or Vault secrets. Neither is currently used by Race Control. Extend the recovery plan before adopting either feature. Provider secrets, Supabase API/Auth settings, certificates, hosting and DNS settings are separate from a database dump; preserve the hosted setup record and keep those secrets in a password manager. The preview-cleanup job is recreated from `supabase/operations/preview_cleanup.sql`, not from internal scheduler runtime tables.

## Run and monitor

From the `racecontrol` directory in PowerShell 7:

```powershell
./scripts/Backup-RaceControl.ps1 -Setup
./scripts/Backup-RaceControl.ps1
./scripts/Backup-RaceControl.ps1 -UpdateDatabasePassword
./scripts/Install-BackupSchedule.ps1
```

Setup prompts privately for the existing database password and a recovery passphrase of at least 16 characters. Updating the database password preserves the backup passphrase. The schedule refuses installation until a successful backup exists. It runs at 3 a.m. local time and at sign-in, uses the current Windows user's credentials without elevation, skips overlapping runs and starts missed runs when available. This PC must be running, online and signed in. It is not an always-on managed backup service.

Check `latest-status.json` for the last successful backup timestamp and Windows Task Scheduler's last result for `ASCRL Race Control encrypted backup` (0 means success). The latest task log is `%USERPROFILE%/.ascrl-backup/last-scheduled-run.log`. An old timestamp means backups need attention. Files are retained until the owner deliberately removes them; the task does not silently delete recovery history.

The scheduled task uses the built-in Windows PowerShell executable, a fixed application working directory, and a hidden window. The restore check requires PowerShell 7. Keep this checkout, its Node.js runtime, and the PostgreSQL tools installed; moving or removing them requires updating the script paths and reinstalling the scheduled task.

## Verified setup — October 15, 2026

The first encrypted export passed at 12:53 UTC. A full isolated PostgreSQL 17.11 restore passed with 21 application tables, RLS on all 21, one auth user and identity, 42 scores, 42 original results and seven migration records. Both private acceptance fixtures passed after restoration. Encryption round-trip and tamper rejection also passed.

An actual Task Scheduler launch completed successfully at 13:08 UTC (8:08 a.m. America/Chicago), produced a new verified encrypted archive, and returned task result 0. The next daily trigger is 3 a.m. local time. This verifies the scheduled process itself, not just a manual invocation. No paid upgrade was purchased. Off-device OneDrive upload has not been independently verified.

After rotating the database password, allow time for the Supabase pooler to pick up the change before treating an immediate authentication error as a bad password. The reset password worked after that delay during commissioning.

## Verify recovery without touching production

```powershell
./scripts/Test-RaceControlRestore.ps1 -BackupFile 'C:/path/to/racecontrol-TIMESTAMP.ascrl-backup'
```

The check decrypts into a private local scratch directory, starts a separate PostgreSQL server on `127.0.0.1:55439` with a random password, restores the selected schemas in one transaction and runs the same SQL acceptance checks against that isolated database. It verifies identity records, scoring, original results, RLS isolation, penalty reversal and the hosted concurrency/stage fixture. It stops the server and removes only its own scratch directory afterward. The live Supabase database is never a restore target. `restore-verification.json` records a successful run.

This validates a logical restore into PostgreSQL, not restoration of the whole Supabase hosting platform or a Discord OAuth service. For a fresh managed Supabase project, follow the official managed-schema restore process, preserve auth user UUIDs, reinstall required extensions, revoke permissive target default grants before restoring, restore application schema/data and auth data under the platform's rules, reapply Auth settings and test access before switching the app. Never import all managed auth/storage schema definitions blindly over an existing project.

On another PC without the DPAPI file, `Backup-RaceControl.ps1 -Decrypt -BackupFile ... -RecoveryDirectory ...` prompts for the recovery passphrase. It also requires Node.js; the full restore check requires matching PostgreSQL tools. Adjust the documented runtime paths for that machine.

References: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase logical backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [verified TLS connections](https://supabase.com/docs/guides/database/psql).
