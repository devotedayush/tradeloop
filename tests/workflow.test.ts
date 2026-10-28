import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { seed } from "../src/core/seed";
import {
  receive,
  ruleIntent,
  queueFollowup,
  attach,
  caseAction,
  approveRequest,
} from "../src/core/engine";
import { Store } from "../src/adapters/store";
import { normalize } from "../src/handlers/messaging";
import type { Actor, Evidence, State } from "../src/core/types";
const admin: Actor = { id: "reviewer", tenantId: "demofoods", role: "admin" };
const incoming = (
  s: State,
  text: string,
  messageId: string = crypto.randomUUID(),
) =>
  receive(s, {
    customerId: "C001",
    text,
    messageId,
    channel: "simulator",
    intent: ruleIntent(text),
    engine: "rules",
  });
const evidence: Evidence = {
  id: "DOC-test",
  name: "synthetic-pod.png",
  key: "demofoods/test",
  mime: "image/png",
  sha256: "fake-fixture-hash",
  size: 200,
  extraction: "manual",
  kind: "sample",
  createdAt: new Date().toISOString(),
};
describe("Customer and delivery workflow invariants", () => {
  it("opens a shortage case, attributes receipt as a claim, and pauses sales", () => {
    const s = seed();
    incoming(s, "2 cartons missing from my last delivery");
    expect(s.cases).toHaveLength(1);
    expect(s.cases[0]).toMatchObject({
      shipmentId: "SHP-101",
      expected: 20,
      reported: 18,
      status: "awaiting_evidence",
    });
    expect(s.customers[0].paused).toBe(true);
    expect(s.shipments[0].podStatus).toBe("missing");
  });
  it("does not invent missing quantities for damage", () => {
    const s = seed();
    incoming(s, "2 cartons damaged");
    expect(s.cases[0].reported).toBeUndefined();
    expect(s.cases[0].type).toBe("damage");
  });
  it("deduplicates replayed inbound events", () => {
    const s = seed();
    incoming(s, "2 cartons missing", "same-id");
    const count = s.audit.length;
    incoming(s, "2 cartons missing", "same-id");
    expect(s.cases).toHaveLength(1);
    expect(s.messages).toHaveLength(2);
    expect(s.audit).toHaveLength(count);
  });
  it("blocks scheduled follow-up after a complaint opens", () => {
    const s = seed();
    queueFollowup(s, admin, "C001");
    incoming(s, "2 cartons missing");
    expect(s.outbox[0].status).toBe("suppressed");
    expect(() => queueFollowup(s, admin, "C001")).toThrow("blocked");
  });
  it("stops follow-ups on opt-out, including already queued actions", () => {
    const s = seed();
    queueFollowup(s, admin, "C001");
    incoming(s, "Stop messages");
    expect(s.customers[0].consent).toBe(false);
    expect(s.outbox[0].status).toBe("suppressed");
    expect(() => queueFollowup(s, admin, "C001")).toThrow();
  });
  it("does not let the simulator open a real WhatsApp service window", () => {
    const s = seed();
    incoming(s, "Where is my delivery?");
    expect(s.customers[0].lastInboundAt).toBeUndefined();
  });
  it("requires clarification when a shipment reference belongs to another customer", () => {
    const s = seed();
    incoming(s, "2 cartons missing from SHP-102");
    expect(s.cases[0].shipmentId).toBeUndefined();
    expect(s.cases[0].status).toBe("awaiting_details");
  });
  it("requires clarification when multiple shipments match", () => {
    const s = seed();
    s.shipments.push({ ...s.shipments[0], id: "SHP-extra" });
    incoming(s, "2 cartons missing");
    expect(s.cases[0].shipmentId).toBeUndefined();
  });
  it("prevents negative inferred received quantities", () => {
    const s = seed();
    incoming(s, "99 cartons missing");
    expect(s.cases[0].reported).toBeUndefined();
  });
  it("does not approve an order before customer confirmation", () => {
    const s = seed();
    incoming(s, "same order again, 5 cartons");
    const r = s.requests[0];
    expect(() => approveRequest(s, admin, r.id, r.version)).toThrow();
    incoming(s, "confirm");
    approveRequest(s, admin, r.id, r.version);
    expect(r.status).toBe("approved");
    expect(s.orders).toHaveLength(10);
  });
  it("amends the draft and requires fresh confirmation", () => {
    const s = seed();
    incoming(s, "same order again, 5 cartons");
    incoming(s, "same order again, 8 cartons");
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].items[0].quantity).toBe(8);
    expect(s.requests[0].status).toBe("draft");
  });
  it("requires a changed confirmation to be restated before approval", () => {
    const s = seed();
    incoming(s, "same order again, 5 cartons");
    incoming(s, "yes but 8 cartons");
    expect(s.requests[0].status).toBe("draft");
    expect(s.requests[0].items[0].quantity).toBe(5);
  });
  it("does not silently copy a prior order for a new product request", () => {
    const s = seed();
    incoming(s, "order chocolate cream 5 cartons");
    expect(s.requests).toHaveLength(0);
  });
  it("resumes an ambiguous case when an authorized reference arrives", () => {
    const s = seed();
    s.shipments.push({ ...s.shipments[0], id: "SHP-104", lr: "LR-504" });
    incoming(s, "2 cartons missing");
    expect(s.cases[0].shipmentId).toBeUndefined();
    incoming(s, "SHP-101");
    expect(s.cases[0].shipmentId).toBe("SHP-101");
    expect(s.cases[0].status).toBe("awaiting_evidence");
  });
  it("does not guess that boxes equal cartons", () => {
    const s = seed();
    incoming(s, "same order 5 boxes");
    expect(s.requests).toHaveLength(0);
    expect(s.messages.at(-1)?.text).toContain("selling units");
  });
  it("keeps a discount request as a stated concern without creating an offer", () => {
    const s = seed();
    incoming(s, "Your price is too high");
    expect(s.customers[0].reason).toContain("price");
    expect(s.requests).toHaveLength(0);
    expect(s.messages.at(-1)?.text).toContain("cannot promise");
  });
  it("requires evidence and a proposal before approving a case action", () => {
    const s = seed();
    incoming(s, "2 cartons missing");
    const c = s.cases[0];
    expect(() =>
      caseAction(s, admin, {
        caseId: c.id,
        version: c.version,
        action: "approve",
        note: "approve",
      }),
    ).toThrow();
    attach(s, admin, c.id, evidence, c.version);
    expect(c.status).toBe("review");
    expect(s.shipments[0].podStatus).toBe("missing");
    caseAction(s, admin, {
      caseId: c.id,
      version: c.version,
      action: "propose",
      note: "Dispatch will verify the shortage",
    });
    caseAction(s, admin, {
      caseId: c.id,
      version: c.version,
      action: "approve",
      note: "Approved for dispatch verification",
    });
    expect(c.status).toBe("action_pending");
    expect(s.customers[0].paused).toBe(true);
  });
  it("rejects stale staff decisions after new evidence changes the case", () => {
    const s = seed();
    incoming(s, "2 cartons missing");
    const c = s.cases[0],
      v = c.version;
    attach(s, admin, c.id, evidence, v);
    expect(() =>
      caseAction(s, admin, {
        caseId: c.id,
        version: v,
        action: "propose",
        note: "Outdated review",
      }),
    ).toThrow("changed");
  });
  it("requires an approved action before completion and preserves opt-out", () => {
    const s = seed();
    incoming(s, "2 cartons missing");
    const c = s.cases[0];
    expect(() =>
      caseAction(s, admin, {
        caseId: c.id,
        version: c.version,
        action: "resolve",
        note: "done",
      }),
    ).toThrow();
    attach(s, admin, c.id, evidence, c.version);
    caseAction(s, admin, {
      caseId: c.id,
      version: c.version,
      action: "propose",
      note: "Verify",
    });
    caseAction(s, admin, {
      caseId: c.id,
      version: c.version,
      action: "approve",
      note: "Approved",
    });
    incoming(s, "stop");
    caseAction(s, admin, {
      caseId: c.id,
      version: c.version,
      action: "resolve",
      note: "Office verified correction and customer acceptance",
    });
    expect(c.status).toBe("resolved");
    expect(s.customers[0].paused).toBe(true);
  });
  it("prevents a sales role from approving logistics cases", () => {
    const s = seed();
    incoming(s, "2 cartons missing");
    expect(() =>
      attach(s, { ...admin, role: "sales" }, s.cases[0].id, evidence, 1),
    ).toThrow("role");
  });
  it("prevents cross-business staff mutations even with identical customer IDs", () => {
    const s = seed();
    expect(() =>
      queueFollowup(s, { ...admin, tenantId: "otherco" }, "C001"),
    ).toThrow();
  });
  it("reports a timestamped recorded status without live GPS claims", () => {
    const s = seed();
    incoming(s, "Where is my delivery?");
    expect(s.messages.at(-1)?.text).toContain("Last recorded update");
    expect(s.messages.at(-1)?.text).toContain("not a live vehicle");
  });
});
describe("Ambiguous business instructions", () => {
  it("does not equate missing boxes with the recorded carton unit", () => {
    const s = seed();
    incoming(s, "2 boxes missing");
    expect(s.cases[0].reported).toBeUndefined();
    expect(s.messages.at(-1)?.text).toContain("cannot equate");
  });
  it("does not treat conditional confirmation as unconditional consent", () => {
    const s = seed();
    incoming(s, "same order again, 5 cartons");
    incoming(s, "confirm if the price is discounted");
    expect(s.requests[0].status).toBe("draft");
  });
});
describe("Persistent state isolation and concurrency", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });
  it("serializes concurrent local mutations and persists both", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tradeloop-test-"));
    dirs.push(dir);
    const store = new Store(undefined, dir);
    await Promise.all([
      store.change("demofoods", (s) => incoming(s, "2 cartons missing", "m1")),
      store.change("demofoods", (s) => incoming(s, "price too high", "m2")),
    ]);
    const state = await store.load("demofoods");
    expect(state.revision).toBe(2);
    expect(state.processed).toHaveLength(2);
    expect(state.cases).toHaveLength(1);
  });
  it("keeps identical entity IDs separate between businesses", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tradeloop-test-"));
    dirs.push(dir);
    const store = new Store(undefined, dir);
    await store.change("demofoods", (s) => incoming(s, "2 cartons missing"));
    expect((await store.load("otherco")).cases).toHaveLength(0);
    expect((await store.load("otherco")).customers[0].name).toBe(
      "Northstar Test Outlet",
    );
  });
});
describe("AWS WhatsApp event normalization", () => {
  it("decodes the documented nested JSON string and ignores provider status-only events", () => {
    const event = {
      context: { MetaPhoneNumberIds: [{ arn: "arn:example" }] },
      whatsAppWebhookEntry: JSON.stringify({
        changes: [
          {
            value: {
              metadata: { phone_number_id: "meta-1" },
              messages: [
                {
                  from: "123",
                  id: "wamid.1",
                  type: "text",
                  text: { body: "hello" },
                },
              ],
            },
          },
        ],
      }),
    };
    expect(normalize(event)[0]).toMatchObject({
      from: "123",
      messageId: "wamid.1",
      text: "hello",
      metaPhoneId: "meta-1",
      phoneArns: ["arn:example"],
    });
    expect(
      normalize({
        whatsAppWebhookEntry: JSON.stringify({
          changes: [{ value: { statuses: [{ id: "sent" }] } }],
        }),
      }),
    ).toEqual([]);
  });
});
