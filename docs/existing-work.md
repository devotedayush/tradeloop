# Existing work and submission provenance

TradeLoop source in this repository was created for the AWS CDS hackathon on 28 October 2026 using AI coding assistance.

Kaysons Logistics is an existing Flutter/Supabase logistics application. Its delivery workflow and permission rules informed the integration boundary. The Kaysons repository was not duplicated and no production database was modified. `src/adapters/kaysons.ts` defines an HTTPS read connector contract; the requisite endpoint is not implemented or configured in Kaysons. Do not describe this as a completed live integration.

An earlier Kaysons Document Check prototype was inspected as background. Its application code, OCR evaluation results and old performance measurements have not been copied into TradeLoop or claimed as new results.

Business names, catalogue prices, purchase history, shipments, complaints and delivery-evidence images in the TradeLoop demo are explicitly synthetic. No customer adoption, recovered revenue, real invoice, recipient signature or production delivery acceptance is claimed.

Open-source runtime dependencies are recorded in package.json and package-lock.json and retain their respective licenses. No private business source or proprietary customer dataset is included.
