#!/usr/bin/env python3
"""Generate Better Home favicon PNG/ICO from BH icon geometry (better_home_logo.svg)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Icon line segments from better_home_logo.svg (viewBox 0 0 800 800)
LINES = [
    (250, 180, 250, 620),
    (250, 180, 380, 100),
    (380, 100, 380, 300),
    (250, 400, 380, 300),
    (250, 400, 380, 500),
    (380, 500, 380, 700),
    (500, 120, 500, 700),
    (500, 420, 250, 420),
]

ICON_MIN_X, ICON_MIN_Y = 250, 100
ICON_MAX_X, ICON_MAX_Y = 500, 700
ICON_W = ICON_MAX_X - ICON_MIN_X
ICON_H = ICON_MAX_Y - ICON_MIN_Y

BG = (15, 17, 21)  # #0f1115 brand charcoal
GOLD = (198, 165, 94)  # #c6a55e brand amber


def render_icon(size: int, padding_ratio: float = 0.14, stroke_scale: float = 1.0) -> Image.Image:
    img = Image.new("RGBA", (size, size), (*BG, 255))
    draw = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    inner = size - 2 * pad
    scale = min(inner / ICON_W, inner / ICON_H)

    def tx(x: float) -> float:
        return pad + (x - ICON_MIN_X) * scale

    def ty(y: float) -> float:
        return pad + (y - ICON_MIN_Y) * scale

    # Thicker strokes at small sizes for legibility
    stroke = max(1.5, (22 * scale / (800 / size)) * stroke_scale)
    if size <= 16:
        stroke = max(2.0, stroke * 1.35)
    elif size <= 32:
        stroke = max(2.25, stroke * 1.15)

    for x1, y1, x2, y2 in LINES:
        draw.line(
            (tx(x1), ty(y1), tx(x2), ty(y2)),
            fill=GOLD,
            width=int(round(stroke)),
        )
    return img


def main() -> None:
    public = Path(__file__).resolve().parents[1] / "public"
    public.mkdir(parents=True, exist_ok=True)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
    }
    images: dict[int, Image.Image] = {}
    for name, px in sizes.items():
        im = render_icon(px)
        im.save(public / name, optimize=True)
        images[px] = im
        print(f"wrote {name} ({px}x{px})")

    # Multi-resolution ICO for legacy browsers
    ico_path = public / "favicon.ico"
    images[16].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32)],
        append_images=[images[32]],
    )
    print(f"wrote favicon.ico")


if __name__ == "__main__":
    main()
