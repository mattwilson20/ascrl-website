import { z } from "zod";
import { authorize, boundedBody, fail } from "@/lib/http";
import { ImportError, MAX_UPLOAD_BYTES, parseRaceFile } from "@/lib/importer";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const db = await authorize(request);
    const body = await boundedBody(request, MAX_UPLOAD_BYTES + 65536);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body,
    }).formData();
    const race = z.uuid().parse(form.get("race"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".json"))
      throw new Error("Choose the downloaded .json event result.");
    const session = form.get("session");
    const selected =
      session !== null && session !== ""
        ? z.coerce.number().int().parse(session)
        : undefined;
    const normalized = parseRaceFile(
      new Uint8Array(await file.arrayBuffer()),
      selected,
    );
    const correction = z
      .string()
      .max(2000)
      .parse(form.get("correction") ?? "");
    const { data, error } = await db.rpc("rc_preview_import", {
      race,
      hash: normalized.hash,
      normalized,
      correction: correction || null,
    });
    if (error) throw new Error(error.message);
    return Response.json(
      { id: data, href: "/imports/" + data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ImportError && e.sessions)
      return Response.json(
        { error: e.message, sessions: e.sessions },
        { status: 422 },
      );
    return fail(e);
  }
}
