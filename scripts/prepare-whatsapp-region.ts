/** Prepare the dedicated Mumbai WhatsApp event topic and private media quarantine.
 * Run: npx tsx scripts/prepare-whatsapp-region.ts
 * Uses the caller's AWS CLI credentials; never stores credentials or contacts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const region = "ap-south-1";
const topicName = "TradeLoopWhatsAppMumbai";

function aws(args: string[]): any {
  const output = execFileSync(
    "aws",
    [...args, "--region", region, "--output", "json", "--no-cli-pager"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  return output ? JSON.parse(output) : undefined;
}

const { Account: account } = aws(["sts", "get-caller-identity"]);
if (!/^\d{12}$/.test(account))
  throw new Error("STS returned an invalid account.");
const mediaBucket = `tradeloop-whatsapp-media-${account}-${region}`;
const ownerArgs = ["--expected-bucket-owner", account];

// A failed ownership/access check is never interpreted as permission to mutate.
try {
  aws(["s3api", "head-bucket", "--bucket", mediaBucket, ...ownerArgs]);
} catch (error) {
  const stderr = String((error as { stderr?: unknown }).stderr ?? "");
  if (!/\(404\)|\(NoSuchBucket\)|\(NotFound\)/.test(stderr)) {
    throw new Error(
      `Cannot verify ownership of ${mediaBucket}: ${stderr.trim()}`,
    );
  }
  aws([
    "s3api",
    "create-bucket",
    "--bucket",
    mediaBucket,
    "--create-bucket-configuration",
    JSON.stringify({ LocationConstraint: region }),
    "--object-ownership",
    "BucketOwnerEnforced",
  ]);
  aws(["s3api", "head-bucket", "--bucket", mediaBucket, ...ownerArgs]);
}
const location = aws([
  "s3api",
  "get-bucket-location",
  "--bucket",
  mediaBucket,
  ...ownerArgs,
]).LocationConstraint;
if (location !== region)
  throw new Error(`Bucket is in unexpected region: ${location}`);

const publicAccess = {
  BlockPublicAcls: true,
  IgnorePublicAcls: true,
  BlockPublicPolicy: true,
  RestrictPublicBuckets: true,
};
const encryption = {
  Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
};
const bucketPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "DenyInsecureTransport",
      Effect: "Deny",
      Principal: "*",
      Action: "s3:*",
      Resource: [
        `arn:aws:s3:::${mediaBucket}`,
        `arn:aws:s3:::${mediaBucket}/*`,
      ],
      Condition: { Bool: { "aws:SecureTransport": "false" } },
    },
  ],
};
const lifecycle = {
  Rules: [
    {
      ID: "ExpireDemoFoodsIncomingAfterOneDay",
      Status: "Enabled",
      Filter: { Prefix: "demofoods/incoming/" },
      Expiration: { Days: 1 },
    },
  ],
};
for (const [operation, argument, value] of [
  [
    "put-public-access-block",
    "--public-access-block-configuration",
    publicAccess,
  ],
  [
    "put-bucket-encryption",
    "--server-side-encryption-configuration",
    encryption,
  ],
  ["put-bucket-policy", "--policy", bucketPolicy],
  [
    "put-bucket-lifecycle-configuration",
    "--lifecycle-configuration",
    lifecycle,
  ],
] as const) {
  aws([
    "s3api",
    operation,
    "--bucket",
    mediaBucket,
    ...ownerArgs,
    argument,
    JSON.stringify(value),
  ]);
}
const { TopicArn: topicArn } = aws([
  "sns",
  "create-topic",
  "--name",
  topicName,
]);
if (topicArn !== `arn:aws:sns:${region}:${account}:${topicName}`)
  throw new Error("Unexpected SNS topic owner or region.");
const topicPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "AllowAccountSocialMessagingPublish",
      Effect: "Allow",
      Principal: { Service: "social-messaging.amazonaws.com" },
      Action: "sns:Publish",
      Resource: topicArn,
      Condition: { StringEquals: { "aws:SourceAccount": account } },
    },
  ],
};
aws([
  "sns",
  "set-topic-attributes",
  "--topic-arn",
  topicArn,
  "--attribute-name",
  "Policy",
  "--attribute-value",
  JSON.stringify(topicPolicy),
]);

const actualPublicAccess = aws([
  "s3api",
  "get-public-access-block",
  "--bucket",
  mediaBucket,
  ...ownerArgs,
]).PublicAccessBlockConfiguration;
const actualEncryption = aws([
  "s3api",
  "get-bucket-encryption",
  "--bucket",
  mediaBucket,
  ...ownerArgs,
]).ServerSideEncryptionConfiguration;
const actualBucketPolicy = JSON.parse(
  aws(["s3api", "get-bucket-policy", "--bucket", mediaBucket, ...ownerArgs])
    .Policy,
);
const actualLifecycle = aws([
  "s3api",
  "get-bucket-lifecycle-configuration",
  "--bucket",
  mediaBucket,
  ...ownerArgs,
]);
const actualTopicPolicy = JSON.parse(
  aws(["sns", "get-topic-attributes", "--topic-arn", topicArn]).Attributes
    .Policy,
);
if (
  !Object.keys(publicAccess).every((key) => actualPublicAccess[key] === true) ||
  actualEncryption.Rules[0]?.ApplyServerSideEncryptionByDefault
    ?.SSEAlgorithm !== "AES256" ||
  JSON.stringify(actualBucketPolicy) !== JSON.stringify(bucketPolicy) ||
  !actualLifecycle.Rules?.some(
    (rule: any) =>
      rule.Status === "Enabled" &&
      rule.Filter?.Prefix === "demofoods/incoming/" &&
      rule.Expiration?.Days === 1,
  ) ||
  JSON.stringify(actualTopicPolicy) !== JSON.stringify(topicPolicy)
) {
  throw new Error(
    "Regional resource readback did not match the requested controls.",
  );
}
const runtimeDir = fileURLToPath(new URL("../.runtime/", import.meta.url));
mkdirSync(runtimeDir, { recursive: true });
const config = { region, topicArn, mediaBucket };
writeFileSync(
  `${runtimeDir}/whatsapp-region.json`,
  `${JSON.stringify(config, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      ...config,
      account,
      verified: {
        bucketOwner: true,
        bucketRegion: true,
        publicAccessBlocked: true,
        encryption: "AES256",
        denyInsecureTransport: true,
        incomingExpirationDays: 1,
        topicPublishService: "social-messaging.amazonaws.com",
        topicSourceAccount: account,
      },
    },
    null,
    2,
  ),
);
