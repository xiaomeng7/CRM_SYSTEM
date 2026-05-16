#!/usr/bin/env python3
"""Generate favicon PNG / ICO from the House+B master crop (favicon-source-house-b.png)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

SOURCE_NAME = "favicon-source-house-b.png"


def load_master(public: Path) -> Image.Image:
    path = public / SOURCE_NAME
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path.name}; add the 300×300 House+B crop from the brand favicon sheet."
        )
    return Image.open(path).convert("RGBA")


def render_size(src: Image.Image, size: int) -> Image.Image:
    """High-quality downscale + light sharpening so 16×16 stays readable."""
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 24:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.4, percent=150, threshold=1))
        # Lift gold slightly on tiny sizes (tabs / bookmarks)
        px = im.load()
        for y in range(size):
            for x in range(size):
                r, g, b, a = px[x, y]
                if a < 8:
                    continue
                if r > 120 and g > 90 and b < 140 and r > b + 25:
                    px[x, y] = (
                        min(255, int(r * 1.08)),
                        min(255, int(g * 1.06)),
                        min(255, int(b * 1.02)),
                        a,
                    )
    return im


def main() -> None:
    public = Path(__file__).resolve().parents[1] / "public"
    public.mkdir(parents=True, exist_ok=True)
    master = load_master(public)

    targets = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
    }
    images: dict[int, Image.Image] = {}
    for name, px in targets.items():
        im = render_size(master, px).convert("RGBA")
        im.save(public / name, optimize=True)
        images[px] = im
        print(f"wrote {name} ({px}×{px})")

    ico_path = public / "favicon.ico"
    images[16].convert("RGBA").save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32)],
        append_images=[images[32].convert("RGBA")],
    )
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
