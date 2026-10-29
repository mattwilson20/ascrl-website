// Verified against the existing platform owner's Discord-linked account.
// Pilot access must not expand when another person becomes a league/platform admin.
export const PAINT_PILOT_OWNER = "2a20a12e-3786-481d-a77d-72d281290948";
export function paintIdentityAllowed(userId?: string | null) {
  return userId === PAINT_PILOT_OWNER;
}
// Match the actual video slot, including short landscape phone screens.
export function paintViewport(width: number, height: number) {
  return {
    width: Math.max(320, Math.min(1600, Math.round(width || 1280))),
    height: Math.max(240, Math.min(1000, Math.round(height || 720))),
  };
}
export function videoPoint(
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const scale = Math.min(rect.width / width, rect.height / height);
  const px =
    (x - rect.left - (rect.width - width * scale) / 2) / (width * scale);
  const py =
    (y - rect.top - (rect.height - height * scale) / 2) / (height * scale);
  return {
    x: Math.max(0, Math.min(1, px)),
    y: Math.max(0, Math.min(1, py)),
    inside: px >= 0 && px <= 1 && py >= 0 && py <= 1,
  };
}
export function validOffer(value: unknown): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== "object") return false;
  const offer = value as { type?: unknown; sdp?: unknown };
  return (
    offer.type === "offer" &&
    typeof offer.sdp === "string" &&
    offer.sdp.length < 60000 &&
    offer.sdp.startsWith("v=0") &&
    offer.sdp.includes("m=video") &&
    offer.sdp.includes("m=application")
  );
}
