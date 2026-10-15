# Verification and remaining work

## Automated verification

The test suite runs migrations on PGlite, a real PostgreSQL engine compiled to WebAssembly. Database requests execute as `anon` or `authenticated` with test user claims; they do not bypass RLS for the behavior under test. Trusted setup uses database-admin access to arrange fixtures. Each test rolls back its transaction.

With the user-provided genuine export path configured, **31 tests passed**:

- Valid/invalid JSON, maximum size, optional fields, zero-based finish conversion, multiple race sessions, practice rejection, duplicate customer IDs, unsupported team events and ambiguous class grids.
- Creation of league/season/rules, preview and public publication; custom points instead of source championship totals.
- Duplicate hashes/subsessions, retry idempotence, explicit unmatched-driver approval and failed-transaction rollback.
- Stage orders, bonus calculation, invalid stages and audited stage corrections.
- All/best-N team scoring, rule and team snapshots, drop weeks and retained deductions.
- Point penalties, position adjustments, DQ, appeal, reversal, and next-race deduction confirmation.
- Cross-league denial, direct-table write denial, private league read isolation, restricted account linkage, platform-owner access and final-commissioner protection.
- Verified-driver registration, private incident reporting and steward-only review.
- Immutable audit/original history, stale correction rejection and retained rule versions.
- Missing minimum-lap data blocks publication; expired previews can be replaced safely.
- Genuine file parsing plus full 21-driver PostgreSQL publication, correct winner, custom 40-point score and byte-for-byte preservation of the source file.

Without `ASCRL_IRACING_SAMPLE`, the two real-file tests are skipped; the repository intentionally contains synthetic fixtures only. All local sample compatibility claims apply to the specific verified event-result envelope, not every format iRacing may export.

## Implemented application routes

The production build and TypeScript checks passed locally. Browser checks covered the desktop homepage, a 390-pixel mobile viewport, setup navigation and the empty/disconnected state with no browser errors observed. These checks do not establish authenticated hosted workflow compatibility.

The complete route/file inventory is in the [README](../README.md). The implementation includes public directories, schedules, standings, race results, driver/team pages and server-authorized administration. Empty or disconnected states never display invented league results. Responsive layout, table search/sorting, setup/login screens and metadata are included.

## Not implemented or not yet verified

- **Hosting and real account acceptance:** Supabase/Discord/Vercel projects and DNS must be configured. Browser testing of authenticated hosted workflows and persistent OAuth sessions still needs those services.
- **Additional import adapters:** endurance driver changes, AI fields, other export envelopes and stage-result files. Unsupported formats are rejected.
- **Additional automation:** automatic suspension thresholds, future-penalty carry-forward when a driver skips a race, bots, notifications, payments, replay storage and iRacing API access.
- **Advanced championship formats:** playoffs/chase resets, arbitrary custom bonus formulas, separate class championships, configurable team tiebreaker chains and retrospective rule/team reassignment. The documented finish/stage/bonus/drop/team modes are implemented.
- **Administrative conveniences:** editable league/series/season names, calendar rescheduling after creation, bulk user invitations, driver identity merges, self-service verification, and reversible season archive controls. Current management supports creation, assignments, rules, scoring corrections and archival.
- **Large deployments:** server-side table filtering, cursor pagination in the UI, cached public aggregates and high-load testing. Queries fetch all permitted rows in deterministic 1,000-row batches, with a visible error beyond 50,000 rather than silent truncation. Large global directories should be scoped before operating at that scale.
- **Operational validation:** independent concurrent-connection stress tests, hosted PostgREST API tests, backup restoration, external penetration testing, and full accessibility audits. The test engine exercises transactions and RLS, but does not reproduce Supabase networking or concurrent connections.
- **Existing site integration:** an optional Race Control navigation link should be added to the public site after the new service is accepted and its production URL works. The public site is unchanged by this feature branch.

## Acceptance record

Complete the deployment guide's staging checklist before publishing official championship results. Record deployment URL, commit SHA, migration version, successful Discord sign-in, first test publication, anonymous/private access checks and penalty reversal. Do not mark hosted verification complete based only on the local test suite.
