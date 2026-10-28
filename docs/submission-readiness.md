# TradeLoop submission readiness

Rules checked against the official Devpost pages on 28 October 2026. Software evidence below comes from the current repository and its recorded verification; this audit did not repeat the live WhatsApp tests. ACE status was updated on 29 October from a recorded direct observation of the signed-in Partner Central opportunity UI; see [ACE verification](ace-verification.json).

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

**Tagline:** Ask about the next delivery, understand why customers are waiting, and connect the next sales action to order and service context.

**Description:**

Distributors need to know whether a customer wants the next delivery and why orders have slowed. TradeLoop gives staff a dedicated Sales follow-ups tab with due check-ins, customer conversations and a next action for the responsible salesperson.

A check-in asks about delivery needs and reasons for waiting. The customer's exact statement stays beside a categorized reason, owner and suggested next action. Remaining stock or low demand defers follow-up seven days. A price enquiry is distinct from a price concern, and stopped ordering is not automatically treated as an opt-out. Brand-team counts summarize one latest categorized reason per customer in the workspace, not the wider market.

A factual latest-recorded-purchase summary provides invoice, items and available shipment context. Staff can queue that update; an unambiguous authorized shipment can answer a status question without repeatedly demanding its ID. The prototype does not ingest production order events or infer a business-specific reorder cadence. Those require a real business feed and agreed operating rules.

Delivery complaints pause sales follow-ups and link shipment evidence for staff review. Proposal, approval and recorded completion remain separate. A later repeat order requires customer confirmation and staff processing approval; it does not create an invoice, reservation, fulfilled order or sale.

Operational demo records are fictional. Historical real WhatsApp replies and incoming synthetic PDF processing verify AWS End User Messaging Social runtime use. The latest sales/context scope has 109 passing local tests and a fresh second 23-step GUI take with all states matched and zero browser errors; [21 read-only checks](sales-context-verification.json) verify the resulting judge state. No customer adoption, time savings or recovered revenue has been measured. A pilot would measure answered check-ins, documented reasons, assigned next actions and manual record lookups.

**Technical implementation / WhatsApp usage:**

AWS End User Messaging Social in Mumbai receives the authorized test customer's messages. SNS forwards events to the Virginia application; SQS FIFO queues conversation work. Amazon Bedrock proposes a typed business intent, while deterministic application checks enforce permissions and workflow transitions. DynamoDB stores records and the audit trail. Incoming synthetic PDF evidence passes through private S3 storage and Textract extraction. Staff use a Cognito-authenticated React dashboard served by API Gateway and Lambda.

The outbox sender actually invokes `SendWhatsAppMessageCommand` from `@aws-sdk/client-socialmessaging`. Recorded verification covers three inbound texts, three text replies and one document acknowledgement observed in WhatsApp, plus one incoming synthetic PDF processed into staff review. At current application source `935e607`, local `npm run verify` passed **109 tests**, type checking, production build and Lambda bundle. Fresh [sales/context cloud verification](sales-context-verification.json) passed 21 read-only checks; current-source [CI run 40754087697](https://github.com/devotedayush/tradeloop/actions/runs/40754087697) succeeded at `935e607`. Historical [final readiness verification](final-readiness-verification.json) records 12 passing read-only cloud checks. The earlier WhatsApp verification file preserves its historical 33-test snapshot. These are functional checks, not impact or load benchmarks.

Check-ins and recorded-purchase updates are staff-queued. Production order-event automation, an inactivity cadence grounded in a business feed and automatic campaigns are not implemented. Proactive approved-template delivery remains unverified. SES is disabled. The Kaysons connector is an unconfigured integration contract. This is bounded AI workflow orchestration, with staff approval for consequential actions. See [architecture](architecture.md), [verification](whatsapp-verification.json), and [existing-work disclosure](existing-work.md).

## Current review artifacts and workspace

- Upload-ready architecture: [PNG](architecture.png) and editable [SVG](architecture.svg).
- A dedicated `judgedemo` tenant contains synthetic records only, with no original invoice or live WhatsApp binding. Credentials stay in private, gitignored `.runtime/judge-access.json`. Its actual login was verified in the live browser.
- Run `npx tsx scripts/check-readiness.ts` for read-only cloud checks. The mutating `cloud-smoke.ts` begins with a reset; resetting a workspace containing live or imported evidence is blocked.

## Three-minute recording checklist

1. Lead with **Sales follow-ups**: due check-ins, the next-delivery question and responsible owner.
2. Demonstrate exact customer feedback, seven-day deferral and workspace category counts for the brand team.
3. Show factual latest-recorded-purchase context, a unique-shipment status answer and a staff-queued order update. Queueing is not delivery.
4. Clearly label a separate historical real WhatsApp text/PDF test, then return to the synthetic judge simulator.
5. Show a complaint pausing sales follow-ups, private synthetic evidence and separate proposal, approval and fictional completion.
6. Show a repeat-order draft, customer confirmation and staff processing approval, then architecture and honest limits. Follow the [180-second walkthrough](demo-walkthrough.md).

The older local demo is a pre-improvement draft, not the current final video. The replacement [180-second narrated demo](https://www.youtube.com/watch?v=Jt7BoLEayKY) adds AI narration to the unchanged, verified visuals and burned-in English captions. Its video-stream SHA256 matches the previous demo exactly, and the local H.264/AAC file passed a full decode without errors. The replacement URL is saved in the existing submitted Devpost entry. The narrated video is Public, SD and HD processing completed, copyright checks found no issues, and signed-out playback was verified. The same submitted Devpost page embeds the new video. A custom black-text/lime dashboard thumbnail is saved and persisted after reloading YouTube Studio. See [video verification](demo-video-verification.json).

The judge tenant has no live WhatsApp binding. Label its simulator clearly; demonstrate live WhatsApp separately through a sanitized authorized test recording that shows only fictional records. Record dashboard footage only from the dedicated synthetic workspace. Keep private contacts, authentication secrets and original documents out of the footage. Do not present a queued proactive follow-up as delivered or the simulator as WhatsApp.

## External gates still to verify

- **APN/entrant eligibility:** The user explicitly attests legal age, no conflict of interest, authority to represent **MENTS**, and signed APN Terms & Conditions. These are user attestations, not an independent audit of APN membership records or the contract.
- **ACE:** opportunity **`O30532571`** for **Kay Sons Oils Pvt Ltd / Dr Smith** exists in the signed-in Partner Central UI, with stage **Prospect**, status **Pending approval**, **$50 estimated MRR**, and Social among six selected products. The marketing campaign is exactly `AWS CDS Agentic AI Hackathon -Sept. 2026.`. The user reports creating it on 29 October 2026; a creation timestamp was not directly observed. This is a preliminary opportunity estimate, not actual revenue, a customer contract or AWS approval. Include this ID in Devpost; see [sanitized ACE verification](ace-verification.json).
- **Judge access:** The dedicated synthetic workspace login was verified and authorized credentials are included only in the private Devpost judge-package upload.
- **Repository access:** The repository is **public**, with default branch **main** and the existing **MIT** license; this was verified with GitHub CLI and the local license file. Organizer access to a private repository is no longer a gate.
- **Video and architecture attachment:** The public three-minute demo and architecture PNG are saved in the Devpost draft.
- **Final submission:** TradeLoop was **submitted** to the AWS CDS Agentic AI Partner Hackathon on 29 October 2026. Devpost displayed **Project submitted!** and **SUBMITTED TO** the hackathon. [Project page](https://devpost.com/software/tradeloop). The saved entry includes public demo video, three screenshots, public MIT repository, architecture PNG, ACE **O30532571**, entrant attestations and the private judge package with authorized synthetic-workspace credentials.

Current screenshots: [Sales follow-ups](screenshots/sales-followups-desktop.jpg), [Customer feedback](screenshots/sales-feedback-desktop.jpg), [Recorded order context](screenshots/order-context-desktop.jpg).
