import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAINT_PILOT_OWNER,
  paintIdentityAllowed,
  validOffer,
  videoPoint,
  paintViewport,
} from "../src/lib/paint-policy";
let db: PGlite;
test("stream fits portrait and short landscape screens without forcing a desktop height", () => {
  expect(paintViewport(369, 726)).toEqual({ width: 369, height: 726 });
  expect(paintViewport(852, 315)).toEqual({ width: 852, height: 315 });
  expect(paintViewport(320, 240)).toEqual({ width: 320, height: 240 });
  expect(paintViewport(2560, 1440)).toEqual({ width: 1600, height: 1000 });
  expect(paintViewport(300, 200)).toEqual({ width: 320, height: 240 });
});
test("stream coordinates account for both letterbox directions and reject black bars", () => {
  expect(
    videoPoint(
      { left: 10, top: 20, width: 800, height: 800 },
      1600,
      800,
      410,
      420,
    ),
  ).toEqual({ x: 0.5, y: 0.5, inside: true });
  expect(
    videoPoint(
      { left: 10, top: 20, width: 800, height: 800 },
      1600,
      800,
      410,
      120,
    ),
  ).toEqual({ x: 0.5, y: 0, inside: false });
  expect(
    videoPoint(
      { left: 0, top: 0, width: 1000, height: 600 },
      600,
      600,
      200,
      300,
    ),
  ).toEqual({ x: 0, y: 0.5, inside: true });
  expect(
    videoPoint(
      { left: 0, top: 0, width: 1000, height: 600 },
      600,
      600,
      100,
      300,
    ).inside,
  ).toBe(false);
});
const other = "11111111-1111-4111-8111-111111111111",
  token = "a".repeat(64);
async function asUser(id: string | null, sql: string) {
  await db.exec("begin;set local role " + (id ? "authenticated" : "anon"));
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    id ?? "",
  ]);
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("rollback");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;",
  );
  await db.query("insert into auth.users values($1),($2)", [
    PAINT_PILOT_OWNER,
    other,
  ]);
  await db.exec(
    readFileSync(
      resolve("supabase/migrations/20261029052121_paint_studio_private.sql"),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      resolve("supabase/migrations/20261029053208_paint_studio_privileges.sql"),
      "utf8",
    ),
  );
  await db.query(
    "insert into rc_paint_private.host_credentials values($1,sha256(convert_to($2,'UTF8')),now()+interval '1 day')",
    [PAINT_PILOT_OWNER, token],
  );
}, 30000);
afterAll(() => db.close());
test("pilot identity does not expand to other users or anonymous visitors", () => {
  expect(paintIdentityAllowed(PAINT_PILOT_OWNER)).toBe(true);
  for (const id of [other, "owner", null, undefined])
    expect(paintIdentityAllowed(id)).toBe(false);
});
test("connection offers require video and control with bounded SDP", () => {
  expect(
    validOffer({ type: "offer", sdp: "v=0\r\nm=video\r\nm=application" }),
  ).toBe(true);
  expect(validOffer({ type: "offer", sdp: "a".repeat(65000) })).toBe(false);
  expect(validOffer({ type: "answer", sdp: "v=0" })).toBe(false);
});
test("only the exact owner can see the access grant", async () => {
  expect(
    (await asUser(PAINT_PILOT_OWNER, "select * from public.rc_paint_access"))[0]
      .rows,
  ).toHaveLength(1);
  expect(
    (await asUser(other, "select * from public.rc_paint_access"))[0].rows,
  ).toHaveLength(0);
  await expect(
    asUser(null, "select * from public.rc_paint_access"),
  ).rejects.toThrow();
});
test("users cannot grant themselves access or read the host credential", async () => {
  await expect(
    asUser(
      other,
      `insert into public.rc_paint_access(user_id) values('${other}')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      PAINT_PILOT_OWNER,
      "select * from rc_paint_private.host_credentials",
    ),
  ).rejects.toThrow();
});
test("inherited truncate privileges are revoked", async () => {
  await expect(
    asUser(other, "truncate public.rc_paint_sessions"),
  ).rejects.toThrow();
});
test("session writes are protected at database level", async () => {
  const sql = `insert into public.rc_paint_sessions(user_id,id,offer,expires_at) values('${PAINT_PILOT_OWNER}',gen_random_uuid(),'{"type":"offer"}',now()+interval '1 hour')`;
  await expect(asUser(other, sql)).rejects.toThrow();
  expect((await asUser(PAINT_PILOT_OWNER, sql))[0].affectedRows).toBe(1);
});
test("host calls reject wrong, missing and expired credentials", async () => {
  for (const key of ["", "b".repeat(64)])
    await expect(
      db.query("select public.rc_paint_host($1,'poll')", [key]),
    ).rejects.toThrow(/authorized/);
  await db.exec(
    "begin;update rc_paint_private.host_credentials set expires_at=now()-interval '1 second'",
  );
  await expect(
    db.query("select public.rc_paint_host($1,'poll')", [token]),
  ).rejects.toThrow(/authorized/);
  await db.exec("rollback");
});
test("host cannot use arbitrary commands or access a disabled pilot", async () => {
  await expect(
    db.query("select public.rc_paint_host($1,'sql')", [token]),
  ).rejects.toThrow(/Unsupported/);
  await db.exec("begin;update public.rc_paint_access set enabled=false");
  await expect(
    db.query("select public.rc_paint_host($1,'poll')", [token]),
  ).rejects.toThrow(/authorized/);
  await db.exec("rollback");
});
test("cloud backups deduplicate, preserve artwork, and hide content from clients", async () => {
  const doc = {
    format: "garage-livery",
    version: 2,
    profile: "camaro",
    title: "Test artwork",
    layers: [],
    assets: {},
  };
  const payload = JSON.stringify({ doc });
  const first = await db.query<{ result: { id: string } }>(
    "select public.rc_paint_host($1,'backup',$2::jsonb) result",
    [token, payload],
  );
  const second = await db.query<{ result: { id: string } }>(
    "select public.rc_paint_host($1,'backup',$2::jsonb) result",
    [token, payload],
  );
  expect(first.rows[0].result.id).toBe(second.rows[0].result.id);
  expect(
    (
      await asUser(
        PAINT_PILOT_OWNER,
        "select id,title from public.rc_paint_backups",
      )
    )[0].rows,
  ).toHaveLength(1);
  expect(
    (await asUser(other, "select id,title from public.rc_paint_backups"))[0]
      .rows,
  ).toHaveLength(0);
  await expect(
    asUser(PAINT_PILOT_OWNER, "select content from public.rc_paint_backups"),
  ).rejects.toThrow();
  const restored = await db.query<{ result: { doc: unknown } }>(
    "select public.rc_paint_host($1,'restore',$2::jsonb) result",
    [token, JSON.stringify({ id: first.rows[0].result.id })],
  );
  expect(restored.rows[0].result.doc).toEqual(doc);
});
