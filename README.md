# TradeLoop

**Customer follow-ups and delivery issues, connected through one accountable workflow.**

TradeLoop is an AWS-hosted prototype for distributors. It captures repeat-order requests, records why a customer stopped ordering, connects delivery complaints to shipment evidence, and routes the next action to authorized staff.

**Operational demo records are synthetic.** A separate private source-review case contains an owner-authorized original invoice, excluded from repository fixtures. The deployed dashboard uses real Cognito, DynamoDB, Bedrock, S3 and Textract. **Live WhatsApp text replies and PDF evidence processing were verified on 28 October 2026.** The active AWS End User Messaging Social account is in Mumbai; the application runs in Virginia. Three real inbound texts (two status enquiries and a shortage complaint) traversed SNS, cross-region ingestion, SQS FIFO, the worker, Bedrock and DynamoDB, and three text replies were visually confirmed in desktop WhatsApp. One incoming forwarded synthetic PDF was retrieved, stored privately and extracted by Textract; the linked case moved to staff review with 20 expected and 18 reported cartons. POD remains missing and follow-ups remain paused. The document acknowledgement was also visually confirmed in WhatsApp at 22:45 IST. See the sanitized [WhatsApp verification record](docs/whatsapp-verification.json). Approved-template delivery remains unverified, and SES is disabled. This verifies actual CDS runtime use; it does not establish hackathon eligibility or completed submission.

## Working application

Dashboard: https://lhswn6utwl.execute-api.us-east-1.amazonaws.com

Staff data requires authentication. A dedicated `judgedemo` workspace has been provisioned with freshly seeded synthetic data only. It contains no original invoice or live WhatsApp contact binding. Its credentials are stored privately in the gitignored `.runtime/judge-access.json`; supply them through private judge testing instructions, never this README. Judge sign-in and the separate workspace were verified in the live browser; cloud tests also verified isolation from the owner workspace. The public URL alone does not expose customer records or credentials.

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

The current suite has **66 passing tests**, covering workflow permissions, opt-outs, duplicate events, stale approvals, quantity ambiguity, persistence concurrency, business isolation, reset protection and WhatsApp handling. [Final readiness verification](docs/final-readiness-verification.json) records 12 passing read-only cloud checks. The isolated judge workspace also passed the live browser sign-in check. These are functional checks, not customer-impact or scale benchmarks.

[Cloud verification](docs/cloud-verification.json) records the live isolated judge workflow rehearsal. [WhatsApp verification](docs/whatsapp-verification.json) preserves the live text/PDF checks and the 33-test regression snapshot recorded at that time. [CI run 40733361890](https://github.com/devotedayush/tradeloop/actions/runs/40733361890) succeeded at historical commit `7d62e4c`; that run does not attest to every subsequent change.

For current deployed checks, run `npx tsx scripts/check-readiness.ts`. It reads the authenticated cloud state without resetting records, sending messages or changing cases.

`npx tsx scripts/cloud-smoke.ts` is a mutating synthetic-workflow test that starts with a reset. The reset is now blocked when the workspace contains live or imported evidence. Use it only in a disposable synthetic workspace; use the read-only readiness script for the connected workspace.

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

Follow [docs/messaging-setup.md](docs/messaging-setup.md). The current authorized test connection has completed live text round-trips and incoming synthetic PDF processing through AWS End User Messaging Social. For a new deployment, configure a dedicated number, the regional AWS SNS event destination, authorized test-contact bindings and approved templates, then verify receipt in WhatsApp and document processing in the linked case. Approved-template delivery still needs verification. Do not label the simulator as WhatsApp.

## Product boundaries

- Repeat-order requests copy the latest recorded purchase and require a fresh customer confirmation plus staff approval for processing. New combinations go to staff clarification.
- No actual invoice, credit, replacement shipment, stock reservation, or live GPS update is created.
- Evidence upload does not accept a POD or release freight payment.
- The Kaysons connector is an unconfigured integration contract, not a live connection.
- Whole-business reads and revision locking are bounded prototype decisions, not evidence of enterprise load capacity.
- Only printed supported documents are evaluated automatically; uncertain/unsupported extraction stays for staff review.
- Original source documents can be reviewed privately with the owner's authorization, separately from the synthetic demonstration case. They are not included in this repository or its public evidence.

See [architecture notes](docs/architecture.md), the upload-ready [architecture PNG](docs/architecture.png) or [SVG](docs/architecture.svg), [demo walkthrough](docs/demo-walkthrough.md), and [existing-work disclosure](docs/existing-work.md).

## Submission preparation

Include the repository, deployed app and private judge access, architecture diagram, approximately three-minute public working-demo video, and ACE opportunity ID. Confirm APN eligibility and the required campaign tag. These are account/submission requirements, not features this code can fabricate.

The GitHub repository is private; organizer access is required. The [submission-readiness checklist and paste-ready project text](docs/submission-readiness.md) track the remaining external gates. A dedicated judge workspace is provisioned, but the ACE opportunity, organizer repository access, video publication and final submission remain outstanding.

The demo script must distinguish implemented-and-verified behaviour from configured-but-untested integrations. No business adoption, recovered revenue or production impact is claimed.
