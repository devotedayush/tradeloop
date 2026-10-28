import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/core/seed";
import { receive } from "../src/core/engine";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  BedrockRuntimeClient: class {
    send = mocks.send;
  },
}));
import { interpret } from "../src/adapters/interpreter";

const modelResult = (quantity: number) => ({
  output: {
    message: {
      content: [
        {
          toolUse: {
            name: "propose_business_action",
            input: { kind: "reorder", quantity },
          },
        },
      ],
    },
  },
});

describe("Explicit reorder quantity validation before Bedrock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BEDROCK_MODEL_ID", "test-model");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([0, -5, 1.5, 10001])(
    "rejects explicit %s cartons without calling the provider",
    async (quantity) => {
      mocks.send.mockRejectedValue(new Error("Provider unavailable"));
      const state = seed();
      const text = `Same order again, ${quantity} cartons`;
      const parsed = await interpret(text, state, "C001");
      expect(parsed).toEqual({
        intent: { kind: "reorder", quantity },
        engine: "rules",
      });
      receive(state, {
        customerId: "C001",
        text,
        messageId: "invalid",
        channel: "simulator",
        ...parsed,
      });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(state.requests).toHaveLength(0);
      expect(state.messages.at(-1)?.text).toContain("whole number of cartons");
    },
  );

  it("cannot repair raw zero into a valid one-carton order", async () => {
    mocks.send.mockResolvedValue(modelResult(1));
    const state = seed();
    const text = "Same order again, 0 cartons";
    const parsed = await interpret(text, state, "C001");
    receive(state, {
      customerId: "C001",
      text,
      messageId: "raw-zero",
      channel: "simulator",
      ...parsed,
    });
    expect(parsed.intent.quantity).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(state.requests).toHaveLength(0);
  });

  it("still uses Bedrock for valid reorder quantities", async () => {
    mocks.send.mockResolvedValue(modelResult(5));
    expect(
      await interpret("Same order again, 5 cartons", seed(), "C001"),
    ).toEqual({ intent: { kind: "reorder", quantity: 5 }, engine: "bedrock" });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("does not reinterpret a negated confirmation as consent revocation", async () => {
    mocks.send.mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: "propose_business_action",
                input: { kind: "optout" },
              },
            },
          ],
        },
      },
    });
    const state = seed();
    receive(state, {
      customerId: "C001",
      text: "Same order again, 5 cartons",
      messageId: "draft",
      channel: "simulator",
      engine: "rules",
      intent: { kind: "reorder", quantity: 5 },
    });
    const version = state.requests[0].version;
    const text = "Do not confirm this order";
    const parsed = await interpret(text, state, "C001");
    receive(state, {
      customerId: "C001",
      text,
      messageId: "negated",
      channel: "simulator",
      ...parsed,
    });
    expect(parsed).toEqual({ intent: { kind: "confirm" }, engine: "rules" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(state.customers[0].consent).toBe(true);
    expect(state.requests[0].status).toBe("draft");
    expect(state.requests[0].version).toBe(version);
  });

  it("keeps strict validation of invalid model-generated quantities", async () => {
    mocks.send.mockResolvedValue(modelResult(0));
    await expect(
      interpret("Same order again, 5 cartons", seed(), "C001"),
    ).rejects.toThrow();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
