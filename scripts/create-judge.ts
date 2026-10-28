import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateGroupCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { seed } from "../src/core/seed";

// Provision a separate fictional tenant. Never copy the owner's workspace.
const path = ".runtime/judge-access.json";
try {
  await readFile(path);
  console.log("Existing judge credentials retained; no workspace reset.");
  process.exit(0);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const outputs = JSON.parse(
  await readFile(".runtime/outputs.json", "utf8"),
).TradeLoopDemo;
process.env.AWS_REGION = "us-east-1";
process.env.TABLE_NAME = outputs.TableName;
const { Store } = await import("../src/adapters/store");
const store = new Store(outputs.TableName);
const tenantId = "judgedemo";
const current = await store.load(tenantId);
if (current.revision !== 0 || current.messages.length || current.cases.length)
  throw new Error(
    "Judge workspace already has activity. Refusing to replace it without saved credentials.",
  );
await store.change(tenantId, (state) => {
  const clean = seed("demofoods");
  clean.tenantId = tenantId;
  clean.business.name = "Judge Demo Distribution";
  Object.assign(state, clean, { revision: state.revision });
});
const client = new CognitoIdentityProviderClient({ region: "us-east-1" });
const username = "hackathon-judge";
try {
  await client.send(
    new AdminGetUserCommand({
      UserPoolId: outputs.UserPoolId,
      Username: username,
    }),
  );
  throw new Error(
    "Judge user already exists; refusing to rotate its credentials.",
  );
} catch (error) {
  if ((error as Error).name !== "UserNotFoundException") throw error;
}
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
const group = `tl:${tenantId}:admin`;
try {
  await client.send(
    new CreateGroupCommand({
      UserPoolId: outputs.UserPoolId,
      GroupName: group,
      Description:
        "Isolated fictional judge workspace, no original documents or WhatsApp contacts",
    }),
  );
} catch (error) {
  if ((error as Error).name !== "GroupExistsException") throw error;
}
await client.send(
  new AdminAddUserToGroupCommand({
    UserPoolId: outputs.UserPoolId,
    Username: username,
    GroupName: group,
  }),
);
await mkdir(".runtime", { recursive: true });
await writeFile(
  path,
  JSON.stringify(
    {
      url: outputs.DashboardUrl,
      username,
      password,
      clientId: outputs.ClientId,
      region: "us-east-1",
      tenantId,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
await chmod(path, 0o600);
console.log(
  "Separate fictional judge workspace ready. Credentials saved privately in .runtime/judge-access.json; no email sent.",
);
