import { describe, expect, it } from "vitest";
import {
  championshipSchema,
  championshipStandings,
  newRound,
  type ChampionshipSnapshot,
  type PostseasonConfig,
  type ScoreFact,
} from "../src/lib/championship";

const config = (): PostseasonConfig => ({
  mode: "playoffs",
  regularSeasonRaces: 2,
  qualification: "points",
  minimumStarts: 1,
  seedBonuses: [],
  raceWinBonus: 0,
  stageWinBonus: 0,
  rounds: [
    {
      ...newRound(4),
      name: "Semifinal",
      races: 1,
      resetPoints: 100,
      addBonuses: false,
    },
    {
      ...newRound(2),
      name: "Final",
      races: 1,
      resetPoints: 500,
      addBonuses: false,
    },
  ],
});
function fixture(published = 2, c = config()): ChampionshipSnapshot {
  const total =
    c.regularSeasonRaces + c.rounds.reduce((n, r) => n + r.races, 0);
  const races = Array.from({ length: total }, (_, i) => ({
    id: `race-${i}`,
    starts_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    status: i < published ? "published" : "scheduled",
    revision: i < published ? 1 : 0,
  }));
  const scores: ScoreFact[] = [];
  for (let r = 0; r < published; r++)
    for (let d = 0; d < 5; d++)
      scores.push({
        race_id: races[r].id,
        driver_id: String(d),
        position: d + 1,
        dq: false,
        eligible: true,
        finish_points: 50 - d * 10,
        stage_points: 0,
        bonus_points: 0,
        penalty_points: 0,
      });
  return {
    season: {
      championship_config: c,
      drop_weeks: 0,
      tiebreakers: ["wins", "top5", "latest_finish"],
    },
    races,
    scores,
    stages: [],
    standings: Array.from({ length: 5 }, (_, i) => ({
      driver_id: String(i),
      championship_position: i + 1,
      total_points: published * (50 - i * 10),
    })),
  };
}
const row = (s: ChampionshipSnapshot, id: string) =>
  championshipStandings(s).rows.find((r) => r.driver_id === id)!;
const score = (s: ChampionshipSnapshot, id: string, race: number) =>
  s.scores.find((r) => r.driver_id === id && r.race_id === `race-${race}`)!;

describe("configurable driver championships", () => {
  it("leaves full-season standings unchanged", () => {
    const s = fixture();
    s.season.championship_config = { mode: "full_season" };
    expect(championshipStandings(s).rows).toEqual(s.standings);
  });
  it("shows regular-season points before the cut and resets immediately after it", () => {
    expect(row(fixture(1), "0").total_points).toBe(50);
    const s = fixture();
    expect(row(s, "0").total_points).toBe(100);
    expect(row(s, "4").championship_status).toBe("Did not qualify");
    expect(row(s, "4").season_points).toBe(20);
  });
  it("requires eligible starts to qualify, even if minimum starts is zero", () => {
    const s = fixture();
    (s.season.championship_config as PostseasonConfig).minimumStarts = 0;
    s.scores = s.scores.filter((sc) => sc.driver_id !== "0");
    expect(row(s, "0").championship_status).toBe("Did not qualify");
    expect(row(s, "4").championship_status).toBe("Semifinal");
  });
  it("can qualify on wins before points while enforcing minimum starts", () => {
    const c = config();
    c.qualification = "wins_then_points";
    c.minimumStarts = 2;
    const s = fixture(2, c);
    score(s, "4", 0).position = 1;
    expect(row(s, "4").championship_status).toBe("Semifinal");
    score(s, "4", 1).eligible = false;
    expect(row(s, "4").championship_status).toBe("Did not qualify");
  });
  it("does not drop penalty deductions at the regular-season cut", () => {
    const s = fixture();
    s.season.drop_weeks = 1;
    score(s, "0", 0).finish_points = 1;
    score(s, "0", 0).penalty_points = 100;
    expect(row(s, "0").championship_status).toBe("Did not qualify");
  });
  it("adds seed, race-win and current-revision stage-win bonuses once per reset", () => {
    const c = config();
    c.seedBonuses = [15];
    c.raceWinBonus = 5;
    c.stageWinBonus = 2;
    c.rounds[0].addBonuses = true;
    const s = fixture(2, c);
    s.stages.push(
      { race_id: "race-0", driver_id: "0", position: 1, revision: 1 },
      { race_id: "race-1", driver_id: "0", position: 1, revision: 0 },
    );
    expect(row(s, "0").total_points).toBe(127);
    score(s, "0", 0).dq = true;
    expect(row(s, "0").total_points).toBe(120);
  });
  it("does not award stage-win bonuses to an ineligible driver", () => {
    const c = config();
    c.stageWinBonus = 20;
    c.rounds[0].addBonuses = true;
    const s = fixture(2, c);
    score(s, "0", 0).eligible = false;
    s.stages.push({
      race_id: "race-0",
      driver_id: "0",
      position: 1,
      revision: 1,
    });
    expect(row(s, "0").total_points).toBe(100);
  });
  it("advances round winners before points and excludes non-contender wins", () => {
    const c = config();
    c.rounds[0].winAdvance = true;
    const s = fixture(3, c);
    score(s, "0", 2).position = 2;
    score(s, "2", 2).position = 1;
    expect(row(s, "2").championship_status).toBe("Final");
    expect(row(s, "1").championship_status).toBe("Eliminated · Semifinal");
    score(s, "2", 2).dq = true;
    score(s, "4", 2).position = 1;
    expect(row(s, "2").championship_status).toBe("Eliminated · Semifinal");
    expect(row(s, "4").championship_status).toBe("Did not qualify");
  });
  it("uses points when more round winners exist than available advancement slots", () => {
    const c = config();
    c.rounds[0].races = 3;
    c.rounds[0].winAdvance = true;
    const s = fixture(5, c);
    for (let r = 2; r < 5; r++)
      for (let d = 0; d < 5; d++)
        score(s, String(d), r).position = d === r - 2 ? 1 : d + 2;
    expect([
      row(s, "0").championship_status,
      row(s, "1").championship_status,
      row(s, "2").championship_status,
    ]).toEqual(["Final", "Final", "Eliminated · Semifinal"]);
  });
  it("carries previous points and deductions without adding the bank twice", () => {
    const c = config();
    c.rounds[1].resetPoints = null;
    const s = fixture(4, c);
    score(s, "0", 2).penalty_points = 5;
    expect(row(s, "0").total_points).toBe(195);
    expect(championshipStandings(s).complete).toBe(true);
  });
  it("ranks all finalists above eliminated and unqualified drivers", () => {
    const s = fixture(4);
    score(s, "0", 3).penalty_points = 1000;
    const result = championshipStandings(s);
    expect(result.rows.map((r) => r.driver_id)).toEqual([
      "1",
      "0",
      "2",
      "3",
      "4",
    ]);
    expect(row(s, "1").championship_status).toBe("Champion");
  });
  it("supports a Chase with one reset and no eliminations", () => {
    const c = config();
    c.mode = "chase";
    c.rounds = [{ ...c.rounds[0], races: 3 }];
    const s = fixture(5, c);
    expect(championshipStandings(s).complete).toBe(true);
    expect(row(s, "3").championship_status).toBe("Semifinal");
    expect(row(s, "0").total_points).toBe(250);
  });
  it("supports a one-race finish-order final, including DQ and missing drivers", () => {
    const c = config();
    c.rounds[1].scoring = "finish";
    const s = fixture(4, c);
    score(s, "0", 3).position = 10;
    score(s, "1", 3).position = 2;
    score(s, "1", 3).penalty_points = 1000;
    expect(championshipStandings(s).rows[0].driver_id).toBe("1");
    score(s, "1", 3).dq = true;
    expect(championshipStandings(s).rows[0].driver_id).toBe("0");
    s.scores = s.scores.filter(
      (sc) => !(sc.driver_id === "0" && sc.race_id === "race-3"),
    );
    expect(championshipStandings(s).rows[0].driver_id).toBe("1");
  });
  it("recomputes a corrected qualification cut and playoff advancement", () => {
    const s = fixture(4);
    expect(row(s, "4").championship_status).toBe("Did not qualify");
    score(s, "4", 0).finish_points = 1000;
    score(s, "4", 2).finish_points = 1000;
    score(s, "4", 3).finish_points = 1000;
    expect(row(s, "4").championship_status).toBe("Champion");
    expect(row(s, "3").championship_status).toBe("Did not qualify");
  });
  it("breaks point ties deterministically using configured statistics then driver ID", () => {
    const c = config();
    c.rounds[0].fieldSize = 2;
    c.rounds = [c.rounds[0]];
    const s = fixture(2, c);
    for (const sc of s.scores) sc.finish_points = 10;
    score(s, "4", 1).position = 1;
    expect(row(s, "4").championship_status).toBe("Semifinal");
    s.season.tiebreakers = [];
    expect(row(s, "4").championship_status).toBe("Did not qualify");
  });
  it("rejects inconsistent calendar snapshots instead of silently advancing", () => {
    const s = fixture();
    s.races[3].status = "published";
    expect(() => championshipStandings(s)).toThrow("calendar order");
    s.races.pop();
    expect(() => championshipStandings(s)).toThrow("does not match");
  });
  it("rejects ambiguous or impossible configurations", () => {
    const invalid = [
      { ...config(), minimumStarts: 3 },
      { ...config(), mode: "chase" },
      { ...config(), rounds: [newRound(2), newRound(4)] },
      { ...config(), rounds: [{ ...newRound(), resetPoints: null }] },
      { ...config(), rounds: [{ ...newRound(), scoring: "finish", races: 2 }] },
      { ...config(), rounds: [{ ...newRound(), winAdvance: true }] },
      { ...config(), raceWinBonus: -1 },
      { ...config(), injected: "unsupported" },
    ];
    for (const c of invalid)
      expect(championshipSchema.safeParse(c).success).toBe(false);
  });
});
