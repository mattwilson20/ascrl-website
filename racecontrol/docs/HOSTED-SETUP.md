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
- Initial deployment was uploaded with the authenticated Vercel CLI from the application directory. Vercel project root is currently `.`; Git-based automatic deployment is not configured yet. When connecting the repository, set its root to `racecontrol` and select the dedicated branch before triggering builds.
- Runtime: Node.js 24, Next.js, `pnpm install --frozen-lockfile`, `pnpm build`.
- Supabase organization: `ASCRL` (`mbtuvbnslodxxhwnhsar`), Free plan.
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

## Remaining setup

- Further acceptance: second real Discord account, session refresh/sign-out, stage correction through the hosted UI, and two independent concurrent publication sessions. Core authenticated import/publication and database penalty reversal have passed.
- Git-based automatic deployments remain disabled. Automatic approval review rejected connecting the repository while the intended branch and root were not pinned. CLI deployment remains available from this application directory.
- Backup/restore acceptance remains outstanding. The Free plan requires regular off-site logical exports; daily managed backups require a paid plan. No plan upgrade or paid backup service has been purchased. See [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups).
