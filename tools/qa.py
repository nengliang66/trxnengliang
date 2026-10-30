#!/usr/bin/env python3
"""站点静态自检：HTML 解析、重复 ID、内部链接、SEO 基础项、JSON-LD。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from lxml import etree, html

ROOT = Path(__file__).resolve().parent.parent
pages = sorted(ROOT.glob("*.html"))
errors: list[str] = []
warnings: list[str] = []

for page in pages:
    is_404 = page.name == "404.html"
    raw = page.read_text(encoding="utf-8")
    parser = etree.HTMLParser(recover=True)
    doc = html.fromstring(raw, parser=parser)

    title = doc.findtext(".//title") or ""
    if not (10 <= len(title) <= 45):
        warnings.append(f"{page.name}: title 长度 {len(title)}：{title}")

    descs = doc.xpath('//meta[@name="description"]/@content')
    if not descs or not (50 <= len(descs[0]) <= 170):
        warnings.append(f"{page.name}: description 长度 {len(descs[0]) if descs else 0}")

    if not is_404:
        if not doc.xpath('//link[@rel="canonical"]/@href'):
            errors.append(f"{page.name}: 缺少 canonical")
        if not doc.xpath('//meta[@property="og:image"]'):
            errors.append(f"{page.name}: 缺少 og:image")

    h1s = doc.xpath("//h1")
    if len(h1s) != 1:
        errors.append(f"{page.name}: h1 数量为 {len(h1s)}")

    seen: dict[str, int] = {}
    for el in doc.iter():
        if not isinstance(el.tag, str):
            continue
        eid = el.get("id")
        if eid:
            seen[eid] = seen.get(eid, 0) + 1
    for eid, count in seen.items():
        if count > 1:
            errors.append(f"{page.name}: 页面内重复 ID {eid} ×{count}")

    for img in doc.xpath("//img"):
        if not img.get("alt"):
            errors.append(f"{page.name}: <img> 缺少 alt：{img.get('src')}")

    for script in doc.xpath('//script[@type="application/ld+json"]'):
        try:
            json.loads(script.text or "{}")
        except json.JSONDecodeError as exc:
            errors.append(f"{page.name}: JSON-LD 无效 {exc}")

    for attr in ("href", "src"):
        for value in doc.xpath(f"//@*[local-name()='{attr}']"):
            if not value.startswith("/") or value.startswith("//"):
                continue
            path = value.split("#")[0].split("?")[0]
            if not path or path == "/":
                continue
            target = ROOT / path.lstrip("/")
            if target.exists() or (ROOT / (path.lstrip("/") + ".html")).exists():
                continue
            errors.append(f"{page.name}: 死链 {value}")

    for value in doc.xpath("//a/@href"):
        if value.startswith("/#"):
            fragment = value[2:]
            index = (ROOT / "index.html").read_text(encoding="utf-8")
            if f'id="{fragment}"' not in index:
                errors.append(f"{page.name}: 锚点不存在 {value}")

    # 检查 SVG 闭合是否异常（lxml 会把未闭合标签吞掉）
    if raw.count("<svg") != raw.count("</svg>"):
        errors.append(f"{page.name}: <svg> 标签未闭合")

print(f"页面：{', '.join(p.name for p in pages)}")
print(f"错误 {len(errors)}，警告 {len(warnings)}")
for e in errors:
    print("  x", e)
for w in warnings:
    print("  !", w)
sys.exit(1 if errors else 0)
