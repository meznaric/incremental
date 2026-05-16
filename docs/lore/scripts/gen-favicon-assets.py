#!/usr/bin/env python3
"""
Generate favicon / PWA / share assets from the canonical echo glyph.

Outputs (written to repo root):
    apple-touch-icon.png   180x180   iOS home screen
    icon-192.png           192x192   Android PWA
    icon-512.png           512x512   Android PWA (large)
    icon-512-maskable.png  512x512   Android adaptive (safe zone padded)
    og-image.png          1200x630   Open Graph / Twitter Card share image

The favicon itself is hand-authored SVG at ./favicon.svg — it's small enough
that maintaining the markup directly beats round-tripping through a rasterizer.

Run from repo root:
    python3 docs/lore/scripts/gen-favicon-assets.py
"""
from __future__ import annotations
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
ECHO_GLYPH = ROOT / "docs" / "lore" / "images" / "echo-glyph.png"

BG = (10, 10, 20)          # #0a0a14 — game canvas background
BG_DEEP = (13, 18, 40)     # #0d1228 — slightly lifted, for gradient
WARM = (212, 154, 85)      # #d49a55 — the currency / tungsten accent
COOL = (138, 160, 200)     # #8aa0c8 — steel-blue
INK = (232, 232, 240)      # #e8e8f0 — body text
DIM = (138, 138, 192)      # #8a8ac0 — muted label


def make_glyph(size: int, *, padding: float = 0.0, bg=None, rounded: int = 0) -> Image.Image:
    """Vector-style draw of the echo glyph.

    padding: fraction of size reserved as transparent border (maskable safe zone).
    bg: fill the (rounded) tile behind the glyph. None = transparent.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if bg is not None:
        if rounded > 0:
            draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=rounded, fill=bg)
        else:
            draw.rectangle((0, 0, size - 1, size - 1), fill=bg)

    inner = size * (1 - 2 * padding)
    cx = cy = size / 2
    # Two pairs of arcs (outer + inner) opening outward from a vertical axis.
    # Outer pair: large, warm, dominant. Inner pair: tight, mirrored.
    outer_r = inner * 0.32
    inner_r = inner * 0.11
    sw_outer = max(2, int(inner * 0.085))
    sw_inner = max(2, int(inner * 0.075))

    def arc(side: int, r: float, sw: int, color):
        # side = -1 (left arc, opens right) or +1 (right arc, opens left).
        # Each arc spans ~140°, leaving a visible vertical gap at top and bottom
        # so the pair reads as "signal waves" rather than a closed circle.
        bbox = (cx - r, cy - r, cx + r, cy + r)
        if side < 0:
            draw.arc(bbox, start=110, end=250, fill=color, width=sw)
        else:
            draw.arc(bbox, start=290, end=70, fill=color, width=sw)

    arc(-1, outer_r, sw_outer, WARM)
    arc(+1, outer_r, sw_outer, WARM)
    arc(-1, inner_r, sw_inner, WARM)
    arc(+1, inner_r, sw_inner, WARM)
    return img


def gradient(size_w: int, size_h: int) -> Image.Image:
    """Vertical dark gradient #0a0a14 → #0d1228."""
    img = Image.new("RGB", (size_w, size_h), BG)
    px = img.load()
    for y in range(size_h):
        t = y / max(1, size_h - 1)
        r = int(BG[0] + (BG_DEEP[0] - BG[0]) * t)
        g = int(BG[1] + (BG_DEEP[1] - BG[1]) * t)
        b = int(BG[2] + (BG_DEEP[2] - BG[2]) * t)
        for x in range(size_w):
            px[x, y] = (r, g, b)
    return img


def starfield(img: Image.Image, count: int = 220) -> None:
    """Faint, deterministic starfield overlay."""
    import random
    rng = random.Random(7)  # deterministic
    draw = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    for _ in range(count):
        x = rng.randint(0, w - 1)
        y = rng.randint(0, h - 1)
        a = rng.choice([18, 28, 40, 60, 90])
        r = rng.choice([0, 0, 0, 1])
        if r == 0:
            draw.point((x, y), fill=(220, 230, 250, a))
        else:
            draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(220, 230, 250, a))


def find_font(*names, size: int) -> ImageFont.FreeTypeFont:
    """Try a list of likely fonts on macOS, fall back to default."""
    for name in names:
        for ext in ("", ".ttf", ".ttc", ".otf"):
            try:
                return ImageFont.truetype(name + ext, size=size)
            except OSError:
                continue
        # Also try common macOS font dirs
        for d in ("/System/Library/Fonts/", "/Library/Fonts/", "/System/Library/Fonts/Supplemental/"):
            for ext in (".ttf", ".ttc", ".otf"):
                p = Path(d) / (name + ext)
                if p.exists():
                    try:
                        return ImageFont.truetype(str(p), size=size)
                    except OSError:
                        continue
    return ImageFont.load_default()


def write_apple_touch():
    out = ROOT / "apple-touch-icon.png"
    # iOS clips to a rounded rect on its own — fill the tile fully.
    img = make_glyph(180, padding=0.0, bg=BG, rounded=0)
    img.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)}")


def write_pwa_icons():
    for size in (192, 512):
        out = ROOT / f"icon-{size}.png"
        img = make_glyph(size, padding=0.06, bg=BG, rounded=int(size * 0.18))
        img.save(out, optimize=True)
        print(f"wrote {out.relative_to(ROOT)}")
    # Maskable: ~20% safe-zone padding; full-bleed background so Android can
    # crop to any shape (circle, squircle, rounded square) without clipping art.
    out = ROOT / "icon-512-maskable.png"
    img = make_glyph(512, padding=0.18, bg=BG, rounded=0)
    img.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)}")


def write_og_image():
    W, H = 1200, 630
    img = gradient(W, H).convert("RGBA")
    starfield(img, count=260)

    # Hero glyph on the left third.
    glyph_size = 420
    glyph = make_glyph(glyph_size, padding=0.05, bg=None)
    # Soft glow halo behind the glyph.
    halo = Image.new("RGBA", (glyph_size, glyph_size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(halo)
    cx = cy = glyph_size // 2
    hdraw.ellipse(
        (cx - 170, cy - 170, cx + 170, cy + 170),
        fill=(212, 154, 85, 38),
    )
    halo = halo.filter(ImageFilter.GaussianBlur(40))
    gx = 110
    gy = (H - glyph_size) // 2
    img.alpha_composite(halo, (gx, gy))
    img.alpha_composite(glyph, (gx, gy))

    # Text block on the right.
    draw = ImageDraw.Draw(img)
    title_font = find_font(
        "HelveticaNeue", "Helvetica", "Arial", "DejaVuSans-Bold", size=68,
    )
    sub_font = find_font(
        "HelveticaNeue-Thin", "HelveticaNeue", "Helvetica", "Arial", "DejaVuSans", size=28,
    )
    tag_font = find_font(
        "HelveticaNeue", "Helvetica", "Arial", "DejaVuSans", size=20,
    )

    tx = 560
    draw.text((tx, 200), "AN IDLE COMPANION TO", font=tag_font, fill=DIM)
    draw.text((tx, 232), "ECHOES BEYOND", font=title_font, fill=INK)
    draw.text((tx, 304), "THE STARS", font=title_font, fill=INK)
    draw.text((tx, 392), "The dark was never silent.", font=sub_font, fill=WARM)

    out = ROOT / "og-image.png"
    img.convert("RGB").save(out, optimize=True, quality=92)
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    write_apple_touch()
    write_pwa_icons()
    write_og_image()
