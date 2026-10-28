import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/core/seed";
import type { State } from "../src/core/types";

const mocks = vi.hoisted(() => ({
  socialSend: vi.fn(),
  load: vi.fn(),
  change: vi.fn(),
}));

vi.mock("@aws-sdk/client-socialmessaging", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SocialMessagingClient: class {
    send = mocks.socialSend;
  },
}));
vi.mock("../src/adapters/store", () => ({
  store: { load: mocks.load, change: mocks.change },
}));

describe("Outbound claims under transaction contention", () => {
  let state: State;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("WHATSAPP_PHONE_ID", "phone-number-id-test");
    vi.stubEnv("META_API_VERSION", "v23.0");
    vi.stubEnv("TENANT_IDS", "demofoods");
    vi.stubEnv(
      "CONTACT_BINDINGS_JSON",
      JSON.stringify({
        "15555550123": {
          tenantId: "demofoods",
          customerId: "C001",
          kind: "customer",
        },
      }),
    );
    state = seed();
    state.customers[0].lastInboundAt = new Date().toISOString();
    state.outbox.push({
      id: "contended-followup",
      customerId: "C001",
      text: "Follow up",
      status: "pending",
      kind: "followup",
      createdAt: new Date().toISOString(),
    });
    mocks.load.mockImplementation(async () => structuredClone(state));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not send when a competing sender won the retried claim", async () => {
    mocks.change.mockImplementation(async (_tenant, mutate) => {
      // The first callback is evaluated, but its transaction loses the CAS.
      const discarded = structuredClone(state);
      mutate(discarded);
      expect(discarded.outbox[0].status).toBe("sending");
      // Another invocation committed this claim before Store.change retries.
      state.outbox[0].status = "sending";
      return mutate(state);
    });
    const { sender } = await import("../src/handlers/messaging");

    expect(await sender()).toEqual({ configured: true, sent: 0 });
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("sending");
  });

  it("does not send when an opt-out wins before the claim retry", async () => {
    mocks.change.mockImplementation(async (_tenant, mutate) => {
      const discarded = structuredClone(state);
      mutate(discarded);
      expect(discarded.outbox[0].status).toBe("sending");
      state.customers[0].consent = false;
      return mutate(state);
    });
    const { sender } = await import("../src/handlers/messaging");

    expect(await sender()).toEqual({ configured: true, sent: 0 });
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("suppressed");
  });
});
