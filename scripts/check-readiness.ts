import { readFile, writeFile } from "node:fs/promises";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Read-only cloud check. Never resets records, sends messages or changes cases.
const access = JSON.parse(
  await readFile(".runtime/reviewer-access.json", "utf8"),
);
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
if (!token) throw new Error("Staff authentication failed");
const get = (route: string, authorization?: string) =>
  fetch(`${access.url}/api/${route}`, {
    headers: authorization ? { Authorization: `Bearer ${authorization}` } : {},
    signal: AbortSignal.timeout(25000),
  });
const outcomes: { check: string; passed: boolean }[] = [];
const record = (check: string, passed: boolean) =>
  outcomes.push({ check, passed });
const [
  configResponse,
  stateResponse,
  unauthState,
  unauthExport,
  badToken,
  unauthDocument,
] = await Promise.all([
  get("config"),
  get("state", token),
  get("state"),
  get("export"),
  get("state", "invalid-token"),
  get("evidence/not-authorized"),
]);
const config = await configResponse.json();
if (!stateResponse.ok)
  throw new Error(`Workspace access failed (${stateResponse.status})`);
const state = await stateResponse.json();
record(
  "Cognito staff sign-in and authenticated workspace read",
  state.actor?.role === "admin",
);
record(
  "DynamoDB, Bedrock and WhatsApp configured",
  config.storage === "dynamodb" &&
    config.interpreter === "bedrock" &&
    config.whatsapp === true,
);
record("Business records require authentication", unauthState.status === 401);
record("Audit export requires authentication", unauthExport.status === 401);
record("Evidence requires authentication", unauthDocument.status === 401);
record("Invalid staff tokens are rejected", badToken.status === 401);
const live = state.cases.find(
  (c: any) =>
    c.origin === "whatsapp" &&
    c.evidence.some((e: any) => e.mime === "application/pdf"),
);
record(
  "Live WhatsApp PDF evidence remains linked to its review case",
  !!live && live.evidence.some((e: any) => e.extraction === "extracted"),
);
record(
  "Complaint follow-ups remain paused",
  !!live &&
    state.customers.find((c: any) => c.id === live.customerId)?.paused === true,
);
record(
  "Document receipt has not accepted delivery",
  !!live &&
    state.shipments.find((s: any) => s.id === live.shipmentId)?.podStatus ===
      "missing",
);
const evidence = live?.evidence.find((e: any) => e.mime === "application/pdf");
if (evidence) {
  const response = await get(
    `evidence/${encodeURIComponent(evidence.id)}`,
    token,
  );
  const { url } = await response.json();
  const document = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const bytes = Buffer.from(await document.arrayBuffer());
  record(
    "Authorized private evidence opens as a valid PDF",
    document.ok && bytes.subarray(0, 5).toString() === "%PDF-",
  );
}
record(
  "No live outbound messages are awaiting processing",
  !state.outbox.some((o: any) => ["pending", "sending"].includes(o.status)),
);
record(
  "Private original review remains separate and unconfirmed",
  state.cases.some(
    (c: any) =>
      c.type === "source_document_review" &&
      c.status === "review" &&
      c.reported === undefined,
  ),
);
const report = {
  checkedAt: new Date().toISOString(),
  mode: "read-only",
  changesMade: false,
  checks: outcomes,
};
await writeFile(
  "docs/final-readiness-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (outcomes.some((o) => !o.passed)) process.exitCode = 1;
