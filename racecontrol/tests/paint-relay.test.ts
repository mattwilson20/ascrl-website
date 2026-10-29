import { expect, test, vi } from "vitest";
import {
  preparePaintConnection,
  verifyPaintRelayTicket,
} from "../src/lib/paint-relay-server";
import { PAINT_RELAY_URL, validatedPaintRelay } from "../src/lib/paint-relay";
const env = {
  PAINT_TURN_KEY_ID: "test-key-12345678",
  PAINT_TURN_API_TOKEN: "server-only-test-token-123456789",
};
const user = "owner",
  now = 1800000000000;
const rtc = {
  iceTransportPolicy: "relay",
  iceServers: [
    {
      urls: PAINT_RELAY_URL,
      username: "short-lived-test-user",
      credential: "short-lived-test-password",
    },
  ],
};
const provider = () =>
  vi.fn<typeof fetch>(async (_input, _init) =>
    Response.json({
      iceServers: [
        {
          urls: [
            PAINT_RELAY_URL,
            "turn:turn.cloudflare.com:3478?transport=udp",
          ],
          username: rtc.iceServers[0].username,
          credential: rtc.iceServers[0].credential,
        },
      ],
    }),
  );
test("unconfigured relay retains the direct connection and makes no provider request", async () => {
  const fetcher = provider();
  const result = await preparePaintConnection({}, user, fetcher, now);
  expect(result.relayTicket).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
test("relay credentials are short-lived, TLS-only and the master token never leaves the server", async () => {
  const fetcher = provider(),
    result = await preparePaintConnection(env, user, fetcher, now);
  expect(result.rtc).toEqual(rtc);
  expect(fetcher.mock.calls[0][0]).toContain(
    "rtc.live.cloudflare.com/v1/turn/keys/test-key-12345678/",
  );
  const options = fetcher.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(options.body)).ttl).toBe(7500);
  expect(JSON.stringify(result)).not.toContain(env.PAINT_TURN_API_TOKEN);
  expect(
    verifyPaintRelayTicket(result.relayTicket, env, user, now + 1000),
  ).toEqual(rtc);
});
test("tickets reject another owner, expiration, tampering and a different provider key", async () => {
  const { relayTicket } = await preparePaintConnection(
    env,
    user,
    provider(),
    now,
  );
  expect(() =>
    verifyPaintRelayTicket(relayTicket, env, "someone-else", now),
  ).toThrow();
  expect(() =>
    verifyPaintRelayTicket(relayTicket, env, user, now + 300001),
  ).toThrow();
  expect(() =>
    verifyPaintRelayTicket("x" + relayTicket, env, user, now),
  ).toThrow();
  expect(() =>
    verifyPaintRelayTicket(
      relayTicket,
      { ...env, PAINT_TURN_API_TOKEN: "another-key-123456789" },
      user,
      now,
    ),
  ).toThrow();
});
test("provider failures never silently fall back to the blocked direct path", async () => {
  await expect(
    preparePaintConnection(
      env,
      user,
      async () => new Response("failed", { status: 503 }),
      now,
    ),
  ).rejects.toThrow("unavailable");
  await expect(
    preparePaintConnection(
      { PAINT_TURN_KEY_ID: env.PAINT_TURN_KEY_ID },
      user,
      provider(),
      now,
    ),
  ).rejects.toThrow("incomplete");
  await expect(
    preparePaintConnection(
      env,
      user,
      async () => Response.json({ iceServers: [] }),
      now,
    ),
  ).rejects.toThrow("unsupported");
});
test("relay configuration cannot redirect the host to another server or protocol", () => {
  for (const url of [
    "turn:127.0.0.1:1234",
    "turns:other.example:443?transport=tcp",
    "turns:turn.cloudflare.com.evil.test:443?transport=tcp",
    "turn:turn.cloudflare.com:443?transport=tcp",
  ])
    expect(
      validatedPaintRelay({
        ...rtc,
        iceServers: [{ ...rtc.iceServers[0], urls: url }],
      }),
    ).toBeNull();
  expect(validatedPaintRelay({ ...rtc, iceTransportPolicy: "all" })).toBeNull();
  expect(
    validatedPaintRelay({
      ...rtc,
      iceServers: [...rtc.iceServers, ...rtc.iceServers],
    }),
  ).toBeNull();
});
