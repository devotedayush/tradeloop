"""Create fictional single-page fixtures matching the seeded TradeLoop shipment.

Only document structure is inspired by paper invoice/GR workflows. No source
customer, bank, tax, signature, QR, phone, or vehicle data is reproduced.
"""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "demo-data"
OUT.mkdir(exist_ok=True)
WIDTH, HEIGHT = A4
INK = colors.HexColor("#122C33")
MUTED = colors.HexColor("#52656A")
TEAL = colors.HexColor("#007B70")


def base(filename, title, subtitle):
    c = canvas.Canvas(str(OUT / filename), pagesize=A4)
    c.setTitle(title + " - SYNTHETIC DEMO")
    c.setAuthor("TradeLoop demo fixture generator")
    c.setFillColor(colors.HexColor("#FFF1ED"))
    c.rect(0, HEIGHT - 40, WIDTH, 40, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#9D361D"))
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(WIDTH / 2, HEIGHT - 25, "SYNTHETIC DEMO - NOT A LEGAL OR PAYMENT DOCUMENT")
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(42, HEIGHT - 78, "TRADELOOP / DEMO FOODS DISTRIBUTION")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 27)
    c.drawString(42, HEIGHT - 115, title)
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(42, HEIGHT - 136, subtitle)
    c.setStrokeColor(colors.HexColor("#D8E2E3"))
    c.line(42, HEIGHT - 155, WIDTH - 42, HEIGHT - 155)
    return c


def text(c, x, y, label, value):
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(x, y, label)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y - 18, value)


def footer(c):
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(42, 55, "Fictional training artifact. No real tax ID, bank account, contact, vehicle or signature.")
    c.drawString(42, 42, "Use for document extraction and staff review only. Uploading does not accept POD or approve a remedy.")
    c.showPage()
    c.save()


c = base("synthetic-invoice-shortage.pdf", "Sample tax invoice", "Printed invoice with a separate demonstration receipt annotation")
text(c, 42, 650, "Invoice number", "INV-200")
text(c, 225, 650, "Invoice date", "14 October 2026")
text(c, 410, 650, "Shipment", "SHP-101")
text(c, 42, 594, "Buyer", "Sunrise Cafe")
text(c, 225, 594, "Destination", "Lucknow (fictional outlet)")
text(c, 410, 594, "LR / GR reference", "LR-501")
c.setFillColor(TEAL)
c.rect(42, 510, WIDTH - 84, 30, fill=1, stroke=0)
c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 9)
for x, label in [(52, "Description / pack"), (300, "Quantity"), (380, "Rate INR"), (465, "Amount INR")]:
    c.drawString(x, 521, label)
c.setFillColor(INK)
c.setFont("Helvetica", 11)
c.drawString(52, 486, "Tomato pizza sauce / 6 x 1 kg")
c.drawString(300, 486, "20 cartons")
c.drawRightString(433, 486, "1,680.00")
c.drawRightString(543, 486, "33,600.00")
c.setStrokeColor(colors.HexColor("#D8E2E3"))
c.line(42, 465, WIDTH - 42, 465)
for y, label, value in [(434, "Taxable value", "33,600.00"), (412, "Illustrative GST 5%", "1,680.00"), (384, "Sample invoice total INR", "35,280.00")]:
    c.setFont("Helvetica-Bold" if y == 384 else "Helvetica", 11)
    c.drawString(300, y, label)
    c.drawRightString(543, y, value)
c.setFillColor(colors.HexColor("#EDF7F5"))
c.roundRect(42, 200, WIDTH - 84, 130, 8, fill=1, stroke=0)
c.setFillColor(TEAL)
c.setFont("Helvetica-Bold", 12)
c.drawString(58, 305, "DEMO RECEIPT ANNOTATION")
c.setFillColor(INK)
c.setFont("Helvetica", 12)
c.drawString(58, 279, "Reported received: 18 cartons")
c.drawString(58, 257, "Reported shortage: 2 cartons out of 20 cartons")
c.setFont("Helvetica-Oblique", 10)
c.drawString(58, 229, "Customer claim only. Staff must compare shipment and carrier evidence.")
c.setFont("Helvetica", 10)
c.drawString(42, 163, "Acknowledgement: unsigned synthetic sample. Not proof of an accepted shortage.")
footer(c)

c = base("synthetic-bilty-pod-shortage.pdf", "Sample goods receipt / POD", "Transport receipt with explicit booking and reported delivery quantities")
text(c, 42, 650, "GR / LR number", "LR-501")
text(c, 225, 650, "Invoice number", "INV-200")
text(c, 410, 650, "Shipment", "SHP-101")
text(c, 42, 594, "Carrier", "Demo Transport")
text(c, 225, 594, "Consignee", "Sunrise Cafe")
text(c, 410, 594, "Destination", "Lucknow")
text(c, 42, 538, "Dispatch date", "24 October 2026")
text(c, 225, 538, "Receipt date", "26 October 2026")
text(c, 410, 538, "Vehicle reference", "DEMO-TRUCK-01")
c.setFillColor(colors.HexColor("#EDF7F5"))
c.roundRect(42, 342, WIDTH - 84, 135, 8, fill=1, stroke=0)
text(c, 58, 450, "Booked quantity", "20 cartons")
text(c, 235, 450, "Reported received", "18 cartons")
text(c, 425, 450, "Reported shortage", "2 cartons")
c.setFillColor(INK)
c.setFont("Helvetica", 11)
c.drawString(58, 386, "Goods: Tomato pizza sauce, 6 x 1 kg per carton")
c.setFont("Helvetica-Oblique", 10)
c.drawString(58, 364, "DEMO NOTE: Two cartons reported short; request dispatch verification.")
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 12)
c.drawString(42, 294, "Review before accepting delivery evidence")
c.setFont("Helvetica", 11)
for y, line in [(266, "1. Match invoice INV-200, LR-501 and shipment SHP-101."), (244, "2. Compare the 20 booked cartons with 18 reported cartons."), (222, "3. Check the original receipt and obtain authorized staff review."), (200, "4. Keep the case open until an approved action is completed.")]:
    c.drawString(42, y, line)
c.setStrokeColor(colors.HexColor("#D8E2E3"))
c.rect(42, 106, WIDTH - 84, 62, fill=0, stroke=1)
c.setFont("Helvetica-Bold", 10)
c.drawString(56, 145, "UNSIGNED SYNTHETIC ACKNOWLEDGEMENT")
c.setFont("Helvetica", 9)
c.drawString(56, 125, "No real signature, receiver stamp or freight authorization is represented.")
footer(c)
print("Created 2 synthetic single-page PDF fixtures in demo-data/.")
