# Synthetic evidence fixtures

All files in this directory are fictional demonstration artifacts. The PDF pair
is inspired by the structure of paper tax invoices and carrier goods receipts,
not copied business records. No real contact, bank, tax, signature, QR or vehicle
data is included.

- `synthetic-invoice-shortage.pdf`: INV-200, shipment SHP-101, LR-501, 20 cartons
  billed with a separate 18-carton receipt claim. Tax is explicitly illustrative,
  not calculated by TradeLoop's ordering workflow.
- `synthetic-bilty-pod-shortage.pdf`: matching fictional GR/POD with 20 booked,
  18 reported received and 2 reported short. It is unsigned and has no legal or
  payment validity.
- Existing PNG fixtures exercise printed evidence reading and shortage review.

Recreate the PDFs with `python3 scripts/make-demo-documents.py` (ReportLab is
required). They are single-page PDFs well below the application's 4 MB limit.

For a demo, send a labelled shortage complaint from the authorized WhatsApp
test customer, then attach the fictional POD to that single open case. Confirm
the document is stored privately, text is extracted, and the case moves to staff
review. Uploading evidence must not accept POD, issue credit, or authorize freight
payment. Keep all original source scans and their extracted details outside Git.
