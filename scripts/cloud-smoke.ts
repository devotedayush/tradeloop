import { readFile, writeFile } from "node:fs/promises";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

type Access = {
  region: string;
  clientId: string;
  username: string;
  password: string;
  url: string;
};
const tenant = "judgedemo";
const outcomes: { check: string; passed: boolean; detail?: string }[] = [];
const check = (name: string, passed: boolean, detail?: string) =>
  outcomes.push({ check: name, passed, ...(detail ? { detail } : {}) });
async function login(file: string) {
  const access: Access = JSON.parse(await readFile(file, "utf8"));
  const auth = await new CognitoIdentityProviderClient({
    region: access.region,
  }).send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: access.clientId,
      AuthParameters: { USERNAME: access.username, PASSWORD: access.password },
    }),
  );
  const token = auth.AuthenticationResult?.IdToken;
  if (!token) throw new Error("Authentication did not return an ID token");
  return { access, token };
}
let failed = false;
try {
  // A supplied credential file still has to pass the same immutable tenant guard.
  const judge = await login(process.argv[2] ?? ".runtime/judge-access.json");
  async function request(
    route: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(judge.access.url + "/api/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        Authorization: `Bearer ${judge.token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  async function api(route: string, body?: unknown) {
    const result = await request(route, body);
    if (result.status < 200 || result.status >= 300)
      throw new Error(
        `Cloud request ${route} failed with HTTP ${result.status}`,
      );
    return result.data;
  }
  const initial = await api("state");
  const safe =
    initial.actor?.tenantId === tenant &&
    initial.tenantId === tenant &&
    initial.business?.synthetic === true &&
    initial.shipments.every((s: any) => s.source === "synthetic") &&
    initial.messages.every((m: any) => m.channel === "simulator") &&
    initial.cases.every((c: any) => c.origin === "simulator") &&
    initial.outbox.length === 0 &&
    !initial.audit.some((a: any) =>
      /whatsapp|transporter|import/i.test(`${a.actor} ${a.action}`),
    );
  check(
    "Reset preflight restricts writes to isolated synthetic judgedemo with no imported or WhatsApp records",
    safe,
  );
  if (!safe) throw new Error("Unsafe workspace: refused all cloud writes");
  const config = await api("config");
  check(
    "Cloud uses DynamoDB and Bedrock",
    config.storage === "dynamodb" && config.interpreter === "bedrock",
  );
  check(
    "Unauthenticated business data access denied",
    (await fetch(judge.access.url + "/api/state")).status === 401,
  );
  const headerProbe = await request("state", undefined, {
    "X-Tenant-ID": "demofoods",
  });
  check(
    "X-Tenant-ID cannot select another tenant",
    headerProbe.status === 200 &&
      headerProbe.data.tenantId === tenant &&
      headerProbe.data.actor.tenantId === tenant &&
      headerProbe.data.revision === initial.revision,
  );

  // Owner access is strictly read-only, solely to obtain an opaque evidence ID.
  const owner = await login(".runtime/reviewer-access.json");
  const ownerResponse = await fetch(owner.access.url + "/api/state", {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  if (!ownerResponse.ok)
    throw new Error("Read-only owner evidence lookup failed");
  const ownerState = await ownerResponse.json();
  if (ownerState.actor?.tenantId === tenant)
    throw new Error("Owner evidence lookup resolved to judge workspace");
  const originalEvidence = ownerState.cases
    .filter((c: any) => c.type === "source_document_review")
    .flatMap((c: any) => c.evidence)
    .find((e: any) => e.id);
  if (!originalEvidence)
    throw new Error("No original evidence available for isolation check");
  const evidenceProbe = await request(
    `evidence/${encodeURIComponent(originalEvidence.id)}`,
    undefined,
    { "X-Tenant-ID": ownerState.actor.tenantId },
  );
  check(
    "Judge cannot fetch original workspace evidence even with a tenant header",
    evidenceProbe.status === 404,
  );

  await api("reset", {});
  const seededOrderCount = (await api("state")).orders.length;
  await api("messages", {
    customerId: "C001",
    text: "Same order again, 0 cartons",
    messageId: "cloud-smoke-zero",
  });
  let state = await api("state");
  check("Zero-quantity reorder creates no draft", state.requests.length === 0);
  if (state.requests.length)
    throw new Error("Invalid zero quantity created a draft; stopping workflow");
  const complaint = {
    customerId: "C001",
    text: "Last delivery mein 2 cartons missing the",
    messageId: "cloud-smoke-shortage",
  };
  await api("messages", complaint);
  state = await api("state");
  let c = state.cases[0];
  check(
    "Bedrock complaint links to authorized synthetic shipment",
    c?.shipmentId === "SHP-101" &&
      c.reported === 18 &&
      state.customers[0].paused &&
      state.messages.some((m: any) => m.engine === "bedrock"),
  );
  await api("messages", complaint);
  state = await api("state");
  check(
    "Replayed inbound message is idempotent",
    state.cases.length === 1 &&
      state.messages.filter((m: any) => m.id === complaint.messageId).length ===
        1,
  );
  const image = await readFile("demo-data/synthetic-pod-shortage.png");
  await api("evidence", {
    caseId: c.id,
    version: c.version,
    name: "synthetic-pod-shortage.png",
    mime: "image/png",
    base64: image.toString("base64"),
  });
  state = await api("state");
  c = state.cases[0];
  check(
    "Private S3 evidence stored with real Textract reading",
    c.evidence.length === 1 && c.evidence[0].extraction === "extracted",
    c.evidence[0].extraction,
  );
  const evidenceRead = await api(
    `evidence/${encodeURIComponent(c.evidence[0].id)}`,
  );
  const privateRead = await fetch(evidenceRead.url);
  check(
    "Authorized private S3 evidence can be retrieved",
    privateRead.ok &&
      (await privateRead.arrayBuffer()).byteLength === image.byteLength,
  );
  await api("cases/action", {
    caseId: c.id,
    version: c.version,
    action: "propose",
    note: "DEMO: dispatch to verify shortage and arrange an approved correction",
  });
  state = await api("state");
  c = state.cases[0];
  await api("cases/action", {
    caseId: c.id,
    version: c.version,
    action: "approve",
    note: "DEMO: next action approved by reviewer",
  });
  state = await api("state");
  c = state.cases[0];
  check(
    "Approval keeps case action pending",
    c.status === "action_pending" && state.customers[0].paused,
  );
  await api("cases/action", {
    caseId: c.id,
    version: c.version,
    action: "resolve",
    note: "DEMO: staff recorded correction and customer acceptance; no real goods moved",
  });
  await api("messages", {
    customerId: "C001",
    text: "Same order again, 5 cartons",
    messageId: "cloud-smoke-reorder",
  });
  state = await api("state");
  const draft = state.requests[0];
  for (const [id, text] of [
    ["conditional", "Confirm if the price is discounted"],
    ["negated", "Do not confirm this order"],
  ]) {
    await api("messages", {
      customerId: "C001",
      text,
      messageId: `cloud-smoke-${id}`,
    });
    state = await api("state");
    check(
      `${id === "conditional" ? "Conditional" : "Negated"} confirmation does not confirm a draft`,
      state.requests[0]?.status === "draft" &&
        state.requests[0]?.version === draft.version &&
        state.customers.find((customer: any) => customer.id === "C001")
          ?.consent === true,
    );
    if (state.requests[0]?.status !== "draft")
      throw new Error(
        "Unsafe confirmation changed request state; stopping workflow",
      );
  }
  await api("messages", {
    customerId: "C001",
    text: "Confirm",
    messageId: "cloud-smoke-confirm",
  });
  state = await api("state");
  const req = state.requests[0];
  check(
    "Reorder becomes a customer-confirmed request",
    req.status === "customer_confirmed" && req.items[0].quantity === 5,
  );
  await api("requests/approve", { requestId: req.id, version: req.version });
  state = await api("state");
  check(
    "Staff approval does not create a fictional sale",
    state.requests[0].status === "approved" &&
      state.orders.length === seededOrderCount,
  );
  check(
    "Cloud smoke queued no WhatsApp messages",
    state.outbox.length === 0 &&
      state.messages.every((m: any) => m.channel === "simulator"),
  );
} catch (error) {
  failed = true;
  // Keep reports free of customer data, access URLs, identifiers and credentials.
  const message =
    error instanceof Error ? error.message : "Unknown smoke failure";
  const safeMessage =
    /^(Unsafe workspace:|Cloud request |Invalid zero quantity|Unsafe confirmation|Authentication did not|Read-only owner|Owner evidence|No original evidence)/.test(
      message,
    )
      ? message
      : "Cloud smoke could not complete; inspect the local failure without publishing credentials";
  check("Cloud smoke completed without execution errors", false, safeMessage);
}
const report = {
  at: new Date().toISOString(),
  tenant,
  synthetic: true,
  ownerAccess: "read-only evidence isolation probe",
  whatsappSends: 0,
  checks: outcomes,
  passed: !failed && outcomes.every((o) => o.passed),
};
await writeFile(
  "docs/cloud-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
