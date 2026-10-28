# Three-minute working demonstration

Use the actual deployed application. Keep the synthetic-data banner and connection status visible. Do not imply the simulator is WhatsApp.

1. **0:00–0:20 — Problem.** Distributor staff manually reconnect customer conversations, previous purchases and delivery evidence. TradeLoop gives each next step an owner.
2. **0:20–0:45 — Customer context.** Open Sunrise Café. Show previous purchase, SHP-101 and a due follow-up. Queue a follow-up, explaining whether it is actually delivered through an approved WhatsApp template or remains queued.
3. **0:45–1:15 — Service issue.** From the authorized WhatsApp test customer, send `DEMO: I received 18 of the 20 cartons in shipment SHP-101. Two cartons are missing.` Show the real reply, the case linked to SHP-101 and sales follow-ups paused.
4. **1:15–1:45 — Evidence.** Attach `demo-data/synthetic-bilty-pod-shortage.pdf` through the channel verified for the recording. The matching fictional invoice is `demo-data/synthetic-invoice-shortage.pdf`. Show the document, extracted text when available, expected 20 and customer-reported 18. Document receipt is not POD acceptance. Original business scans are not public demo assets.
5. **1:45–2:10 — Staff action.** Save a proposal such as `Dispatch to verify shortage and contact the customer with an approved arrangement`. Approve the next action. Show `action pending`. Record completion only as a visibly fictional test outcome, e.g. `DEMO: staff verified correction and customer accepted the outcome`.
6. **2:10–2:35 — Next order.** Customer requests `Same order again, 5 cartons`, then `Confirm`. Show the request awaiting review and staff approval for processing. No invoice, stock reservation or actual shipment is created.
7. **2:35–3:00 — Technical evidence.** Show the audit trail, connection status, AWS architecture and actual test results. WhatsApp is active in Mumbai and the application is in Virginia. Disclose synthetic data, the disconnected Kaysons connector and unverified approved-template delivery.

## Pitch

TradeLoop helps distributors coordinate repeat orders and delivery problems through customer conversations. It records what customers need or why they stopped ordering, connects complaints to shipment evidence, and routes the next action to authorized staff. The prototype runs on AWS with a bounded Bedrock interpreter and a live AWS End User Messaging Social channel. Real text round-trips and recipient receipt are verified in `docs/whatsapp-verification.json`; do not extend that claim to any untested feature.

## External prerequisites still required

AWS Partner eligibility and the net-new ACE opportunity are submission gates independent of the software. The dedicated WhatsApp account, event destination and opted-in test contact are configured. Approved templates are still needed for proactive messages outside a customer service window. Do not invent an opportunity ID or claim a pending feature works.
