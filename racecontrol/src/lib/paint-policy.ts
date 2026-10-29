// Verified against the existing platform owner's Discord-linked account.
// Pilot access must not expand when another person becomes a league/platform admin.
export const PAINT_PILOT_OWNER = "2a20a12e-3786-481d-a77d-72d281290948";
export function paintIdentityAllowed(userId?: string | null) {
  return userId === PAINT_PILOT_OWNER;
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
