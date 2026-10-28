# TradeLoop judge guide

Open the [deployed application](https://lhswn6utwl.execute-api.us-east-1.amazonaws.com/) and sign in using the credentials supplied privately with the entry. Confirm **TradeLoop Judge Demo**, then start with **Sales follow-ups**. Staff ask whether the next delivery is needed, preserve why a customer is waiting, and give the responsible salesperson a next action. Order context and delivery complaints remain connected to that conversation.

Current application source is [`935e607`](https://github.com/devotedayush/tradeloop/commit/935e607), with **109 local tests**, type checking, production build and Lambda bundle passing. Fresh [sales/context verification](sales-context-verification.json) passed **21 read-only cloud checks** after the new GUI rehearsal. Current [CI run 40754087697](https://github.com/devotedayush/tradeloop/actions/runs/40754087697) succeeded at `935e607`; previous application/CSS runs retain their historical source commits. Earlier cloud and WhatsApp records below retain their own source/date; the final public demo is documented in [video verification](demo-video-verification.json).

The dedicated `judgedemo` workspace has no live WhatsApp contact binding and contains no original business invoice. Its private provisioning file is `.runtime/judge-access.json`, excluded from Git; credentials must be supplied through private testing instructions. The public URL alone does not grant access. **POD means proof of delivery.** A received document is evidence for review, not accepted POD.

## Try sales follow-ups and order context

These expected results are supported by the fresh GUI rehearsal and [21 read-only cloud checks](sales-context-verification.json). Use an eligible due customer for queue actions. A queued item does not establish WhatsApp delivery, and the judge workspace has no live contact binding.

| Step | Input or staff action | Expected result |
| --- | --- | --- |
| Due check-in | Open **Sales follow-ups**, inspect the due date and owner, then **Queue check-in** for an eligible due customer. | Staff queue a question about the next delivery and the reason for waiting. Consent, service cases, due dates and duplicate checks apply. |
| Remaining stock | In the labelled simulator, send `I still have stock left`. Return to Sales follow-ups. | The exact statement is saved in `Customer.retention`, with category **Stock still left**, existing customer owner and suggested action. Next follow-up moves seven days; pending check-ins are suppressed. |
| Low demand | Send `Demand is low` to another fictional customer if demonstrating a second category. | Records customer-stated low demand and defers seven days; no order is inferred. |
| Careful interpretation | Compare `What is the price?` with `The price is too high`. | A pricing enquiry does not itself become a reason for stopped orders. A stated concern goes to the salesperson without a promised discount. `I stopped ordering` alone is not an opt-out. |
| Brand feedback | Inspect **Customer feedback for the brand team**. | Counts use one latest categorized reason per customer in this workspace. The exact statement, owner and suggested next action are reviewable; counts do not represent the wider market. |
| Latest recorded purchase | Open a customer and send `What did I order?`, or inspect their purchase card. | Invoice/date/items and available recorded shipment status are factual context. Pending requests are separate from recorded purchases. |
| Shipment context | Send `Where is my delivery?` for a customer with exactly one authorized shipment. | Replies using that unique shipment without asking repeatedly for its ID. Multiple possible shipments require a reference; status is recorded, not live tracking. |
| Staff order update | Select **Queue order update** on the purchase card. | `POST /api/order-updates/:customerId` queues the recorded-purchase summary. Consent/session/template checks still govern any delivery; this is not automatic order-event integration. |

Due dates reflect the existing staff schedule, not a learned reorder interval. Production order-event automation and inactivity cadence need an actual business feed and agreed rules. Approved proactive templates remain unverified. The simulator does not send WhatsApp.

## Try complaint handling and repeat orders

Use the labelled customer-message simulator in the judge workspace. These actions change only its demonstration records and do not send WhatsApp messages. Inspect the current case first, since a previous rehearsal may already have advanced it; do not reset a connected workspace.

| Step | Input or staff action | Expected result |
| --- | --- | --- |
| Customer complaint | `DEMO: I received 18 of the 20 cartons in shipment SHP-101. Two cartons are missing.` | A case links to SHP-101, expected 20 and reported 18 remain distinct, and sales follow-ups pause. |
| Evidence | Upload [synthetic-bilty-pod-shortage.pdf](../demo-data/synthetic-bilty-pod-shortage.pdf) to the linked case. The [matching synthetic invoice](../demo-data/synthetic-invoice-shortage.pdf) is also available. | Private evidence and extraction appear on the case; matched evidence advances it to `review`. POD remains `missing`. Uncertain extraction stays for staff review. |
| Staff proposal | Enter `DEMO: Dispatch to verify shortage and contact the customer with an approved arrangement.`, then **Save proposal**. | Proposal is recorded; case remains `review`. |
| Staff approval | Select **Approve next action**. | Case becomes `action_pending`, not resolved. No credit or replacement shipment is issued. |
| Separate completion | Enter `DEMO ONLY: Fictional staff completion recorded for this test. No real correction or customer acceptance verified.`, then **Record completion**. | Case becomes `resolved` as a fictional test outcome. Follow-ups can resume only when no other unresolved case or consent restriction prevents them. |
| Customer reorder | Send `Same order again, 5 cartons`. | A `draft` copies the latest recorded purchase and asks for confirmation. |
| Customer confirmation | Send `Confirm`. | Request becomes `customer_confirmed`, awaiting staff review. |
| Staff processing approval | Open the request and approve it for processing. | Request becomes `approved`. No actual invoice, stock reservation, fulfilled order or sale is created. |

Staff case actions require an admin or logistics role; request approval requires admin or sales. Changed evidence invalidates stale approval. See the [three-minute walkthrough](demo-walkthrough.md) and [workflow implementation](../src/core/engine.ts).

## Evidence and reproducibility

Current-source local verification: **109 tests**, type checking, production build and Lambda bundle at `935e607`. Previous successful runs: [application CI run 40750699606](https://github.com/devotedayush/tradeloop/actions/runs/40750699606) (`a91fdd2`) and [CSS/documentation CI run 40751686831](https://github.com/devotedayush/tradeloop/actions/runs/40751686831) (`a5fb12c`); both succeeded, and current-source [CI run 40754087697](https://github.com/devotedayush/tradeloop/actions/runs/40754087697) succeeded at `935e607`. [Sales/context verification](sales-context-verification.json) records 21 passing read-only checks after the second 23-step GUI take; see the record for the latest revision and timestamp. Historical [CI run 40744000597](https://github.com/devotedayush/tradeloop/actions/runs/40744000597) succeeded for `f237e81`; [UI verification](ui-redesign-verification.json) records that earlier deployed HTML match and browser checks. These snapshots do not attest to subsequent sales/context changes.

| Evidence | What it establishes | Boundary |
| --- | --- | --- |
| [Final test report](final-test-report.md) | Current source: 109 local tests, type checking, production build and Lambda bundle passed. Fresh sales/context cloud checks passed; previous CI records retain their source commits and current-source [CI run 40754087697](https://github.com/devotedayush/tradeloop/actions/runs/40754087697) succeeded at `935e607`. | Functional evidence, not an impact or load benchmark. |
| [Sales/context rehearsal verification](sales-context-verification.json) | 21 read-only checks: exact stock feedback and seven-day deferral, suppressed check-in, contextual replies, private extracted PDF, distinct approvals and five-carton request. Previous CI succeeded for `a91fdd2` and `a5fb12c`; current-source [CI run 40754087697](https://github.com/devotedayush/tradeloop/actions/runs/40754087697) succeeded at `935e607`. | Judge outbox is **one pending order update plus one suppressed check-in**, with no live binding or active sender tenant. No judge WhatsApp send or actual sale. |
| [Separate live sales/context proof](sales-context-verification.json) | Parent directly observed a factual recorded-purchase update in WhatsApp at 00:34 IST and the synthetic DEMO price-feedback reply at 00:39 IST on 29 October. | Separate authorized owner connection. Provider acceptance and subsequent observed receipt are recorded separately; no production order-event integration or automatic campaign. |
| [Cloud workflow rehearsal](cloud-verification.json) | 16 passing checks in isolated synthetic `judgedemo`: Cognito, Bedrock, DynamoDB, private S3/Textract, permissions and approval states. | Mutating rehearsal; zero WhatsApp sends. |
| [Earlier judge rehearsal verification](judge-rehearsal-verification.json) | 16 passing read-only checks after an earlier fresh-login GUI rehearsal on 29 October: synthetic case, private evidence, separate approvals, confirmed five-carton request and zero outbox items **at that time**. | Fictional completion; no real correction, sale or WhatsApp send. |
| [Read-only cloud verification](final-readiness-verification.json) | 12 passing checks of deployed authentication, preserved live evidence and review boundaries. | Separate owner-workspace checks, not the synthetic rehearsal. |
| [Live WhatsApp/PDF verification](whatsapp-verification.json) | Real inbound texts, observed text replies and a forwarded synthetic PDF processed through private storage and Textract into review; document acknowledgement observed at 22:45 IST on 28 October. | Sanitized observation record. Its 33-test count is historical. No original invoice or private contact details are included. |
| [Final live WhatsApp check](final-live-whatsapp-verification.json) | Fresh SHP-101 status reply observed in desktop WhatsApp at 23:21 IST on 28 October, after the deployment tested at that time. | Receipt is supported by direct UI observation; provider delivery-status reconciliation is not implemented. |

The simulator demonstrates workflow state transitions. Actual WhatsApp runtime proof comes from the separate authorized test connection above. `sent` means provider acceptance; recipient receipt additionally requires observation. Approved proactive template delivery is unverified. There is one active qualifying CDS service, AWS End User Messaging Social; SES is disabled.

Use Node.js **22.12 or newer** from the repository root:

```sh
npm ci
npm run verify
```

For a local rehearsal, run `npm run dev` and open `http://127.0.0.1:4310`. Local mode has no staff login and uses the visibly labelled rules interpreter unless Bedrock is configured. It does not reproduce the live cloud connection by itself.

The configured operator can safely inspect cloud application state with:

```sh
npm run check:cloud
```

This operator check uses the separately provisioned private `.runtime/reviewer-access.json`, not judge credentials. It makes authenticated reads, including private evidence validation; it does not reset business records, change cases or send messages. It does rewrite the local `docs/final-readiness-verification.json` report. Judges need not access that private operator workspace or original documents: the sanitized recorded results above are sufficient to inspect its claims. Do not substitute `npm run test:cloud`: that script begins with a synthetic reset and is unsuitable for connected or imported evidence.

## Architecture and judging index

View the [architecture PNG](architecture.png), [editable SVG](architecture.svg) or [architecture explanation](architecture.md). Mumbai WhatsApp/SNS feeds Virginia Lambda and SQS FIFO; Bedrock proposes a bounded typed intent, deterministic checks enforce actions, DynamoDB stores records, S3/Textract handles evidence, and Cognito authenticates staff. Runtime SDK calls are in [messaging.ts](../src/handlers/messaging.ts), with [Bedrock interpretation](../src/adapters/interpreter.ts), [persistence](../src/adapters/store.ts) and [infrastructure](../infra/app.ts).

The [official rubric](https://aws-cds-partner.devpost.com/) weights Potential Value/Impact **20%**, Creativity **10%**, Technical Execution **40%**, Functionality **10%**, and Demo Presentation **20%**. The workflow and evidence above support inspection against those criteria; they are not official scores. No adoption, time savings or recovered revenue has been measured. Whole-business reads and business-wide revision locking are prototype choices, with no scale benchmark. The Kaysons production connector is not configured.

Historical readability source is [`5ecb6a3`](https://github.com/devotedayush/tradeloop/commit/5ecb6a3); [CI run 40748471874](https://github.com/devotedayush/tradeloop/actions/runs/40748471874) passed all 66 tests, type checking and production build.

The subsequent [text readability update](text-readability-verification.json) changed CSS only: near-black text, stronger body weight and larger small labels. It was deployed with all four Lambda environments unchanged. [Desktop](screenshots/crm-contrast-desktop.jpg) and [mobile](screenshots/crm-contrast-mobile.jpg) screenshots show the updated text. The older local captioned draft predates the sales/context additions and is not the current final demo. The [180-second public demo](https://www.youtube.com/watch?v=ROkGlIfyKMk) is published on the Ayushman channel. The local H.264 export played to completion without error; signed-out public playback started successfully at 3:00 duration. English captions are burned into the video. See [video verification](demo-video-verification.json).

## Submission gates, separate from software evidence

Recorded preparation status, with ACE updated from a signed-in Partner Central observation on 29 October 2026. These records do not establish final submission:

- **Eligibility attestations:** The user explicitly attests legal age, no conflict of interest, authority to represent **MENTS**, and signed APN Terms & Conditions. These are user attestations, not an independent audit of APN membership records or the contract.
- **ACE opportunity `O30532571` exists** for Kay Sons Oils Pvt Ltd / Dr Smith. Signed-in Partner Central UI showed stage **Prospect**, status **Pending approval**, **$50 estimated MRR**, and Social among six selected products, with exact marketing campaign `AWS CDS Agentic AI Hackathon -Sept. 2026.`. The user reports creating it on 29 October 2026; the creation timestamp was not directly observed. This preliminary estimate does not establish actual revenue, a customer contract or AWS approval. See the [sanitized ACE verification](ace-verification.json).
- **Repository:** The repository is **public**, with default branch **main** and the existing **MIT** license; this was verified with GitHub CLI and the local license file. Organizer access to a private repository is no longer a gate.
- **Video:** The [180-second public demo](https://www.youtube.com/watch?v=ROkGlIfyKMk) is published on the Ayushman channel. The local H.264 export played to completion without error; signed-out public playback started successfully at 3:00 duration. English captions are burned into the video. See [video verification](demo-video-verification.json).
- **Devpost draft:** Devpost draft **1269677-tradeloop** has Overview, Story/video and Additional Info saved (**4/5**). ACE **O30532571**, the architecture PNG and source ZIP are attached. The private judge package is prepared for upload with authorized synthetic-workspace access. Final legal agreement and submission remain pending; no submitted entry is claimed.

See the [official rules](https://aws-cds-partner.devpost.com/rules), [official FAQ](https://aws-cds-partner.devpost.com/details/faq), [submission checklist](submission-readiness.md) and [existing-work disclosure](existing-work.md). Working software does not establish eligibility or submission.

## Current sales/context screenshots

The second GUI take completed 23 steps with all expected states matched and zero browser errors, as directly observed by the parent. The [fresh read-only verification](sales-context-verification.json) checks the resulting dedicated judge state. Current screenshots: [Sales follow-ups](screenshots/sales-followups-desktop.jpg), [Customer feedback](screenshots/sales-feedback-desktop.jpg), [Recorded order context](screenshots/order-context-desktop.jpg).
