# Finish the AWS CDS connection

## WhatsApp, required for the intended demonstration

1. Sign in to the AWS End User Messaging Social console in the deployment region. Choose **Business accounts**, then launch Meta's embedded signup.
2. Use the correct business portfolio and a dedicated number able to receive a verification code. Preserve the business's operational WhatsApp number; do not migrate or delete it just for this demo.
3. Link the WABA and complete the required Meta/account checks.
4. Configure the stack's **standard SNS topic** as the account's message/event destination. Get `WhatsAppTopicArn` from `.runtime/outputs.json` or CloudFormation outputs. SNS FIFO is not supported as the direct event destination; our downstream queue is FIFO.
5. Record the AWS origination phone ID and Meta phone ID. Configure only explicitly authorized, opted-in test contacts. The app will not disclose records to unmapped senders.
6. Request a correctly categorized reorder-follow-up template and, if needed, a service template. The current sender expects one body text parameter and a configured language code. Reorder marketing is subject to destination restrictions; do not disguise it as a utility message.
7. Configure a currently supported `META_API_VERSION`. No API version is silently assumed by the sender.
8. Set the environment values listed in `.env.example` in your shell or private deployment configuration and rerun deployment. Never commit phone mappings or access tokens.
9. From the mapped test handset, send an enquiry. Confirm the event, persisted message, reply, and actual handset receipt. Then test an attachment on a uniquely matched open case.

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

- WhatsApp onboarding, event destination and templates are account-side work and have not passed a live test in this project.
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
