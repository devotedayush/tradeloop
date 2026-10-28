# TradeLoop judge guide

Open the [deployed application](https://lhswn6utwl.execute-api.us-east-1.amazonaws.com/) and sign in using the credentials supplied privately with the entry. Confirm the workspace is **TradeLoop Judge Demo**, then open **Sunrise Café** or search for **SHP-101**. This is a fictional distributor scenario: 20 cartons were expected and the customer reports receiving 18. The useful outcome is to pause sales reminders, collect evidence and give staff an accountable next action.

The dedicated `judgedemo` workspace has no live WhatsApp contact binding and contains no original business invoice. Its private provisioning file is `.runtime/judge-access.json`, excluded from Git; credentials must be supplied through private testing instructions. The public URL alone does not grant access. **POD means proof of delivery.** A received document is evidence for review, not accepted POD.

## Try the synthetic workflow

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

Application source verified by the recorded deployment: [`f237e81`](https://github.com/devotedayush/tradeloop/commit/f237e81). Documentation baseline before this guide: [`76704fc`](https://github.com/devotedayush/tradeloop/commit/76704fc). [CI run 40744000597](https://github.com/devotedayush/tradeloop/actions/runs/40744000597) succeeded for source `f237e81`; [UI verification](ui-redesign-verification.json) records the deployed HTML match and browser checks. These references identify the tested snapshot, not a claim that every later change is covered by that run.

| Evidence | What it establishes | Boundary |
| --- | --- | --- |
| [Final test report](final-test-report.md), CI above | 66 automated tests, type checking, production build and Lambda bundle passed. | Functional/regression evidence, not customer impact or load testing. |
| [Cloud workflow rehearsal](cloud-verification.json) | 16 passing checks in isolated synthetic `judgedemo`: Cognito, Bedrock, DynamoDB, private S3/Textract, permissions and approval states. | Mutating rehearsal; zero WhatsApp sends. |
| [Fresh judge rehearsal verification](judge-rehearsal-verification.json) | 16 passing read-only checks after a fresh-login GUI rehearsal on 29 October: synthetic case, private evidence, separate approvals, confirmed five-carton request and zero outbox items. | Fictional completion; no real correction, sale or WhatsApp send. |
| [Read-only cloud verification](final-readiness-verification.json) | 12 passing checks of deployed authentication, preserved live evidence and review boundaries. | Separate owner-workspace checks, not the synthetic rehearsal. |
| [Live WhatsApp/PDF verification](whatsapp-verification.json) | Real inbound texts, observed text replies and a forwarded synthetic PDF processed through private storage and Textract into review; document acknowledgement observed at 22:45 IST on 28 October. | Sanitized observation record. Its 33-test count is historical. No original invoice or private contact details are included. |
| [Final live WhatsApp check](final-live-whatsapp-verification.json) | Fresh SHP-101 status reply observed in desktop WhatsApp at 23:21 IST on 28 October, after final deployment. | Receipt is supported by direct UI observation; provider delivery-status reconciliation is not implemented. |

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

The subsequent [text readability update](text-readability-verification.json) changed CSS only: near-black text, stronger body weight and larger small labels. It was deployed with all four Lambda environments unchanged. [Desktop](screenshots/crm-contrast-desktop.jpg) and [mobile](screenshots/crm-contrast-mobile.jpg) screenshots show the updated text. The local captioned demo draft was captured before this CSS update and is not yet published.

## Submission gates, separate from software evidence

Recorded preparation status at this guide's creation, not independently changed or completed by this document:

- APN organization access exists, but signed terms, entrant authority and full eligibility are **not proven**.
- An ACE opportunity is **absent from the last recorded portal check**. It needs accurate prospective-customer fields and the exact campaign tag `AWS CDS Agentic AI Hackathon -Sept. 2026.`; do not invent an ID or business details.
- The repository is private; required organizer access is **not yet granted**.
- A public approximately three-minute demo video and a **confirmed submitted Devpost entry are missing** from the verified record.

See the [official rules](https://aws-cds-partner.devpost.com/rules), [official FAQ](https://aws-cds-partner.devpost.com/details/faq), [submission checklist](submission-readiness.md) and [existing-work disclosure](existing-work.md). Working software does not establish eligibility or submission.
