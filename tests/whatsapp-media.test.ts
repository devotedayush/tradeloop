import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/core/seed";
import { receive, ruleIntent } from "../src/core/engine";
import type { Evidence, State } from "../src/core/types";

const mocks = vi.hoisted(() => ({
  socialSend: vi.fn(),
  socialConfig: vi.fn(),
  s3Send: vi.fn(),
  s3Config: vi.fn(),
  load: vi.fn(),
  change: vi.fn(),
  saveEvidence: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-socialmessaging", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SocialMessagingClient: class {
    constructor(config: unknown) {
      mocks.socialConfig(config);
    }
    send = mocks.socialSend;
  },
}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  S3Client: class {
    constructor(config: unknown) {
      mocks.s3Config(config);
    }
    send = mocks.s3Send;
  },
}));
vi.mock("../src/adapters/store", () => ({
  store: { load: mocks.load, change: mocks.change },
}));
vi.mock("../src/adapters/evidence", () => ({
  saveEvidence: mocks.saveEvidence,
}));
vi.mock("../src/adapters/interpreter", () => ({ interpret: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

const binding = {
  tenantId: "demofoods",
  customerId: "C001",
  kind: "customer",
};
const inboundAt = "2026-10-28T10:00:00.000Z";
const event = () => ({
  Records: [
    {
      messageId: "queue-media-1",
      body: JSON.stringify({
        from: "15555550123",
        messageId: "wamid-media-1",
        timestamp: String(Date.parse(inboundAt) / 1000),
        media: { id: "media-123", name: "pod.png", mime: "image/png" },
        binding,
      }),
    },
  ],
});

describe("WhatsApp regional inbound media", () => {
  let state: State;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T10:01:00.000Z"));
    vi.stubEnv("WHATSAPP_REGION", "ap-south-1");
    vi.stubEnv("WHATSAPP_MEDIA_BUCKET", "mumbai-media");
    vi.stubEnv("EVIDENCE_BUCKET", "virginia-evidence");
    vi.stubEnv("WHATSAPP_PHONE_ID", "phone-number-id-test");
    vi.stubEnv(
      "CONTACT_BINDINGS_JSON",
      JSON.stringify({
        "15555550123": binding,
      }),
    );
    state = seed();
    mocks.load.mockImplementation(async () => state);
    mocks.change.mockImplementation(async (_tenant, change) => change(state));
    mocks.socialSend.mockResolvedValue({});
    mocks.getSignedUrl.mockResolvedValue(
      "https://mumbai-media.example/signed-put",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("pins media retrieval to a signed Mumbai PUT and reads/deletes that exact key", async () => {
    receive(state, {
      customerId: "C001",
      text: "2 cartons missing from my last delivery",
      messageId: "case-fixture",
      channel: "simulator",
      intent: ruleIntent("2 cartons missing from my last delivery"),
      engine: "rules",
    });
    const bytes = Buffer.from("mock retrieved image bytes");
    const evidence: Evidence = {
      id: "DOC-media",
      name: "pod.png",
      mime: "image/png",
      key: "demofoods/DOC-media",
      sha256: "fixture-hash",
      size: bytes.length,
      extraction: "manual",
      kind: "attachment",
      createdAt: inboundAt,
    };
    mocks.saveEvidence.mockResolvedValue(evidence);
    mocks.s3Send.mockImplementation(async (command) => {
      if (command.constructor.name === "GetObjectCommand")
        return {
          ContentLength: bytes.length,
          Body: { transformToByteArray: async () => bytes },
        };
      return {};
    });
    const { worker } = await import("../src/handlers/messaging");

    expect(await worker(event())).toEqual({ batchItemFailures: [] });

    expect(mocks.socialConfig).toHaveBeenCalledWith({
      region: "ap-south-1",
      maxAttempts: 1,
    });
    expect(mocks.s3Config).toHaveBeenCalledWith({
      region: "ap-south-1",
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    const retrieval = mocks.socialSend.mock.calls[0][0].input;
    expect(retrieval).toMatchObject({
      mediaId: "media-123",
      originationPhoneNumberId: "phone-number-id-test",
      destinationS3PresignedUrl: {
        url: "https://mumbai-media.example/signed-put",
        headers: { "Content-Type": "image/png" },
      },
    });
    expect(retrieval).not.toHaveProperty("destinationS3File");
    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(1);
    const [regionalClient, putCommand, signingOptions] =
      mocks.getSignedUrl.mock.calls[0];
    expect(regionalClient.send).toBe(mocks.s3Send);
    expect(putCommand.constructor.name).toBe("PutObjectCommand");
    expect(putCommand.input).toMatchObject({
      Bucket: "mumbai-media",
      ContentType: "image/png",
    });
    expect(signingOptions).toEqual({ expiresIn: 300 });
    const actualKey = putCommand.input.Key;
    expect(actualKey).toMatch(/^demofoods\/incoming\/.+\/media-123$/);
    expect(
      mocks.s3Send.mock.calls.map(([command]) => ({
        name: command.constructor.name,
        input: command.input,
      })),
    ).toEqual([
      {
        name: "GetObjectCommand",
        input: { Bucket: "mumbai-media", Key: actualKey },
      },
      {
        name: "DeleteObjectCommand",
        input: { Bucket: "mumbai-media", Key: actualKey },
      },
    ]);
    expect(mocks.saveEvidence).toHaveBeenCalledWith(
      "demofoods",
      "pod.png",
      "image/png",
      bytes,
    );
    expect(state.cases[0].evidence).toEqual([evidence]);
    expect(state.cases[0].status).toBe("review");
    expect(state.shipments[0].podStatus).toBe("missing");
    expect(state.customers[0].lastInboundAt).toBe(inboundAt);
    expect(
      state.processed.some((message) => message.id === "wamid-media-1"),
    ).toBe(true);
  });

  it("sends a service reply to the plus-prefixed E.164 destination in the WhatsApp region", async () => {
    vi.stubEnv("META_API_VERSION", "v23.0");
    vi.stubEnv("TENANT_IDS", "demofoods");
    state.customers[0].lastInboundAt = inboundAt;
    state.customers[0].consent = true;
    state.outbox.push({
      id: "send-live-reply",
      customerId: "C001",
      text: "Your case is awaiting staff review.",
      status: "pending",
      kind: "service",
      createdAt: inboundAt,
    });
    mocks.socialSend.mockResolvedValue({ messageId: "provider-reply-1" });
    const { sender } = await import("../src/handlers/messaging");

    expect(await sender()).toEqual({ configured: true, sent: 1 });

    expect(mocks.socialConfig).toHaveBeenCalledWith({
      region: "ap-south-1",
      maxAttempts: 1,
    });
    expect(mocks.socialSend).toHaveBeenCalledTimes(1);
    const command = mocks.socialSend.mock.calls[0][0];
    expect(command.constructor.name).toBe("SendWhatsAppMessageCommand");
    expect(command.input).toMatchObject({
      originationPhoneNumberId: "phone-number-id-test",
      metaApiVersion: "v23.0",
    });
    expect(JSON.parse(Buffer.from(command.input.message).toString())).toEqual({
      messaging_product: "whatsapp",
      to: "+15555550123",
      type: "text",
      text: { body: "Your case is awaiting staff review." },
    });
    expect(state.outbox[0]).toMatchObject({
      status: "sent",
      providerId: "provider-reply-1",
    });
  });

  it("suppresses an order update when consent is withdrawn after queuing, even inside the reply window", async () => {
    vi.stubEnv("META_API_VERSION", "v23.0");
    vi.stubEnv("TENANT_IDS", "demofoods");
    state.customers[0].lastInboundAt = inboundAt;
    state.customers[0].consent = true;
    const { queueOrderUpdate } = await import("../src/core/engine");
    queueOrderUpdate(state, { id: "sales", role: "sales", tenantId: "demofoods" }, "C001");
    state.customers[0].consent = false;
    const { sender } = await import("../src/handlers/messaging");

    expect(await sender()).toEqual({ configured: true, sent: 0 });
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("suppressed");
    expect(state.audit.at(-1)?.action).toBe("message.suppressed");
  });

  it("opens the service window for an unmatched attachment without fetching or assigning media", async () => {
    expect(state.cases).toHaveLength(0);
    const { worker } = await import("../src/handlers/messaging");

    expect(await worker(event())).toEqual({ batchItemFailures: [] });

    expect(state.customers[0].lastInboundAt).toBe(inboundAt);
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.saveEvidence).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
    expect(state.cases).toHaveLength(0);
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: "wamid-media-1",
        direction: "inbound",
        channel: "whatsapp",
      }),
    ]);
    expect(state.outbox).toEqual([
      expect.objectContaining({
        customerId: "C001",
        status: "pending",
        kind: "service",
      }),
    ]);
    expect(
      state.processed.some((message) => message.id === "wamid-media-1"),
    ).toBe(true);
    expect(state.outbox[0].text).toContain("was not retained");
    expect(state.outbox[0].text).toContain("resend the attachment");
  });

  it("does not attach a caption for another shipment to the only open case", async () => {
    receive(state, {
      customerId: "C001",
      text: "2 cartons missing from SHP-101",
      messageId: "case-fixture",
      channel: "simulator",
      intent: ruleIntent("2 cartons missing from SHP-101"),
      engine: "rules",
    });
    state.shipments.push({
      ...state.shipments[0],
      id: "SHP-104",
      lr: "LR-504",
    });
    const inbound = event();
    inbound.Records[0].body = JSON.stringify({
      ...JSON.parse(inbound.Records[0].body),
      text: "POD for SHP-104",
    });
    const { worker } = await import("../src/handlers/messaging");

    expect(await worker(inbound)).toEqual({ batchItemFailures: [] });
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(mocks.saveEvidence).not.toHaveBeenCalled();
    expect(state.cases[0].evidence).toEqual([]);
    expect(state.messages.at(-1)?.text).toContain("POD for SHP-104");
    expect(state.outbox.at(-1)?.text).toContain("resend the attachment");
  });

  it("uses an authorized caption reference to choose the matching open case", async () => {
    receive(state, {
      customerId: "C001",
      text: "2 cartons missing from SHP-101",
      messageId: "case-fixture",
      channel: "simulator",
      intent: ruleIntent("2 cartons missing from SHP-101"),
      engine: "rules",
    });
    state.shipments.push({
      ...state.shipments[0],
      id: "SHP-104",
      lr: "LR-504",
    });
    state.cases.push({
      ...structuredClone(state.cases[0]),
      id: "CASE-second",
      shipmentId: "SHP-104",
    });
    const inbound = event();
    inbound.Records[0].body = JSON.stringify({
      ...JSON.parse(inbound.Records[0].body),
      text: "POD for LR-504",
    });
    const evidence: Evidence = {
      id: "DOC-caption",
      name: "pod.png",
      mime: "image/png",
      key: "demofoods/DOC-caption",
      sha256: "caption-hash",
      size: 3,
      extraction: "manual",
      kind: "attachment",
      createdAt: inboundAt,
    };
    mocks.saveEvidence.mockResolvedValue(evidence);
    mocks.s3Send.mockImplementation(async (command) =>
      command.constructor.name === "GetObjectCommand"
        ? {
            ContentLength: 3,
            Body: { transformToByteArray: async () => Buffer.from("pod") },
          }
        : {},
    );
    const { worker } = await import("../src/handlers/messaging");

    expect(await worker(inbound)).toEqual({ batchItemFailures: [] });
    expect(state.cases[0].evidence).toEqual([]);
    expect(state.cases[1].evidence).toEqual([evidence]);
    expect(state.shipments[0].podStatus).toBe("missing");
    expect(state.shipments.at(-1)?.podStatus).toBe("missing");
  });

  it("does not use a caption to bypass transporter shipment authorization", async () => {
    receive(state, {
      customerId: "C001",
      text: "2 cartons missing from SHP-101",
      messageId: "case-fixture",
      channel: "simulator",
      intent: ruleIntent("2 cartons missing from SHP-101"),
      engine: "rules",
    });
    const restrictedBinding = {
      ...binding,
      kind: "transporter",
      shipmentIds: ["SHP-104"],
    };
    vi.stubEnv(
      "CONTACT_BINDINGS_JSON",
      JSON.stringify({ "15555550123": restrictedBinding }),
    );
    const inbound = event();
    inbound.Records[0].body = JSON.stringify({
      ...JSON.parse(inbound.Records[0].body),
      binding: restrictedBinding,
      text: "POD for SHP-101",
    });
    const { worker } = await import("../src/handlers/messaging");

    expect(await worker(inbound)).toEqual({ batchItemFailures: [] });
    expect(mocks.socialSend).not.toHaveBeenCalled();
    expect(mocks.saveEvidence).not.toHaveBeenCalled();
    expect(state.cases[0].evidence).toEqual([]);
  });
});
