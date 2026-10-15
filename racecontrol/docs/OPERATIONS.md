# Scoring and league operations

## Verified importer

Adapter `iracing-event-result-v1` accepts the explicit `{ "type": "event_result", "data": ... }` export envelope. It was tested against the user's original `eventresult-89327098.json`: Talladega, subsession 89327098, 21 race drivers, with separate practice, qualifying and warmup sessions. Both parser and PostgreSQL publication tests passed. The original file is not included in this repository.

Only sessions with `simsession_type: 6` are eligible. Multiple race sessions require a manual selection. Finishing and class positions are converted from the verified zero-based schema; incomplete or duplicate classifications are rejected. Customer IDs provide stable matching regardless of display-name changes. `livery.car_number`, `laps_complete`, `laps_lead`, `best_lap_time`, `incidents`, source date/track and identifiers are read when present. Missing optional values remain null; no statistics are invented. Lap times retain source ticks, with zero/negative sentinels excluded from fastest-lap selection.

Files must be UTF-8 JSON, nonempty and at most 3 MiB. Driver-change/team endurance events, AI grids, restricted results, other export shapes and ambiguous grids are rejected with an explanation. Additional schemas require new adapters and real fixtures. iRacing championship totals, ratings, licenses, location, friend flags, paint schemes and other unrelated data are not imported. This adapter does not extract stage finishes; use the populated stage-entry form.

## Publication and corrections

An authenticated commissioner selects a calendar race. The server validates the upload, computes SHA-256, and saves a temporary normalized preview. The commissioner checks the source metadata and approves each unmatched driver. The selected source date and track replace the provisional calendar values on publication.

One PostgreSQL transaction creates approved drivers, snapshots teams/eligibility/rules, stores immutable normalized originals, writes stages and scores, marks the race published, clears the preview payload and appends an audit event. Failure rolls back the entire operation. Retrying the same committed job returns its existing race. Per-season transaction locks, unique subsessions and file hashes prevent duplicate scoring. Customer-ID locks serialize new identities across leagues.

To correct results, choose the published race on `/imports/new`, upload the corrected export and provide a reason of at least ten characters. A correction adds an immutable revision and replaces the current official score set for that race. It never adds another championship start. Existing rule and team snapshots remain attached. A stale preview cannot overwrite a newer correction. Original normalized results from all revisions remain available to officials. Active penalties are recalculated; a correction cannot omit a driver who has an active/appealed penalty.

An identical committed file is rejected. Stage-only changes use **Correct stage scoring** on the race page and require a reason. Re-enter only stage scoring positions, not the race classification. If a preview is stale or unwanted, discard it before re-uploading. Rule changes apply to new races, not historical race corrections. Retroactive rule-version or team-snapshot reassignment is not provided.

## Championship rules

- Finish: configurable position table plus points beyond that table. The editable stock-car preset starts 40, 35, 34…; it is not advertised as a current official NASCAR rulebook.
- Stages: configurable stage-position table. Choose the number of stages for each scheduled race. Enter the scoring positions using the imported drivers; duplicate/nonparticipant entries fail the transaction. An empty stage table awards no stage points.
- Bonuses: first grid slot (pole), at least one lap led, most laps led and fastest race lap. Tied most-laps-led or fastest-lap values award the full bonus to every tied driver. Relevant missing data prevents a configured bonus from being silently guessed.
- Classification: overall or within each imported car class. Overall finishing position remains the displayed race classification and basis for career finish statistics; class scoring uses the class rank for finish points. Pole/fastest-lap/led bonuses remain overall event awards.
- DQ: configurable finish points; zero stage and bonus points; deductions still apply. Disqualified drivers move to the rear and do not earn win/top-five/top-ten statistics.
- Eligibility: all imported drivers or commissioner-approved season registrations, plus minimum completed laps. Eligibility is captured on publication. Ineligible entries remain in race results but do not enter championship standings. If minimum laps are required and laps are missing, publication is blocked.
- Drop weeks: discard the lowest earned race totals, retaining at least one race; deduction points are never dropped. Race counts and finish statistics still include dropped races. Equal earned scores drop the earlier race first.
- Driver ties: season-defined ordering of wins, top-five finishes, top-ten finishes, average finish and latest finish. A stable driver UUID resolves any remaining tie deterministically.

Scoring versions are immutable and each race records the version used. Season drop policy and tiebreakers are fixed at creation. Current and prior versions are visible on the rules page. Archived seasons remain readable; new races, imports and new rule versions are locked. Audited penalty decisions and stage corrections remain available for appeals after archiving, so titles may change if an official decision changes the final standings.

## Teams

`teamCount = 0` counts all eligible drivers; 1 counts the best single driver; 2 counts the best two; another positive integer counts that many. Selected drivers are ranked by net race points, then finish, then stable ID. Only the selected drivers' earned points and deductions enter the team score. Team drop weeks then apply to aggregate earned race points, retaining their selected deductions. Team ties use total points, wins and stable team ID.

Membership intervals use `[valid_from, valid_until)`. A driver can have one team at a time within a league, while racing for teams in other leagues. Team membership is captured at the imported race start time. End the previous interval before assigning the next team. Historical snapshots are unchanged when a roster is later edited or a result is corrected. Enter initial rosters before publishing a race. Changing current team membership does not retroactively add team points to old races.

## Penalties, incidents and appeals

Participating verified drivers and authorized officials can submit incident reports from published race pages, including lap, narrative and an HTTPS evidence link. These reports are visible only to the reporter and authorized league stewards/commissioners. External evidence is linked, not fetched or stored. A steward records an audited review outcome; any resulting penalty is a separate explicit decision.

Penalties start **pending** and do not alter points. An authorized steward confirms **active** or records **overturned**, with a rationale. The affected verified driver can appeal an active penalty once; **appealed** retains the existing effect until a steward changes the decision. Repeated recalculation recomputes from originals, so deductions are never applied twice. Notes, issuer, timestamps, decisions and reversals are retained.

- Points: deduct the specified nonnegative integer amount.
- Position: move the driver to an absolute overall finishing slot, shift the remaining grid, and recalculate finish points. Each driver's latest active adjustment applies; multiple decisions execute in chronological order with stable ID fallback.
- Disqualification: use DQ scoring and move to the rear.
- Warning / suspension points: tracked disciplinary records; they do not subtract championship points or automatically prohibit entry. Automatic suspension thresholds are not implemented.
- Next-race points: propose a deduction against an explicitly selected later race in the same season. Confirm it after that race is published and the driver appears in its grid. The system rejects premature confirmation instead of silently losing a deduction. There is no automatic carry-forward to a later attended race.

Public tables show championship deductions but do not disclose private supporting notes or account linkage. Team owners can add dated members to their own team; commissioners handle ending previous intervals. Platform owners verify account linkage manually. No iRacing credentials are requested.
