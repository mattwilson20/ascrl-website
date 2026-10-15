# ASCRL Race Control

A separate Next.js application for manually imported iRacing race results and custom league championships. Intended address: **https://racecontrol.ascrl.online**. The static ASCRL homepage, historical pages, JSON feeds, and hosting are independent of this application.

## Current delivery

Implemented: persistent Supabase authentication through Discord; six permission levels; leagues, series, seasons, calendars, registrations, dated team rosters, versioned scoring; JSON validation and driver matching; transactional publication and corrections; public driver/team standings and career profiles; stages, penalties, appeals, incident reports, and immutable audit records. All scoring and permission checks run in PostgreSQL; the browser never submits official point totals.

**Service setup is still required.** No Supabase or Vercel project existed when this was built. The code has been tested locally against PostgreSQL through PGlite, including the user's genuine export. Hosted Discord login, Supabase HTTP/session integration, concurrent multi-connection load, and Vercel deployment have not been verified. Treat this as a tested implementation awaiting deployment acceptance, not an already running production service.

Read [deployment instructions](docs/DEPLOYMENT.md), [scoring and operations](docs/OPERATIONS.md), and [verification and remaining work](docs/VERIFICATION.md).

## Run locally

Use Node.js 24 and pnpm 11.25.0 (the version in `packageManager`). From this directory:

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env.local`. Configure a dedicated Supabase development project, apply the migrations, and enable Discord as described in the deployment guide. Then:

```sh
pnpm dev
```

Open http://localhost:3000. Without credentials, the public shell and `/setup` work and clearly show that the database is disconnected. No fake standings or development authentication bypass are included.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Tests use a temporary PostgreSQL engine and synthetic fixtures, without a hosted database or credentials. To additionally verify your own original JSON without copying it into the repository, set `ASCRL_IRACING_SAMPLE` to its absolute path before running `pnpm test`.

PowerShell example:

```powershell
$env:ASCRL_IRACING_SAMPLE = 'C:\path\to\eventresult-89327098.json'
pnpm test
```

The test only reads that file. Never commit real exports, `.env.local`, passwords, or private keys. There is no iRacing API integration or scraping.

## First championship

1. Sign in with Discord; open **Control room** and create a league. Its creator becomes commissioner.
2. Add a series, then a season. Choose drop weeks and the tiebreaker order before the season begins.
3. Open the season's **Scoring rules** page. Save the editable stock-car preset or your custom points table.
4. Add a scheduled race, including the number of points-paying stages.
5. Create teams and dated rosters before publishing if you want that race to count toward a team championship.
6. Open **Import results**; select league → series → season → race and upload the JSON downloaded from the individual iRacing results screen.
7. Review source date/track, customer-ID matches, finishing order, and stage results. Approve each unknown driver explicitly.
8. Confirm publication. The race page and public season standings now read the committed database records.

Driver accounts are linked to imported driver identities only after a platform owner verifies ownership. Drivers may then request league membership and season registration, maintain their racing name, submit incident reports, and appeal their own active penalties.

## Routes and source map

| Routes                                                         | Purpose                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/`, `/leagues`, `/schedule`                                   | Public home, league directory, race calendar                                   |
| `/leagues/:id`, `/leagues/:id/manage`                          | League dashboard and commissioner tools                                        |
| `/series/:id`                                                  | Series seasons and archives                                                    |
| `/seasons/:id`, `/seasons/:id/standings`, `/seasons/:id/rules` | Championship, driver/team standings, rule versions                             |
| `/races/:id`                                                   | Published classification, scoring breakdown, penalties and incident submission |
| `/drivers/:id`, `/teams/:id`                                   | Career record and dated team rosters                                           |
| `/admin`, `/settings`                                          | Control room, profile, role and identity management                            |
| `/imports/new`, `/imports/:id`                                 | Upload and transactional publication preview                                   |
| `/penalties`, `/incidents`                                     | Steward decisions, appeals and private incident review                         |
| `/login`, `/setup`                                             | Authentication entry and setup help                                            |
| `/auth/login`, `/auth/callback`, `/auth/logout`                | Discord PKCE flow and sign-out                                                 |
| `POST /api/import`, `POST /api/commands`                       | Authenticated upload and checked command handlers                              |

| Files                                                | Responsibility                                          |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `src/app/[[...path]]/page.tsx`                       | Server-rendered public and role-aware management pages  |
| `src/app/layout.tsx`, `globals.css`, `public/brand/` | ASCRL identity, responsive navigation and visual design |
| `src/components/`                                    | Forms, import review, searchable/sortable tables        |
| `src/lib/importer.ts`                                | Strict, verified iRacing export adapter                 |
| `src/lib/rules.ts`                                   | Rule validation and stock-car preset                    |
| `src/lib/supabase.ts`, `http.ts`, `src/proxy.ts`     | User-scoped DB access, cookie refresh and HTTP guards   |
| `supabase/migrations/202610140001_core.sql`          | Tables, constraints, RLS and immutable history          |
| `supabase/migrations/202610140002_management.sql`    | Role-checked league and season operations               |
| `supabase/migrations/202610140003_scoring.sql`       | Deterministic scoring and standings views               |
| `supabase/migrations/202610140004_imports.sql`       | Preview, publication, corrections, stage scoring        |
| `supabase/migrations/202610140005_penalties.sql`     | Penalties, appeals and RPC grants                       |
| `supabase/migrations/202610140006_incidents.sql`     | Private reports and audited steward review              |
| `tests/`                                             | Import and PostgreSQL integration tests                 |

## Permission model

| Role                | Access                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| Platform owner      | All leagues and verified driver/account linkage; bootstrap via trusted SQL      |
| League commissioner | Manage only authorized leagues; configure, import and publish                   |
| Steward             | Review incidents and issue/confirm penalties within assigned leagues            |
| Team owner          | Manage their own team's roster with an active league role                       |
| Driver              | Own profile, membership/registration requests, incident reports and own appeals |
| Public visitor      | Published public standings, results and public schedules                        |

Each account has one active role per league; owner access is a separate platform table. Discord server roles have no authority here. The database enforces permissions even if someone calls an RPC outside the application UI.

All application tables have RLS. Application roles have no direct write grants. Security-definer routines fix their search path, check `auth.uid()` and league permissions, and record audited changes. Views use invoker security. Account UUID linkage, incident reports, original normalized imports and audit data are not exposed to public visitors. No service-role key is required by the application.
