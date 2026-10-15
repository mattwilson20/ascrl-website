import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project"),
  );
export function siteURL() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
export async function database() {
  if (!configured())
    throw new Error("Connect a Supabase project to enable Race Control.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Read-only server component; proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
export async function account() {
  if (!configured()) return null;
  const db = await database();
  const { data, error } = await db.auth.getUser();
  return error ? null : data.user;
}
export async function rows(
  table: string,
  filters: Record<string, string> = {},
  order?: string,
) {
  if (!configured()) return [];
  const db = await database();
  const result: Record<string, any>[] = [];
  const keys: Record<string, string[]> = {
    rc_memberships: ["league_id", "user_id"],
    rc_registrations: ["season_id", "driver_id"],
    rc_scores: ["race_id", "driver_id"],
    rc_imported_results: ["race_id", "revision", "driver_id"],
    rc_stages: ["race_id", "revision", "stage", "position"],
    rc_driver_standings: ["season_id", "driver_id"],
    rc_team_standings: ["season_id", "team_id"],
    rc_platform_owners: ["user_id"],
  };
  for (let offset = 0; offset < 50000; offset += 1000) {
    let q = db.from(table).select("*");
    for (const [key, value] of Object.entries(filters)) q = q.eq(key, value);
    for (const key of new Set([
      ...(order ? [order] : []),
      ...(keys[table] ?? ["id"]),
    ]))
      q = q.order(key);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if (!data || data.length < 1000) return result;
  }
  throw new Error(
    "This view exceeds 50,000 records. Scope the query to a league or season before displaying it.",
  );
}
export async function one(table: string, id: string) {
  const data = await rows(table, { id });
  return data[0] ?? null;
}
