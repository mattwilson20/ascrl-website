import "server-only";
import { account, database } from "./supabase";
import { paintIdentityAllowed } from "./paint-policy";
export async function paintAccess() {
  const user = await account();
  if (!user || !paintIdentityAllowed(user.id)) return null;
  const db = await database();
  const { data, error } = await db
    .from("rc_paint_access")
    .select("enabled,host_seen")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data?.enabled) return null;
  return { user, db, hostSeen: data.host_seen as string | null };
}
