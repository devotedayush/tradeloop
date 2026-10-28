# Three-minute working demonstration

Use the actual deployed application. Keep the synthetic-data banner and connection status visible. Do not imply the simulator is WhatsApp.

1. **0:00–0:20 — Problem.** Distributor staff manually reconnect customer conversations, previous purchases and delivery evidence. TradeLoop gives each next step an owner.
2. **0:20–0:45 — Customer context.** Open Sunrise Café. Show previous purchase, SHP-101 and a due follow-up. Queue a follow-up, explaining whether it is actually delivered through an approved WhatsApp template or remains queued.
3. **0:45–1:15 — Service issue.** Customer replies `2 cartons missing from my last delivery`. Prefer a real test handset after onboarding. Otherwise explicitly show the simulator. Show the case linked to SHP-101 and sales follow-ups paused.
4. **1:15–1:45 — Evidence.** Attach `demo-data/synthetic-pod-shortage.png`. Show the original, OCR output when available, expected 20 and customer-reported 18. Document receipt is not POD acceptance.
5. **1:45–2:10 — Staff action.** Save a proposal such as `Dispatch to verify shortage and contact the customer with an approved arrangement`. Approve the next action. Show `action pending`. Record completion only as a visibly fictional test outcome, e.g. `DEMO: staff verified correction and customer accepted the outcome`.
6. **2:10–2:35 — Next order.** Customer requests `Same order again, 5 cartons`, then `Confirm`. Show the request awaiting review and staff approval for processing. No invoice, stock reservation or actual shipment is created.
7. **2:35–3:00 — Technical evidence.** Show the audit trail, connection status, AWS architecture and actual test results. Disclose Kaysons connector status, synthetic data and any unfinished WhatsApp setup.

## Pitch

TradeLoop helps distributors coordinate repeat orders and delivery problems through customer conversations. It records what customers need or why they stopped ordering, connects complaints to shipment evidence, and routes the next action to authorized staff. The prototype runs on AWS, with a bounded Bedrock interpreter and AWS End User Messaging Social integration code. Describe runtime WhatsApp usage only after a real send-and-receive test succeeds.

## External prerequisites still required

AWS Partner eligibility and the net-new ACE opportunity are submission gates independent of the software. The team must link a WhatsApp Business account and dedicated number, configure the event destination, obtain approved templates and map opted-in test contacts. No code can substitute for Meta/account-side setup or approval. Do not invent an opportunity ID or claim a pending feature works.
