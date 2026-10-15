# Setup and deployment

Create a **new Supabase project** and a **new Vercel project** for Race Control. Keep the existing ASCRL public website on its present hosting. This feature branch does not replace its homepage or navigation.

## 1. Supabase database

1. Create a project named `ASCRL Race Control` in your Supabase account. Store the database password privately.
2. In its SQL editor, run each file from `supabase/migrations/` once, in filename order, from `202610140001_core.sql` through `202610140006_incidents.sql`. Use a separate SQL execution for each migration and stop on any error. These are first-install migrations for an empty, dedicated project.
3. In project settings, copy the project URL and **publishable key**. Keep the default Data API row limit at 1,000. The application fetches additional pages when needed.
4. Verify the `public` schema is exposed to the Data API and reload its schema cache after installing migrations if necessary:

```sql
notify pgrst, 'reload schema';
```

Alternatively, use the [Supabase CLI migration workflow](https://supabase.com/docs/guides/local-development/database-migrations): initialize its local configuration in this app directory, link the intended project, inspect `supabase db push --dry-run`, and then apply `supabase db push`. Choose SQL editor or CLI migration tracking consistently; do not replay already-applied SQL. No seeded league results are provided.

## 2. Discord sign-in

Create an application called `ASCRL Race Control` in the [Discord Developer Portal](https://discord.com/developers/applications). In OAuth2 redirects, add the **Supabase provider callback** copied from Supabase Authentication → Sign In / Providers → Discord:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Enable Discord in Supabase and save the Discord client ID and client secret there. This secret never belongs in Next.js public variables or GitHub. See [Supabase's Discord guide](https://supabase.com/docs/guides/auth/social-login/auth-discord).

In Supabase Authentication → URL Configuration, set the site URL to the application deployment URL. Add these **application callbacks** to its redirect allow list:

```text
http://localhost:3000/auth/callback
https://racecontrol.ascrl.online/auth/callback
```

The Discord provider callback and application callback are different URLs. The code exchanges the returned authorization code for a persistent cookie session. Add an exact staging callback separately if testing on a Vercel preview domain.

## 3. Local environment

Copy `.env.example` to `.env.local` and enter:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Run `pnpm install --frozen-lockfile` and `pnpm dev`. The publishable key is intentionally public; RLS and authenticated RPC checks protect records. The application never uses a Supabase service-role key. Use separate development and production Supabase projects when operating a live championship.

## 4. Vercel project

Import `mattwilson20/ascrl-website` as a new Vercel project. Select the `codex/ascrl-race-control` branch for the initial isolated deployment and choose **`racecontrol` as Root Directory**, with the Next.js framework preset. See [Vercel project configuration](https://vercel.com/docs/project-configuration).

Use Node.js 24, install command `pnpm install --frozen-lockfile`, build command `pnpm build`, and the default Next.js output. Add the three environment variables above in Vercel; set `NEXT_PUBLIC_SITE_URL` to the exact URL being tested. Redeploy after changing variables. These URLs are also used to validate mutation origins, so a mismatch will block form submissions.

For a preview, use a stable preview domain with its own site URL and allowed callback. Do not share a production database with arbitrary unreviewed preview branches. After acceptance, either maintain the dedicated production branch or merge the reviewed app-only PR and select the resulting branch in Vercel. This application does not depend on changing the public site's deployment settings.

## 5. Domain

Add `racecontrol.ascrl.online` to the new Vercel project's Domains settings. In the existing DNS provider, create **only the `racecontrol` record**, using the exact target Vercel displays. Wait for domain verification and HTTPS. Set the production site URL to `https://racecontrol.ascrl.online`, confirm the Supabase callback allow list, and redeploy.

## 6. First owner

Sign in once with Discord. Open `/settings` and copy your account UUID. As the database administrator, run this SQL in Supabase, replacing the placeholder with that UUID:

```sql
insert into public.rc_platform_owners(user_id)
values ('YOUR_ACCOUNT_UUID'::uuid)
on conflict do nothing;
```

Refresh the app. The platform owner can verify driver/account associations in Settings. Verify the person's iRacing customer ID through your existing league process before linking; knowing a public customer ID alone is not proof of account ownership. A league commissioner can import unclaimed driver records without creating Discord accounts for those drivers.

## 7. Acceptance before using official results

Use a staging league to complete Discord login → create league/series/season → rules → scheduled race → upload → review → publish → anonymous standings. Then try a second Discord account with no league role and confirm imports/management are denied. Verify sign-out, session refresh, stage correction, penalty reversal, an appeal by a verified driver, and a private league viewed anonymously.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Enable your Supabase backup/restore process and review provider logs. Do a two-session concurrent publish test on hosted PostgreSQL; the implementation has transaction locks and unique constraints, but PGlite tests do not exercise independent concurrent connections. No hosted acceptance was possible before these accounts were created.

## Data cleanup and maintenance

The raw JSON exists only in upload request memory and is never stored on disk or in a storage bucket. Normalized previews expire after 24 hours; publication/cancellation clears their payload immediately. An expired preview is also cleaned on the uploader's next import. To remove abandoned normalized previews even when users do not return, run this hourly through Supabase Cron with database-admin privileges:

```sql
update public.rc_imports
set payload = null, status = 'expired'
where status = 'preview' and expires_at < now();
```

This query preserves hashes and audit metadata and never deletes structured results. The hosted administrator setup script is [preview_cleanup.sql](../supabase/operations/preview_cleanup.sql); it enables pg_cron and upserts a named hourly job. Review and authorize its payload-retention policy before applying it. Its installation and first successful production run are recorded in [HOSTED-SETUP.md](HOSTED-SETUP.md).

Review authenticated creation limits, add provider-level rate limiting for your deployment's traffic, and monitor logs before opening broad public registration. Restore database backups into staging before relying on them operationally. Supabase's Free plan needs regular off-site logical exports; paid managed backups have not been enabled for this project. Follow the [current backup guide](https://supabase.com/docs/guides/platform/backups) when choosing a backup and restore process.
