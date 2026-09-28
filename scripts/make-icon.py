#!/usr/bin/env python3
"""Generates build/icon.png — the 1024x1024 source electron-builder turns
into the .icns / .ico / hicolor set at package time.

The mark is the Configure My AI avatar (shared/_cfa_avatar in the main
repository: the brand-blue squircle with a face, the circuit-board mark
faintly behind it) holding a notepad — an editor, drawn as the character
everyone already knows from the site. The avatar's geometry is copied from
its stylesheet, as fractions of the plate, so the two match.

Run from the repo root:  python3 scripts/make-icon.py
Requires Pillow, and cairosvg for the circuit mark (build/mark.svg — the
brand mark's paths, copied from BrandHelper::MARK_PATHS). Without cairosvg
the icon still renders, without the faint mark.
"""

from PIL import Image, ImageDraw, ImageFilter
import io
import pathlib

SCALE = 4
SIZE = 1024 * SCALE

# macOS icon grid: the plate sits inside a ~100pt margin.
MARGIN = 100 * SCALE
PLATE = SIZE - 2 * MARGIN

# ── The avatar's palette (shared/_cfa_avatar_styles: everything mixed from
# the brand blue) ────────────────────────────────────────────────────────
BRAND = (37, 99, 235)                          # --app-brand
SKIN_1 = tuple(round(c * .82 + 255 * .18) for c in BRAND)   # lit side
SKIN_2 = BRAND                                             # body
SKIN_3 = tuple(round(c * .74) for c in BRAND)              # shade
FEATURE = (255, 255, 255)
INK = (35, 29, 27)                             # --brand-dark
PAPER = (247, 245, 244)                        # --app-body (light)
RULE = (196, 206, 235)                         # ruled lines, a pale brand blue
MARGIN_RULE = (232, 141, 141)                  # the red margin line


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ── The orb: a squircle (the avatar's 42% radius, squared off a little
# toward the app-icon grid), lit from the top-left, shaded at the chin ────
orb = Image.new("RGBA", (PLATE, PLATE))
od = ImageDraw.Draw(orb)
# Diagonal body gradient (155deg): skin-2 at the top-left to skin-3 bottom-right.
for y in range(PLATE):
    t = y / PLATE
    od.line([(0, y), (PLATE, y)], fill=lerp(SKIN_2, SKIN_3, t * 0.85) + (255,))
# The highlight: a radial bloom at 30% 18%.
hl = Image.new("L", (PLATE, PLATE), 0)
hd = ImageDraw.Draw(hl)
cx, cy = int(PLATE * .30), int(PLATE * .18)
for r in range(int(PLATE * .62), 0, -8 * SCALE):
    a = int(255 * (1 - r / (PLATE * .62)) ** 1.6)
    hd.ellipse([cx - r * 1.2, cy - r, cx + r * 1.2, cy + r], fill=a)
hl = hl.filter(ImageFilter.GaussianBlur(PLATE * .04))
lit = Image.new("RGBA", (PLATE, PLATE), SKIN_1 + (255,))
orb = Image.composite(lit, orb, hl)
# Inset shadow at the bottom (box-shadow: inset 0 -6% 12%).
sh = Image.new("L", (PLATE, PLATE), 0)
ImageDraw.Draw(sh).rectangle([0, int(PLATE * .80), PLATE, PLATE], fill=110)
sh = sh.filter(ImageFilter.GaussianBlur(PLATE * .07))
dark = Image.new("RGBA", (PLATE, PLATE), (0, 0, 0, 255))
orb = Image.composite(dark, orb, sh.point(lambda v: v * .5))

# The circuit mark behind the face: white at 28%, sat 6% high and faded
# toward the chin (inset 2% 8% 14%; mask to 30% at the bottom).
mark_svg = pathlib.Path(__file__).resolve().parent.parent / "build" / "mark.svg"
try:
    import cairosvg
    inset_l, inset_t, inset_b = PLATE * .08, PLATE * .02, PLATE * .14
    box_h = PLATE - inset_t - inset_b
    box_w = PLATE - 2 * inset_l
    png = cairosvg.svg2png(url=str(mark_svg), output_height=int(box_h))
    mark = Image.open(io.BytesIO(png)).convert("RGBA")
    if mark.width > box_w:
        mark = mark.resize((int(box_w), int(mark.height * box_w / mark.width)), Image.LANCZOS)
    alpha = mark.getchannel("A")
    fade = Image.new("L", mark.size, 0)
    fd = ImageDraw.Draw(fade)
    for y in range(mark.height):
        t = y / mark.height
        v = 255 if t < .52 else int(255 * (1 - (t - .52) / .48 * .7))
        fd.line([(0, y), (mark.width, y)], fill=v)
    alpha = Image.composite(alpha, Image.new("L", mark.size, 0), fade).point(lambda v: int(v * .28))
    mark.putalpha(alpha)
    mx = int((PLATE - mark.width) / 2)
    my = int(inset_t + (box_h - mark.height) / 2)
    orb.alpha_composite(mark, (mx, my))
except Exception as e:  # noqa: BLE001 — the mark is decorative
    print(f"note: circuit mark skipped ({e.__class__.__name__}: {e})")

# The rim light (inset 0 0 0 1px white 26%), drawn as a thin ring.
orb_radius = int(PLATE * .36)
rim = Image.new("RGBA", (PLATE, PLATE), (0, 0, 0, 0))
ImageDraw.Draw(rim).rounded_rectangle([0, 0, PLATE - 1, PLATE - 1], radius=orb_radius,
                                      outline=(255, 255, 255, 66), width=3 * SCALE)
orb.alpha_composite(rim)

# Clip to the squircle.
orb.putalpha(Image.composite(orb.getchannel("A"), Image.new("L", (PLATE, PLATE), 0),
                             rounded_mask((PLATE, PLATE), orb_radius)))

# ── The face. Fractions of --cfa-size, from the stylesheet; nudged up and
# left so the character looks toward the notepad it holds ──────────────
face = ImageDraw.Draw(orb)
S = PLATE
eye_w, eye_h, eye_gap = S * .13, S * .21, S * .17
mouth_w, mouth_h, stack_gap = S * .18, S * .055, S * .085
fcx, fcy = S * (.5 - .06), S * (.5 - .05)
stack_h = eye_h + stack_gap + mouth_h
eye_top = fcy - stack_h / 2
for side in (-1, 1):
    ex = fcx + side * (eye_gap / 2 + eye_w / 2)
    box = [ex - eye_w / 2, eye_top, ex + eye_w / 2, eye_top + eye_h]
    # A soft glow behind each eye (box-shadow 0 0 7% feature at 55%).
    glow = Image.new("RGBA", (PLATE, PLATE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=int(eye_w * .46), fill=FEATURE + (120,))
    orb.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * .03)))
    face.rounded_rectangle(box, radius=int(eye_w * .46), fill=FEATURE + (255,))
    # The iris: top 18%, left 22%, 34% x 26% of the eye, the shade colour at ~40%.
    ix, iy = box[0] + eye_w * .22, box[1] + eye_h * .18
    face.ellipse([ix, iy, ix + eye_w * .34, iy + eye_h * .26], fill=lerp(FEATURE, SKIN_3, .42) + (255,))
mouth_top = eye_top + eye_h + stack_gap
face.rounded_rectangle([fcx - mouth_w / 2, mouth_top, fcx + mouth_w / 2, mouth_top + mouth_h],
                       radius=int(mouth_h / 2), fill=FEATURE + (230,))

img.alpha_composite(orb, (MARGIN, MARGIN))

# ── The notepad, held at the bottom-right: paper with a spiral binding,
# ruled lines and a margin line ──────────────────────────────────────────
pad_w = int(PLATE * .40)
pad_h = int(pad_w * 1.12)
pad_r = int(pad_w * .11)
pad_x = MARGIN + PLATE - pad_w - int(PLATE * .045)
pad_y = MARGIN + PLATE - pad_h - int(PLATE * .045)

# A soft shadow under it, so it sits on the orb rather than in it.
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([pad_x + 6 * SCALE, pad_y + 14 * SCALE, pad_x + pad_w + 6 * SCALE, pad_y + pad_h + 14 * SCALE],
                                         radius=pad_r, fill=(0, 0, 0, 120))
img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10 * SCALE)))

pad = Image.new("RGBA", (pad_w, pad_h), (0, 0, 0, 0))
pd = ImageDraw.Draw(pad)
pd.rounded_rectangle([0, 0, pad_w - 1, pad_h - 1], radius=pad_r, fill=PAPER + (255,))
# The binding strip across the top, in the brand's warm dark.
strip_h = int(pad_h * .16)
pd.rounded_rectangle([0, 0, pad_w - 1, strip_h + pad_r], radius=pad_r, fill=INK + (255,))
pd.rectangle([0, strip_h, pad_w - 1, strip_h + pad_r], fill=PAPER + (255,))
# Spiral rings: pale loops over the strip, each with a hole below it.
rings = 5
ring_w = int(pad_w * .075)
ring_h = int(strip_h * .78)
for i in range(rings):
    rcx = int(pad_w * (0.14 + i * 0.18))
    pd.rounded_rectangle([rcx - ring_w / 2, strip_h * .22, rcx + ring_w / 2, strip_h * .22 + ring_h],
                         radius=ring_w // 2, outline=PAPER + (255,), width=int(ring_w * .34))
    hole_r = int(ring_w * .28)
    pd.ellipse([rcx - hole_r, strip_h + int(pad_h * .045) - hole_r, rcx + hole_r, strip_h + int(pad_h * .045) + hole_r],
               fill=lerp(PAPER, INK, .35) + (255,))
# Ruled lines, and the red margin line down the left.
line_x0, line_x1 = int(pad_w * .16), int(pad_w * .86)
first = strip_h + int(pad_h * .20)
step = int(pad_h * .155)
lw = max(2, int(pad_h * .022))
for i in range(4):
    y = first + i * step
    pd.line([(line_x0, y), (line_x1, y)], fill=RULE + (255,), width=lw)
pd.line([(int(pad_w * .12), strip_h + int(pad_h * .10)), (int(pad_w * .12), pad_h - int(pad_h * .06))],
        fill=MARGIN_RULE + (255,), width=lw)
# A hairline edge so the paper reads against the orb's lit side too.
pd.rounded_rectangle([0, 0, pad_w - 1, pad_h - 1], radius=pad_r, outline=INK + (70,), width=2 * SCALE)
img.alpha_composite(pad, (pad_x, pad_y))

out = pathlib.Path(__file__).resolve().parent.parent / "build" / "icon.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.resize((1024, 1024), Image.LANCZOS).save(out)
print(f"wrote {out}")
