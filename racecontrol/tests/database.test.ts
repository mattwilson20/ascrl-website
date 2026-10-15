import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseRaceFile } from "../src/lib/importer";
import { STOCK_CAR_PRESET } from "../src/lib/rules";
import { bytes, exportFixture } from "./fixtures";
import { championshipStandings, newRound } from "../src/lib/championship";

const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  S = "33333333-3333-4333-8333-333333333333",
  D = "44444444-4444-4444-8444-444444444444";
let db: PGlite,
  l: string,
  other: string,
  series: string,
  season: string,
  race: string;
async function request(
  user: string | null,
  sql: string,
  args: unknown[] = [],
): Promise<Record<string, any>[]> {
  await db.exec("savepoint request_guard");
  try {
    await db.exec("set local role " + (user ? "authenticated" : "anon"));
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user ?? "",
    ]);
    const r = await db.query<Record<string, any>>(sql, args);
    await db.exec("reset role; release savepoint request_guard");
    return r.rows;
  } catch (e) {
    await db.exec(
      "rollback to savepoint request_guard; reset role; release savepoint request_guard",
    );
    throw e;
  }
}
const manage = async (command: string, p: Record<string, unknown>, user = A) =>
  (
    await request(user, "select public.rc_manage($1,$2::jsonb) id", [
      command,
      JSON.stringify(p),
    ])
  )[0].id as string;
const query = async (
  sql: string,
  args: unknown[] = [],
  user: string | null = A,
) => request(user, sql, args);
async function preview(
  rid = race,
  subsession = 1001,
  reason: string | null = null,
) {
  const n = parseRaceFile(bytes(exportFixture(subsession)));
  return (
    await query("select public.rc_preview_import($1,$2,$3::jsonb,$4) id", [
      rid,
      n.hash,
      JSON.stringify(n),
      reason,
    ])
  )[0].id as string;
}
const publish = (id: string, created = [101, 102], stages: number[][] = []) =>
  query("select public.rc_publish_import($1,$2::bigint[],$3::jsonb,true) id", [
    id,
    created,
    JSON.stringify(stages),
  ]);
const standings = () =>
  query(
    "select * from public.rc_driver_standings order by championship_position",
    [],
    null,
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;",
  );
  for (const f of readdirSync(resolve("supabase/migrations")).sort())
    await db.exec(readFileSync(resolve("supabase/migrations", f), "utf8"));
  await db.query("insert into auth.users values($1),($2),($3),($4)", [
    A,
    B,
    S,
    D,
  ]);
});
beforeEach(async () => {
  await db.exec("begin");
  l = await manage("create_league", { name: "Test League A", slug: "test-a" });
  other = await manage(
    "create_league",
    { name: "Test League B", slug: "test-b" },
    B,
  );
  series = await manage("create_series", { league_id: l, name: "Test Cup" });
  season = await manage("create_season", {
    league_id: l,
    series_id: series,
    name: "Test Season",
  });
  await manage("save_rules", {
    league_id: l,
    season_id: season,
    name: "Test rules",
    config: STOCK_CAR_PRESET,
  });
  race = await manage("create_race", {
    league_id: l,
    season_id: season,
    name: "Test race",
    track: "Test Speedway",
    starts_at: "2026-10-12T23:30:18Z",
  });
});
afterEach(() => db.exec("rollback"));
afterAll(() => db.close());
describe("league rulebooks and championship settings", () => {
  const config = () => ({
    mode: "chase",
    regularSeasonRaces: 1,
    qualification: "points",
    minimumStarts: 1,
    seedBonuses: [10],
    raceWinBonus: 5,
    stageWinBonus: 1,
    rounds: [{ ...newRound(2), name: "Title chase", races: 1 }],
  });
  const settings = (
    command: string,
    p: Record<string, unknown>,
    user: string | null = A,
  ) =>
    query(
      "select public.rc_settings($1,$2::jsonb) id",
      [command, JSON.stringify(p)],
      user,
    );
  const payload = () => ({
    league_id: l,
    season_id: season,
    name: "Custom title",
    version: 0,
    config: config(),
    drop_weeks: 0,
    tiebreakers: ["wins", "latest_finish"],
  });
  const lastRace = () =>
    manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Championship final",
      track: "Test Speedway",
      starts_at: "2026-10-19T23:30:18Z",
    });
  it("saves custom written rules with audit history and detects stale edits", async () => {
    const p = {
      league_id: l,
      version: 0,
      name: "Our Racing League",
      description: "Our format",
      rulebook: "Our own rules\nDrive clean.\n<script>plain text only</script>",
    };
    await settings("league_settings", p);
    expect(
      (
        await query(
          "select name,rulebook,rulebook_version from rc_leagues where id=$1",
          [l],
          null,
        )
      )[0],
    ).toMatchObject({
      name: p.name,
      rulebook: p.rulebook,
      rulebook_version: 1,
    });
    await expect(settings("league_settings", p)).rejects.toThrow("changed");
    expect(
      (
        await query(
          "select count(*)::int n from rc_audit where action='league_settings'",
        )
      )[0].n,
    ).toBe(1);
  });
  it("restricts settings to commissioners of that league and snapshots to visible seasons", async () => {
    await expect(
      settings("championship_settings", payload(), B),
    ).rejects.toThrow();
    await expect(
      settings("championship_settings", payload(), null),
    ).rejects.toThrow();
    await manage("membership", {
      league_id: l,
      user_id: S,
      role: "steward",
      status: "active",
    });
    await expect(
      settings("championship_settings", payload(), S),
    ).rejects.toThrow();
    await db.query("update rc_leagues set is_public=false where id=$1", [l]);
    expect(
      (
        await query("select rc_championship_snapshot($1) snapshot", [season], B)
      )[0].snapshot,
    ).toBeNull();
    expect(
      (
        await query(
          "select rc_championship_snapshot($1) snapshot",
          [season],
          null,
        )
      )[0].snapshot,
    ).toBeNull();
    expect(
      (await query("select rc_championship_snapshot($1) snapshot", [season]))[0]
        .snapshot.season,
    ).toBeTruthy();
    expect(
      await query("select rulebook from rc_leagues where id=$1", [l], B),
    ).toEqual([]);
  });
  it("validates direct RPC configurations, including nulls and unsupported fields", async () => {
    for (const cfg of [
      null,
      {},
      { mode: "unknown" },
      { ...config(), extra: true },
      { ...config(), regularSeasonRaces: 0 },
      { ...config(), seedBonuses: [null] },
      { ...config(), rounds: [{ ...newRound(), races: null }] },
      {
        ...config(),
        rounds: [{ ...newRound(), resetPoints: null, addBonuses: true }],
      },
      { ...config(), rounds: [{ ...newRound(), winAdvance: true }] },
    ]) {
      await expect(
        settings("championship_settings", { ...payload(), config: cfg }),
      ).rejects.toThrow();
    }
    await expect(
      settings("championship_settings", {
        ...payload(),
        tiebreakers: ["wins", "wins"],
      }),
    ).rejects.toThrow("repeat");
    await expect(
      settings("championship_settings", {
        ...payload(),
        tiebreakers: ["made_up"],
      }),
    ).rejects.toThrow("tiebreaker");
  });
  it("publishes a configured Chase, exposes an atomic safe snapshot and locks the format", async () => {
    await settings("championship_settings", payload());
    await lastRace();
    await publish(await preview());
    const snap = (
      await query(
        "select rc_championship_snapshot($1) snapshot",
        [season],
        null,
      )
    )[0].snapshot;
    expect(snap.scores).toHaveLength(2);
    expect(JSON.stringify(snap)).not.toContain("customer_id");
    expect(JSON.stringify(snap)).not.toContain("original");
    expect(championshipStandings(snap).rows.map((r) => r.total_points)).toEqual(
      [2015, 2000],
    );
    await expect(
      settings("championship_settings", { ...payload(), version: 1 }),
    ).rejects.toThrow("lock");
    await expect(
      manage("create_race", {
        league_id: l,
        season_id: season,
        name: "Too late",
        track: "Test Speedway",
        starts_at: "2026-10-26T23:30:18Z",
      }),
    ).rejects.toThrow("calendar locks");
    // Written policies remain editable and versioned after racing begins.
    await settings("league_settings", {
      league_id: l,
      version: 0,
      name: "Test League A",
      description: "",
      rulebook: "New steward procedure",
    });
  });
  it("requires a complete calendar and sequential publication without partial writes", async () => {
    await settings("championship_settings", payload());
    const job = await preview();
    await expect(publish(job)).rejects.toThrow("expected 2 races");
    expect((await query("select count(*)::int n from rc_scores"))[0].n).toBe(0);
    const final = await lastRace();
    const later = await preview(final, 1002);
    await expect(publish(later)).rejects.toThrow("calendar order");
    await publish(job);
    await publish(later, []);
    expect(
      championshipStandings(
        (
          await query("select rc_championship_snapshot($1) snapshot", [season])
        )[0].snapshot,
      ).complete,
    ).toBe(true);
  });
  it("rejects stale configuration writes and locks archived seasons", async () => {
    await settings("championship_settings", payload());
    await expect(settings("championship_settings", payload())).rejects.toThrow(
      "changed",
    );
    await manage("archive_season", { league_id: l, season_id: season });
    await expect(
      settings("championship_settings", { ...payload(), version: 1 }),
    ).rejects.toThrow("lock");
  });
});

describe("PostgreSQL transactional championship flow", () => {
  it("creates a league, previews, publishes and reads public standings with custom points", async () => {
    const j = await preview();
    await publish(j);
    const rows = await standings();
    expect(rows.map((r) => Number(r.total_points))).toEqual([40, 35]);
    expect(rows[0].racing_name).toBe("Test Driver A");
    expect(
      (
        await query(
          "select payload,status from public.rc_imports where id=$1",
          [j],
        )
      )[0],
    ).toMatchObject({ payload: null, status: "committed" });
  });
  it("is idempotent when publication is retried and rejects duplicate hashes/subsessions", async () => {
    const j = await preview();
    await publish(j);
    await publish(j);
    expect((await standings())[0].starts).toBe(1);
    await expect(preview()).rejects.toThrow("already been submitted");
    const r2 = await manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Another race",
      track: "Test Speedway",
      starts_at: "2026-10-19T23:30:18Z",
    });
    await expect(preview(r2)).rejects.toThrow("already");
    const n = parseRaceFile(bytes(exportFixture()));
    n.hash = "a".repeat(64);
    await expect(
      query("select public.rc_preview_import($1,$2,$3::jsonb,null)", [
        r2,
        n.hash,
        JSON.stringify(n),
      ]),
    ).rejects.toThrow("already assigned");
  });
  it("requires explicit new-driver approval and rolls back every partial write", async () => {
    const j = await preview();
    await expect(publish(j, [101])).rejects.toThrow("Unmatched driver");
    expect(
      (await query("select count(*)::int n from public.rc_drivers"))[0].n,
    ).toBe(0);
    expect(
      (
        await query("select revision from public.rc_races where id=$1", [race])
      )[0].revision,
    ).toBe(0);
    await publish(j);
    expect(await standings()).toHaveLength(2);
  });
  it("enforces league isolation, composite relationships, and direct-table denial", async () => {
    await expect(
      manage("create_series", { league_id: l, name: "Intrusion" }, B),
    ).rejects.toThrow("Not authorized");
    await expect(
      manage(
        "create_season",
        { league_id: other, series_id: series, name: "Cross league" },
        B,
      ),
    ).rejects.toThrow();
    await expect(
      query("insert into public.rc_scores(race_id) values($1)", [race], B),
    ).rejects.toThrow("permission denied");
    expect(
      await query("select * from public.rc_audit where league_id=$1", [l], B),
    ).toHaveLength(0);
  });
  it("scores stages and bonuses from imported driver identities", async () => {
    await query("select 1");
    await db.query("update public.rc_races set stage_count=1 where id=$1", [
      race,
    ]);
    await manage("save_rules", {
      league_id: l,
      season_id: season,
      name: "Bonus rules",
      config: {
        ...STOCK_CAR_PRESET,
        bonus: { pole: 2, lapLed: 1, mostLapsLed: 3, fastestLap: 4 },
      },
    });
    const j = await preview();
    await publish(j, [101, 102], [[102, 101]]);
    const r = await standings();
    expect(r.find((x) => x.racing_name === "Test Driver A")?.total_points).toBe(
      "53.000",
    );
    expect(r.find((x) => x.racing_name === "Test Driver B")?.total_points).toBe(
      "52.000",
    );
  });
  it("validates stage orders transactionally and allows audited correction", async () => {
    await db.query("update public.rc_races set stage_count=1 where id=$1", [
      race,
    ]);
    const j = await preview();
    await expect(publish(j, [101, 102], [[101, 101]])).rejects.toThrow();
    expect(await standings()).toHaveLength(0);
    await publish(j, [101, 102], [[101, 102]]);
    await query("select public.rc_update_stages($1,$2::jsonb,$3)", [
      race,
      JSON.stringify([[102, 101]]),
      "Corrected official stage sheet",
    ]);
    expect((await standings())[0].stage_points).toBe("9.000");
  });
  it("applies, recalculates, appeals, and reverses a penalty exactly once", async () => {
    await publish(await preview());
    await manage("membership", {
      league_id: l,
      user_id: S,
      role: "steward",
      status: "active",
    });
    const driver = (await standings())[0].driver_id;
    const id = (
      await query(
        "select public.rc_penalty($1::jsonb) id",
        [
          JSON.stringify({
            race_id: race,
            driver_id: driver,
            type: "points",
            value: 10,
            reason: "Avoidable contact on lap 20",
          }),
        ],
        S,
      )
    )[0].id;
    expect((await standings())[0].total_points).toBe("40.000");
    await query(
      "select public.rc_penalty($1::jsonb)",
      [
        JSON.stringify({
          id,
          status: "active",
          reason: "Reviewed and confirmed by steward",
        }),
      ],
      S,
    );
    expect(
      (await standings()).find((x) => x.driver_id === driver)?.total_points,
    ).toBe("30.000");
    await query(
      "select public.rc_penalty($1::jsonb)",
      [
        JSON.stringify({
          id,
          status: "active",
          reason: "Repeated request remains idempotent",
        }),
      ],
      S,
    );
    await db.query(
      "update public.rc_driver_identities set account_id=$1 where driver_id=$2",
      [D, driver],
    );
    await query(
      "select public.rc_appeal($1,$2)",
      [id, "Please review the alternate camera angle"],
      D,
    );
    expect(
      (await standings()).find((x) => x.driver_id === driver)?.total_points,
    ).toBe("30.000");
    await query(
      "select public.rc_penalty($1::jsonb)",
      [
        JSON.stringify({
          id,
          status: "overturned",
          reason: "Alternate footage clears the driver",
        }),
      ],
      S,
    );
    expect((await standings())[0].total_points).toBe("40.000");
  });
  it("prevents stewards from importing results and visitors from privileged RPCs", async () => {
    await manage("membership", {
      league_id: l,
      user_id: S,
      role: "steward",
      status: "active",
    });
    await expect(
      manage(
        "save_rules",
        {
          league_id: l,
          season_id: season,
          name: "Unauthorized rules",
          config: STOCK_CAR_PRESET,
        },
        S,
      ),
    ).rejects.toThrow("Not authorized");
    await expect(
      query("select public.rc_manage('create_league','{}')", [], null),
    ).rejects.toThrow("permission denied");
  });
  it("preserves original results, scoring versions and team snapshots through corrections", async () => {
    const driver = await manage("create_driver", {
      league_id: l,
      racing_name: "Test Driver A",
      customer_id: 101,
    });
    const team = await manage("create_team", {
      league_id: l,
      name: "Test Team",
    });
    await manage("roster", {
      league_id: l,
      team_id: team,
      driver_id: driver,
      valid_from: "2026-01-01T00:00:00Z",
    });
    await publish(await preview());
    await manage("save_rules", {
      league_id: l,
      season_id: season,
      name: "Future rules",
      config: { ...STOCK_CAR_PRESET, finish: [100, 90] },
    });
    await expect(preview(race, 1002)).rejects.toThrow("correction");
    await publish(
      await preview(race, 1002, "Corrected file from race control"),
    );
    expect((await standings())[0].total_points).toBe("40.000");
    expect(
      (await query("select count(*)::int n from public.rc_imported_results"))[0]
        .n,
    ).toBe(4);
    expect(
      (await query("select * from public.rc_team_standings", [], null))[0]
        .team_id,
    ).toBe(team);
    await expect(
      query("update public.rc_imported_results set original='{}'"),
    ).rejects.toThrow("permission denied");
  });
  it("rejects stale correction previews and keeps an immutable audit trail", async () => {
    await publish(await preview());
    const a = await preview(race, 2001, "Correction candidate number one");
    const b = await preview(race, 2002, "Correction candidate number two");
    await publish(a);
    await expect(publish(b)).rejects.toThrow("Race changed");
    await expect(
      db.exec("update public.rc_audit set action='tamper'"),
    ).rejects.toThrow("immutable");
  });
  it("scores all drivers versus best-N team entries", async () => {
    const team = await manage("create_team", {
      league_id: l,
      name: "Two car team",
    });
    for (const [customer, name] of [
      [101, "Test Driver A"],
      [102, "Test Driver B"],
    ] as const) {
      const driver = await manage("create_driver", {
        league_id: l,
        racing_name: name,
        customer_id: customer,
      });
      await manage("roster", {
        league_id: l,
        team_id: team,
        driver_id: driver,
        valid_from: "2026-01-01T00:00:00Z",
      });
    }
    await publish(await preview());
    expect(
      Number(
        (await query("select * from public.rc_team_standings", [], null))[0]
          .total_points,
      ),
    ).toBe(75);
    await manage("save_rules", {
      league_id: l,
      season_id: season,
      name: "Best single car",
      config: { ...STOCK_CAR_PRESET, teamCount: 1 },
    });
    const r2 = await manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Second race",
      track: "Test Speedway",
      starts_at: "2026-10-19T23:30:18Z",
    });
    await publish(await preview(r2, 1002));
    expect(
      Number(
        (await query("select * from public.rc_team_standings", [], null))[0]
          .total_points,
      ),
    ).toBe(115);
    await manage("save_rules", {
      league_id: l,
      season_id: season,
      name: "All team cars",
      config: { ...STOCK_CAR_PRESET, teamCount: 0 },
    });
    const r3 = await manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Third race",
      track: "Test Speedway",
      starts_at: "2026-10-26T23:30:18Z",
    });
    await publish(await preview(r3, 1003));
    expect(
      Number(
        (await query("select * from public.rc_team_standings", [], null))[0]
          .total_points,
      ),
    ).toBe(190);
  });
  it("drops earned points but retains deductions and at least one race", async () => {
    await db.query("update public.rc_seasons set drop_weeks=1 where id=$1", [
      season,
    ]);
    await publish(await preview());
    expect(Number((await standings())[0].total_points)).toBe(40);
    const r2 = await manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Drop race",
      track: "Test Speedway",
      starts_at: "2026-10-19T23:30:18Z",
    });
    await publish(await preview(r2, 1002));
    const driver = (await standings())[0].driver_id;
    const p = (
      await query("select public.rc_penalty($1::jsonb) id", [
        JSON.stringify({
          race_id: race,
          driver_id: driver,
          type: "points",
          value: 10,
          reason: "Deduction remains on a dropped race",
        }),
      ])
    )[0].id;
    await query("select public.rc_penalty($1::jsonb)", [
      JSON.stringify({
        id: p,
        status: "active",
        reason: "Reviewed and confirmed by race control",
      }),
    ]);
    expect(
      Number(
        (await standings()).find((x) => x.driver_id === driver)?.total_points,
      ),
    ).toBe(30);
    expect(
      (await standings()).find((x) => x.driver_id === driver)?.starts,
    ).toBe(2);
  });
  it("moves finishing positions down and restores the original order on reversal", async () => {
    await publish(await preview());
    const driver = (await standings())[0].driver_id;
    const p = (
      await query("select public.rc_penalty($1::jsonb) id", [
        JSON.stringify({
          race_id: race,
          driver_id: driver,
          type: "position",
          value: 2,
          reason: "Adjusted classification after contact",
        }),
      ])
    )[0].id;
    await query("select public.rc_penalty($1::jsonb)", [
      JSON.stringify({
        id: p,
        status: "active",
        reason: "Officially move winner to second place",
      }),
    ]);
    expect((await standings())[0].racing_name).toBe("Test Driver B");
    expect(
      Number(
        (await standings()).find((x) => x.driver_id === driver)?.total_points,
      ),
    ).toBe(35);
    await query("select public.rc_penalty($1::jsonb)", [
      JSON.stringify({
        id: p,
        status: "overturned",
        reason: "Classification adjustment is reversed",
      }),
    ]);
    expect((await standings())[0].racing_name).toBe("Test Driver A");
  });
  it("disqualifies a driver without rewriting imported finishes or duplicating deductions", async () => {
    await publish(await preview());
    const driver = (await standings())[0].driver_id;
    const p = (
      await query("select public.rc_penalty($1::jsonb) id", [
        JSON.stringify({
          race_id: race,
          driver_id: driver,
          type: "disqualification",
          value: 0,
          reason: "Technical disqualification after review",
        }),
      ])
    )[0].id;
    await query("select public.rc_penalty($1::jsonb)", [
      JSON.stringify({
        id: p,
        status: "active",
        reason: "Technical inspection confirms violation",
      }),
    ]);
    const result = (
      await query("select * from public.rc_scores where driver_id=$1", [driver])
    )[0];
    expect(result.dq).toBe(true);
    expect(Number(result.total_points)).toBe(0);
    expect(result.position).toBe(2);
    expect(
      (
        await query(
          "select original from public.rc_imported_results where driver_id=$1",
          [driver],
        )
      )[0].original.position,
    ).toBe(1);
  });
  it("keeps private league schedules, standings, originals, and account linkage private", async () => {
    await db.query("update public.rc_leagues set is_public=false where id=$1", [
      l,
    ]);
    await publish(await preview());
    expect(await standings()).toHaveLength(0);
    expect(
      await query("select * from public.rc_races where league_id=$1", [l], B),
    ).toHaveLength(0);
    expect(
      await query(
        "select * from public.rc_imported_results where league_id=$1",
        [l],
        B,
      ),
    ).toHaveLength(0);
    await expect(
      query("select account_id from public.rc_driver_identities"),
    ).rejects.toThrow("permission denied");
    await db.query("insert into public.rc_platform_owners values($1)", [B]);
    expect(
      await query("select * from public.rc_scores where league_id=$1", [l], B),
    ).toHaveLength(2);
  });
  it("supports verified driver registration and prevents removing the final commissioner", async () => {
    const driver = await manage("create_driver", {
      league_id: l,
      racing_name: "Test Driver A",
      customer_id: 101,
    });
    await db.query(
      "update public.rc_driver_identities set account_id=$1 where driver_id=$2",
      [D, driver],
    );
    await manage("join_league", { league_id: l }, D);
    await expect(
      manage(
        "register",
        { league_id: l, season_id: season, driver_id: driver },
        D,
      ),
    ).rejects.toThrow("Not authorized");
    await manage("membership", {
      league_id: l,
      user_id: D,
      role: "driver",
      status: "active",
    });
    await manage(
      "register",
      { league_id: l, season_id: season, driver_id: driver },
      D,
    );
    expect(
      (await query("select * from public.rc_registrations"))[0].eligible,
    ).toBe(false);
    await expect(
      manage("membership", {
        league_id: l,
        user_id: A,
        role: "driver",
        status: "active",
      }),
    ).rejects.toThrow("retain a commissioner");
  });
  it("records incidents privately and restricts reviews to the correct league", async () => {
    await publish(await preview());
    const driver = (await standings())[0].driver_id;
    await db.query(
      "update public.rc_driver_identities set account_id=$1 where driver_id=$2",
      [D, driver],
    );
    const incident = (
      await query(
        "select public.rc_incident($1::jsonb) id",
        [
          JSON.stringify({
            race_id: race,
            driver_id: driver,
            lap: 2,
            statement: "Contact reported on the back straight",
            evidence_url: "https://example.com/replay",
          }),
        ],
        D,
      )
    )[0].id;
    expect(
      await query("select * from public.rc_incidents", [], B),
    ).toHaveLength(0);
    await expect(
      query(
        "select public.rc_incident($1::jsonb)",
        [
          JSON.stringify({
            id: incident,
            status: "reviewed",
            decision: "Reviewed by an unauthorized official",
          }),
        ],
        B,
      ),
    ).rejects.toThrow("Not authorized");
    await query("select public.rc_incident($1::jsonb)", [
      JSON.stringify({
        id: incident,
        status: "dismissed",
        decision: "Racing incident confirmed by review",
      }),
    ]);
    expect(
      (await query("select * from public.rc_incidents", [], D))[0].status,
    ).toBe("dismissed");
  });
  it("holds a next-race deduction until its target is published, then deducts once", async () => {
    await publish(await preview());
    const driver = (await standings())[0].driver_id;
    const r2 = await manage("create_race", {
      league_id: l,
      season_id: season,
      name: "Target race",
      track: "Test Speedway",
      starts_at: "2026-10-19T23:30:18Z",
    });
    const p = (
      await query("select public.rc_penalty($1::jsonb) id", [
        JSON.stringify({
          race_id: race,
          target_race_id: r2,
          driver_id: driver,
          type: "next_race",
          value: 5,
          reason: "Carry deduction into the next round",
        }),
      ])
    )[0].id;
    await expect(
      query("select public.rc_penalty($1::jsonb)", [
        JSON.stringify({
          id: p,
          status: "active",
          reason: "Confirm next round deduction now",
        }),
      ]),
    ).rejects.toThrow("published target race");
    await publish(await preview(r2, 1002));
    await query("select public.rc_penalty($1::jsonb)", [
      JSON.stringify({
        id: p,
        status: "active",
        reason: "Confirm deduction after next race",
      }),
    ]);
    expect(Number((await standings())[0].total_points)).toBe(75);
  });
  it.runIf(Boolean(process.env.ASCRL_IRACING_SAMPLE))(
    "publishes the genuine 21-driver export and verifies its source is unchanged",
    async () => {
      const source = readFileSync(process.env.ASCRL_IRACING_SAMPLE!);
      const n = parseRaceFile(source);
      const job = (
        await query(
          "select public.rc_preview_import($1,$2,$3::jsonb,null) id",
          [race, n.hash, JSON.stringify(n)],
        )
      )[0].id;
      await publish(
        job,
        n.drivers.map((d) => d.customerId),
      );
      const results = await standings();
      expect(results).toHaveLength(21);
      expect(results[0].racing_name).toBe("Josh Ball");
      expect(Number(results[0].total_points)).toBe(40);
      expect(results.reduce((sum, r) => sum + r.starts, 0)).toBe(21);
      expect(readFileSync(process.env.ASCRL_IRACING_SAMPLE!)).toEqual(source);
    },
  );

  it("rejects missing data needed for minimum-lap scoring and rolls publication back", async () => {
    const n = parseRaceFile(bytes(exportFixture()));
    n.drivers[0].laps = null;
    const j = (
      await query("select public.rc_preview_import($1,$2,$3::jsonb,null) id", [
        race,
        n.hash,
        JSON.stringify(n),
      ])
    )[0].id;
    await expect(publish(j)).rejects.toThrow("Minimum-lap eligibility");
    expect(await standings()).toHaveLength(0);
  });
  it("allows an expired preview to be uploaded again without awarding extra starts", async () => {
    const first = await preview();
    await db.query(
      "update public.rc_imports set expires_at=now()-interval '1 hour' where id=$1",
      [first],
    );
    const replacement = await preview();
    expect(replacement).not.toBe(first);
    await publish(replacement);
    expect((await standings())[0].starts).toBe(1);
  });
});
