#!/usr/bin/env python3
"""
生成站点静态图片资源：收款二维码、favicon、Apple Touch Icon、社交分享图（OG）。

依赖：segno, Pillow  (pip install segno pillow)
运行：python tools/gen_assets.py
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
IMG.mkdir(parents=True, exist_ok=True)

CONFIG_TEXT = (ROOT / "assets" / "js" / "config.js").read_text(encoding="utf-8")


def _cfg_str(key: str, default: str) -> str:
    m = re.search(rf"{key}:\s*'([^']*)'", CONFIG_TEXT)
    return m.group(1) if m else default


def _cfg_num(key: str, default: float) -> float:
    m = re.search(rf"{key}:\s*([0-9.]+)", CONFIG_TEXT)
    return float(m.group(1)) if m else default


ADDRESS = _cfg_str("address", "TAvzRvSBBQyHYc9hDDxgETQfkXqh555s18")
PRICE = f"{_cfg_num('price', 0.5):g}"
ENERGY = f"{_cfg_num('energyPerUnit', 65000):,.0f}"

BG = (5, 8, 13)
MINT = (53, 224, 176)
CYAN = (65, 201, 255)
TEXT = (233, 238, 247)
MUTED = (148, 165, 190)
DARK = "#0a111d"

FONT_DIR = Path("C:/Windows/Fonts")
FONT_REG = FONT_DIR / "msyh.ttc"
FONT_BOLD = FONT_DIR / "msyhbd.ttc"
FONT_MONO = FONT_DIR / "consola.ttf"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


# ---------------------------------------------------------------- 二维码 ----
def make_qr() -> Image.Image:
    qr = segno.make_qr(ADDRESS, error="m")
    qr.save(
        IMG / "qr-pay.svg",
        scale=10,
        border=3,
        dark=DARK,
        light="#ffffff",
        xmldecl=False,
        svgclass=None,
        lineclass=None,
        omitsize=False,
    )
    qr.save(IMG / "qr-pay.png", scale=24, border=3, dark=DARK, light="#ffffff")
    return Image.open(IMG / "qr-pay.png").convert("RGB")


# ------------------------------------------------------------------ 图标 ----
def make_mark(size: int) -> Image.Image:
    """渐变方块 + 闪电图标。"""
    ss = 4  # 超采样，抗锯齿
    w = size * ss
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角底板
    r = int(w * 0.28)
    d.rounded_rectangle([0, 0, w - 1, w - 1], radius=r, fill=(10, 17, 29, 255))

    # 渐变描边
    grad = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(w):
        t = y / max(w - 1, 1)
        c = (
            int(MINT[0] + (CYAN[0] - MINT[0]) * t),
            int(MINT[1] + (CYAN[1] - MINT[1]) * t),
            int(MINT[2] + (CYAN[2] - MINT[2]) * t),
            255,
        )
        gd.line([(0, y), (w, y)], fill=c)
    mask = Image.new("L", (w, w), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, w - 1, w - 1], radius=r, outline=255, width=max(2, int(w * 0.045)))
    img.paste(grad, (0, 0), mask)

    # 闪电
    pts = [
        (0.565, 0.18),
        (0.32, 0.545),
        (0.475, 0.545),
        (0.415, 0.825),
        (0.685, 0.44),
        (0.515, 0.44),
    ]
    bolt = [(x * w, y * w) for x, y in pts]
    bolt_mask = Image.new("L", (w, w), 0)
    ImageDraw.Draw(bolt_mask).polygon(bolt, fill=255)
    img.paste(grad, (0, 0), bolt_mask)

    return img.resize((size, size), Image.LANCZOS)


def make_favicon_svg() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#35e0b0"/><stop offset="1" stop-color="#41c9ff"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="#0a111d"/>
  <rect x="0.9" y="0.9" width="30.2" height="30.2" rx="8.4" fill="none" stroke="url(#g)" stroke-opacity=".65" stroke-width="1.2"/>
  <path d="M18 5 10.4 17.6h4.9L13.8 27 22 13.2h-5.3z" fill="url(#g)"/>
</svg>
"""
    (IMG / "favicon.svg").write_text(svg, encoding="utf-8")


def make_icons() -> None:
    make_favicon_svg()
    make_mark(180).save(IMG / "apple-touch-icon.png", "PNG")
    make_mark(512).save(IMG / "icon-512.png", "PNG")


# --------------------------------------------------------------- OG 图 ----
def make_og(qr_img: Image.Image) -> None:
    W, H = 1200, 630
    base = Image.new("RGB", (W, H), BG)

    # 背景光斑
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-260, -320, 620, 320], fill=(16, 66, 56))
    gd.ellipse([820, -280, 1480, 300], fill=(12, 52, 74))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    base = Image.blend(base, glow, 0.55)

    d = ImageDraw.Draw(base)

    # 细网格
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gr = ImageDraw.Draw(grid)
    for x in range(0, W, 60):
        gr.line([(x, 0), (x, H)], fill=(255, 255, 255, 9))
    for y in range(0, H, 60):
        gr.line([(0, y), (W, y)], fill=(255, 255, 255, 9))
    base = Image.alpha_composite(base.convert("RGBA"), grid).convert("RGB")
    d = ImageDraw.Draw(base)

    # 品牌标识
    mark = make_mark(56)
    base.paste(mark, (72, 64), mark)

    f_brand = font(FONT_BOLD, 30)
    d.text((142, 78), "TRX 能量直营", font=f_brand, fill=TEXT)

    # 主标题
    f_h1 = font(FONT_BOLD, 68)
    d.text((72, 190), "TRX 能量", font=f_h1, fill=TEXT)
    d.text((72, 268), "直营按笔供货", font=f_h1, fill=MINT)

    # 副标题
    f_sub = font(FONT_REG, 26)
    d.text((74, 372), f"{ENERGY} 能量 / 笔 · 链上转账即下单", font=f_sub, fill=MUTED)

    # 地址
    f_mono = font(FONT_MONO, 22)
    d.text((74, 432), ADDRESS, font=f_mono, fill=(120, 210, 190))

    # 二维码卡片
    card = (846, 158, 1126, 438)
    d.rounded_rectangle(card, radius=24, fill=(255, 255, 255))
    qr = qr_img.copy()
    qr.thumbnail((238, 238), Image.LANCZOS)
    base.paste(qr, (986 - qr.width // 2, 298 - qr.height // 2))

    f_tip = font(FONT_REG, 20)
    d.text((74, 520), "扫码或复制地址转账，链上确认后自动发放", font=f_tip, fill=(110, 128, 152))
    d.text((846, 118), "扫码付款", font=f_tip, fill=(140, 160, 186))
    d.text((846, 460), "TRON 主网 · TRX", font=f_tip, fill=(120, 210, 190))

    base.save(IMG / "og.png", "PNG", optimize=True)
    base.resize((600, 315), Image.LANCZOS).save(IMG / "og-small.png", "PNG", optimize=True)


def main() -> None:
    qr_img = make_qr()
    make_icons()
    make_og(qr_img)
    for p in sorted(IMG.iterdir()):
        print(f"{p.name:24s} {p.stat().st_size/1024:8.1f} KB")


if __name__ == "__main__":
    main()
