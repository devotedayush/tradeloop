import {
  DomainError,
  id,
  type State,
  type Actor,
  type Intent,
  type Evidence,
  type ServiceCase,
} from "./types";
const stamp = () => new Date().toISOString();
export function audit(
  s: State,
  actor: string,
  action: string,
  detail: string,
  customerId?: string,
  recordId?: string,
) {
  s.audit.push({
    id: id("evt"),
    at: stamp(),
    actor,
    action,
    detail,
    customerId,
    recordId,
  });
}
function customer(s: State, cid: string) {
  const c = s.customers.find((x) => x.id === cid);
  if (!c) throw new DomainError(404, "Customer not found in this business");
  return c;
}
function permit(s: State, a: Actor, roles: string[]) {
  if (a.tenantId !== s.tenantId || !roles.includes(a.role))
    throw new DomainError(403, "This staff role cannot perform this action");
}
function message(
  s: State,
  cid: string,
  text: string,
  channel: "simulator" | "whatsapp",
  engine: "rules" | "bedrock",
) {
  s.messages.push({
    id: id("msg"),
    customerId: cid,
    text,
    direction: "outbound",
    at: stamp(),
    channel,
    engine,
  });
  if (channel === "whatsapp")
    s.outbox.push({
      id: id("send"),
      customerId: cid,
      text,
      status: "pending",
      kind: "service",
      createdAt: stamp(),
    });
  return text;
}
export function ruleIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(stop|unsubscribe|opt.?out)\b|मत भेज|message mat|band karo/.test(t))
    return { kind: "optout" };
  if (
    /missing|short|damag|broken|complaint|kam mile|kam aaye|nahi mile|खराब|कम मिले|क्षतिग्रस्त/.test(
      t,
    )
  ) {
    const received =
      t.match(/(?:received|got|mile|aaye|मिले)\s*(\d+)/)?.[1] ??
      t.match(
        /(\d+)\s*(?:cartons?|boxes?|cases?|कार्टन)?\s*(?:mile|aaye|मिले)/,
      )?.[1];
    const short = t.match(
      /(\d+)\s*(?:cartons?|boxes?|cases?)?\s*(?:missing|short)/,
    )?.[1];
    return {
      kind: "complaint",
      reported: received ? Number(received) : undefined,
      quantity: short ? Number(short) : undefined,
    };
  }
  if (/\b(confirm|yes|haan|ha|okay|ok)\b|हाँ|ठीक/.test(t))
    return { kind: "confirm" };
  if (/same|reorder|order|bhej|भेज|ऑर्डर/.test(t))
    return {
      kind: "reorder",
      quantity: Number(t.match(/\b(\d+)\b/)?.[1]) || undefined,
    };
  if (/where|status|track|delivery kab|कहाँ|कब/.test(t))
    return { kind: "status" };
  if (/later|stock|next week|baad|अगले/.test(t))
    return { kind: "defer", days: /week|अगले/.test(t) ? 7 : 14 };
  if (/price|expensive|discount|rate|महंगा|कीमत/.test(t))
    return { kind: "price" };
  return { kind: "other" };
}
export function receive(
  s: State,
  input: {
    customerId: string;
    text: string;
    messageId: string;
    channel: "simulator" | "whatsapp";
    intent: Intent;
    engine: "rules" | "bedrock";
    inboundAt?: string;
  },
) {
  const { customerId: cid, text, messageId, channel, intent, engine } = input;
  if (s.processed.some((p) => p.id === messageId))
    return { duplicate: true, reply: "Already processed" };
  const c = customer(s, cid);
  if (channel === "whatsapp") c.lastInboundAt = input.inboundAt ?? stamp();
  s.processed.push({ id: messageId, at: stamp() });
  s.messages.push({
    id: messageId,
    customerId: cid,
    text,
    direction: "inbound",
    at: stamp(),
    channel,
  });
  const reply = (t: string) => ({
    duplicate: false,
    reply: message(s, cid, t, channel, engine),
  });
  audit(
    s,
    `customer:${cid}`,
    "message.received",
    `Intent: ${intent.kind}; interpreter: ${engine}`,
    cid,
  );
  const active = s.cases.find(
    (x) => x.customerId === cid && x.status !== "resolved",
  );
  if (intent.kind === "optout") {
    c.consent = false;
    c.paused = true;
    for (const o of s.outbox)
      if (o.customerId === cid && o.status === "pending")
        o.status = "suppressed";
    audit(
      s,
      `customer:${cid}`,
      "consent.revoked",
      "Automated follow-ups disabled",
      cid,
    );
    return reply(
      "Understood. Automated follow-ups are stopped. You can still contact the team here for service help.",
    );
  }
  if (active?.status === "awaiting_details") {
    const reference = text.match(/SHP-\d+|LR-\d+|INV-\d+/i)?.[0].toUpperCase();
    if (reference) {
      const sh = s.shipments.find(
        (x) =>
          x.customerId === cid &&
          (x.id === reference ||
            x.lr === reference ||
            s.orders.some(
              (o) => o.id === x.orderId && o.invoice === reference,
            )),
      );
      if (sh) {
        active.shipmentId = sh.id;
        active.expected = sh.expected;
        active.status = "awaiting_evidence";
        active.version++;
        active.updatedAt = stamp();
        audit(
          s,
          "workflow",
          "case.matched",
          "Customer supplied an authorized shipment reference",
          cid,
          active.id,
        );
        return reply(
          `Your case is now linked to ${sh.id}. Please share supporting evidence for staff review.`,
        );
      }
      return reply(
        "I could not match that reference to a shipment you are authorized to discuss. Please check it or ask the office to help.",
      );
    }
  }
  if (intent.kind === "complaint") {
    c.paused = true;
    c.reason = text;
    const explicit = text.match(/SHP-\d+|LR-\d+|INV-\d+/i)?.[0].toUpperCase();
    const allowed = s.shipments.filter((x) => x.customerId === cid);
    const ship = explicit
      ? allowed.find(
          (x) =>
            x.id === explicit ||
            x.lr === explicit ||
            s.orders.some((o) => o.id === x.orderId && o.invoice === explicit),
        )
      : allowed.length === 1
        ? allowed[0]
        : undefined;
    if (active) {
      active.claim = text;
      active.version++;
      active.updatedAt = stamp();
      audit(
        s,
        "workflow",
        "case.updated",
        "Added customer clarification; existing case preserved",
        cid,
        active.id,
      );
      return reply(
        "I have added that to your open case. Sales follow-ups remain paused while the team investigates. Please share any supporting photo or delivery reference.",
      );
    }
    const ambiguousUnit =
      /\b(box(?:es)?|pieces?|cases?|kg|kilograms?|litres?|liters?)\b/i.test(
        text,
      );
    let reported = ambiguousUnit ? undefined : intent.reported;
    if (
      reported === undefined &&
      !ambiguousUnit &&
      ship &&
      intent.quantity !== undefined &&
      /missing|short/i.test(text)
    )
      reported = ship.expected - intent.quantity;
    if (
      reported !== undefined &&
      (!Number.isInteger(reported) ||
        reported < 0 ||
        (ship && reported > ship.expected))
    )
      reported = undefined;
    const record: ServiceCase = {
      id: id("CASE"),
      customerId: cid,
      shipmentId: ship?.id,
      type: /damag|broken|खराब/.test(text.toLowerCase())
        ? "damage"
        : "delivery discrepancy",
      claim: text,
      origin: channel,
      owner: "Dispatch review",
      status: ship ? "awaiting_evidence" : "awaiting_details",
      expected: ship?.expected,
      reported,
      version: 1,
      evidence: [],
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    s.cases.push(record);
    for (const o of s.outbox)
      if (
        o.customerId === cid &&
        o.kind === "followup" &&
        o.status === "pending"
      )
        o.status = "suppressed";
    audit(
      s,
      "workflow",
      "case.opened",
      "Customer claim recorded separately from accepted delivery facts; sales follow-up paused",
      cid,
      record.id,
    );
    return reply(
      ship
        ? `I have opened a delivery case for ${ship.id} (${ship.expected} ${ship.unit}s expected${reported !== undefined ? `, ${reported} reported received` : ""}). ${ambiguousUnit ? `Please clarify the quantity in ${ship.unit}s; I cannot equate different units. ` : ""}Please share a photo or POD. The dispatch team will review; no credit or replacement has been promised.`
        : "I have opened a case and paused sales reminders. Which shipment or invoice is this about? Please share its reference; I will not guess.",
    );
  }
  if (intent.kind === "reorder") {
    if (active)
      return reply(
        "Your delivery issue is still open. I can record your interest, but the team should review the issue before we continue the routine reorder follow-up.",
      );
    if (!/same|again|repeat|reorder|pichla|वही|दोबारा/i.test(text))
      return reply(
        "Please specify the product, pack size, and quantity, or say “same order again” to repeat your last recorded purchase. New product combinations need staff review.",
      );
    const previous = s.orders
      .filter((x) => x.customerId === cid)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!previous)
      return reply(
        "Which product, pack size, and quantity would you like? I do not have a previous purchase to copy.",
      );
    if (/boxes?|pieces?|kg|litres?|liters?/i.test(text))
      return reply(
        "Your previous order uses cartons. Please confirm the product, pack size, and quantity in cartons so we do not confuse selling units.",
      );
    const qty = intent.quantity;
    if (qty !== undefined && (!Number.isInteger(qty) || qty < 1 || qty > 10000))
      return reply(
        "Please provide a whole number of cartons between 1 and 10,000.",
      );
    const items = previous.items.map((i) => ({
      ...i,
      quantity: qty ?? i.quantity,
    }));
    const req = {
      id: id("REQ"),
      customerId: cid,
      items,
      status: "draft" as const,
      version: 1,
      createdAt: stamp(),
    };
    const old = s.requests.find(
      (x) => x.customerId === cid && x.status === "draft",
    );
    if (old) {
      old.items = items;
      old.version++;
      audit(
        s,
        "workflow",
        "order.amended",
        "Draft changed; fresh customer confirmation needed",
        cid,
        old.id,
      );
    } else {
      s.requests.push(req);
      audit(
        s,
        "workflow",
        "order.drafted",
        "Copied latest recorded purchase; stock and delivery not confirmed",
        cid,
        req.id,
      );
    }
    return reply(
      `Please confirm: ${items.map((i) => `${i.quantity} cartons of ${s.products.find((p) => p.id === i.productId)?.name} (${s.products.find((p) => p.id === i.productId)?.pack})`).join(", ")}. Reply “confirm” to send this request for staff review. Stock, final price, and delivery will be confirmed by the team.`,
    );
  }
  if (intent.kind === "confirm") {
    if (
      /\d|\b(but|if|unless|provided)\b|change|instead|discount|बदल/i.test(text)
    )
      return reply(
        "Your confirmation includes a possible amendment. Please restate the repeat order and quantity first, then confirm the updated draft.",
      );
    const req = s.requests
      .filter((x) => x.customerId === cid && x.status === "draft")
      .at(-1);
    if (!req)
      return reply(
        "There is no draft order awaiting confirmation. Tell me the products and quantities you need.",
      );
    req.status = "customer_confirmed";
    req.version++;
    audit(
      s,
      `customer:${cid}`,
      "order.customer_confirmed",
      "Request sent to sales review; not a fulfilled order",
      cid,
      req.id,
    );
    return reply(
      "Your order request is with the sales team for stock, price, and delivery checks. It is not yet a confirmed sale.",
    );
  }
  if (intent.kind === "status") {
    const ships = s.shipments.filter((x) => x.customerId === cid);
    if (ships.length !== 1)
      return reply(
        "Please share the shipment reference so I can find the right authorized record.",
      );
    const sh = ships[0];
    return reply(
      `${sh.id}: ${sh.status}. Last recorded update: ${new Date(sh.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} IST. This is a recorded status, not a live vehicle location.`,
    );
  }
  if (intent.kind === "defer") {
    c.nextFollowupAt = new Date(
      Date.now() + (intent.days ?? 7) * 86400000,
    ).toISOString();
    c.reason = text;
    audit(
      s,
      `customer:${cid}`,
      "followup.deferred",
      `Next follow-up ${c.nextFollowupAt}`,
      cid,
    );
    return reply(
      "I have recorded that and moved the next follow-up. The team can adjust the date if needed.",
    );
  }
  if (intent.kind === "price") {
    c.reason = text;
    audit(
      s,
      "workflow",
      "sales.review_requested",
      "Customer-stated price concern; no discount authorized",
      cid,
    );
    return reply(
      "I have recorded your price concern for your salesperson. They will review the approved commercial terms; I cannot promise a discount.",
    );
  }
  return reply(
    active
      ? "Your case is open. Please share the shipment reference, what was received, or supporting evidence. A staff member will review."
      : "I can help with a repeat-order request, the latest recorded shipment status, or a delivery complaint. What would you like help with?",
  );
}
export function queueFollowup(s: State, a: Actor, cid: string) {
  permit(s, a, ["admin", "sales"]);
  const c = customer(s, cid);
  if (
    !c.consent ||
    c.paused ||
    s.cases.some((x) => x.customerId === cid && x.status !== "resolved")
  )
    throw new DomainError(
      409,
      "Follow-up blocked by consent or an unresolved service case",
    );
  if (new Date(c.nextFollowupAt).getTime() > Date.now())
    throw new DomainError(409, "Follow-up is not due yet");
  if (
    s.outbox.some(
      (x) =>
        x.customerId === cid &&
        x.kind === "followup" &&
        ["pending", "sending"].includes(x.status),
    )
  )
    throw new DomainError(409, "A follow-up is already queued");
  c.nextFollowupAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const text = `Hello ${c.name}, would you like to place another order? If there is a problem with your last delivery, please tell us so the team can help.`;
  s.outbox.push({
    id: id("followup"),
    customerId: cid,
    text,
    status: "pending",
    kind: "followup",
    createdAt: stamp(),
  });
  audit(
    s,
    a.id,
    "followup.queued",
    "Recheck consent, service cases, template and session before delivery",
    cid,
  );
  return text;
}
export function attach(
  s: State,
  a: Actor,
  caseId: string,
  e: Evidence,
  version: number,
) {
  permit(s, a, ["admin", "logistics"]);
  const c = s.cases.find((x) => x.id === caseId);
  if (!c) throw new DomainError(404, "Case not found");
  if (c.version !== version)
    throw new DomainError(409, "Case changed. Refresh before adding evidence.");
  if (c.status === "resolved")
    throw new DomainError(409, "Resolved case cannot accept evidence");
  if (c.evidence.some((x) => x.sha256 === e.sha256)) return;
  c.evidence.push(e);
  c.status = c.shipmentId ? "review" : "awaiting_details";
  c.version++;
  c.updatedAt = stamp();
  audit(
    s,
    a.id,
    "evidence.received",
    "Document is evidence pending review, not delivery acceptance",
    c.customerId,
    c.id,
  );
}
export function caseAction(
  s: State,
  a: Actor,
  input: { caseId: string; version: number; action: string; note: string },
) {
  permit(s, a, ["admin", "logistics"]);
  const c = s.cases.find((x) => x.id === input.caseId);
  if (!c) throw new DomainError(404, "Case not found");
  if (c.version !== input.version)
    throw new DomainError(
      409,
      "Case changed. Refresh and review the latest evidence.",
    );
  if (!input.note.trim())
    throw new DomainError(400, "A review note is required");
  if (input.action === "propose") {
    if (c.status !== "review")
      throw new DomainError(
        409,
        "Evidence and a matched shipment are required first",
      );
    c.proposal = input.note;
    c.status = "review";
  } else if (input.action === "approve") {
    if (!c.proposal || c.status !== "review")
      throw new DomainError(409, "Review a proposed next action first");
    c.approvedBy = a.id;
    c.status = "action_pending";
    message(
      s,
      c.customerId,
      `The team approved this next step: ${c.proposal}. The case remains open until the action is completed.`,
      c.origin ?? "simulator",
      "rules",
    );
  } else if (input.action === "resolve") {
    if (c.status !== "action_pending")
      throw new DomainError(409, "An approved action must precede resolution");
    c.resolution = input.note;
    c.status = "resolved";
    const cust = customer(s, c.customerId);
    cust.paused =
      s.cases.some(
        (x) =>
          x.customerId === c.customerId &&
          x.id !== c.id &&
          x.status !== "resolved",
      ) || !cust.consent;
    cust.nextFollowupAt = new Date(Date.now() + 86400000).toISOString();
    message(
      s,
      c.customerId,
      `The team recorded completion: ${input.note}. Please tell us if the issue remains.`,
      c.origin ?? "simulator",
      "rules",
    );
  } else throw new DomainError(400, "Unknown case action");
  c.version++;
  c.updatedAt = stamp();
  audit(s, a.id, `case.${input.action}`, input.note, c.customerId, c.id);
}
export function approveRequest(
  s: State,
  a: Actor,
  rid: string,
  version: number,
) {
  permit(s, a, ["admin", "sales"]);
  const r = s.requests.find((x) => x.id === rid);
  if (!r) throw new DomainError(404, "Request not found");
  if (r.version !== version || r.status !== "customer_confirmed")
    throw new DomainError(
      409,
      "A current customer-confirmed request is required",
    );
  r.status = "approved";
  r.version++;
  r.approvedBy = a.id;
  audit(
    s,
    a.id,
    "order.approved",
    "Approved for processing; invoicing, reservation and fulfillment remain in the selling system",
    r.customerId,
    r.id,
  );
}
