"""Render the Imprest logo (black rounded square, three white bars) to favicon.ico and
apple-icon.png for the web app. Same geometry as web/src/app/icon.svg (24-unit grid).

    python -I scripts/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "web" / "src" / "app"
BLACK = (22, 24, 28, 255)
WHITE = (255, 255, 255, 255)


def logo(size: int, pad: float = 0.0) -> Image.Image:
    ss = 8  # supersample for smooth edges
    s = size * ss
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = s / 24
    o = pad * s
    d.rounded_rectangle([o, o, s - o, s - o], radius=5 * u * (1 - 2 * pad), fill=BLACK)
    w = 2 * u * (1 - 2 * pad)

    def bar(x, y0, y1):
        x = o + x * u * (1 - 2 * pad)
        y0 = o + y0 * u * (1 - 2 * pad)
        y1 = o + y1 * u * (1 - 2 * pad)
        d.rounded_rectangle([x - w / 2, y0 - w / 2, x + w / 2, y1 + w / 2], radius=w / 2, fill=WHITE)

    bar(7, 7.5, 16.5)
    bar(12, 10, 16.5)
    bar(17, 12.5, 16.5)
    return img.resize((size, size), Image.LANCZOS)


base = logo(256)
base.save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
# Apple touch icon: opaque background, no transparency.
apple = Image.new("RGBA", (180, 180), BLACK)
apple.alpha_composite(logo(180))
apple.convert("RGB").save(APP / "apple-icon.png")
print("wrote", APP / "favicon.ico", APP / "apple-icon.png")
