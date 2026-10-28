# TradeLoop submission readiness

Checked against the official Devpost pages on 28 October 2026. Software evidence below comes from the current repository and its recorded verification; this audit did not repeat the live WhatsApp tests or inspect private Partner Central records.

## Deadline and requirements

**Deadline: 29 October 2026, 01:30 IST**, equivalent to 28 October, 13:00 PDT. Judging ends 12 November, 17:00 Pacific Time. Entrants must represent an APN-registered organization with signed APN Terms & Conditions; teammates must share that AWS Partner. Registration requires the associated corporate email domain and organization name. [Official rules](https://aws-cds-partner.devpost.com/rules)

Submit these artifacts:

- GitHub/GitLab repository with source, assets, installation/testing instructions and actual qualifying CDS SDK calls. Public repositories need an open-source license; private repositories need organizer access.
- Architecture diagram, feature description, deployed application URL and judge testing credentials for this authenticated application.
- Approximately three-minute working demo, publicly visible on YouTube or Vimeo, with English material or translations.
- Net-new ACE opportunity ID created on/after 14 September 2026, tagged exactly **AWS CDS Agentic AI Hackathon -Sept. 2026.**
- Explain AWS End User Messaging Social usage for the Meta WhatsApp prize.

Keep the working application freely available through judging. Disclose incorporated pre-existing work. [Submission and project rules](https://aws-cds-partner.devpost.com/rules)

ACE only needs **Created** status. A signed customer deal is not required: use the most accurate available industry, geography and ARR estimate, then update actual details later. Keep confidential customer information in ACE; public materials can describe the industry/use case generally. [Official FAQ](https://aws-cds-partner.devpost.com/details/faq)

## Judging priorities

| Criterion | Weight | What TradeLoop should demonstrate |
| --- | ---: | --- |
| Technical execution | 40% | Actual CDS runtime calls, connected AWS architecture and reproducible setup |
| Potential value/impact | 20% | Clear distributor problem and a credible measurement plan |
| Demo presentation | 20% | Complete, understandable customer-to-staff workflow |
| Creativity | 10% | Complaint handling connected to later repeat-order coordination |
| Functionality | 10% | Working integrations, AI contribution and honest scaling boundaries |

Multiple well-integrated CDS services are considered under technical execution, but one qualifying service meets the minimum. AgentCore is optional. [Official overview and judging criteria](https://aws-cds-partner.devpost.com/)

## Paste-ready project text

**Title:** TradeLoop

**Tagline:** Connect WhatsApp delivery complaints, shipment evidence and repeat-order requests in one accountable distributor workflow.

**Description:**

Distributor teams often have to reconnect a customer's WhatsApp complaint with purchase history, delivery records and the staff member responsible for the next action. TradeLoop keeps that context together.

When a customer reports missing cartons, TradeLoop interprets the message, links the complaint to the recorded shipment, opens a service case and pauses sales follow-ups. An incoming document is stored privately and extracted for staff review. Authorized staff propose, approve and record the next action. A later repeat-order request requires customer confirmation and staff approval for processing.

The AWS-hosted prototype has verified real WhatsApp text replies and incoming synthetic PDF processing through AWS End User Messaging Social. Operational demonstration records are fictional. The workflow distinguishes customer claims, extracted evidence and staff decisions: uploading a document does not accept delivery, and approving an order request does not create an invoice or shipment.

TradeLoop aims to reduce manual context gathering and missed ownership during complaint-to-reorder coordination. Customer adoption, time savings and recovered revenue have not been measured. A pilot would measure time from complaint to assigned action, manual record lookups and unresolved cases receiving inappropriate follow-ups.

**Technical implementation / WhatsApp usage:**

AWS End User Messaging Social in Mumbai receives the authorized test customer's messages. SNS forwards events to the Virginia application; SQS FIFO queues conversation work. Amazon Bedrock proposes a typed business intent, while deterministic application checks enforce permissions and workflow transitions. DynamoDB stores records and the audit trail. Incoming synthetic PDF evidence passes through private S3 storage and Textract extraction. Staff use a Cognito-authenticated React dashboard served by API Gateway and Lambda.

The outbox sender actually invokes `SendWhatsAppMessageCommand` from `@aws-sdk/client-socialmessaging`. Recorded verification covers three inbound texts, three text replies and one document acknowledgement observed in WhatsApp, plus one incoming synthetic PDF processed into staff review. The current suite has 66 passing tests, and [final readiness verification](final-readiness-verification.json) records 12 passing read-only cloud checks. The earlier WhatsApp verification file preserves its historical 33-test snapshot. These are functional checks, not impact or load benchmarks.

Proactive approved-template delivery remains unverified. SES is disabled. The Kaysons connector is an unconfigured integration contract. This is bounded AI workflow orchestration, with staff approval for consequential actions. See [architecture](architecture.md), [verification](whatsapp-verification.json), and [existing-work disclosure](existing-work.md).

## Current review artifacts and workspace

- Upload-ready architecture: [PNG](architecture.png) and editable [SVG](architecture.svg).
- A dedicated `judgedemo` tenant contains freshly seeded synthetic records only, with no original invoice or live WhatsApp binding. Credentials stay in private, gitignored `.runtime/judge-access.json`. Its actual login was verified in the live browser.
- Run `npx tsx scripts/check-readiness.ts` for read-only cloud checks. The mutating `cloud-smoke.ts` begins with a reset; resetting a workspace containing live or imported evidence is blocked.

## Three-minute recording checklist

1. Show the dedicated synthetic judge dashboard and synthetic-data label. Explain the distributor's problem and customer context.
2. Send a real authorized WhatsApp shortage complaint. Show its received reply, linked shipment/case and paused follow-ups.
3. Attach the synthetic PDF. Show extraction and staff review, keeping delivery acceptance separate.
4. Show staff proposal and approval. Label any demonstrated completion explicitly as a fictional test outcome.
5. Show a customer-confirmed reorder request awaiting staff processing approval.
6. Finish with the architecture, audit trail and concise limitations. Use [the detailed walkthrough](demo-walkthrough.md).

The judge tenant has no live WhatsApp binding. Label its simulator clearly; demonstrate live WhatsApp separately through a sanitized authorized test recording that shows only fictional records. Record dashboard footage only from the dedicated synthetic workspace. Keep private contacts, authentication secrets and original documents out of the footage. Do not present a queued proactive follow-up as delivered or the simulator as WhatsApp.

## External gates still to verify

- **APN eligibility:** inspect actual organization membership, signed terms and entrant authority. Devpost registration or an ordinary AWS login does not prove this.
- **ACE:** Partner Central organization access and the opportunity wizard were verified in signed-in Chrome. The all-status list showed zero opportunities updated in the last six months. A new opportunity still needs accurate prospective customer details, the campaign tag and ID.
- **Judge access:** the dedicated synthetic workspace and private access file exist. Test the actual login, then supply credentials through private testing instructions. Do not publish them in repository files.
- **Repository access:** GitHub CLI confirms `isPrivate: true`. Grant the specified organizer accounts access. An MIT license exists locally.
- **Video and architecture attachment:** record, publish and verify the actual YouTube/Vimeo link. Attach the prepared [architecture PNG](architecture.png) to the form; [SVG](architecture.svg) is also available. A recording script does not establish video publication.
- **Final submission:** complete the Devpost fields and verify the submitted state before the deadline. This document does not establish that submission has occurred.
