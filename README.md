# TradeLoop

**Customer follow-ups and delivery issues, connected through one accountable workflow.**

TradeLoop is an AWS-hosted prototype for distributors. It captures repeat-order requests, records why a customer stopped ordering, connects delivery complaints to shipment evidence, and routes the next action to authorized staff.

**Current business data is synthetic.** The deployed dashboard uses real Cognito, DynamoDB, Bedrock, S3 and Textract. WhatsApp integration code is implemented, but the business account/number has not yet been linked and no real WhatsApp send-and-receive test has passed. SES has no verified sender configured. **The entry still needs actual qualifying CDS runtime usage before it can be presented as a completed CDS submission.**

## Working application

Dashboard: https://lhswn6utwl.execute-api.us-east-1.amazonaws.com

Staff data requires authentication. The repository owner has a private, gitignored `.runtime/reviewer-access.json` file with the synthetic workspace login. Judge access should be supplied privately after the user chooses whom to authorize. The public URL alone does not expose customer records or credentials.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4310. Local mode binds to loopback, stores data in `.runtime/`, and uses a visibly labelled deterministic rules interpreter unless a Bedrock model is configured. Local mode has no staff login; never expose it as a production server.

Optional frontend hot reload: run `npm run web` in another terminal; Vite proxies `/api` to the local backend.

To test Bedrock locally with your configured AWS credentials, set `BEDROCK_REGION` and `BEDROCK_MODEL_ID` to an enabled, tool-capable model or inference profile before launching the backend. The deployed prototype was verified with `us.amazon.nova-pro-v1:0` in `us-east-1` on 28 October 2026. Confirm current availability in your own account.

## Validate

```sh
npm run typecheck
npm test
npm run build
npm run bundle
npm run synth
```

`tests/workflow.test.ts` covers workflow permissions, opt-outs, duplicate events, stale approvals, quantity ambiguity, persistence concurrency, business isolation, and the documented AWS event envelope. `docs/cloud-verification.json` records real cloud integration checks; it is not a customer-impact or scale benchmark.

After deploying and creating a private reviewer, `npx tsx scripts/cloud-smoke.ts` resets **only the synthetic workspace**, runs the connected workflow against AWS, uploads labelled synthetic evidence, and records results. Do not run it against real business data.

## Deploy to your AWS account

```sh
npm run build
npm run bundle
npx cdk bootstrap --app 'npx tsx infra/app.ts' --region us-east-1
BEDROCK_MODEL_ID='<enabled-model-id>' npm run deploy
npx tsx scripts/create-reviewer.ts
```

The stack uses region `us-east-1` by default. Change `DEPLOY_REGION` deliberately and ensure the model and messaging services are available there. For another account/region, update the reviewer script's region as well. CDK outputs go to the ignored `.runtime/outputs.json`. Deployment creates IAM roles and AWS resources in the configured account and can incur charges. Database, documents and Cognito are retained on stack deletion; see the architecture notes before eventual teardown.

## Complete WhatsApp setup

Follow [docs/messaging-setup.md](docs/messaging-setup.md). Configure a dedicated number, the AWS SNS event destination, authorized test-contact bindings and approved templates. Redeploy with the configuration, then prove an actual handset round-trip and media retrieval. Do not label the simulator as WhatsApp.

## Product boundaries

- Repeat-order requests copy the latest recorded purchase and require a fresh customer confirmation plus staff approval for processing. New combinations go to staff clarification.
- No actual invoice, credit, replacement shipment, stock reservation, or live GPS update is created.
- Evidence upload does not accept a POD or release freight payment.
- The Kaysons connector is an unconfigured integration contract, not a live connection.
- Whole-business reads and revision locking are bounded prototype decisions, not evidence of enterprise load capacity.
- Only printed supported documents are evaluated automatically; uncertain/unsupported extraction stays for staff review.

See [architecture](docs/architecture.md), [demo walkthrough](docs/demo-walkthrough.md), and [existing-work disclosure](docs/existing-work.md).

## Submission preparation

Include the repository, deployed app and private judge access, architecture diagram, approximately three-minute public working-demo video, and ACE opportunity ID. Confirm APN eligibility and the required campaign tag. These are account/submission requirements, not features this code can fabricate.

The demo script must distinguish implemented-and-verified behaviour from configured-but-untested integrations. No business adoption, recovered revenue or production impact is claimed.
