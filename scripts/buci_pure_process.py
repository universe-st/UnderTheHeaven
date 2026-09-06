#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""阶段4：纯卦主视觉 PIL 后处理（深墨底转透明 → 裁剪 → 居中 → 缩放 → 压缩）。

用法：
  python3 scripts/buci_pure_process.py /tmp/hexgen/hex_qian_qian.png public/hex_qian_qian.png [size]

- 背景取四角平均色（深墨底或白底均可），alpha = 线性映射"像素到背景色曼哈顿距离"
  （dist 40~150 → alpha 0~255）+ 1.15 幂增强，保留金线/淡墨层次；
- 内容 bbox + 4% 边距裁剪，主体占目标画布约 82%，LANCZOS 缩放；
- RGBA + optimize + compress_level=9 压缩。
"""
import sys
import os
from PIL import Image, ImageChops, ImageOps

CANVAS = 512  # 显示 150px（商店卡）/ 56px（栏位），DPR3 下 512 富余


def corner_bg(im: Image.Image, size: int = 24) -> tuple[int, int, int]:
    """四角小块平均色作为背景色。"""
    w, h = im.size
    pts = [(0, 0), (w - size, 0), (0, h - size), (w - size, h - size)]
    px = im.convert("RGB")
    rs = gs = bs = n = 0
    for x, y in pts:
        crop = px.crop((x, y, x + size, y + size))
        r, g, b = map(int, ImageStat_mean(crop))
        rs += r; gs += g; bs += b; n += 1
    return rs // n, gs // n, bs // n


def ImageStat_mean(crop: Image.Image) -> tuple[float, float, float]:
    pix = crop.load()
    w, h = crop.size
    rs = gs = bs = 0.0
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y][:3]
            rs += r; gs += g; bs += b
    n = w * h
    return rs / n, gs / n, bs / n


def bg_to_alpha(im: Image.Image) -> Image.Image:
    """按到背景色的曼哈顿距离映射透明度。"""
    bg = corner_bg(im)
    rgb = im.convert("RGB")
    w, h = im.size
    pix = rgb.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y][:3]
            dist = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            a = 0.0
            if dist > 150:
                a = 255.0
            elif dist > 40:
                a = 255.0 * (dist - 40) / 110.0
            a = int(255.0 * (a / 255.0) ** 1.15)
            op[x, y] = (r, g, b, a)
    return out


def process(src: str, dst: str, canvas: int = CANVAS) -> None:
    im = Image.open(src).convert("RGB")
    im = bg_to_alpha(im)
    # 内容 bbox（含 alpha 阈值）
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit(f"空内容: {src}")
    pad = 4
    l, t, r, b = bbox
    w, h = r - l, b - t
    nl = max(0, l - w * pad // 100); nt = max(0, t - h * pad // 100)
    nr = min(im.width, r + w * pad // 100); nb = min(im.height, b + h * pad // 100)
    im = im.crop((nl, nt, nr, nb))
    # 居中缩放：主体占画布约 82%
    target = int(canvas * 0.82)
    scale = target / max(im.size)
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    canvas_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    canvas_img.paste(im, ((canvas - im.width) // 2, (canvas - im.height) // 2), im)
    canvas_img.save(dst, optimize=True, compress_level=9)
    print(f"{src} -> {dst} ({canvas}x{canvas}, {os.path.getsize(dst)} 字节)")


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    size = int(sys.argv[3]) if len(sys.argv) > 3 else CANVAS
    process(src, dst, size)
