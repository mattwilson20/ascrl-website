import { z } from "zod";
import { authorize, boundedBody, fail } from "@/lib/http";
import { rulesSchema } from "@/lib/rules";
import { championshipSchema } from "@/lib/championship";
const manageCommands = [
  "create_league",
  "join_league",
  "profile",
  "link_identity",
  "register",
  "roster",
  "create_series",
  "create_season",
  "save_rules",
  "create_race",
  "create_driver",
  "create_team",
  "end_roster",
  "registration",
  "membership",
  "archive_season",
];
export async function POST(request: Request) {
  try {
    const db = await authorize(request);
    const input = z
      .object({
        command: z.string(),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(
        JSON.parse(
          new TextDecoder().decode(await boundedBody(request, 200000)),
        ),
      );
    const p = input.payload;
    let name: string;
    let args: Record<string, unknown>;
    if (manageCommands.includes(input.command)) {
      if (input.command === "save_rules")
        p.config = rulesSchema.parse(p.config);
      name = "rc_manage";
      args = { command: input.command, p };
    } else if (
      input.command === "championship_settings" ||
      input.command === "league_settings"
    ) {
      const base = {
        league_id: z.uuid(),
        version: z.number().int().min(0),
        name: z.string().trim().min(2).max(100),
      };
      const settings =
        input.command === "league_settings"
          ? z
              .object({
                ...base,
                description: z.string().max(2000),
                rulebook: z.string().max(50000),
              })
              .parse(p)
          : z
              .object({
                ...base,
                season_id: z.uuid(),
                config: championshipSchema,
                drop_weeks: z.number().int().min(0).max(50),
                tiebreakers: z
                  .array(
                    z.enum([
                      "wins",
                      "top5",
                      "top10",
                      "average_finish",
                      "latest_finish",
                    ]),
                  )
                  .max(5),
              })
              .parse(p);
      name = "rc_settings";
      args = { command: input.command, p: settings };
    } else if (input.command === "publish_import") {
      name = "rc_publish_import";
      args = z
        .object({
          job: z.uuid(),
          create_customers: z.array(z.number().int().positive()).max(500),
          stage_orders: z
            .array(z.array(z.number().int().positive()).max(500))
            .max(10),
          confirm_metadata: z.literal(true),
        })
        .parse(p);
    } else if (input.command === "penalty") {
      name = "rc_penalty";
      args = { p };
    } else if (input.command === "incident") {
      name = "rc_incident";
      args = { p };
    } else if (input.command === "appeal") {
      name = "rc_appeal";
      args = z
        .object({ penalty: z.uuid(), statement: z.string().min(10).max(5000) })
        .parse(p);
    } else if (input.command === "stages") {
      name = "rc_update_stages";
      args = z
        .object({
          race: z.uuid(),
          orders: z
            .array(z.array(z.number().int().positive()).max(500))
            .max(10),
          reason: z.string().min(10).max(2000),
        })
        .parse(p);
    } else if (input.command === "cancel_import") {
      name = "rc_cancel_import";
      args = z.object({ job: z.uuid() }).parse(p);
    } else throw new Error("Unknown command.");
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return Response.json(
      { id: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
