import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/core/seed";
import type { State } from "../src/core/types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  change: vi.fn(),
  interpret: vi.fn(),
}));
vi.mock("../src/adapters/store", () => ({
  store: { load: mocks.load, change: mocks.change },
}));
vi.mock("../src/adapters/interpreter", () => ({ interpret: mocks.interpret }));

describe("Private source and live evidence protection", () => {
  let state: State;
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("USER_POOL_ID", undefined);
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", undefined);
    state = seed();
    mocks.load.mockImplementation(async () => state);
    mocks.change.mockImplementation(async (_tenant, change) => change(state));
  });
  afterEach(() => vi.unstubAllEnvs());
  const call = async (route: string, body?: unknown) => {
    const { dispatch } = await import("../src/handlers/http");
    return dispatch({
      method: body === undefined ? "GET" : "POST",
      path: `/api/${route}`,
      headers: {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  it("blocks simulator messages against an imported customer's records before AI interpretation", async () => {
    state.shipments[0].source = "imported";
    const before = structuredClone(state);
    const response = await call("messages", {
      customerId: "C001",
      text: "Same order again",
      messageId: "private-source-test",
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.interpret).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });
  it.each(["imported", "whatsapp"])(
    "refuses reset without changing %s evidence",
    async (kind) => {
      if (kind === "imported") state.shipments[0].source = "imported";
      else
        state.messages.push({
          id: "live-msg",
          customerId: "C001",
          text: "live evidence",
          at: new Date().toISOString(),
          direction: "inbound",
          channel: "whatsapp",
        });
      const before = structuredClone(state);
      expect((await call("reset", {})).statusCode).toBe(409);
      expect(state).toEqual(before);
    },
  );
  it("does not label a mixed original/demo export as entirely synthetic", async () => {
    state.shipments[0].source = "imported";
    expect(JSON.parse((await call("export")).body).synthetic).toBe(false);
  });
  it("still permits reset for a purely fictional local rehearsal", async () => {
    expect((await call("reset", {})).statusCode).toBe(200);
    expect(state.audit.at(-1)?.action).toBe("demo.reset");
  });
});
