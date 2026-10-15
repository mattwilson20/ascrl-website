# Verification and remaining work

## Automated verification

The test suite runs migrations on PGlite, a real PostgreSQL engine compiled to WebAssembly. Database requests execute as `anon` or `authenticated` with test user claims; they do not bypass RLS for the behavior under test. Trusted setup uses database-admin access to arrange fixtures. Each test rolls back its transaction.

With the user-provided genuine export path configured, **54 tests passed**:

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
- Custom rulebooks and names, audited versions, stale-write rejection, commissioner-only settings, cross-league/private snapshot denial, direct RPC validation and locked formats.
- Full-season compatibility, Chase resets, playoff elimination, points/wins qualification, minimum starts, retained drop penalties, seed/race/stage bonuses, current stage revisions, win advancement with overflow, carried points, finish-order finals, DQ/non-starters, corrected qualification, deterministic ties and calendar completeness/order.

Without `ASCRL_IRACING_SAMPLE`, the two real-file tests are skipped; the repository intentionally contains synthetic fixtures only. All local sample compatibility claims apply to the specific verified event-result envelope, not every format iRacing may export.

## Implemented application routes

The production build and TypeScript checks passed locally. Browser checks covered the desktop homepage, a 390-pixel mobile viewport, setup navigation and the empty/disconnected state with no browser errors observed. These checks do not establish authenticated hosted workflow compatibility.

The complete route/file inventory is in the [README](../README.md). The implementation includes public directories, schedules, standings, race results, driver/team pages and server-authorized administration. Empty or disconnected states never display invented league results. Responsive layout, table search/sorting, setup/login screens and metadata are included.

## Not implemented or not yet verified

- **Hosting and real account acceptance:** Live at https://racecontrol.ascrl.online with Discord login and verified Platform Owner access. The real browser flow passed league/series/season/rules/calendar creation, genuine 21-driver JSON upload, preview, publication, standings and stage correction in a clearly labeled private league. Session renewal after expiry and sign-out/protected-route redirect passed. Hosted SQL checks passed retry idempotence, penalty reversal and permission isolation. See [the hosted setup record](HOSTED-SETUP.md). A second real Discord-account browser test is unavailable because the owner has no second account; the unrelated-identity database check passed.
- **Additional import adapters:** endurance driver changes, AI fields, other export envelopes and stage-result files. Unsupported formats are rejected.
- **Additional automation:** automatic suspension thresholds, future-penalty carry-forward when a driver skips a race, bots, notifications, payments, replay storage and iRacing API access.
- **Additional championship formats:** arbitrary mathematical bonus formulas, separate class championships, team playoffs/configurable team tiebreaker chains and retrospective rule/team reassignment remain outside the implementation. Custom Chase/playoff rounds and written rulebooks are implemented; see [their exact semantics](CHAMPIONSHIPS.md).
- **Administrative conveniences:** series renaming, calendar rescheduling after creation, bulk user invitations, driver identity merges, self-service verification, and reversible season archive controls remain. League names/introduction/rulebooks and pre-publication season names/settings are editable.
- **Large deployments:** server-side table filtering, cursor pagination in the UI, cached public aggregates and high-load testing. Queries fetch all permitted rows in deterministic 1,000-row batches, with a visible error beyond 50,000 rather than silent truncation. Large global directories should be scoped before operating at that scale.
- **Operational validation:** the two-connection concurrent publication test passed on hosted PostgreSQL; it is not a high-load stress test. Hosted stage correction and its audit/score checks passed. Encrypted backup, actual scheduled execution and isolated PostgreSQL restoration with both acceptance fixtures passed. Supabase Pro is enabled and managed physical restore points were verified; managed restoration into a separate project remains untested. OneDrive sync is unhealthy and repair was deferred; local copies are supplemental. External penetration testing and full accessibility audits remain. Hosted anonymous PostgREST checks and authenticated API calls through the production UI passed. Expired-preview cleanup runs hourly. Git auto-deployment uses `codex/ascrl-race-control` and the `racecontrol` root. See [the setup record](HOSTED-SETUP.md).
- **Existing site integration:** an optional Race Control navigation link should be added to the public site after the new service is accepted and its production URL works. The public site is unchanged by this feature branch.

## Acceptance record

Complete the deployment guide's staging checklist before publishing official championship results. Record deployment URL, commit SHA, migration version, successful Discord sign-in, first test publication, anonymous/private access checks and penalty reversal. Do not mark hosted verification complete based only on the local test suite.
