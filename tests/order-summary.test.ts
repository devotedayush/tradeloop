import { describe, expect, it } from "vitest";
import { seed } from "../src/core/seed";
import { queueOrderUpdate, receive, ruleIntent } from "../src/core/engine";
import type { Actor, State } from "../src/core/types";
const actor: Actor = { id: "staff", tenantId: "demofoods", role: "sales" };
function ask(s: State, text: string) {
  return receive(s, {
    customerId: "C001",
    text,
    messageId: crypto.randomUUID(),
    channel: "simulator",
    intent: ruleIntent(text),
    engine: "rules",
  });
}
describe("Factual recorded purchase context", () => {
  it.each(["What did I order?", "Mera order kya hai", "Order summary"])(
    "answers %s with recorded items and unique shipment, without asking for a reference",
    (text) => {
      const s = seed();
      const response = ask(s, text);
      expect(response.reply).toContain("INV-200");
      expect(response.reply).toContain(
        "20 cartons of Tomato pizza sauce (6 × 1 kg)",
      );
      expect(response.reply).toContain("SHP-101");
      expect(response.reply).not.toContain("please share a shipment reference");
      expect(s.requests).toHaveLength(0);
    },
  );
  it("requests a reference only for genuinely ambiguous shipment status", () => {
    const s = seed();
    s.shipments.push({ ...s.shipments[0], id: "SHP-second" });
    const response = ask(s, "What did I order?");
    expect(response.reply).toContain("INV-200");
    expect(response.reply).toContain("Multiple shipments");
    expect(response.reply).toContain("one specific shipment");
  });
  it("does not use another customer's shipment or turn an unapproved request into an order", () => {
    const s = seed();
    s.shipments = s.shipments.filter((sh) => sh.customerId !== "C001");
    s.orders = s.orders.filter((o) => o.customerId !== "C001");
    s.requests.push({
      id: "draft",
      customerId: "C001",
      status: "draft",
      version: 1,
      createdAt: new Date().toISOString(),
      items: [{ productId: "P01", quantity: 99 }],
    });
    expect(ask(s, "What did I order?").reply).toContain(
      "do not have a recorded purchase",
    );
    expect(() => queueOrderUpdate(s, actor, "C001")).toThrow(
      "No recorded purchase",
    );
    expect(s.outbox).toHaveLength(0);
  });
  it("queues a service update, retains the sender consent guard and prevents duplicate pending sends", () => {
    const s = seed();
    const text = queueOrderUpdate(s, actor, "C001");
    expect(text).toContain("latest recorded purchase");
    expect(text).toMatch(/^DEMO \/ synthetic record\./);
    expect(s.outbox[0]).toMatchObject({
      text,
      kind: "service",
      status: "pending",
      requiresConsent: true,
    });
    expect(s.customers[0].lastInboundAt).toBeUndefined();
    expect(s.audit.at(-1)?.action).toBe("order_update.queued");
    expect(() => queueOrderUpdate(s, actor, "C001")).toThrow("already queued");
    expect(s.outbox).toHaveLength(1);
  });
  it("rejects revoked consent and cross-business staff", () => {
    const s = seed();
    s.customers[0].consent = false;
    expect(() => queueOrderUpdate(s, actor, "C001")).toThrow("consent");
    expect(() =>
      queueOrderUpdate(s, { ...actor, tenantId: "other" }, "C001"),
    ).toThrow("cannot perform");
  });
});
