import "server-only";
import { database, siteURL } from "./supabase";
export async function authorize(request: Request) {
  if (request.headers.get("origin") !== new URL(siteURL()).origin)
    throw new Error("Request origin is not allowed.");
  const db = await database();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required.");
  return db;
}
export async function boundedBody(request: Request, max: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max)
    throw new Error("Request is too large.");
  if (!request.body) throw new Error("Request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new Error("Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export const fail = (e: unknown) =>
  Response.json(
    { error: e instanceof Error ? e.message : "Request failed." },
    {
      status:
        e instanceof Error && /Sign in|authorized|origin/i.test(e.message)
          ? 403
          : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
