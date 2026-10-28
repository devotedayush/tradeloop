import { describe, expect, it } from "vitest";
import { seed } from "../src/core/seed";
import { queueFollowup, receive, ruleIntent } from "../src/core/engine";
import type { State } from "../src/core/types";
const actor = {
  id: "sales-reviewer",
  tenantId: "demofoods",
  role: "sales" as const,
};
function inbound(
  s: State,
  text: string,
  messageId: string = crypto.randomUUID(),
) {
  return receive(s, {
    customerId: "C001",
    text,
    messageId,
    channel: "simulator",
    intent: ruleIntent(text),
    engine: "rules",
  });
}
describe("Customer-reported repeat-order feedback", () => {
  it("queues a needs-and-reason check-in without recording an inbound session or sending it", () => {
    const s = seed();
    expect(queueFollowup(s, actor, "C001")).toContain(
      "would you like your next delivery?",
    );
    expect(s.outbox[0]).toMatchObject({ status: "pending", kind: "followup" });
    expect(s.customers[0].lastInboundAt).toBeUndefined();
    expect(s.customers[0].retention).toBeUndefined();
  });
  it.each([
    ["We still have stock remaining", "stock_remaining"],
    ["Abhi stock hai, maal bacha hai", "stock_remaining"],
    ["Sales are slow this week", "low_demand"],
    ["Demand kam hai", "low_demand"],
    ["No reorder, demand is low", "low_demand"],
    ["Do not reorder, stock remaining", "stock_remaining"],
    ["Price nahi, demand kam hai", "low_demand"],
    ["Not expensive, but low demand", "low_demand"],
  ])(
    "preserves %s as reported %s and suppresses the old reminder",
    (text, category) => {
      const s = seed();
      queueFollowup(s, actor, "C001");
      const before = Date.now();
      inbound(s, text);
      const c = s.customers[0];
      expect(c.retention).toMatchObject({ category, statement: text });
      expect(c.retention?.nextAction).toContain(c.owner);
      expect(new Date(c.nextFollowupAt).getTime()).toBeGreaterThanOrEqual(
        before + 7 * 86400000,
      );
      expect(s.outbox[0].status).toBe("suppressed");
      expect(s.requests).toHaveLength(0);
      expect(s.cases).toHaveLength(0);
      expect(() => queueFollowup(s, actor, "C001")).toThrow("not due");
    },
  );
  it("records price feedback for the owner without promising a concession", () => {
    const s = seed();
    queueFollowup(s, actor, "C001");
    const response = inbound(s, "Rate mehenga hai");
    expect(s.customers[0].retention).toMatchObject({
      category: "price",
      statement: "Rate mehenga hai",
    });
    expect(s.customers[0].retention?.nextAction).toContain(
      s.customers[0].owner,
    );
    expect(response.reply).toContain("cannot promise a discount");
    expect(s.outbox[0].status).toBe("suppressed");
  });
  it("does not mistake a price concern followed by a negated order for a negated price concern", () => {
    const s = seed();
    inbound(s, "Price is high, not ordering now");
    expect(s.customers[0].retention?.category).toBe("price");
    expect(s.requests).toHaveLength(0);
  });
  it.each([
    "Price is not the issue, demand is not low",
    "Not low demand",
    "No demand problem",
    "Price is high and demand is low",
  ])("keeps negated or mixed feedback for staff clarification: %s", (text) => {
    const s = seed();
    const due = s.customers[0].nextFollowupAt;
    inbound(s, text);
    expect(s.customers[0].retention?.category).toBe("other");
    expect(s.customers[0].nextFollowupAt).toBe(due);
  });
  it("routes generic quality feedback without inventing a shipment or quantity", () => {
    const s = seed();
    queueFollowup(s, actor, "C001");
    inbound(s, "Product quality kharab hai");
    expect(s.customers[0].retention?.category).toBe("product_quality");
    expect(s.customers[0].paused).toBe(true);
    expect(s.cases).toHaveLength(0);
    expect(s.shipments[0].podStatus).toBe("missing");
    expect(() => queueFollowup(s, actor, "C001")).toThrow("blocked");
  });
  it("records a delivery claim and preserves existing complaint protections", () => {
    const s = seed();
    inbound(s, "2 cartons missing");
    expect(s.customers[0].retention?.category).toBe("delivery_issue");
    expect(s.cases[0]).toMatchObject({
      expected: 20,
      reported: 18,
      status: "awaiting_evidence",
    });
  });
  it("preserves opt-out, confirmation and repeat-order guards", () => {
    const s = seed();
    inbound(s, "Same order again, 5 cartons at the same price");
    expect(s.requests[0].status).toBe("draft");
    inbound(s, "Do not confirm this order");
    expect(s.requests[0].status).toBe("draft");
    inbound(s, "Stop messages, demand kam hai");
    expect(s.customers[0].consent).toBe(false);
    expect(s.customers[0].retention).toBeUndefined();
  });
  it("deduplicates feedback and leaves unprompted greetings unclassified", () => {
    const s = seed();
    inbound(s, "Hello");
    expect(s.customers[0].retention).toBeUndefined();
    inbound(s, "Stock remaining", "feedback-1");
    const due = s.customers[0].nextFollowupAt;
    const auditCount = s.audit.length;
    inbound(s, "Stock remaining", "feedback-1");
    expect(s.audit).toHaveLength(auditCount);
    expect(s.customers[0].nextFollowupAt).toBe(due);
  });
  it.each(["What is the price?", "Send price list", "Discount please"])(
    "does not turn an ordinary enquiry into a stopped-order reason: %s",
    (text) => {
      const s = seed();
      queueFollowup(s, actor, "C001");
      inbound(s, text);
      expect(ruleIntent(text).kind).toBe("price_enquiry");
      expect(s.customers[0].retention).toBeUndefined();
      expect(s.customers[0].reason).toBeUndefined();
      expect(s.outbox[0].status).toBe("pending");
    },
  );
  it.each([
    "We stopped ordering because price is high",
    "We will stop ordering because price is high",
  ])(
    "captures a price reason without revoking messaging consent: %s",
    (text) => {
      const s = seed();
      inbound(s, text);
      expect(s.customers[0].retention).toMatchObject({
        category: "price",
        statement: text,
      });
      expect(s.customers[0].consent).toBe(true);
      expect(s.requests).toHaveLength(0);
    },
  );
  it.each(["Stop", "Stop messages", "Stop sending me messages", "Unsubscribe"])(
    "keeps explicit messaging opt-outs: %s",
    (text) => {
      const s = seed();
      inbound(s, text);
      expect(s.customers[0].consent).toBe(false);
    },
  );
  it("preserves the original delivery claim and quantity when adding a quality concern", () => {
    const s = seed();
    inbound(s, "2 cartons missing");
    const claim = s.cases[0].claim;
    const reported = s.cases[0].reported;
    s.cases[0].proposal = "Review shortage";
    s.cases[0].approvedBy = "old-approver";
    inbound(s, "Product quality kharab hai");
    expect(s.cases).toHaveLength(1);
    expect(s.cases[0].claim).toContain(claim);
    expect(s.cases[0].claim).toContain("Product quality kharab hai");
    expect(s.cases[0].reported).toBe(reported);
    expect(s.cases[0].approvedBy).toBeUndefined();
    expect(s.cases[0].proposal).toBeUndefined();
  });
});
