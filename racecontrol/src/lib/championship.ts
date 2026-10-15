import { z } from "zod";

const points = z.number().min(0).max(100000).multipleOf(0.001);
const roundSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    races: z.number().int().min(1).max(100),
    fieldSize: z.number().int().min(2).max(500),
    resetPoints: points.nullable(),
    addBonuses: z.boolean(),
    winAdvance: z.boolean(),
    scoring: z.enum(["points", "finish"]),
  })
  .strict();
export const championshipSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("full_season") }).strict(),
    z
      .object({
        mode: z.enum(["chase", "playoffs"]),
        regularSeasonRaces: z.number().int().min(1).max(200),
        qualification: z.enum(["points", "wins_then_points"]),
        minimumStarts: z.number().int().min(0).max(200),
        seedBonuses: z.array(points).max(500),
        raceWinBonus: points,
        stageWinBonus: points,
        rounds: z.array(roundSchema).min(1).max(10),
      })
      .strict(),
  ])
  .superRefine((c, ctx) => {
    if (c.mode === "full_season") return;
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (c.minimumStarts > c.regularSeasonRaces)
      issue("Minimum starts cannot exceed the regular season.");
    if (c.mode === "chase" && c.rounds.length !== 1)
      issue("A Chase has one round. Choose playoffs for eliminations.");
    if (c.regularSeasonRaces + c.rounds.reduce((n, r) => n + r.races, 0) > 500)
      issue("A championship can have at most 500 races.");
    c.rounds.forEach((r, i) => {
      if (i && r.fieldSize >= c.rounds[i - 1].fieldSize)
        issue(
          "Each playoff round must have a smaller field than the previous round.",
        );
      if (r.resetPoints === null && r.addBonuses)
        issue("Seeding bonuses can only be added when points reset.");
      if (i === c.rounds.length - 1 && r.winAdvance)
        issue("Win advancement belongs on rounds before the final.");
      if (
        r.scoring === "finish" &&
        (i !== c.rounds.length - 1 || r.races !== 1)
      )
        issue("Finish-order scoring requires a one-race final round.");
    });
  });
export type ChampionshipConfig = z.infer<typeof championshipSchema>;
export type PostseasonConfig = Exclude<
  ChampionshipConfig,
  { mode: "full_season" }
>;
export type ChampionshipRound = z.infer<typeof roundSchema>;
export const newRound = (fieldSize = 16): ChampionshipRound => ({
  name: "Championship round",
  races: 3,
  fieldSize,
  resetPoints: 2000,
  addBonuses: true,
  winAdvance: false,
  scoring: "points",
});

export type RaceFact = {
  id: string;
  starts_at: string;
  status: string;
  revision: number;
};
export type ScoreFact = {
  race_id: string;
  driver_id: string;
  position: number;
  dq: boolean;
  eligible: boolean;
  finish_points: number;
  stage_points: number;
  bonus_points: number;
  penalty_points: number;
};
export type StageFact = {
  race_id: string;
  revision: number;
  driver_id: string;
  position: number;
};
export type Standing = Record<string, unknown> & {
  driver_id: string;
  championship_position: number;
  total_points: number;
};
export type ChampionshipSnapshot = {
  season: {
    championship_config: ChampionshipConfig;
    drop_weeks: number;
    tiebreakers: string[];
  };
  races: RaceFact[];
  scores: ScoreFact[];
  stages: StageFact[];
  standings: Standing[];
};
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Pure projection of one RLS-protected, transactionally consistent database snapshot.
 * Corrections always recompute qualification and advancement from official race facts.
 */
export function championshipStandings(snapshot: ChampionshipSnapshot): {
  rows: Standing[];
  phase: string;
  complete: boolean;
} {
  const parsed = championshipSchema.parse(snapshot.season.championship_config);
  const baseline = snapshot.standings.map((s) => ({
    ...s,
    total_points: Number(s.total_points),
  }));
  if (parsed.mode === "full_season")
    return { rows: baseline, phase: "Full-season points", complete: false };
  const c = parsed;
  const calendar = [...snapshot.races].sort(
    (a, b) =>
      a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
  );
  const expected =
    c.regularSeasonRaces + c.rounds.reduce((n, r) => n + r.races, 0);
  const firstPending = calendar.findIndex((r) => r.status !== "published");
  const published = firstPending < 0 ? calendar.length : firstPending;
  if (calendar.slice(published).some((r) => r.status === "published"))
    throw Error("Championship results must be published in calendar order.");
  if (published && calendar.length !== expected)
    throw Error(
      "The championship calendar does not match the configured format.",
    );
  if (published < c.regularSeasonRaces)
    return {
      rows: baseline.map((s) => ({
        ...s,
        championship_status: "Regular season",
        season_points: s.total_points,
      })),
      phase: `Regular season · ${published} / ${c.regularSeasonRaces} races`,
      complete: false,
    };
  const raceIndex = new Map(calendar.map((r, i) => [r.id, i]));
  const validScores = snapshot.scores.filter(
    (s) => s.eligible && (raceIndex.get(s.race_id) ?? Infinity) < published,
  );
  const byDriver = new Map<string, ScoreFact[]>();
  for (const s of validScores)
    byDriver.set(s.driver_id, [...(byDriver.get(s.driver_id) ?? []), s]);
  function aggregate(id: string, start: number, end: number, drops = 0) {
    const scores = (byDriver.get(id) ?? [])
      .filter((s) => {
        const index = raceIndex.get(s.race_id)!;
        return index >= start && index < end;
      })
      .sort((a, b) => raceIndex.get(a.race_id)! - raceIndex.get(b.race_id)!);
    const earned = (s: ScoreFact) =>
      Number(s.finish_points) + Number(s.stage_points) + Number(s.bonus_points);
    const dropped = new Set(
      [...scores]
        .sort(
          (a, b) =>
            earned(a) - earned(b) ||
            raceIndex.get(a.race_id)! - raceIndex.get(b.race_id)!,
        )
        .slice(0, Math.min(drops, Math.max(scores.length - 1, 0))),
    );
    return {
      total: rounded(
        scores.reduce(
          (n, s) =>
            n + (dropped.has(s) ? 0 : earned(s)) - Number(s.penalty_points),
          0,
        ),
      ),
      starts: scores.length,
      wins: scores.filter((s) => s.position === 1 && !s.dq).length,
      top5: scores.filter((s) => s.position <= 5 && !s.dq).length,
      top10: scores.filter((s) => s.position <= 10 && !s.dq).length,
      average_finish: scores.length
        ? rounded(scores.reduce((n, s) => n + s.position, 0) / scores.length)
        : Infinity,
      latest_finish: scores.at(-1)?.position ?? Infinity,
    };
  }
  type Stats = ReturnType<typeof aggregate>;
  const regular = new Map(
    baseline.map((s) => [
      s.driver_id,
      aggregate(
        s.driver_id,
        0,
        c.regularSeasonRaces,
        snapshot.season.drop_weeks,
      ),
    ]),
  );
  function tie(a: string, b: string, stats: Map<string, Stats>) {
    const x = stats.get(a)!,
      y = stats.get(b)!;
    for (const key of snapshot.season.tiebreakers) {
      const k = key as keyof Stats;
      const difference =
        key === "wins" || key === "top5" || key === "top10"
          ? y[k] - x[k]
          : x[k] - y[k];
      if (difference && !Number.isNaN(difference)) return difference;
    }
    return a.localeCompare(b);
  }
  const qualified = baseline
    .map((s) => s.driver_id)
    .filter((id) => regular.get(id)!.starts >= Math.max(1, c.minimumStarts))
    .sort(
      (a, b) =>
        (c.qualification === "wins_then_points"
          ? regular.get(b)!.wins - regular.get(a)!.wins
          : 0) ||
        regular.get(b)!.total - regular.get(a)!.total ||
        tie(a, b, regular),
    )
    .slice(0, c.rounds[0].fieldSize);
  const seed = new Map(qualified.map((id, i) => [id, c.seedBonuses[i] ?? 0]));
  const scoreByRaceDriver = new Map(
    validScores.map((s) => [s.race_id + ":" + s.driver_id, s]),
  );
  function bankedBonus(id: string, before: number) {
    const wins = aggregate(id, 0, before).wins;
    const stageWins = snapshot.stages.filter((st) => {
      const index = raceIndex.get(st.race_id);
      const score = scoreByRaceDriver.get(st.race_id + ":" + id);
      return (
        st.driver_id === id &&
        st.position === 1 &&
        index !== undefined &&
        index < before &&
        st.revision === calendar[index].revision &&
        score &&
        !score.dq
      );
    }).length;
    return rounded(
      (seed.get(id) ?? 0) + wins * c.raceWinBonus + stageWins * c.stageWinBonus,
    );
  }
  let contenders = qualified,
    start = c.regularSeasonRaces,
    phase = "",
    complete = false,
    finishScoring = false;
  let previous = new Map(qualified.map((id) => [id, regular.get(id)!.total]));
  const reached = new Map(qualified.map((id) => [id, 0]));
  const status = new Map(qualified.map((id) => [id, "Qualified"]));
  let currentPoints = previous;
  for (let i = 0; i < c.rounds.length; i++) {
    const r = c.rounds[i],
      end = start + r.races;
    finishScoring = r.scoring === "finish";
    const stats = new Map(
      contenders.map((id) => [
        id,
        aggregate(id, start, Math.min(end, published)),
      ]),
    );
    const pointMap = new Map(
      contenders.map((id) => [
        id,
        rounded(
          (r.resetPoints === null
            ? previous.get(id)!
            : r.resetPoints + (r.addBonuses ? bankedBonus(id, start) : 0)) +
            stats.get(id)!.total,
        ),
      ]),
    );
    const finishRank = (id: string) => {
      const sc = scoreByRaceDriver.get((calendar[start]?.id ?? "") + ":" + id);
      return sc ? (sc.dq ? 100000 : 0) + sc.position : 1000000;
    };
    const rank = (a: string, b: string) =>
      (r.scoring === "finish" && published > start
        ? finishRank(a) - finishRank(b)
        : pointMap.get(b)! - pointMap.get(a)!) || tie(a, b, stats);
    contenders.sort(rank);
    currentPoints = pointMap;
    phase = `${r.name} · ${Math.max(0, Math.min(published - start, r.races))} / ${r.races} races`;
    for (const id of contenders) {
      reached.set(id, i);
      status.set(id, r.name);
    }
    if (published < end) break;
    if (i === c.rounds.length - 1) {
      complete = true;
      if (contenders.length) status.set(contenders[0], "Champion");
      phase = `${r.name} · Complete`;
      break;
    }
    const advancing = [...contenders]
      .sort(
        (a, b) =>
          (r.winAdvance
            ? Number(stats.get(b)!.wins > 0) - Number(stats.get(a)!.wins > 0)
            : 0) || rank(a, b),
      )
      .slice(0, c.rounds[i + 1].fieldSize);
    for (const id of contenders)
      if (!advancing.includes(id)) status.set(id, `Eliminated · ${r.name}`);
    contenders = advancing;
    previous = pointMap;
    start = end;
  }
  const active = new Set(contenders);
  const ordered = [...baseline].sort((a, b) => {
    const ai = contenders.indexOf(a.driver_id),
      bi = contenders.indexOf(b.driver_id);
    if (ai >= 0 || bi >= 0) return ai < 0 ? 1 : bi < 0 ? -1 : ai - bi;
    return (
      (reached.get(b.driver_id) ?? -1) - (reached.get(a.driver_id) ?? -1) ||
      a.championship_position - b.championship_position
    );
  });
  const leader = currentPoints.get(contenders[0]);
  return {
    rows: ordered.map((s, i) => ({
      ...s,
      championship_position: i + 1,
      championship_status: status.get(s.driver_id) ?? "Did not qualify",
      season_points: s.total_points,
      total_points: active.has(s.driver_id)
        ? currentPoints.get(s.driver_id)!
        : s.total_points,
      gap:
        active.has(s.driver_id) && !finishScoring
          ? rounded((leader ?? 0) - currentPoints.get(s.driver_id)!)
          : null,
    })),
    phase,
    complete,
  };
}
