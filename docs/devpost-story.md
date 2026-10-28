## Inspiration
A distributor can see an inactive customer and send another sales reminder, while the real reason is an unresolved delivery shortage. Sales and dispatch then work from disconnected messages, documents and manual records. TradeLoop connects that service issue to the next responsible action before continuing the sales conversation.

## What it does
Our fictional café expects 20 cartons but reports receiving 18. A WhatsApp complaint links to the recorded shipment, opens an owned delivery case and pauses routine sales follow-ups. A received PDF or image becomes private evidence for staff review. Document receipt does not accept delivery or authorize a remedy.

Authorized staff save a proposal, approve the next action and record completion separately. Approval keeps the case open as action pending. A later repeat order becomes a draft, then a customer-confirmed request, then a staff-approved processing request. It does not create an invoice, reserve stock or record a fulfilled sale.

The dashboard brings conversations, customer context, shipment references, case ownership, documents, order requests and an audit trail together. The dedicated judge workspace contains synthetic records and a clearly labelled simulator, with no live customer binding or WhatsApp sends.

## How we built it
AWS End User Messaging Social in Mumbai provides the actual WhatsApp channel. SNS forwards events to a Virginia ingestion Lambda and SQS FIFO worker. The sender imports and calls SendWhatsAppMessageCommand from @aws-sdk/client-socialmessaging at runtime.

Amazon Bedrock proposes a bounded, typed intent. Backend checks enforce consent, messaging-session eligibility, linked-record context, permissions, record versions and human approvals. DynamoDB persists workflow records, audit events and the outbox. S3 stores private evidence, Textract extracts supported documents, and Cognito controls staff access. The React and TypeScript dashboard and AWS CDK infrastructure are included in the repository.

## What we verified
An authorized live WhatsApp test verified inbound enquiries and a shortage complaint, observed text replies, an incoming forwarded synthetic PDF processed into staff review, and a document acknowledgement observed in WhatsApp. This live evidence is separate from the judge simulator.

The automated suite has 66 passing tests. CI passed type checking and the production build. A fresh-login cloud rehearsal exercised complaint, evidence, proposal, approval, separate fictional completion, customer confirmation and processing approval. Read-only checks verified private evidence access, denial of unsigned access, the audit sequence and zero judge outbox items.

## Challenges and learning
The working channel required cross-region event delivery between Mumbai and Virginia. We also had to keep document readings, customer claims and accepted operational facts distinct. The central design lesson was that interpreting a message and authorizing a business action are separate responsibilities.

## Current limits and next steps
This is a working prototype, with synthetic operational outcomes. Adoption, time savings and recovered revenue have not been measured. Proactive approved-template delivery and a scale benchmark remain unverified. The Kaysons production connector is not configured. The next step is an authorized pilot measuring staff handling time, service-case completion and customer-confirmed reorder quality against the existing process.

## Existing work disclosure
TradeLoop was created for this hackathon with AI coding assistance. Existing Kaysons Logistics workflow knowledge informed the design; its repository was not duplicated, and no production database was changed. The connector contract is included, but a live Kaysons integration is not claimed. Full provenance and open-source dependencies are documented in the repository.
