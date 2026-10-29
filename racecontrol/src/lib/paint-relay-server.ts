import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DIRECT_PAINT_RTC,
  PAINT_RELAY_URL,
  validatedPaintRelay,
} from "./paint-relay";
import type { PaintRelay } from "./paint-relay";

type RelayEnvironment = {
  [key: string]: string | undefined;
  PAINT_TURN_KEY_ID?: string;
  PAINT_TURN_API_TOKEN?: string;
};
const TTL = 7500; // Two-hour editor session plus a five-minute handshake margin.
function key(env: RelayEnvironment) {
  const id = env.PAINT_TURN_KEY_ID,
    token = env.PAINT_TURN_API_TOKEN;
  if (!id && !token) return null;
  if (!id || !/^[a-zA-Z0-9_-]{8,128}$/.test(id) || !token || token.length < 16)
    throw Error("Secure relay configuration is incomplete.");
  return { id, token };
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest();
}
export async function preparePaintConnection(
  env: RelayEnvironment,
  userId: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  const config = key(env);
  if (!config) return { rtc: DIRECT_PAINT_RTC, relayTicket: null };
  const response = await fetcher(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${config.id}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: TTL }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw Error(
      "The secure relay is temporarily unavailable. Try connecting again.",
    );
  const data = await response.json();
  const server = Array.isArray(data.iceServers)
    ? data.iceServers.find((s: { urls?: string | string[] }) =>
        Array.isArray(s.urls)
          ? s.urls.includes(PAINT_RELAY_URL)
          : s.urls === PAINT_RELAY_URL,
      )
    : null;
  const rtc = validatedPaintRelay({
    iceTransportPolicy: "relay",
    iceServers: [
      {
        urls: PAINT_RELAY_URL,
        username: server?.username,
        credential: server?.credential,
      },
    ],
  });
  if (!rtc)
    throw Error("The secure relay returned an unsupported configuration.");
  // A five-minute owner-bound ticket prevents clients injecting relay settings
  // into the PC's offer. The provider's long-lived key stays on the server.
  const payload = Buffer.from(
    JSON.stringify({ userId, expires: now + 300000, rtc }),
  ).toString("base64url");
  return {
    rtc,
    relayTicket: `${payload}.${signature(payload, config.token).toString("base64url")}`,
  };
}
export function verifyPaintRelayTicket(
  ticket: unknown,
  env: RelayEnvironment,
  userId: string,
  now = Date.now(),
): PaintRelay | null {
  if (ticket == null) return null;
  const config = key(env);
  if (!config || typeof ticket !== "string" || ticket.length > 10000)
    throw Error("Invalid relay ticket. Refresh Paint Studio.");
  const pieces = ticket.split(".");
  if (pieces.length !== 2)
    throw Error("Invalid relay ticket. Refresh Paint Studio.");
  const [payload, mac] = pieces,
    expected = signature(payload, config.token),
    actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw Error("Invalid relay ticket. Refresh Paint Studio.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    rtc = validatedPaintRelay(data.rtc);
  if (
    data.userId !== userId ||
    !Number.isFinite(data.expires) ||
    data.expires <= now ||
    data.expires > now + 300000 ||
    !rtc
  )
    throw Error("Relay ticket expired. Connect again.");
  return rtc;
}
