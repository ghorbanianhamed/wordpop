"""Make the Google Play feature graphic (1024 x 500) in docs/google-play/.

Requires Pillow. Uses the Inter font if installed (pass another .ttf/.otf with --font).
    python scripts/make_play_assets.py
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "google-play"
AMBER, BROWN, INK, CREAM = (255, 201, 41), (110, 62, 0), (59, 35, 0), (255, 247, 224)
FONTS = ["/usr/share/fonts/opentype/inter/Inter-Bold.otf", "C:/Windows/Fonts/segoeuib.ttf", "DejaVuSans-Bold.ttf"]


def font(size: int, path: str | None) -> ImageFont.FreeTypeFont:
    for candidate in ([path] if path else []) + FONTS:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def feature_graphic(font_path: str | None) -> Image.Image:
    img = Image.new("RGB", (1024, 500), AMBER)
    d = ImageDraw.Draw(img)
    # The full-square (maskable) icon has the same amber background, so it blends in seamlessly.
    icon = Image.open(ROOT / "frontend" / "icons" / "icon-maskable-512.png").convert("RGB").resize((300, 300))
    img.paste(icon, (45, 100))
    d.text((370, 120), "WordPop", font=font(96, font_path), fill=INK)
    d.text((374, 240), "Remember anything you want –", font=font(34, font_path), fill=BROWN)
    d.text((374, 284), "until you know it by heart", font=font(34, font_path), fill=BROWN)
    x = 374
    for chip in ("words", "phrases", "quotes", "formulas"):
        w = d.textlength(chip, font=font(26, font_path)) + 36
        d.rounded_rectangle([x, 352, x + w, 400], radius=24, fill=CREAM)
        d.text((x + 18, 362), chip, font=font(26, font_path), fill=INK)
        x += w + 12
    return img


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", help="path to a bold .ttf/.otf font")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    feature_graphic(args.font).save(OUT / "feature-graphic.png", optimize=True)
    Image.open(ROOT / "frontend" / "icons" / "icon-512.png").convert("RGB").save(OUT / "app-icon-512.png")
    print("Written to", OUT)


if __name__ == "__main__":
    main()
