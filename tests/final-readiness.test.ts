import { describe, expect, it } from "vitest";
import { seed } from "../src/core/seed";
import {
  attach,
  caseAction,
  queueFollowup,
  receive,
  ruleIntent,
} from "../src/core/engine";
import type { Actor, Evidence, State } from "../src/core/types";

const admin: Actor = {
  id: "final-reviewer",
  tenantId: "demofoods",
  role: "admin",
};
const incoming = (state: State, text: string) =>
  receive(state, {
    customerId: "C001",
    text,
    messageId: crypto.randomUUID(),
    channel: "simulator",
    intent: ruleIntent(text),
    engine: "rules",
  });
const evidence = (suffix: string): Evidence => ({
  id: `DOC-final-${suffix}`,
  name: `${suffix}.png`,
  key: `demofoods/${suffix}`,
  mime: "image/png",
  sha256: `fixture-${suffix}`,
  size: 200,
  extraction: "manual",
  kind: "sample",
  createdAt: new Date().toISOString(),
});
const approvedCase = () => {
  const state = seed();
  incoming(state, "2 cartons missing");
  const record = state.cases[0];
  attach(state, admin, record.id, evidence("first"), record.version);
  caseAction(state, admin, {
    caseId: record.id,
    version: record.version,
    action: "propose",
    note: "Dispatch will verify two missing cartons",
  });
  caseAction(state, admin, {
    caseId: record.id,
    version: record.version,
    action: "approve",
    note: "Approved after reviewing the first document",
  });
  return { state, record };
};

describe("Final readiness: explicit customer intent and fresh staff decisions", () => {
  it.each(["0", "-5", "1.5", ".5", "1,5"])(
    "does not draft an order from invalid quantity %s",
    (quantity) => {
      const state = seed();
      incoming(state, `same order again, ${quantity} cartons`);
      expect(state.requests).toHaveLength(0);
    },
  );

  it("does not turn a negated confirmation into a customer-confirmed order", () => {
    const state = seed();
    incoming(state, "same order again, 5 cartons");
    incoming(state, "do not confirm");
    expect(state.requests[0].status).toBe("draft");
  });

  it("suppresses an already queued reminder when the customer defers", () => {
    const state = seed();
    queueFollowup(state, admin, "C001");
    incoming(state, "Please contact me next week");
    expect(state.outbox[0].status).toBe("suppressed");
    expect(() => queueFollowup(state, admin, "C001")).toThrow("not due");
  });

  it("keeps ordinary repeat orders and explicit valid quantities working", () => {
    const state = seed();
    const previous = state.orders
      .filter((o) => o.customerId === "C001")
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    incoming(state, "same order again");
    expect(state.requests[0].items).toEqual(previous.items);
    incoming(state, "same order again, 8 cartons");
    expect(state.requests[0].items[0].quantity).toBe(8);
  });

  it("answers an explicit authorized shipment reference after asking for clarification", () => {
    const state = seed();
    state.shipments.push({
      ...state.shipments[0],
      id: "SHP-104",
      lr: "LR-504",
    });
    incoming(state, "Where is my delivery?");
    expect(state.messages.at(-1)?.text).toContain("Please share the shipment");
    incoming(state, "SHP-101");
    expect(state.messages.at(-1)?.text).toContain("SHP-101:");
    expect(state.messages.at(-1)?.text).toContain("Last recorded update");
  });

  it.each(["SHP-102", "SHP-999"])(
    "does not substitute a customer's own shipment for unauthorized or unknown reference %s",
    (reference) => {
      const state = seed();
      incoming(state, `status ${reference}`);
      expect(state.messages.at(-1)?.text).toContain("could not match");
      expect(state.messages.at(-1)?.text).not.toContain("SHP-101:");
    },
  );

  it("requires a fresh proposal when new evidence arrives after approval", () => {
    const { state, record } = approvedCase();
    attach(state, admin, record.id, evidence("second"), record.version);
    expect(() =>
      caseAction(state, admin, {
        caseId: record.id,
        version: record.version,
        action: "approve",
        note: "Attempt to reuse the action proposed before the second document",
      }),
    ).toThrow();
  });

  it("does not resolve a changed customer claim using the earlier approval", () => {
    const { state, record } = approvedCase();
    incoming(state, "Actually 10 cartons missing, not 2 cartons");
    expect(() =>
      caseAction(state, admin, {
        caseId: record.id,
        version: record.version,
        action: "resolve",
        note: "Attempt to complete the action approved for two cartons",
      }),
    ).toThrow();
  });
});
