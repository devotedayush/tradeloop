# Finish the AWS CDS connection

## Verified live text connection, 28 October 2026

The WhatsApp business account is active with AWS registration `COMPLETE` in Mumbai (`ap-south-1`). Two real text messages from the authorized user's personal WhatsApp reached the Mumbai SNS topic, crossed into the Virginia ingestion Lambda, and passed through SQS FIFO, the worker, Bedrock and DynamoDB. The application remains in `us-east-1`.

The first outbound attempt received HTTP 400, `Invalid destination phone number or message Id.`, because its destination omitted the leading `+`. The sender now supplies a plus-prefixed E.164 destination. A controlled local invocation of the actual sender succeeded through the provider, and its reply was visually confirmed in desktop WhatsApp. The fix was then deployed with CloudFormation `UPDATE_COMPLETE`.

A second real enquiry, `Please show latest recorded status of shipment SHP-101.`, verified the deployed path without a local sender invocation. DynamoDB persisted the inbound message at `16:49:04.464Z` and Bedrock-backed reply at `16:49:04.522Z`, and the scheduled cloud sender recorded `sent` with a provider message ID. The reply was also visually confirmed in desktop WhatsApp at 22:19 IST (the UI displayed 10:19 PM). This receipt check establishes the text round-trip beyond provider acceptance. See [whatsapp-verification.json](whatsapp-verification.json) for sanitized evidence, regions and checks.

Live attachment retrieval and approved-template delivery have not yet been tested. The 33 passing tests include three mocked WhatsApp regression tests; those checks do not establish live media success. All business records remain synthetic, Kaysons is not connected, and this verification does not establish completed hackathon submission.

## WhatsApp, required for the intended demonstration

1. Sign in to the AWS End User Messaging Social console in the intended WhatsApp region (Mumbai, `ap-south-1`, for the current deployment). Choose **Business accounts**, then launch Meta's embedded signup.
2. Use the correct business portfolio and a dedicated number able to receive a verification code. Preserve the business's operational WhatsApp number; do not migrate or delete it just for this demo.
3. Link the WABA and complete the required Meta/account checks.
4. Configure the WhatsApp region's **standard SNS topic** as the account's message/event destination. For the current cross-region deployment, use `topicArn` from `.runtime/whatsapp-region.json` as `WHATSAPP_EVENT_TOPIC_ARN`. For a single-region deployment, get `WhatsAppTopicArn` from `.runtime/outputs.json` or CloudFormation outputs. SNS FIFO is not supported as the direct event destination; our downstream queue is FIFO.
5. Record the AWS origination phone ID and Meta phone ID. Configure only explicitly authorized, opted-in test contacts. The app will not disclose records to unmapped senders.
6. Request a correctly categorized reorder-follow-up template and, if needed, a service template. The current sender expects one body text parameter and a configured language code. Reorder marketing is subject to destination restrictions; do not disguise it as a utility message.
7. Configure a currently supported `META_API_VERSION`. No API version is silently assumed by the sender.
8. Set the environment values listed in `.env.example` in your shell or private deployment configuration and rerun deployment. Never commit phone mappings or access tokens.
9. From the mapped test handset, send an enquiry. Confirm the event, persisted message, reply, and actual handset receipt. Then test an attachment on a uniquely matched open case.

### Finish wiring an existing linked account

After AWS has saved the account, create an owner-only, ignored `.runtime/whatsapp-setup.json` with `senderNumber`, `testCustomerNumber` (both E.164), and `metaApiVersion`. Only include a test customer who explicitly opted in. Do not commit this file.

Run `npx tsx scripts/connect-whatsapp.ts` to inspect the matching account. Then build and bundle, and run `npx tsx scripts/connect-whatsapp.ts --apply` to set the SNS destination and deploy the contact binding. The script requires complete AWS registration and refuses to overwrite a different event destination. It does not create an account, request an OTP, or complete embedded signup. A handset round-trip remains required afterward.

### Regional recovery, 28 October 2026

The Virginia callback displayed `An internal failure has occurred`, HTTP 500, request ID `23b600f0-c7c5-4e97-b490-9bfd0d3067d7`. Reusing the same verified number through Mumbai succeeded: AWS showed the account Active and the API returned registration `COMPLETE`. No new number, OTP or billing change was required. The exact Virginia failure cause is not established. Screenshots and diagnostics are saved privately under `.runtime/`.

The application remains in Virginia. `scripts/prepare-whatsapp-region.ts` prepares the dedicated Mumbai SNS topic and private media quarantine bucket. CDK subscribes the existing Virginia ingestion Lambda to the Mumbai topic. `WHATSAPP_REGION` directs Social Messaging and temporary media retrieval to Mumbai; validated evidence then enters the existing application evidence store and Textract workflow. A 300-second signed PUT pins the exact temporary S3 key. The worker reads and removes that same key, avoiding assumptions about the extension AWS adds when using a prefix destination. No signed URL is logged or committed.

Set `DEPLOY_REGION=us-east-1`, `WHATSAPP_REGION=ap-south-1`, `WHATSAPP_EVENT_TOPIC_ARN` and `WHATSAPP_MEDIA_BUCKET` to the regional script's outputs when running the connection script. Preserve all values from the private `.runtime/messaging-environment.json` on subsequent deployments. Do not redeploy with an empty messaging environment or reset the synthetic workspace after collecting live test evidence.

Contact binding shape (fictional placeholders, not real destinations):

```json
{
  "OPTED_IN_CUSTOMER_NUMBER_DIGITS": {
    "tenantId": "demofoods",
    "customerId": "C001",
    "kind": "customer"
  },
  "OPTED_IN_TRANSPORTER_NUMBER_DIGITS": {
    "tenantId": "demofoods",
    "customerId": "C001",
    "kind": "transporter",
    "shipmentIds": ["SHP-101"]
  }
}
```

Transporter bindings are limited to their assigned shipment evidence. They cannot place orders or speak as the receiving customer. Unmatched media needs staff clarification. The current worker records ambiguity but does not retain that attachment in the review queue; ask for resubmission after a unique case is established.

## What is already coded

- AWS envelope decoding, origination identity checking and authorized sender bindings.
- SNS normalization into a per-business/customer FIFO queue and dead-letter queue.
- Real Bedrock interpretation and deterministic customer workflow execution.
- Attachment retrieval through `GetWhatsAppMessageMedia`, private S3 persistence and Textract extraction.
- Outbox sender with `SendWhatsAppMessage`, consent/case checks and template/session eligibility.
- Explicit uncertain-send handling. A provider-accepted message is not a recipient-delivered message.

## Outstanding limitations

- WhatsApp onboarding, the regional event destination and the text enquiry/reply path have passed a live test. Live attachment retrieval and approved-template delivery remain unverified.
- Outbound provider delivery-status reconciliation and automated recovery of abandoned `sending` items are not implemented. Investigate them manually before retrying.
- The prototype queues follow-ups through staff actions; it does not autonomously contact every overdue customer.
- A transporter attachment receipt may generate a customer-facing case acknowledgement; direct transporter acknowledgements need separate recipient/session handling.
- No arbitrary inbound event is accepted over a public webhook; the stack uses the AWS SNS subscription.

## SES option

`emailSummary` is implemented in `src/handlers/messaging.ts` but not enabled or connected to a dashboard action. There were no verified SES identities in the checked region. Before use, configure an authorized verified sender and an explicitly authorized test destination. The AWS mailbox simulator is suitable for a provider test without contacting a person. Do not claim this is a working second CDS channel until deployed, invoked and verified.

## Primary documentation

- [AWS account and number setup](https://docs.aws.amazon.com/social-messaging/latest/userguide/getting-started-whatsapp.html)
- [Incoming event envelope](https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-event-destination-dlrs.html)
- [Sending and service windows](https://docs.aws.amazon.com/social-messaging/latest/userguide/whatsapp-send-message.html)
- [Template review](https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-templates.html)
