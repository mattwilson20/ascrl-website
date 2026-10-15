# Hosted setup record

Updated October 14, 2026 (America/Chicago).

## Services

- Vercel team: `ASCRL` (`ascrl`), Hobby plan.
- Vercel project: `ascrl-race-control` (`prj_lo4YhxREHakDjMo31AvVBQbfP5FG`).
- Current live URL: https://ascrl-race-control.vercel.app
- Initial deployment: `dpl_6MKPQsbTYZ44iac5iqddZrpUXybg`, status READY.
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
- The browser shows the live homepage with zero leagues, championships, and results. No official data has been seeded.

## Remaining setup

- Discord OAuth credentials and callback settings are being configured. Real sign-in and persistent-session acceptance have not yet passed.
- First platform owner has not been assigned; use only the verified user's own Discord-authenticated account UUID.
- Complete the staging-league import/publication, permissions, scoring correction, penalty reversal, and concurrent-publication checks in DEPLOYMENT.md before using official results.
- `racecontrol.ascrl.online` is attached to Vercel, but DNS is not configured. Bluehost requires a CNAME named `racecontrol` with target `5f43f2ed49c40fb6.vercel-dns-017.com`. Preserve the existing root/www/mail records and nameservers. After DNS/HTTPS verification, update the production site URL and exact Supabase callback, then redeploy.
- Git-based automatic deployments, backups/restore acceptance, and scheduled preview cleanup remain to be configured or verified.
