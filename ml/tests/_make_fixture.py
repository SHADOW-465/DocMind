"""Generate tests/fixtures/sample-2page.pdf — run once, commit the PDF."""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pathlib import Path

out = Path(__file__).parent / "fixtures" / "sample-2page.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=letter)

page1 = [
    "Photosynthesis converts light energy into chemical energy in plants.",
    "Chlorophyll in the chloroplasts absorbs mostly red and blue light.",
    "The light reactions produce ATP and NADPH on the thylakoid membrane.",
    "The Calvin cycle then fixes carbon dioxide into glucose using that ATP.",
    "Water is split during the light reactions, releasing oxygen as a byproduct.",
]
page2 = [
    "Cellular respiration releases the energy stored in glucose molecules.",
    "Glycolysis breaks glucose into two pyruvate molecules in the cytoplasm.",
    "The citric acid cycle occurs in the mitochondrial matrix.",
    "Oxidative phosphorylation generates most of the cell's ATP.",
    "Oxygen acts as the final electron acceptor in the electron transport chain.",
]
y = 720
for line in page1:
    c.drawString(72, y, line); y -= 24
c.showPage()
y = 720
for line in page2:
    c.drawString(72, y, line); y -= 24
c.showPage()
c.save()
print("wrote", out)
