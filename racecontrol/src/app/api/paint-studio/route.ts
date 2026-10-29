import { randomUUID } from "node:crypto";
import { paintAccess } from "@/lib/paint-access";
import { boundedBody } from "@/lib/http";
import { siteURL } from "@/lib/supabase";
import { validOffer } from "@/lib/paint-policy";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function GET() {
  const access = await paintAccess();
  if (!access) return json({ error: "Not found" }, 404);
  const { data, error } = await access.db
    .from("rc_paint_sessions")
    .select("id,answer,closed,expires_at")
    .eq("user_id", access.user.id)
    .maybeSingle();
  if (error)
    return json({ error: "Paint Studio is temporarily unavailable." }, 503);
  const backups = await access.db
    .from("rc_paint_backups")
    .select("id,profile,title,created_at")
    .eq("user_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return json({
    online:
      !!access.hostSeen && Date.now() - Date.parse(access.hostSeen) < 20000,
    session: data,
    backups: backups.data ?? [],
  });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(siteURL()).origin)
    return json({ error: "Not found" }, 404);
  const access = await paintAccess();
  if (!access) return json({ error: "Not found" }, 404);
  try {
    const body = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 65536)),
    );
    if (body.action === "connect") {
      if (!validOffer(body.offer))
        return json({ error: "Invalid connection offer." }, 400);
      if (!access.hostSeen || Date.now() - Date.parse(access.hostSeen) > 20000)
        return json(
          { error: "Start Paint Studio Host on your PC first." },
          409,
        );
      const id = randomUUID(),
        now = new Date();
      const { error } = await access.db
        .from("rc_paint_sessions")
        .upsert({
          user_id: access.user.id,
          id,
          offer: body.offer,
          answer: null,
          closed: false,
          created_at: now.toISOString(),
          client_seen: now.toISOString(),
          expires_at: new Date(now.getTime() + 7200000).toISOString(),
        });
      if (error) throw error;
      return json({ id });
    }
    if (
      ["heartbeat", "disconnect"].includes(body.action) &&
      typeof body.id === "string" &&
      /^[0-9a-f-]{36}$/.test(body.id)
    ) {
      const { data, error } = await access.db
        .from("rc_paint_sessions")
        .update(
          body.action === "disconnect"
            ? { closed: true }
            : { client_seen: new Date().toISOString() },
        )
        .eq("user_id", access.user.id)
        .eq("id", body.id)
        .eq("closed", false)
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Session ended. Connect again." }, 409);
      return json({ ok: true });
    }
    return json({ error: "Unsupported request." }, 400);
  } catch {
    return json({ error: "The request could not be completed." }, 400);
  }
}
