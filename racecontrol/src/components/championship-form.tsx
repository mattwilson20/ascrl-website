"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  championshipSchema,
  newRound,
  type ChampionshipConfig,
  type PostseasonConfig,
  type ChampionshipRound,
} from "@/lib/championship";

async function save(command: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, payload }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Could not save settings.");
}
export function LeagueSettings({
  league,
}: {
  league: {
    id: string;
    name: string;
    description: string;
    rulebook: string;
    rulebook_version: number;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await save("league_settings", {
        league_id: league.id,
        version: league.rulebook_version,
        name: data.get("name"),
        description: data.get("description"),
        rulebook: data.get("rulebook"),
      });
      setMessage("League settings and rulebook saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field-wide">
        <span>League name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={league.name}
        />
      </label>
      <label className="field-wide">
        <span>League introduction</span>
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          defaultValue={league.description}
        />
      </label>
      <label className="field-wide">
        <span>Your league rulebook</span>
        <textarea
          name="rulebook"
          maxLength={50000}
          rows={16}
          defaultValue={league.rulebook}
          placeholder={
            "1. League identity and eligibility\n2. Schedule and race procedures\n3. Points, qualification and championship format\n4. Driving standards and penalties\n5. Protests, appeals and rule changes"
          }
        />
        <small>
          Write your own rules in plain text. Line breaks are preserved. Up to
          50,000 characters. The rulebook follows your league’s public or
          private visibility. Configure points and championship settings
          separately; stewards enforce written rules outside those settings.
        </small>
      </label>
      <div className="field-wide">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save league & rulebook"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

export function ChampionshipForm({
  season,
  locked,
  editable,
  calendarCount,
}: {
  season: {
    id: string;
    league_id: string;
    name: string;
    championship_config: ChampionshipConfig;
    championship_version: number;
    drop_weeks: number;
    tiebreakers: string[];
  };
  locked: boolean;
  editable: boolean;
  calendarCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ChampionshipConfig["mode"]>(
    season.championship_config.mode,
  );
  const [post, setPost] = useState<PostseasonConfig>(
    season.championship_config.mode === "full_season"
      ? {
          mode: "chase",
          regularSeasonRaces: 10,
          qualification: "points",
          minimumStarts: 0,
          seedBonuses: [],
          raceWinBonus: 0,
          stageWinBonus: 0,
          rounds: [newRound()],
        }
      : season.championship_config,
  );
  const [seedText, setSeedText] = useState(post.seedBonuses.join(", "));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const disabled = locked || !editable;
  const expected =
    post.regularSeasonRaces + post.rounds.reduce((n, r) => n + r.races, 0);
  function updateRound(index: number, patch: Partial<ChampionshipRound>) {
    setPost({
      ...post,
      rounds: post.rounds.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });
  }
  function chooseMode(value: ChampionshipConfig["mode"]) {
    setMode(value);
    if (value === "chase")
      setPost({
        ...post,
        mode: "chase",
        rounds: [{ ...post.rounds[0], winAdvance: false }],
      });
    if (value === "playoffs") setPost({ ...post, mode: "playoffs" });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = championshipSchema.safeParse(
        mode === "full_season"
          ? { mode }
          : {
              ...post,
              mode,
              seedBonuses: seedText.trim()
                ? seedText.split(",").map((v) => Number(v.trim()))
                : [],
            },
      );
      if (!parsed.success)
        throw Error(parsed.error.issues.map((i) => i.message).join(" "));
      await save("championship_settings", {
        league_id: season.league_id,
        season_id: season.id,
        version: season.championship_version,
        name: data.get("name"),
        drop_weeks: Number(data.get("drop_weeks")),
        tiebreakers: String(data.get("tiebreakers"))
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        config: parsed.data,
      });
      setMessage("Championship format saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const number = (
    label: string,
    value: number,
    change: (n: number) => void,
    max = 100000,
    min = 0,
    step = "0.001",
  ) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        required
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  return (
    <form onSubmit={submit} className="championship-form">
      <p className="muted">
        Choose the format your league uses. Settings and calendar order lock
        after the first published result. Corrections recalculate qualification
        and advancement from official results.
      </p>
      {locked && (
        <p className="notice">
          This season’s format is locked. Create a new season to use a different
          format.
        </p>
      )}
      <fieldset
        disabled={disabled || busy}
        className="form-grid championship-fields"
      >
        <legend className="sr-only">Championship settings</legend>
        <label>
          <span>Season name</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={season.name}
          />
        </label>
        <label>
          <span>Championship format</span>
          <select
            value={mode}
            onChange={(e) =>
              chooseMode(e.target.value as ChampionshipConfig["mode"])
            }
          >
            <option value="full_season">
              Full-season points · no postseason
            </option>
            <option value="chase">Chase · one championship round</option>
            <option value="playoffs">Playoffs · elimination rounds</option>
          </select>
        </label>
        <label>
          <span>
            {mode === "full_season"
              ? "Drop weeks"
              : "Regular-season drop weeks"}
          </span>
          <input
            name="drop_weeks"
            type="number"
            min={0}
            max={50}
            step={1}
            required
            defaultValue={season.drop_weeks}
          />
          <small>
            Drop lowest earned scores; always keep at least one. Penalty
            deductions remain.
          </small>
        </label>
        <label>
          <span>Tiebreakers, in priority order</span>
          <input
            name="tiebreakers"
            defaultValue={season.tiebreakers.join(", ")}
          />
          <small>
            wins, top5, top10, average_finish, latest_finish. Leave blank for
            the final stable driver-ID tie.
          </small>
        </label>
        {mode !== "full_season" && (
          <>
            {number(
              "Regular-season races",
              post.regularSeasonRaces,
              (n) => setPost({ ...post, regularSeasonRaces: n }),
              200,
              1,
              "1",
            )}
            <label>
              <span>Qualification order</span>
              <select
                value={post.qualification}
                onChange={(e) =>
                  setPost({
                    ...post,
                    qualification: e.target
                      .value as PostseasonConfig["qualification"],
                  })
                }
              >
                <option value="points">Most regular-season points</option>
                <option value="wins_then_points">
                  Most regular-season wins, then points
                </option>
              </select>
            </label>
            {number(
              "Minimum eligible regular-season starts",
              post.minimumStarts,
              (n) => setPost({ ...post, minimumStarts: n }),
              200,
              0,
              "1",
            )}
            <label>
              <span>Seed bonuses by qualifying position</span>
              <input
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="Example: 15, 10, 5"
              />
              <small>
                Comma-separated points. Missing positions receive zero. Leave
                blank for none.
              </small>
            </label>
            {number("Banked bonus per race win", post.raceWinBonus, (n) =>
              setPost({ ...post, raceWinBonus: n }),
            )}
            {number("Banked bonus per stage win", post.stageWinBonus, (n) =>
              setPost({ ...post, stageWinBonus: n }),
            )}
            <p className="field-wide muted">
              Banked bonuses include the qualifying seed plus eligible,
              non-disqualified race and stage wins before each round. Each round
              chooses whether to add that bank when points reset.
            </p>
            <div className="field-wide round-list">
              {post.rounds.map((r, i) => (
                <section key={i} className="round-editor">
                  <div className="section-heading">
                    <h3>
                      {i + 1}. {r.name || "Untitled round"}
                    </h3>
                    {mode === "playoffs" && post.rounds.length > 1 && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setPost({
                            ...post,
                            rounds: post.rounds
                              .filter((_, j) => j !== i)
                              .map((x, j, all) =>
                                j === all.length - 1
                                  ? { ...x, winAdvance: false }
                                  : x,
                              ),
                          })
                        }
                      >
                        Remove round {i + 1}
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label>
                      <span>Round {i + 1} name</span>
                      <input
                        required
                        maxLength={80}
                        value={r.name}
                        onChange={(e) =>
                          updateRound(i, { name: e.target.value })
                        }
                      />
                    </label>
                    {number(
                      `Round ${i + 1} races`,
                      r.races,
                      (n) => updateRound(i, { races: n }),
                      100,
                      1,
                      "1",
                    )}
                    {number(
                      `Round ${i + 1} field size`,
                      r.fieldSize,
                      (n) => updateRound(i, { fieldSize: n }),
                      500,
                      2,
                      "1",
                    )}
                    <label>
                      <span>Round {i + 1} points policy</span>
                      <select
                        value={r.resetPoints === null ? "carry" : "reset"}
                        onChange={(e) =>
                          updateRound(
                            i,
                            e.target.value === "carry"
                              ? { resetPoints: null, addBonuses: false }
                              : { resetPoints: 0 },
                          )
                        }
                      >
                        <option value="reset">
                          Reset points at round start
                        </option>
                        <option value="carry">
                          Carry previous championship points
                        </option>
                      </select>
                    </label>
                    {r.resetPoints !== null &&
                      number(
                        `Round ${i + 1} reset points`,
                        r.resetPoints,
                        (n) => updateRound(i, { resetPoints: n }),
                      )}
                    <label>
                      <span>Round {i + 1} ranking</span>
                      <select
                        value={r.scoring}
                        onChange={(e) =>
                          updateRound(i, {
                            scoring: e.target.value as "points" | "finish",
                          })
                        }
                      >
                        <option value="points">
                          Round points + season tiebreakers
                        </option>
                        {i === post.rounds.length - 1 && (
                          <option value="finish">
                            One-race final · best official finish
                          </option>
                        )}
                      </select>
                    </label>
                    {r.resetPoints !== null && (
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={r.addBonuses}
                          onChange={(e) =>
                            updateRound(i, { addBonuses: e.target.checked })
                          }
                        />{" "}
                        Add banked bonuses at this reset
                      </label>
                    )}
                    {i < post.rounds.length - 1 && (
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={r.winAdvance}
                          onChange={(e) =>
                            updateRound(i, { winAdvance: e.target.checked })
                          }
                        />{" "}
                        Round winners advance before drivers on points
                      </label>
                    )}
                  </div>
                </section>
              ))}
              {mode === "playoffs" && post.rounds.length < 10 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setPost({
                      ...post,
                      rounds: [
                        ...post.rounds.map((r) => ({
                          ...r,
                          scoring: "points" as const,
                        })),
                        {
                          ...newRound(
                            Math.max(2, post.rounds.at(-1)!.fieldSize - 2),
                          ),
                          name: "Final round",
                          races: 1,
                        },
                      ],
                    })
                  }
                >
                  Add playoff round +
                </button>
              )}
            </div>
            <p className="field-wide notice">
              Calendar: {calendarCount} races scheduled / {expected} required.
              Schedule exactly this many races before publishing the first
              result. Calendar order determines the regular season and each
              round.
            </p>
          </>
        )}
      </fieldset>
      {mode !== "full_season" && (
        <div className="championship-notes">
          <p>
            Postseason rounds use every eligible race score, with no drops. A
            reset replaces prior championship points and deductions. Carrying
            points preserves them. Tiebreakers use the current round;
            qualification uses the regular season.
          </p>
          <p>
            Win advancement applies only to current contenders. If winners
            exceed the next field size, round points and tiebreakers decide.
            Eliminated drivers rank below later-round drivers, then by
            full-season points. Teams continue with full-season scoring.
          </p>
          <p>
            A finish-order final ranks eligible finalists by official finish,
            with disqualified finishers behind other finishers and non-starters
            last. Points bonuses and point deductions do not change that finish
            order; position penalties and disqualifications do.
          </p>
        </div>
      )}
      {!disabled && (
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save championship format"}
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </form>
  );
}
