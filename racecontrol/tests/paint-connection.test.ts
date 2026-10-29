import { expect, test } from "vitest";
import {
  initialPaintConnection,
  paintConnectionReducer as reduce,
  PAINT_STREAM_FAILURE,
  localNetworkPermission,
} from "../src/lib/paint-connection";
test("failed phone connection stays visible through subsequent host availability polls", () => {
  let state = reduce(initialPaintConnection, { type: "start" });
  state = reduce(state, { type: "progress", message: "PC answered" });
  state = reduce(state, { type: "stop", message: PAINT_STREAM_FAILURE });
  for (const online of [true, true, false, true])
    state = reduce(state, { type: "availability", online });
  expect(state).toEqual({ phase: "stopped", message: PAINT_STREAM_FAILURE });
  state = reduce(state, { type: "start" });
  expect(state.phase).toBe("connecting");
  expect(state.message).not.toBe(PAINT_STREAM_FAILURE);
});

test("local-network permission checks support denied, allowed and older browsers safely", async () => {
  const requested: string[] = [];
  for (const state of ["denied", "granted", "prompt"] as const) {
    const permissions = {
      query: async (descriptor: PermissionDescriptor) => {
        requested.push(descriptor.name);
        return { state } as PermissionStatus;
      },
    };
    expect(await localNetworkPermission(permissions)).toBe(state);
  }
  expect(requested).toEqual([
    "local-network",
    "local-network",
    "local-network",
  ]);
  expect(await localNetworkPermission()).toBe("unsupported");
  expect(
    await localNetworkPermission({
      query: async () => {
        throw new TypeError("Unknown permission");
      },
    }),
  ).toBe("unsupported");
});
test("availability polling cannot overwrite handshake progress or a connected stream", () => {
  let state = reduce(initialPaintConnection, { type: "start" });
  state = reduce(state, { type: "progress", message: "Establishing video" });
  expect(reduce(state, { type: "availability", online: true })).toEqual(state);
  state = reduce(state, { type: "connected" });
  expect(reduce(state, { type: "availability", online: false })).toEqual(state);
  expect(reduce(state, { type: "progress", message: "late answer" })).toEqual(
    state,
  );
});
test("initial idle state still reflects PC availability", () => {
  expect(
    reduce(initialPaintConnection, { type: "availability", online: false })
      .message,
  ).toContain("offline");
  expect(
    reduce(initialPaintConnection, { type: "availability", online: true })
      .message,
  ).toContain("ready");
});
