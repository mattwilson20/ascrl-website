import { z } from "zod";
const points = z.number().min(0).max(10000).multipleOf(0.001);
export const rulesSchema = z.object({
  finish: z.array(points).min(1).max(500),
  stage: z.array(points).max(500),
  bonus: z.object({
    pole: points,
    lapLed: points,
    mostLapsLed: points,
    fastestLap: points,
  }),
  dq: points.int(),
  defaultPoints: points.int(),
  classification: z.enum(["overall", "class"]),
  teamCount: z.number().int().min(0).max(500),
  eligibility: z.enum(["all", "registered"]),
  minimumLaps: z.number().int().min(0).max(10000),
});
export type ScoringRules = z.infer<typeof rulesSchema>;
// Editable stock-car preset, not a claim to reproduce any current NASCAR sanctioning rules.
export const STOCK_CAR_PRESET: ScoringRules = {
  finish: [40, 35, ...Array.from({ length: 34 }, (_, i) => 34 - i)],
  stage: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  bonus: { pole: 0, lapLed: 0, mostLapsLed: 0, fastestLap: 0 },
  dq: 0,
  defaultPoints: 1,
  classification: "overall",
  teamCount: 2,
  eligibility: "all",
  minimumLaps: 1,
};
