export type PaintConnectionState = {
  phase: "idle" | "connecting" | "connected" | "stopped";
  message: string;
};
export type PaintConnectionEvent =
  | { type: "availability"; online: boolean }
  | { type: "start" }
  | { type: "progress"; message: string }
  | { type: "connected" }
  | { type: "stop"; message: string };
export const initialPaintConnection: PaintConnectionState = {
  phase: "idle",
  message: "Checking your private workstation…",
};
export function paintConnectionReducer(
  state: PaintConnectionState,
  event: PaintConnectionEvent,
): PaintConnectionState {
  switch (event.type) {
    case "availability":
      return state.phase === "idle"
        ? {
            ...state,
            message: event.online
              ? "Your PC is ready. Connect to start painting."
              : "Your workstation is offline. Start Paint Studio Host on your PC.",
          }
        : state;
    case "start":
      return { phase: "connecting", message: "Preparing a secure connection…" };
    case "progress":
      return state.phase === "connecting"
        ? { ...state, message: event.message }
        : state;
    case "connected":
      return {
        phase: "connected",
        message: "Connected · Only your account has access",
      };
    case "stop":
      return { phase: "stopped", message: event.message };
  }
}
export const PAINT_STREAM_FAILURE =
  "The PC answered, but the video connection could not get through. Check the connection help below, then try again. Your saved artwork remains on the PC.";

export type LocalNetworkPermission = PermissionState | "unsupported";

// Older browsers do not recognize the granular name. Never query the legacy
// local-network-access alias: it can crash older Chromium renderers.
export async function localNetworkPermission(
  permissions?: Pick<Permissions, "query">,
): Promise<LocalNetworkPermission> {
  if (!permissions) return "unsupported";
  try {
    const result = await permissions.query({
      name: "local-network" as PermissionName,
    });
    return result.state;
  } catch {
    return "unsupported";
  }
}
