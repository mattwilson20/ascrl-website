import { createHash } from "node:crypto";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const ADAPTER = "iracing-event-result-v1" as const;
export class ImportError extends Error {
  constructor(
    message: string,
    public sessions?: { number: number; name: string; drivers: number }[],
  ) {
    super(message);
    this.name = "ImportError";
  }
}
export type NormalizedDriver = {
  customerId: number;
  name: string;
  carNumber: string | null;
  position: number;
  classPosition: number | null;
  startPosition: number | null;
  classId: number | null;
  carId: number | null;
  laps: number | null;
  lapsLed: number | null;
  fastestLapTicks: number | null;
  incidents: number | null;
  reasonOut: string | null;
  disqualified: boolean;
};
export type NormalizedRace = {
  adapter: typeof ADAPTER;
  hash: string;
  subsessionId: number;
  sessionId: number | null;
  raceSession: number;
  date: string;
  track: string;
  drivers: NormalizedDriver[];
  warnings: string[];
};
const int = z.number().int().safe();
const resultSchema = z.object({
  cust_id: int.positive(),
  display_name: z.string().trim().min(1).max(100),
  finish_position: int.min(0).max(499),
  finish_position_in_class: int.min(0).max(499).optional(),
  starting_position: int.min(-1).max(499).optional(),
  car_class_id: int.min(0).optional(),
  car_id: int.min(0).optional(),
  laps_complete: int.min(0).max(100000).optional(),
  laps_lead: int.min(0).max(100000).optional(),
  best_lap_time: int.min(-1).optional(),
  incidents: int.min(0).max(100000).optional(),
  reason_out: z.string().max(100).optional(),
  ai: z.boolean().optional(),
  livery: z.object({ car_number: z.string().max(12).optional() }).optional(),
});
const sessionSchema = z.object({
  simsession_number: int,
  simsession_name: z.string(),
  simsession_type: int,
  results: z.array(z.unknown()).max(500),
});
const eventSchema = z.object({
  type: z.literal("event_result"),
  data: z.object({
    subsession_id: int.positive(),
    session_id: int.positive().optional(),
    start_time: z.iso.datetime({ offset: true }),
    track: z.object({
      track_name: z.string().min(2).max(180),
      config_name: z.string().max(100).optional(),
    }),
    driver_changes: z.boolean().optional(),
    results_restricted: z.boolean().optional(),
    session_results: z.array(sessionSchema).min(1).max(50),
  }),
});

/** Adapter verified against the user's original eventresult-89327098.json (2026-10-14).
 * Only this explicit export envelope is accepted. New shapes need a separate reviewed adapter.
 * iRacing finish, class finish, and starting positions are zero-based in this schema.
 * Preserve raw lap-time ticks; -1 and 0 mean no valid lap, never zero-duration fastest laps.
 * Licensing, country, friend flags, liveries, and iRacing point totals are not persisted.
 */
export function parseRaceFile(
  bytes: Uint8Array,
  selectedSession?: number,
): NormalizedRace {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new ImportError("Upload a nonempty JSON file no larger than 3 MiB.");
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/, ""),
    );
  } catch {
    throw new ImportError(
      "The file is not valid UTF-8 JSON. Download the individual event result again.",
    );
  }
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success)
    throw new ImportError(
      'Unsupported or incomplete iRacing export. Expected type "event_result", data.session_results, subsession ID, track, and start time. ' +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  const { data } = parsed.data;
  if (data.driver_changes)
    throw new ImportError(
      "Driver-change/team events need a separate team-event adapter. They cannot be scored as individual driver races.",
    );
  if (data.results_restricted)
    throw new ImportError(
      "This export marks its results restricted; complete classifications are required.",
    );
  const races = data.session_results.filter((s) => s.simsession_type === 6);
  const summaries = races.map((s) => ({
    number: s.simsession_number,
    name: s.simsession_name,
    drivers: s.results.length,
  }));
  if (!races.length)
    throw new ImportError(
      "No race session (simsession_type 6) was found. Practice and qualifying cannot be imported as a race.",
    );
  if (new Set(races.map((r) => r.simsession_number)).size !== races.length)
    throw new ImportError("Duplicate race-session identifiers are ambiguous.");
  if (races.length > 1 && selectedSession === undefined)
    throw new ImportError(
      "This file contains multiple race sessions. Select the intended race explicitly.",
      summaries,
    );
  const race =
    selectedSession === undefined
      ? races[0]
      : races.find((s) => s.simsession_number === selectedSession);
  if (!race)
    throw new ImportError(
      "The selected session is not a race session.",
      summaries,
    );
  if (!race.results.length)
    throw new ImportError("The selected race has no driver results.");
  const drivers = race.results
    .map((raw, index): NormalizedDriver => {
      const item = resultSchema.safeParse(raw);
      if (!item.success)
        throw new ImportError(
          `Race result ${index + 1} is incomplete: ${item.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
        );
      const r = item.data;
      if (r.ai)
        throw new ImportError(
          "AI competitors require an explicit eligibility policy; this adapter only accepts human driver races.",
        );
      return {
        customerId: r.cust_id,
        name: r.display_name,
        carNumber: r.livery?.car_number ?? null,
        position: r.finish_position + 1,
        classPosition:
          r.finish_position_in_class === undefined
            ? null
            : r.finish_position_in_class + 1,
        startPosition:
          r.starting_position === undefined || r.starting_position < 0
            ? null
            : r.starting_position + 1,
        classId: r.car_class_id ?? null,
        carId: r.car_id ?? null,
        laps: r.laps_complete ?? null,
        lapsLed: r.laps_lead ?? null,
        fastestLapTicks:
          r.best_lap_time && r.best_lap_time > 0 ? r.best_lap_time : null,
        incidents: r.incidents ?? null,
        reasonOut: r.reason_out ?? null,
        disqualified: /^disqualif(?:ied|ication)$/i.test(r.reason_out ?? ""),
      };
    })
    .sort((a, b) => a.position - b.position);
  if (new Set(drivers.map((d) => d.customerId)).size !== drivers.length)
    throw new ImportError(
      "Duplicate customer IDs: individual-driver matching is ambiguous.",
    );
  if (drivers.some((d, i) => d.position !== i + 1))
    throw new ImportError(
      "Finishing positions must form a complete zero-based sequence in this verified schema. Missing, repeated, or one-based positions are not accepted.",
    );
  const starts = drivers
    .map((d) => d.startPosition)
    .filter((p): p is number => p !== null);
  if (
    new Set(starts).size !== starts.length ||
    starts.some((p) => p > drivers.length)
  )
    throw new ImportError(
      "Starting positions are duplicated or exceed the grid.",
    );
  for (const classId of new Set(
    drivers.map((d) => d.classId).filter((c) => c !== null),
  )) {
    const group = drivers.filter((d) => d.classId === classId);
    const positions = group
      .map((d) => d.classPosition)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);
    if (
      positions.length &&
      (positions.length !== group.length ||
        positions.some((p, i) => p !== i + 1))
    )
      throw new ImportError(
        "Class finishing positions are incomplete or ambiguous.",
      );
  }
  const warnings = [
    "Stage results are not part of this verified export schema. Enter stage orders if this race awards stage points.",
  ];
  const optional = [
    "laps",
    "lapsLed",
    "incidents",
    "startPosition",
    "classId",
  ] as const;
  for (const field of optional)
    if (drivers.some((d) => d[field] === null))
      warnings.push(
        `${field} is unavailable for one or more drivers. Related bonuses may prevent publication.`,
      );
  const config = data.track.config_name;
  return {
    adapter: ADAPTER,
    hash: createHash("sha256").update(bytes).digest("hex"),
    subsessionId: data.subsession_id,
    sessionId: data.session_id ?? null,
    raceSession: race.simsession_number,
    date: data.start_time,
    track:
      data.track.track_name +
      (config && config !== "N/A" ? " — " + config : ""),
    drivers,
    warnings,
  };
}
