"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { STOCK_CAR_PRESET, type ScoringRules } from "@/lib/rules";
import type { NormalizedDriver } from "@/lib/importer";

export type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox"
    | "list";
  options?: Option[];
  value?: string | number;
  required?: boolean;
  hint?: string;
  min?: number;
};
async function command(name: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: name, payload }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "The request failed.");
  return result;
}
export function CommandForm({
  name,
  fields = [],
  fixed = {},
  submit,
  href,
}: {
  name: string;
  fields?: Field[];
  fixed?: Record<string, unknown>;
  submit: string;
  href?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const values = new FormData(form),
        payload = { ...fixed };
      for (const f of fields) {
        const v = values.get(f.name);
        payload[f.name] =
          f.type === "checkbox"
            ? v === "on"
            : f.type === "number"
              ? Number(v)
              : f.type === "list"
                ? String(v)
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                : f.type === "datetime-local"
                  ? new Date(String(v)).toISOString()
                  : v;
      }
      const result = await command(name, payload);
      if (href) router.push(href.replace(":id", result.id));
      else {
        setMessage("Saved.");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="form-grid">
      {fields.map((f) => (
        <label
          key={f.name}
          className={f.type === "textarea" ? "field-wide" : ""}
        >
          <span>{f.label}</span>
          {f.type === "select" ? (
            <select
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
              rows={3}
              maxLength={5000}
            />
          ) : (
            <input
              name={f.name}
              type={f.type === "list" ? "text" : f.type || "text"}
              defaultValue={f.type === "checkbox" ? undefined : f.value}
              defaultChecked={
                f.type === "checkbox" ? Boolean(f.value) : undefined
              }
              required={f.type !== "checkbox" && f.required !== false}
              min={f.min}
              maxLength={2000}
            />
          )}{" "}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
      <div className="field-wide">
        <button disabled={busy} className="button">
          {busy ? "Saving…" : submit}
        </button>
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
export function RulesForm({
  league,
  season,
  initial,
}: {
  league: string;
  season: string;
  initial?: ScoringRules;
}) {
  const router = useRouter(),
    [rules, setRules] = useState(initial || STOCK_CAR_PRESET),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const config = {
        ...rules,
        finish: String(f.get("finish")).split(",").map(Number),
        stage: String(f.get("stage")).trim()
          ? String(f.get("stage")).split(",").map(Number)
          : [],
        bonus: Object.fromEntries(
          ["pole", "lapLed", "mostLapsLed", "fastestLap"].map((k) => [
            k,
            Number(f.get(k)),
          ]),
        ),
        dq: Number(f.get("dq")),
        defaultPoints: Number(f.get("defaultPoints")),
        teamCount: Number(f.get("teamCount")),
        minimumLaps: Number(f.get("minimumLaps")),
        classification: f.get("classification"),
        eligibility: f.get("eligibility"),
      };
      await command("save_rules", {
        league_id: league,
        season_id: season,
        name: f.get("name"),
        config,
      });
      router.push("/seasons/" + season);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="form-grid" key={JSON.stringify(rules)}>
      <div className="field-wide">
        <button
          type="button"
          className="button secondary"
          onClick={() => setRules({ ...STOCK_CAR_PRESET })}
        >
          Load stock-car preset
        </button>
        <p className="muted">
          An editable 40-point winner / 10-point stage preset. Existing
          published races keep their original rule version.
        </p>
      </div>
      <label className="field-wide">
        <span>Rule version name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue="ASCRL points"
        />
      </label>
      <label className="field-wide">
        <span>Finish points · P1, P2, P3…</span>
        <textarea
          name="finish"
          defaultValue={rules.finish.join(", ")}
          required
          rows={3}
        />
      </label>
      <label className="field-wide">
        <span>Stage points · P1, P2, P3…</span>
        <textarea name="stage" defaultValue={rules.stage.join(", ")} rows={2} />
      </label>
      {(["pole", "lapLed", "mostLapsLed", "fastestLap"] as const).map((k) => (
        <label key={k}>
          <span>
            {
              {
                pole: "Pole / first grid slot",
                lapLed: "At least one lap led",
                mostLapsLed: "Most laps led",
                fastestLap: "Fastest race lap",
              }[k]
            }
          </span>
          <input
            type="number"
            step="0.001"
            min={0}
            max={10000}
            name={k}
            defaultValue={rules.bonus[k]}
            required
          />
        </label>
      ))}
      {(["dq", "defaultPoints", "teamCount", "minimumLaps"] as const).map(
        (k) => (
          <label key={k}>
            <span>
              {
                {
                  dq: "Disqualification points",
                  defaultPoints: "Points beyond the finish table",
                  teamCount: "Team drivers counted · 0 = all",
                  minimumLaps: "Minimum laps for eligibility",
                }[k]
              }
            </span>
            <input
              type="number"
              min={0}
              max={10000}
              name={k}
              defaultValue={rules[k]}
              required
            />
          </label>
        ),
      )}
      <label>
        <span>Classification</span>
        <select name="classification" defaultValue={rules.classification}>
          <option value="overall">Overall finish</option>
          <option value="class">Finish within car class</option>
        </select>
      </label>
      <label>
        <span>Driver eligibility</span>
        <select name="eligibility" defaultValue={rules.eligibility}>
          <option value="all">Every imported driver</option>
          <option value="registered">Approved season registrations only</option>
        </select>
      </label>
      <div className="field-wide">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save new rule version"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
type Choice = {
  id: string;
  name: string;
  league_id?: string;
  series_id?: string;
  season_id?: string;
  status?: string;
};
export function UploadForm({
  leagues,
  series,
  seasons,
  races,
}: {
  leagues: Choice[];
  series: Choice[];
  seasons: Choice[];
  races: Choice[];
}) {
  const router = useRouter(),
    [league, setLeague] = useState(leagues[0]?.id || ""),
    [seriesId, setSeries] = useState(""),
    [season, setSeason] = useState(""),
    [race, setRace] = useState(""),
    [sessions, setSessions] = useState<
      { number: number; name: string; drivers: number }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const raceInfo = races.find((r) => r.id === race);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.sessions) setSessions(data.sessions);
        throw new Error(data.error);
      }
      router.push(data.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={upload}>
      <label>
        <span>League</span>
        <select
          value={league}
          onChange={(e) => {
            setLeague(e.target.value);
            setSeries("");
            setSeason("");
            setRace("");
          }}
          required
        >
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Series</span>
        <select
          value={seriesId}
          onChange={(e) => {
            setSeries(e.target.value);
            setSeason("");
            setRace("");
          }}
          required
        >
          <option value="">Select a series</option>
          {series
            .filter((s) => s.league_id === league)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>Season</span>
        <select
          value={season}
          onChange={(e) => {
            setSeason(e.target.value);
            setRace("");
          }}
          required
        >
          <option value="">Select a season</option>
          {seasons
            .filter((s) => s.series_id === seriesId && s.status !== "archived")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span>Scheduled race</span>
        <select
          name="race"
          value={race}
          onChange={(e) => {
            setRace(e.target.value);
            setSessions([]);
          }}
          required
        >
          <option value="">Select a race</option>
          {races
            .filter((r) => r.season_id === season)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.status === "published" ? " · correction" : ""}
              </option>
            ))}
        </select>
      </label>
      <div className="field-wide">
        <a href={"/leagues/" + league + "/manage"}>
          Need a race on the calendar? Create it in league management →
        </a>
      </div>
      <label className="field-wide upload-drop">
        <span>Individual iRacing event-result JSON</span>
        <input
          name="file"
          type="file"
          accept=".json,application/json"
          required
          onChange={() => setSessions([])}
        />
        <small>
          Manually downloaded from the iRacing results screen · Maximum 3 MiB
        </small>
      </label>
      {sessions.length > 0 && (
        <label className="field-wide">
          <span>Choose the intended race session</span>
          <select name="session" required>
            <option value="">Select one</option>
            {sessions.map((s) => (
              <option key={s.number} value={s.number}>
                {s.name} · session {s.number} · {s.drivers} drivers
              </option>
            ))}
          </select>
        </label>
      )}
      {raceInfo?.status === "published" && (
        <label className="field-wide">
          <span>Correction reason</span>
          <textarea name="correction" required minLength={10} rows={3} />
          <small>
            The prior classification remains in the audit history. A correction
            never adds a second scored race.
          </small>
        </label>
      )}
      <div className="field-wide">
        <button className="button" disabled={busy || !race}>
          {busy ? "Validating file…" : "Validate & preview →"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
export function StageOrders({
  drivers,
  count,
  scoringPlaces,
  onChange,
}: {
  drivers: { customerId: number; name: string }[];
  count: number;
  scoringPlaces: number;
  onChange: (orders: number[][]) => void;
}) {
  const slots = Math.min(scoringPlaces, drivers.length);
  const [orders, setOrders] = useState<number[][]>(
    Array.from({ length: count }, () => Array(slots).fill(0)),
  );
  return (
    <div className="stage-grid">
      {orders.map((stage, s) => (
        <fieldset key={s}>
          <legend>Stage {s + 1}</legend>
          {stage.map((value, i) => (
            <label key={i}>
              <span>P{i + 1}</span>
              <select
                value={value || ""}
                required
                onChange={(e) => {
                  const next = orders.map((a) => [...a]);
                  next[s][i] = Number(e.target.value);
                  setOrders(next);
                  onChange(next);
                }}
              >
                <option value="">Select driver</option>
                {drivers.map((d) => (
                  <option
                    key={d.customerId}
                    value={d.customerId}
                    disabled={
                      stage.includes(d.customerId) && d.customerId !== value
                    }
                  >
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
export function PublishForm({
  id,
  drivers,
  known,
  stages,
  scoringPlaces,
}: {
  id: string;
  drivers: NormalizedDriver[];
  known: number[];
  stages: number;
  scoringPlaces: number;
}) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState<number[][]>(
      Array.from({ length: stages }, () => []),
    );
  const unknown = drivers.filter((d) => !known.includes(d.customerId));
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await command("publish_import", {
        job: id,
        create_customers: f.getAll("create").map(Number),
        stage_orders: orders,
        confirm_metadata: f.get("confirm") === "on",
      });
      router.push("/races/" + result.id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={publish}>
      <h3>Driver matching</h3>
      <p className="muted">
        {known.length} matched by iRacing customer ID. Approve each new driver
        record below.
      </p>
      {unknown.length > 0 ? (
        <div className="approval-grid">
          {unknown.map((d) => (
            <label key={d.customerId} className="check-row">
              <input
                type="checkbox"
                name="create"
                value={d.customerId}
                required
              />
              <span>
                {d.name}
                <small>iRacing #{d.customerId} · Create driver</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="success">All drivers are matched.</p>
      )}
      {stages > 0 && (
        <>
          <h3>Stage finishing orders</h3>
          <p className="muted">
            Select the scoring positions from the imported drivers. The race
            finishing order is already captured.
          </p>
          <StageOrders
            drivers={drivers}
            count={stages}
            scoringPlaces={scoringPlaces}
            onChange={setOrders}
          />
        </>
      )}
      <label className="check-row confirm">
        <input name="confirm" type="checkbox" required />
        <span>
          I reviewed the source track, date, selected race, driver matches, and
          stage orders.
        </span>
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Publishing transaction…" : "Publish official results →"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
export function StageCorrection({
  race,
  drivers,
  count,
  scoringPlaces,
}: {
  race: string;
  drivers: { customerId: number; name: string }[];
  count: number;
  scoringPlaces: number;
}) {
  const router = useRouter(),
    [orders, setOrders] = useState<number[][]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await command("stages", { race, orders, reason: f.get("reason") });
          router.refresh();
          setError("Stage correction saved.");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <StageOrders
        drivers={drivers}
        count={count}
        scoringPlaces={scoringPlaces}
        onChange={setOrders}
      />
      <label>
        <span>Correction reason</span>
        <textarea name="reason" minLength={10} required />
      </label>
      <button disabled={busy} className="button">
        Save stage correction
      </button>
      <p role="status">{error}</p>
    </form>
  );
}
