"""Create conspicuously synthetic delivery evidence for manual and OCR tests."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
out = Path(__file__).resolve().parents[1] / 'demo-data'
out.mkdir(exist_ok=True)
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
def font(size):
    try: return ImageFont.truetype(font_path, size)
    except OSError: return ImageFont.load_default(size=size)
for suffix, received in [('shortage', 18), ('matching', 20)]:
    im = Image.new('RGB', (1200, 1500), '#ffffff')
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1200, 160), fill='#173e33')
    d.text((65, 45), 'SYNTHETIC DEMO - NOT A REAL POD', font=font(42), fill='white')
    d.text((65, 220), 'DELIVERY RECEIPT', font=font(55), fill='#173e33')
    lines = [('Business', 'Demo Foods Distribution'), ('Shipment reference', 'SHP-101'), ('Invoice reference', 'INV-200'), ('Carrier reference', 'LR-501'), ('Receiving business', 'Sunrise Cafe'), ('Product', 'Tomato pizza sauce'), ('Pack', '6 x 1 kg per carton'), ('Expected quantity', '20 cartons'), ('Received quantity', f'{received} cartons'), ('Discrepancy', '2 cartons short' if received == 18 else 'None recorded')]
    y = 350
    for label, value in lines:
        d.text((65, y), label, font=font(25), fill='#73816b')
        d.text((440, y), value, font=font(27), fill='#203e2d')
        d.line((65, y+50, 1135, y+50), fill='#e4e9df', width=2)
        y += 78
    d.text((65, 1220), 'Fictional evidence for prototype evaluation only.', font=font(28), fill='#a46b40')
    d.text((65, 1280), 'No real recipient signature or delivery acceptance.', font=font(28), fill='#a46b40')
    im.save(out / f'synthetic-pod-{suffix}.png')
print('Created two labelled synthetic PNG documents in demo-data/')
