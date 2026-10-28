# Final readiness verification, 28 October 2026

## Verified software

- 66 automated tests, TypeScript checking, production React build and Lambda bundle pass using `npm run verify`.
- `docs/cloud-verification.json` records a live rehearsal in the separate, fictional `judgedemo` workspace using Cognito, Bedrock, DynamoDB, S3 and Textract. The script refuses to reset the owner's tenant or any tenant containing imported or WhatsApp evidence.
- `docs/final-readiness-verification.json` records read-only checks against the owner's deployed workspace: authentication, private PDF retrieval, preserved live evidence and review boundaries.
- `docs/operational-health.json` records queue depths and monitoring state. An `INSUFFICIENT_DATA` alarm is not an all-clear claim.
- A browser rehearsal in an isolated local workspace covered complaint, paused follow-up, actual PDF file selection/upload, staff proposal, approval, separate completion, customer order confirmation and staff processing approval. No browser errors were observed. This rehearsal used the local rules interpreter and manual document-review mode; the separate cloud rehearsal exercised Bedrock and Textract.
- Dedicated judge credentials were tested in the live browser. They are saved privately in `.runtime/judge-access.json` and have not been published or sent to organizers.

A fresh status enquiry after the final deployment received its real WhatsApp reply at 23:21 IST. The sanitized observation is in [final-live-whatsapp-verification.json](final-live-whatsapp-verification.json). Historical live PDF and text evidence remains in [whatsapp-verification.json](whatsapp-verification.json).

## Defects corrected during final testing

- A transaction retry could retain an uncommitted outbox claim and send twice. Only the committed claim now authorizes a provider call.
- New evidence or a changed complaint could reuse an older staff approval. They now require a fresh review and proposal.
- Zero, negative and fractional quantities could silently reuse or alter a previous order quantity. Invalid explicit quantities now receive deterministic validation before Bedrock.
- Negated confirmations could be interpreted as confirmations or opt-outs. Explicit confirmation wording now goes through deterministic amendment/negation checks.
- Customer deferral left an older reminder queued. Deferral now suppresses that pending reminder.
- Explicit shipment references could lead to repeated clarification or a mismatched document attachment. Authorized references now narrow status and media matching; unassigned media clearly requests a resend.
- DynamoDB random-key ordering scrambled conversations and audit history. Timestamped collections now reconstruct chronologically.
- Imported private reviews were labelled as synthetic and could be reset with demo data. The dashboard now labels sources, blocks simulated messages against imported customers and locks destructive demo reset when imported or WhatsApp activity exists.
- The dashboard now shows actual outbox states, labels provider acceptance separately from receipt, respects staff action roles and keeps scheduled follow-ups disabled until due.

## Submission preparation

The pitch and official entry checklist are in [submission-readiness.md](submission-readiness.md). Upload-ready architecture artifacts are [architecture.png](architecture.png) and [architecture.svg](architecture.svg). The recording script is [demo-walkthrough.md](demo-walkthrough.md).

Live runtime verification does not complete APN eligibility checks, an ACE opportunity, private repository organizer access, public demo-video publication or final Devpost submission. Proactive approved-template delivery remains unverified.
