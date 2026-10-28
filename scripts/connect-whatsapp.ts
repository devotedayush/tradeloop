/** Complete the AWS application wiring AFTER embedded signup has saved a linked WABA.
 * Contact numbers are read from an owner-only, gitignored file and never printed.
 */
import { readFile, writeFile, chmod } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  SocialMessagingClient,
  ListLinkedWhatsAppBusinessAccountsCommand,
  GetLinkedWhatsAppBusinessAccountCommand,
  PutWhatsAppBusinessAccountEventDestinationsCommand,
} from "@aws-sdk/client-socialmessaging";
import { z } from "zod";

const settings = z
  .object({
    senderNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    testCustomerNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    metaApiVersion: z.string().regex(/^v\d+\.\d+$/),
  })
  .parse(JSON.parse(await readFile(".runtime/whatsapp-setup.json", "utf8")));
const outputs = JSON.parse(
  await readFile(".runtime/outputs.json", "utf8"),
).TradeLoopDemo;
const region = process.env.DEPLOY_REGION ?? "us-east-1";
const client = new SocialMessagingClient({ region });
const matches = [];
let nextToken: string | undefined;
do {
  const page = await client.send(
    new ListLinkedWhatsAppBusinessAccountsCommand({ nextToken }),
  );
  for (const summary of page.linkedAccounts ?? []) {
    const { account } = await client.send(
      new GetLinkedWhatsAppBusinessAccountCommand({ id: summary.id }),
    );
    if (!account) continue;
    for (const phone of account.phoneNumbers ?? []) {
      if (
        phone.phoneNumber?.replace(/\D/g, "") ===
        settings.senderNumber.replace(/\D/g, "")
      )
        matches.push({ account, phone });
    }
  }
  nextToken = page.nextToken;
} while (nextToken);
if (matches.length !== 1)
  throw new Error(
    `Expected one matching linked number in ${region}; found ${matches.length}. Finish the AWS embedded-signup save first. No account was created or altered.`,
  );
const { account, phone } = matches[0];
if (!phone.phoneNumberId || !phone.metaPhoneNumberId)
  throw new Error("The linked number is missing its AWS or Meta identity.");
if (account.registrationStatus !== "COMPLETE")
  throw new Error(
    "The existing AWS account registration is incomplete. Finish the console setup first.",
  );
const unrelated = (account.eventDestinations ?? []).filter(
  (d) => d.eventDestinationArn !== outputs.WhatsAppTopicArn,
);
if (unrelated.length)
  throw new Error(
    "An existing event destination points elsewhere. Inspect it before replacing another integration; this script will not overwrite it.",
  );
const environment: Record<string, string> = {
  BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0",
  DEPLOY_REGION: region,
  WHATSAPP_PHONE_ID: phone.phoneNumberId,
  WHATSAPP_META_PHONE_ID: phone.metaPhoneNumberId,
  CONTACT_BINDINGS_JSON: JSON.stringify({
    [settings.testCustomerNumber.replace(/\D/g, "")]: {
      tenantId: "demofoods",
      customerId: "C001",
      kind: "customer",
    },
  }),
  META_API_VERSION: settings.metaApiVersion,
};
console.log(
  JSON.stringify({
    region,
    registration: account.registrationStatus,
    senderLast4: settings.senderNumber.slice(-4),
    testCustomerLast4: settings.testCustomerNumber.slice(-4),
    eventDestinationMatches: (account.eventDestinations ?? []).some(
      (d) => d.eventDestinationArn === outputs.WhatsAppTopicArn,
    ),
    apply: process.argv.includes("--apply"),
  }),
);
if (process.argv.includes("--apply")) {
  await client.send(
    new PutWhatsAppBusinessAccountEventDestinationsCommand({
      id: account.id,
      eventDestinations: [{ eventDestinationArn: outputs.WhatsAppTopicArn }],
    }),
  );
  await writeFile(
    ".runtime/messaging-environment.json",
    JSON.stringify(environment, null, 2),
    { mode: 0o600 },
  );
  await chmod(".runtime/messaging-environment.json", 0o600);
  const child = spawn("npm", ["run", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, ...environment },
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Deployment exited ${code}`)),
    );
  });
  console.log(
    "Existing WhatsApp account wired to TradeLoop. A real inbound message and reply must still be verified.",
  );
}
