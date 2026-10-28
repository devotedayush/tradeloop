import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateGroupCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
await mkdir(".runtime", { recursive: true });
const outputs = JSON.parse(
  await readFile(".runtime/outputs.json", "utf8"),
).TradeLoopDemo;
try {
  await readFile(".runtime/reviewer-access.json");
  console.log("Existing private reviewer access file retained.");
  process.exit(0);
} catch {}
const client = new CognitoIdentityProviderClient({ region: "us-east-1" });
const username = "reviewer";
const password = "Tl!" + randomBytes(24).toString("base64url") + "9aZ";
await client.send(
  new AdminCreateUserCommand({
    UserPoolId: outputs.UserPoolId,
    Username: username,
    MessageAction: "SUPPRESS",
  }),
);
await client.send(
  new AdminSetUserPasswordCommand({
    UserPoolId: outputs.UserPoolId,
    Username: username,
    Password: password,
    Permanent: true,
  }),
);
try {
  await client.send(
    new CreateGroupCommand({
      UserPoolId: outputs.UserPoolId,
      GroupName: "tl:demofoods:admin",
      Description: "Synthetic TradeLoop workspace reviewer",
    }),
  );
} catch (e) {
  if ((e as Error).name !== "GroupExistsException") throw e;
}
await client.send(
  new AdminAddUserToGroupCommand({
    UserPoolId: outputs.UserPoolId,
    Username: username,
    GroupName: "tl:demofoods:admin",
  }),
);
await writeFile(
  ".runtime/reviewer-access.json",
  JSON.stringify(
    {
      url: outputs.DashboardUrl,
      username,
      password,
      clientId: outputs.ClientId,
      region: "us-east-1",
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
await chmod(".runtime/reviewer-access.json", 0o600);
console.log(
  "Reviewer created without sending email. Access is stored in gitignored .runtime/reviewer-access.json (mode 0600).",
);
