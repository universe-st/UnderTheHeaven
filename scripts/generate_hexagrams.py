#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成六十四卦卦象图（6 爻：实线/虚线），输出 public/hex_<上卦码>_<下卦码>.png。
八卦三爻模式（自下而上）：乾111 兑110 离101 震100 巽011 坎010 艮001 坤000。
"""
import os
from PIL import Image, ImageDraw

SIZE = 400
CODES = {
    '乾': 'qian', '兑': 'dui', '离': 'li', '震': 'zhen',
    '巽': 'xun', '坎': 'kan', '艮': 'gen', '坤': 'kun',
}
# 三爻（自下而上）实线=1 虚线=0
TRIGRAM = {
    '乾': (1, 1, 1),
    '兑': (1, 1, 0),
    '离': (1, 0, 1),
    '震': (1, 0, 0),
    '巽': (0, 1, 1),
    '坎': (0, 1, 0),
    '艮': (0, 0, 1),
    '坤': (0, 0, 0),
}

INK = (26, 16, 8, 255)  # 墨色 #1a1008
LINE_LEN = 240
LINE_H = 36
GAP = 28          # 爻间垂直间距（6爻总高 356 < 400）
BROKEN_GAP = 56   # 虚线中间缺口
MARGIN_X = (SIZE - LINE_LEN) / 2


def hexagram_lines(upper: str, lower: str) -> list[int]:
    """返回 6 爻（自下而上）：下卦 3 爻 + 上卦 3 爻。"""
    return list(TRIGRAM[lower]) + list(TRIGRAM[upper])


def render(hex_id: str, upper: str, lower: str, out: str) -> None:
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lines = hexagram_lines(upper, lower)
    total_h = len(lines) * LINE_H + (len(lines) - 1) * GAP
    y0 = (SIZE - total_h) / 2
    for i, solid in enumerate(lines):
        y = y0 + i * (LINE_H + GAP)
        if solid:
            d.rounded_rectangle([MARGIN_X, y, MARGIN_X + LINE_LEN, y + LINE_H], radius=10, fill=INK)
        else:
            half = (LINE_LEN - BROKEN_GAP) / 2
            d.rounded_rectangle([MARGIN_X, y, MARGIN_X + half, y + LINE_H], radius=10, fill=INK)
            d.rounded_rectangle([MARGIN_X + half + BROKEN_GAP, y, MARGIN_X + LINE_LEN, y + LINE_H], radius=10, fill=INK)
    img.save(out)
    print(f'{hex_id}  ->  {out}')


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public')
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    count = 0
    for upper in CODES:
        for lower in CODES:
            hex_id = f'hex_{CODES[upper]}_{CODES[lower]}'
            render(hex_id, upper, lower, os.path.join(out_dir, f'{hex_id}.png'))
            count += 1
    print(f'共生成 {count} 张卦象图 -> {out_dir}')


if __name__ == '__main__':
    main()
