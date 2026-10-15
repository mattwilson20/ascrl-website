import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseRaceFile,
  ImportError,
  MAX_UPLOAD_BYTES,
} from "../src/lib/importer";
import { exportFixture, bytes } from "./fixtures";
describe("verified event_result adapter", () => {
  it("selects the race and converts zero-based finish, class, and grid positions", () => {
    const r = parseRaceFile(bytes(exportFixture()));
    expect(r.drivers[0]).toMatchObject({
      customerId: 101,
      position: 1,
      classPosition: 1,
      startPosition: 2,
      carNumber: "01",
      fastestLapTicks: 500000,
    });
    expect(r.drivers[1].startPosition).toBe(1);
    expect(r.drivers[0]).not.toHaveProperty("champ_points");
    expect(r.hash).toHaveLength(64);
  });
  it("rejects invalid JSON and unsupported envelopes", () => {
    expect(() => parseRaceFile(bytes("no"))).toThrow("Unsupported");
    expect(() => parseRaceFile(new TextEncoder().encode("{"))).toThrow(
      "valid UTF-8 JSON",
    );
  });
  it("requires explicit selection among multiple races", () => {
    const f = exportFixture();
    f.data.session_results.push({
      ...f.data.session_results[1],
      simsession_number: 1,
      simsession_name: "RACE 2",
    });
    expect(() => parseRaceFile(bytes(f))).toThrow(ImportError);
    expect(parseRaceFile(bytes(f), 1).raceSession).toBe(1);
    expect(() => parseRaceFile(bytes(f), -2)).toThrow("not a race");
  });
  it("rejects practice-only files", () => {
    const f = exportFixture();
    f.data.session_results = f.data.session_results.slice(0, 1);
    expect(() => parseRaceFile(bytes(f))).toThrow("No race");
  });
  it("rejects incomplete and one-based finishing orders", () => {
    const f = exportFixture();
    f.data.session_results[1].results.forEach((r) => r.finish_position++);
    expect(() => parseRaceFile(bytes(f))).toThrow("zero-based");
  });
  it("rejects duplicate driver identities", () => {
    const f = exportFixture();
    f.data.session_results[1].results[1].cust_id = 101;
    expect(() => parseRaceFile(bytes(f))).toThrow("Duplicate customer");
  });
  it("preserves missing optional fields as unknown and sentinel lap times as null", () => {
    const f = exportFixture();
    const row = f.data.session_results[1].results[0];
    row.best_lap_time = -1;
    Reflect.deleteProperty(row, "incidents");
    const r = parseRaceFile(bytes(f));
    expect(r.drivers[0].fastestLapTicks).toBeNull();
    expect(r.drivers[0].incidents).toBeNull();
    expect(r.warnings.join()).toContain("incidents");
  });
  it("limits uploads before parsing", () =>
    expect(() => parseRaceFile(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toThrow(
      "3 MiB",
    ));
  it("refuses team events and incomplete class positions", () => {
    const f = exportFixture();
    f.data.driver_changes = true;
    expect(() => parseRaceFile(bytes(f))).toThrow("Driver-change");
    f.data.driver_changes = false;
    f.data.session_results[1].results[1].finish_position_in_class = 0;
    expect(() => parseRaceFile(bytes(f))).toThrow("Class finishing");
  });
  it.skipIf(!process.env.ASCRL_IRACING_SAMPLE)(
    "parses the original user-provided eventresult-89327098.json without modifying it",
    () => {
      const raw = readFileSync(process.env.ASCRL_IRACING_SAMPLE!);
      const race = parseRaceFile(raw);
      expect(race.subsessionId).toBe(89327098);
      expect(race.raceSession).toBe(0);
      expect(race.track).toBe("Talladega Superspeedway");
      expect(race.drivers).toHaveLength(21);
      expect(race.drivers[0]).toMatchObject({
        customerId: 92537,
        name: "Josh Ball",
        position: 1,
        startPosition: 2,
        carNumber: "33",
        laps: 100,
        lapsLed: 21,
        incidents: 20,
        fastestLapTicks: 492273,
      });
      expect(
        race.drivers.find((d) => d.customerId === 518474)?.startPosition,
      ).toBe(1);
      expect(race.drivers.at(-1)?.position).toBe(21);
      expect(readFileSync(process.env.ASCRL_IRACING_SAMPLE!).equals(raw)).toBe(
        true,
      );
    },
  );
});
