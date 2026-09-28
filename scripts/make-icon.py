#!/usr/bin/env python3
"""Generates build/icon.png — the 1024x1024 source electron-builder turns
into the .icns / .ico / hicolor set at package time.

Same plate as the desktop app's icon (the brand's warm near-black, rounded
macOS grid) so the two sit together in a Dock as siblings; the mark is a
text cursor between angle brackets — an editor, drawn literally — in the
brand blues. Rendered at 4x and downsampled so the edges stay clean.

Run from the repo root:  python3 scripts/make-icon.py
Requires Pillow:         pip3 install pillow
"""

from PIL import Image, ImageDraw
import pathlib

SCALE = 4
SIZE = 1024 * SCALE

MARGIN = 100 * SCALE
RADIUS = 232 * SCALE

BG_TOP = (43, 35, 32)        # a touch above --brand-dark
BG_BOTTOM = (16, 12, 11)     # --brand-dark-hover
BRACKET = (244, 241, 239)    # off-white
CURSOR_LIGHT = (96, 165, 250)  # --app-brand
CURSOR_STRONG = (37, 99, 235)  # --app-brand-strong

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

plate = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(plate).rounded_rectangle(
    [MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN], radius=RADIUS, fill=255
)
gradient = Image.new("RGBA", (SIZE, SIZE))
for y in range(SIZE):
    t = y / SIZE
    color = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)) + (255,)
    ImageDraw.Draw(gradient).line([(0, y), (SIZE, y)], fill=color)
img.paste(gradient, (0, 0), plate)

cx = cy = SIZE // 2
stroke = 64 * SCALE
arm = 150 * SCALE      # half-height of a bracket
depth = 120 * SCALE    # how far a bracket's point reaches inward
gap = 210 * SCALE      # distance from centre to each bracket's point


def bracket(direction):
    """A chevron: direction -1 opens left (<), +1 opens right (>)."""
    tip_x = cx + direction * gap
    back_x = tip_x - direction * depth
    pts = [(back_x, cy - arm), (tip_x, cy), (back_x, cy + arm)]
    draw.line(pts, fill=BRACKET, width=stroke, joint="curve")
    for p in pts:
        draw.ellipse([p[0] - stroke // 2, p[1] - stroke // 2,
                      p[0] + stroke // 2, p[1] + stroke // 2], fill=BRACKET)


bracket(-1)
bracket(+1)

# The cursor: a tall bar with serifs, in a two-tone blue.
bar_w = 44 * SCALE
bar_h = 300 * SCALE
serif_w = 110 * SCALE
serif_h = 40 * SCALE
draw.rounded_rectangle([cx - bar_w // 2, cy - bar_h // 2, cx + bar_w // 2, cy + bar_h // 2],
                       radius=bar_w // 2, fill=CURSOR_LIGHT)
for sy in (cy - bar_h // 2, cy + bar_h // 2 - serif_h):
    draw.rounded_rectangle([cx - serif_w // 2, sy, cx + serif_w // 2, sy + serif_h],
                           radius=serif_h // 2, fill=CURSOR_STRONG)

out = pathlib.Path(__file__).resolve().parent.parent / "build" / "icon.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.resize((1024, 1024), Image.LANCZOS).save(out)
print(f"wrote {out}")
