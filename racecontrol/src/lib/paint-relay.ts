export type PaintRelay = {
  iceServers: { urls: string; username: string; credential: string }[];
  iceTransportPolicy: "relay";
};
export const PAINT_RELAY_URL = "turns:turn.cloudflare.com:443?transport=tcp";
export const DIRECT_PAINT_RTC = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Only this provider and TLS endpoint are permitted on the private renderer.
export function validatedPaintRelay(value: unknown): PaintRelay | null {
  if (!value || typeof value !== "object") return null;
  const relay = value as PaintRelay;
  if (
    relay.iceTransportPolicy !== "relay" ||
    !Array.isArray(relay.iceServers) ||
    relay.iceServers.length !== 1
  )
    return null;
  const server = relay.iceServers[0];
  if (
    server?.urls !== PAINT_RELAY_URL ||
    ![server.username, server.credential].every(
      (v) => typeof v === "string" && /^[!-~]{16,1024}$/.test(v),
    )
  )
    return null;
  return {
    iceTransportPolicy: "relay",
    iceServers: [
      {
        urls: PAINT_RELAY_URL,
        username: server.username,
        credential: server.credential,
      },
    ],
  };
}
