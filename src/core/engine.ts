import {
  DomainError,
  id,
  type State,
  type Actor,
  type Intent,
  type Evidence,
  type ServiceCase,
  type RetentionCategory,
} from "./types";
const stamp = () => new Date().toISOString();
function statedQuantity(text: string) {
  // Keep signs, zero and fractions so validation can reject them rather than
  // silently copying a previous quantity or treating -5 as 5.
  const token = text.match(
    /(?:^|[\s,(])([+-]?(?:\d+(?:[.,]\d+)*|\.\d+))(?=\s|$|[,;)])/,
  );
  if (!token) return undefined;
  const value = /^[+-]?\d{1,3}(?:,\d{3})+$/.test(token[1])
    ? token[1].replaceAll(",", "")
    : token[1];
  return Number(value);
}
function invalidateCaseDecision(c: ServiceCase) {
  delete c.proposal;
  delete c.approvedBy;
  c.status = c.shipmentId
    ? c.evidence.length
      ? "review"
      : "awaiting_evidence"
    : "awaiting_details";
}
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
// Categories describe customer-reported feedback, never inferred churn or business facts.
function statedFeedback(text: string): RetentionCategory | undefined {
  const t = text.toLowerCase().replace(/[’]/g, "'");
  const categories: RetentionCategory[] = [];
  const priceNegated =
    /(?:price|rate|cost|discount)\s+(?:(?:is|are)\s+)?(?:not\s+(?:the\s+)?(?:issue|problem|high|expensive)|isn't\s+(?:the\s+)?(?:issue|problem|high)|isnt\s+(?:the\s+)?(?:issue|problem|high)|no issue|fine|okay|ok\b|nahi|nahin)|(?:not|isn't|isnt|no).{0,10}(?:expensive|costly|price issue)|not (?:the )?(?:price|rate)|(?:mehenga|mahanga).{0,8}(?:nahi|nahin)/.test(
      t,
    );
  if (
    !priceNegated &&
    /\b(expensive|costly|mehenga|mahanga)\b|(?:price|rate|cost|कीमत).{0,18}(?:high|issue|problem|concern|mehenga|mahanga|महंगा)|(?:high|increased).{0,10}(?:price|rate|cost)|महंगा/.test(
      t,
    )
  )
    categories.push("price");
  if (
    /\b(?:stock|inventory).{0,20}(?:left|remain|still|available|bacha|hai)|(?:still have|have enough|abhi).{0,15}stock|maal.{0,10}bacha|स्टॉक.{0,10}बचा/.test(
      t,
    ) &&
    !/no stock|stock.{0,8}(?:nahi|nahin|not left|finished)/.test(t)
  )
    categories.push("stock_remaining");
  if (
    /(?:demand|sales?|business).{0,16}(?:low|slow|down|weak|kam|nahi)|(?:low|slow|no|less).{0,10}(?:demand|sales)|(?:bik|bikri).{0,12}(?:nahi|kam)|मांग.{0,8}कम/.test(
      t,
    ) &&
    !/(?:demand|sales?).{0,12}(?:not low|not slow|isn't low|isnt low|kam nahi|no issue|no problem)|(?:not|isn't|isnt).{0,8}(?:low|slow).{0,8}(?:demand|sales)|no (?:demand|sales) (?:issue|problem)|no (?:issue|problem).{0,12}(?:demand|sales)/.test(
      t,
    )
  )
    categories.push("low_demand");
  if (
    /(?:quality|taste|smell|product).{0,18}(?:bad|poor|issue|problem|kharab|off)|(?:poor|bad).{0,8}quality|spoiled|गुणवत्ता.{0,10}खराब/.test(
      t,
    ) &&
    !/(?:quality|taste|product).{0,12}(?:not bad|no issue|no problem|fine|good|kharab nahi)/.test(
      t,
    )
  )
    categories.push("product_quality");
  return categories.length > 1
    ? "other"
    : (categories[0] ??
        (priceNegated || /\b(demand|sales|quality|stock)\b/.test(t)
          ? "other"
          : undefined));
}
export function ruleIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (
    /^\s*stop[.!]?\s*$|\b(unsubscribe|opt.?out)\b|\bstop\s+(?:sending\s+)?(?:me\s+)?(?:messages?|messaging|contact(?:ing)?|reminders?|follow.?ups?|texts?|communications?)\b|\b(?:do not|don't|dont)\s+(?:message|contact|text)\b|मत भेज|message mat|^\s*band karo[.!]?\s*$|(?:message|followup|contact).{0,10}band karo/.test(
      t,
    )
  )
    return { kind: "optout" };
  const feedback = statedFeedback(text);
  if (
    feedback === "product_quality" &&
    !/missing|short|damaged|broken|delivery|shipment/.test(t)
  )
    return { kind: "feedback", category: "product_quality" };
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
  if (
    /what (?:did i|have i) order|what(?:'s| is) (?:in )?my (?:last )?order|(?:mera|mere) (?:last )?order (?:kya|mein)|order summary|मैंने क्या ऑर्डर/.test(
      t,
    )
  )
    return { kind: "order_summary" };
  if (
    !feedback &&
    /\b(price|pricing|rate|discount|cost)\b|कीमत/.test(t) &&
    !/\b(same|again|repeat|reorder)\b/.test(t)
  )
    return { kind: "price_enquiry" };
  const explicitRepeat =
    /\b(same|again|repeat|reorder)\b|pichla|वही|दोबारा/.test(t) &&
    !/\b(no|not|don't|dont|nahi|nahin|cancel)\b|नहीं|मत/.test(t);
  if (feedback && !explicitRepeat)
    return feedback === "price"
      ? { kind: "price" }
      : {
          kind: "feedback",
          category: feedback as
            "stock_remaining" | "low_demand" | "product_quality" | "other",
        };
  if (/same|reorder|order|bhej|भेज|ऑर्डर/.test(t))
    return {
      kind: "reorder",
      quantity: statedQuantity(t),
    };
  if (
    /where|status|track|delivery kab|कहाँ|कब|\b(?:shp|lr|inv)-[a-z0-9-]+\b/.test(
      t,
    )
  )
    return { kind: "status" };
  if (/later|stock|next week|baad|अगले/.test(t))
    return { kind: "defer", days: /week|अगले/.test(t) ? 7 : 14 };
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
  const recordFeedback = (category: RetentionCategory, nextAction: string) => {
    c.reason = text;
    c.retention = {
      category,
      statement: text,
      recordedAt: stamp(),
      nextAction,
    };
    audit(
      s,
      `customer:${cid}`,
      "retention.feedback_recorded",
      `Customer-reported ${category}; ${nextAction}`,
      cid,
    );
  };
  const suppressFollowups = () => {
    for (const o of s.outbox)
      if (
        o.customerId === cid &&
        o.kind === "followup" &&
        o.status === "pending"
      )
        o.status = "suppressed";
  };
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
    const reference = text
      .match(/\b(?:SHP|LR|INV)-[A-Z0-9-]+\b/i)?.[0]
      .toUpperCase();
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
    recordFeedback(
      "delivery_issue",
      `Dispatch staff to review the customer claim; ${c.owner} to keep sales follow-ups paused until resolution.`,
    );
    c.paused = true;
    c.reason = text;
    const explicit = text
      .match(/\b(?:SHP|LR|INV)-[A-Z0-9-]+\b/i)?.[0]
      .toUpperCase();
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
      // A changed claim must be reviewed against the evidence again. Preserve
      // the history in audit, but do not retain an approval or receipt quantity
      // that was established for the previous claim.
      active.reported = undefined;
      invalidateCaseDecision(active);
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
  if (intent.kind === "order_summary")
    return reply(
      orderSummary(s, cid) ??
        "I do not have a recorded purchase for you. Your salesperson can confirm the order details; I will not treat an unapproved request as an order.",
    );
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
    const explicitQuantity = statedQuantity(text);
    const qty = explicitQuantity ?? intent.quantity;
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
      /\d|\b(but|if|unless|provided|not|no|never|don't|dont|cancel|nahi|mat)\b|change|instead|discount|बदल|नहीं|मत/i.test(
        text,
      )
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
    const reference = (
      text.match(/\b(?:SHP|LR|INV)-[A-Z0-9-]+\b/i)?.[0] ?? intent.shipmentId
    )?.toUpperCase();
    const matched = reference
      ? ships.filter(
          (x) =>
            x.id.toUpperCase() === reference ||
            x.lr?.toUpperCase() === reference ||
            s.orders.some(
              (o) =>
                o.customerId === cid &&
                o.id === x.orderId &&
                o.invoice?.toUpperCase() === reference,
            ),
        )
      : ships;
    if (matched.length !== 1)
      return reply(
        reference
          ? "I could not match that reference to one authorized shipment. Please check the shipment or invoice reference."
          : "Please share the shipment reference so I can find the right authorized record.",
      );
    const sh = matched[0];
    return reply(
      `${sh.id}: ${sh.status}. Last recorded update: ${new Date(sh.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} IST. This is a recorded status, not a live vehicle location.`,
    );
  }
  if (intent.kind === "price_enquiry") {
    audit(
      s,
      "workflow",
      "sales.price_enquiry",
      "Pricing information requested; no stopped-order reason inferred",
      cid,
    );
    return reply(
      "Your salesperson can confirm the current price list and your approved commercial terms. I have not recorded this enquiry as a reason for stopped orders or promised a discount.",
    );
  }
  if (intent.kind === "feedback") {
    const category = intent.category ?? "other";
    if (category === "stock_remaining" || category === "low_demand") {
      recordFeedback(
        category,
        `${c.owner} to review the reported reason and check delivery needs after 7 days; no order created.`,
      );
      c.nextFollowupAt = new Date(Date.now() + 7 * 86400000).toISOString();
      suppressFollowups();
      return reply(
        "Thanks. I have recorded your reason in your own words and moved the next follow-up by 7 days. Your salesperson will review it; no order has been placed.",
      );
    }
    if (category === "product_quality") {
      recordFeedback(
        category,
        `${c.owner} to arrange authorized staff review of the product-quality concern; clarify product and batch before any action.`,
      );
      c.paused = true;
      suppressFollowups();
      if (active) {
        active.claim += `\nAdditional customer-reported product-quality feedback: ${text}`;
        invalidateCaseDecision(active);
        active.version++;
        active.updatedAt = stamp();
        audit(
          s,
          "workflow",
          "case.updated",
          "Customer-reported product-quality concern added for fresh staff review",
          cid,
          active.id,
        );
      }
      return reply(
        "I have recorded your product-quality concern for staff review and paused sales follow-ups. Please share the product and batch details. No shipment, credit or replacement has been assumed.",
      );
    }
    recordFeedback(
      "other",
      `${c.owner} to clarify the customer's reported reason before deciding the next action.`,
    );
    suppressFollowups();
    return reply(
      "I have saved your exact feedback for your salesperson. Please clarify the main reason for waiting and when you might need your next delivery.",
    );
  }
  if (intent.kind === "defer") {
    c.nextFollowupAt = new Date(
      Date.now() + (intent.days ?? 7) * 86400000,
    ).toISOString();
    recordFeedback(
      "other",
      `${c.owner} to review the requested deferral on ${c.nextFollowupAt}; no reason for stopped orders has been established.`,
    );
    for (const o of s.outbox)
      if (
        o.customerId === cid &&
        o.kind === "followup" &&
        o.status === "pending"
      )
        o.status = "suppressed";
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
    recordFeedback(
      "price",
      `${c.owner} to review approved commercial terms; no discount promised or authorized.`,
    );
    suppressFollowups();
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
  if (
    !active &&
    s.outbox.some((o) => o.customerId === cid && o.kind === "followup")
  ) {
    recordFeedback(
      "other",
      `${c.owner} to clarify this reply; no cause for stopped orders has been established.`,
    );
    suppressFollowups();
    return reply(
      "I have recorded your reply for your salesperson. Do you need your next delivery, or what is the main reason for waiting?",
    );
  }
  return reply(
    active
      ? "Your case is open. Please share the shipment reference, what was received, or supporting evidence. A staff member will review."
      : "I can help with a repeat-order request, the latest recorded shipment status, or a delivery complaint. What would you like help with?",
  );
}
function orderSummary(s: State, cid: string): string | undefined {
  const order = s.orders
    .filter((o) => o.customerId === cid)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!order) return undefined;
  const items = order.items
    .map((item) => {
      const product = s.products.find((p) => p.id === item.productId);
      return `${item.quantity} ${product?.unit ?? "recorded unit"}${item.quantity === 1 ? "" : "s"} of ${product?.name ?? item.productId}${product ? ` (${product.pack})` : ""}`;
    })
    .join(", ");
  const shipments = s.shipments.filter(
    (sh) => sh.customerId === cid && sh.orderId === order.id,
  );
  const delivery =
    shipments.length === 1
      ? ` Recorded shipment ${shipments[0].id}: ${shipments[0].status}. This is the last recorded status, not live vehicle tracking or confirmed receipt.`
      : shipments.length > 1
        ? " Multiple shipments are linked to this purchase; please share a shipment reference only if you need one specific shipment's status."
        : " No linked shipment status is recorded yet.";
  return `${s.business.synthetic ? "DEMO / synthetic record. " : ""}Your latest recorded purchase (${order.invoice}, ${order.date.slice(0, 10)}): ${items}.${delivery} Pending repeat-order requests are separate and are not confirmed sales.`;
}
export function queueOrderUpdate(s: State, a: Actor, cid: string) {
  permit(s, a, ["admin", "sales", "logistics"]);
  const c = customer(s, cid);
  if (!c.consent) throw new DomainError(409, "Order update blocked by consent");
  const text = orderSummary(s, cid);
  if (!text)
    throw new DomainError(
      409,
      "No recorded purchase available for an order update",
    );
  if (
    s.outbox.some(
      (o) =>
        o.customerId === cid &&
        o.kind === "service" &&
        o.text === text &&
        ["pending", "sending"].includes(o.status),
    )
  )
    throw new DomainError(409, "An order update is already queued");
  s.outbox.push({
    id: id("order-update"),
    customerId: cid,
    text,
    status: "pending",
    kind: "service",
    requiresConsent: true,
    createdAt: stamp(),
  });
  audit(
    s,
    a.id,
    "order_update.queued",
    "Factual recorded purchase summary queued; consent, template and session checks still required before delivery",
    cid,
  );
  return text;
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
  const text = `Hello ${c.name}, would you like your next delivery? If not, what is the main reason for waiting or stopping orders? Your salesperson can help with price, remaining stock, low demand, product quality or delivery concerns.`;
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
  invalidateCaseDecision(c);
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
