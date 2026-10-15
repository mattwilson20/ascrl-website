# Your league's rulebook and championship

**Manage league → League rulebook** edits the league name, introduction and up to 50,000 characters of plain-text rules. The rulebook is readable on the league dashboard under the same public/private access policy as the league. Every save increments a version and records the old and new text in the commissioner audit trail. A stale edit is rejected so another commissioner's changes are not silently overwritten.

Written rules can describe any league policy. Race Control automatically enforces its configured scoring and championship settings; prose does not execute arbitrary code or new scoring formulas. Stewards handle additional conduct, procedures and exceptions using the existing incident, appeal and penalty tools.

## Season setup

Open **Rules & championship format** before publishing the first race. Set the season name, drop weeks, tiebreaker order and format:

- **Full-season points:** the existing points championship, without qualification or resets.
- **Chase:** one qualifying cut followed by one championship round, with a reset or carried points.
- **Playoffs:** up to ten named rounds, each with its own race count, field size, reset/carry policy, bonus bank and optional win advancement. Field sizes must decrease. A final can use points or the best official finish in a single race.

Qualification uses regular-season points or wins followed by points. Minimum eligible starts can be required. A driver must have at least one eligible start. DQ results count as starts, but not wins. Wins refer to the overall official race classification, consistent with the existing driver statistics.

The bonus bank combines an optional qualifying-position points table with configured bonuses for eligible, non-disqualified race and stage wins before a round. Each resetting round can add the bank. Carrying points does not add it again. Current corrected stage revisions are used; older revisions do not award duplicate bonuses.

Schedule exactly the regular-season race count plus all round lengths before publishing. Scheduled timestamps, then race IDs, define the calendar order. The source export's actual session timestamp is recorded separately from that fixed schedule. Publish in calendar order. The database locks format and calendar changes when the first race is published, including concurrent save/publication attempts. Configure a new season for a different format. Written league policies remain editable and audited.

## How standings are decided

Regular-season drop weeks remove the lowest earned scores while retaining penalty deductions and at least one score. Postseason rounds have no drops. A reset replaces prior championship points, including prior deductions; carry mode preserves them. Each round adds its race scores and penalties after its start value.

Qualification tiebreakers use regular-season statistics. Round tiebreakers use that round's statistics, in the season's configured order. Stable driver ID is the final tie. Win advancement prioritizes current contenders who won an eligible race in that round; if too many winners exist, round points and tiebreakers fill the available places.

A finish-order final requires exactly one race. Official finish ranks eligible finalists; DQ finishers follow other finishers, and non-starters come last. Point deductions and bonuses do not reorder this final; position penalties and disqualifications do. Use points ranking when the title should be decided by net points.

Active finalists rank above eliminated drivers. Eliminated drivers rank by the furthest round reached, then full-season standings. Nonqualifiers follow them. The standings show championship status, current championship points, and separate full-season points. Eliminated/nonqualifying drivers' points column uses their full-season total; gaps are shown only within the active points-scored field. Teams retain the existing full-season scoring and drop-week policy.

Corrections recalculate qualification and every subsequent round from official facts. Race scores and original imports are not rewritten by a postseason reset. Driver career titles use the resulting championship standings and require both completion and season archival for postseason formats.

## Implementation and boundaries

`rc_settings` validates and audits commissioner writes. `rc_championship_snapshot` uses invoker security to return one consistent snapshot of visible race facts, current stage winners and full-season standings. It excludes original import payloads and private account linkage. `src/lib/championship.ts` is the deterministic server-side projection used by season standings and driver career pages.

Arbitrary mathematical formulas, separate class titles, team playoff formats and calendar rescheduling are not included. Seasons can have up to 500 configured races and fields up to 500 drivers; those validation bounds are not a load-test guarantee.
