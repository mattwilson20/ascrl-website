# Hosted setup record

Updated October 15, 2026 (America/Chicago).

## Services

- Vercel team: `ASCRL` (`ascrl`), Hobby plan.
- Vercel project: `ascrl-race-control` (`prj_lo4YhxREHakDjMo31AvVBQbfP5FG`).
- Current live URL: https://racecontrol.ascrl.online
- Secondary deployment alias: https://ascrl-race-control.vercel.app
- Initial deployment: `dpl_6MKPQsbTYZ44iac5iqddZrpUXybg`, status READY.
- Custom-domain deployment: `dpl_9TGhdN5ftbarUavxaMJDxmDsjMRb`, status READY; production build and TypeScript checking passed.
- Application source: `racecontrol/` on `codex/ascrl-race-control`, commit `363b8897a968cf795847d31d09337e8481fbcbd1`.
- Initial deployment was uploaded with the authenticated Vercel CLI. Git automatic deployment is now connected to `mattwilson20/ascrl-website`, branch `codex/ascrl-race-control`, with root directory `racecontrol`; an actual Git-triggered production deployment passed.
- Runtime: Node.js 24, Next.js, `pnpm install --frozen-lockfile`, `pnpm build`.
- Supabase organization: `ASCRL` (`mbtuvbnslodxxhwnhsar`), Pro plan as of October 15, 2026.
- Supabase project: `ASCRL Race Control` (`ixchlspfwllsmwjxqipr`), healthy, `us-east-1`, PostgreSQL 17.11.
- Discord application: `ASCRL Race Control` (`1560132940476842114`), owned by Wilson's ASCR Team.

Only the public Supabase URL, publishable key, and current site URL are configured in Vercel production. No Supabase service-role key is used. Credentials are excluded from source control.

## Database installation

All six source migrations were applied through Supabase's migration tool, which assigned these remote history versions:

| Source | Remote version | Remote name |
|---|---|---|
| `202610140001_core.sql` | `20261015033557` | `ascrl_core` |
| `202610140002_management.sql` | `20261015033601` | `ascrl_management` |
| `202610140003_scoring.sql` | `20261015034327` | `ascrl_scoring` |
| `202610140004_imports.sql` | `20261015034521` | `ascrl_imports` |
| `202610140005_penalties.sql` | `20261015034541` | `ascrl_penalties` |
| `202610140006_incidents.sql` | `20261015034624` | `ascrl_incidents` |
| `supabase/operations/preview_cleanup.sql` (hosted maintenance) | `20261015115725` | `ascrl_preview_cleanup` |

Do not replay these files or run `supabase db push` against this project without first reconciling this remote history with the local source filenames. The scoring migration initially encountered a tool-session error; remote history was inspected before retrying, and it was applied once successfully.

The project was provisioned with the Data API enabled, automatic exposure of new tables disabled, and automatic RLS enabled. API permissions come from the explicit application grants. The platform-provided `public.rls_auto_enable()` event-trigger function had unnecessary public EXECUTE privileges; those were revoked from PUBLIC, anon, and authenticated as an administrative hardening step. Its automatic-RLS event-trigger behavior remains available to the database owner.

Verified on the hosted database:

- 21 application tables, all with RLS enabled; 21 policies.
- Both standings views use `security_invoker=true`.
- Anonymous users cannot execute the management RPC.
- Authenticated clients cannot insert leagues directly.
- Public league reads succeed over PostgREST and return an empty array.

Supabase's security advisor still reports the intentionally exposed SECURITY DEFINER permission helpers and authenticated application RPCs (5 anonymous-callable helper functions, 14 authenticated-callable functions). These functions have fixed search paths and enforce caller/league permissions; this is an architectural review notice, not a claim that every advisor warning has been eliminated. See the [anonymous-function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated-function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Hosted checks

- Vercel's production installation, TypeScript checking, and Next.js build completed successfully.
- Anonymous requests to `/`, `/leagues`, `/schedule`, and `/login` return HTTP 200.
- `/admin`, `/imports/new`, and `/settings` redirect anonymous visitors to `/login`.
- Anonymous management RPC calls return HTTP 401.
- Anonymous reads of the private driver/account identity column return HTTP 401 (`42501`, insufficient privilege).
- The public homepage and league directory contain no official championship data. A clearly labeled private commissioning league holds the genuine sample publication for verification.

## Authentication, domain, and maintenance

- Discord credentials were saved by the user in Supabase. A real Discord sign-in returned to the control room, created the profile, and verified the account email. The authenticated user's UUID was checked against the Discord identity before assigning Platform Owner access.
- Supabase Site URL is `https://racecontrol.ascrl.online`. Exact allowed callbacks are `https://racecontrol.ascrl.online/auth/callback` and `https://ascrl-race-control.vercel.app/auth/callback`.
- Bluehost CNAME `racecontrol` points to `5f43f2ed49c40fb6.vercel-dns-017.com`, TTL 15 minutes. Authoritative DNS and Vercel verification passed; HTTPS returned 200. Existing apex, www, email records, and nameservers were preserved.
- Production `NEXT_PUBLIC_SITE_URL` is `https://racecontrol.ascrl.online`; the app was rebuilt after this change.
- Discord login completed on the custom domain and returned to `/admin`. Authenticated league, series, season, scoring-rule, and calendar forms saved successfully there.
- After explicit user approval, enabled `pg_cron` and the hourly `ascrl-expire-import-previews` job. It nulls only preview payloads older than 24 hours and marks those previews expired. It preserves published results, original classifications, hashes, and audit records. The first scheduled run succeeded at 12:00 UTC on October 15 with `UPDATE 0`.
- Post-install security advisors reported only the previously documented function-exposure notices; no new notices were added by the scheduler.

## End-to-end acceptance on October 15

- Created the private `setup-verification-20261015` league through the production UI, then a series, season, immutable rule version, and scheduled race.
- Uploaded the user's original `eventresult-89327098.json` through the browser, reviewed all 21 drivers, approved new records, and published the classification inside that private league. The local source file was not edited.
- Published race: `a35c17f5-79e4-46ef-a6a2-88041c35cfa8`; private season: `a01374b4-f84b-422f-a852-dbcd5bfffe45`. The sample and preset are explicitly labeled as verification, not official championship data.
- The hosted standings show 21 drivers, one start each, with 40/35/34 points for the first three finishers. Import status is committed and its normalized preview payload is null.
- `supabase/operations/verify_private_setup.sql` passed against hosted PostgreSQL: publication retry idempotence, pending/active/repeated/overturned penalty behavior (40 → 30 → 40), anonymous/private isolation, denied management by an unrelated identity, and denied access to private account linkage. Test penalty mutations were rolled back; no actual penalty was retained.
- Anonymous HTTPS requests to the homepage and league directory returned 200 without private test data; direct requests to the private league and standings returned 404.
- The unrelated-identity SQL test exercises RLS/RPC permissions but does not replace a second real Discord-account browser test.

## Additional acceptance and Git deployment on October 15

- Git is connected to `mattwilson20/ascrl-website`, production branch `codex/ascrl-race-control`, root `racecontrol`. Preview deployments are disabled and the project build guard skips every other branch. Builds were blocked while establishing the connection and branch configuration.
- Commit `bd8c5baa185be3ddf2415f628165d1b49e54893f` automatically triggered deployment `dpl_AcJF3mfKjA6FByvDA1kuXyGL5dYz`, which reached Ready and received `racecontrol.ascrl.online`. See [Git deployment](GIT-DEPLOYMENT.md).
- Two independent hosted PostgreSQL connections simultaneously published the same fresh preview in a second explicitly private test season. Both succeeded; verification found exactly one publication audit event, revision 1, 21 original results, 21 scores, one committed import with a cleared payload, and one start per driver.
- The hosted **Correct stage scoring** form passed. The private race is labeled `Private concurrency / invented stage test`; its stage order is artificial test data, not claimed to come from the export. Reversing the two test stage positions changed totals from 50/44 to 49/45 while preserving the race finish and championship start counts. The correction was audited once.
- `supabase/operations/verify_hosted_concurrency.sql` and the updated original fixture check both passed on hosted PostgreSQL.
- The user has no second Discord account available. The unrelated-identity database isolation checks passed, but the second real-account browser check is unavailable.

## Backup and session acceptance

- The custom-domain session created at 12:01 UTC successfully refreshed after expiry at 13:05 UTC. The authenticated private race remained accessible, and the database session recorded its refresh. Sign-out removed the authenticated navigation and a subsequent Control room request redirected to login. A new Discord sign-in completed and returned the owner to the authenticated control room.
- Encrypted Free-plan export and an isolated PostgreSQL 17.11 restore passed. The restored database retained all 21 application RLS tables, auth identity, both private scoring fixtures, originals and migration records. Both SQL acceptance scripts passed locally after restoration; the live database was not a restore target.
- Windows Task Scheduler ran the encrypted backup successfully at 13:08 UTC and returned result 0, producing a new verified archive. Daily 3 a.m. local-time and Windows sign-in triggers are installed. Private Windows-encrypted credentials are stored outside OneDrive; only encrypted backups go in its Documents folder. See [backup operations](BACKUPS.md).
- The user completed the Supabase Pro upgrade on October 15. Organization metadata confirms Pro. The backup dashboard shows physical restore points at 08:28:44 and 02:55:13 UTC that day. Daily managed backups retained seven days are the primary off-device protection; the checkout base price was $25/month. No production restore or paid point-in-time recovery was performed.

## Operational limits

- Championship migration `20261015134209_championship_formats.sql` was applied through MCP as hosted version `20261015141204`. Both existing hosted acceptance scripts passed afterward. Local TypeScript, 54 tests (including the genuine file), and the production build passed. The local build required permission for the CSS compiler's child process outside the desktop sandbox.
- The security advisor recognizes `rc_settings` as an authenticated security-definer API, alongside existing guarded RPCs. It requires a signed-in commissioner, fixes its search path, validates input and checks the target league. Anonymous execution is revoked. The new snapshot RPC is security-invoker. See [the advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Pro also surfaced a leaked-password-protection notice; the app uses Discord OAuth rather than password sign-in.

- Cloud managed backups and website hosting do not depend on this PC. Supplemental encrypted exports require the PC to be running, online and signed in. OneDrive sync is unhealthy and cloud upload is unverified; the user deferred its repair.
- A second real Discord-account browser test remains unavailable because the owner has no second account. Database isolation checks with an unrelated identity passed.
- The database restore test does not restore the Supabase hosting platform, OAuth provider configuration or DNS. Their settings and credentials require separate recovery records.
