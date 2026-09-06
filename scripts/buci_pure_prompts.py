#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""阶段4：8 张纯卦专属主视觉的提示词定义（§16.7.2 / §16.7.3）。

每条 = 主体（含六爻卦象 + §16.7.2 视觉意象）+ 统一风格后缀。
风格统一：深墨底 + 金线/浅色主体 → 白/深底转透明后金色主体在深檀木卡面清晰可见。
"""
import json

STYLE = ("中国传统水墨画风，深墨色渐变背景，金色与浅金色线条描边勾勒，"
         "卦象符号居中醒目，主体占画面约六成，四周留白充足，"
         "无文字，无现代元素，方形构图，古朴典雅")

# id -> (卦名, 图键, 主体描述)
HEX = {
    "hex_qian_wei_tian": (
        "乾为天", "hex_qian_qian",
        "六条鎏金实线阳爻卦象（乾卦，六阳爻）居中，金色神龙穿行云海，天象云纹环绕"),
    "hex_kun_wei_di": (
        "坤为地", "hex_kun_kun",
        "六条断线阴爻卦象（坤卦，六阴爻）居中，大地河山沃野千里，金色田埂河流纹理"),
    "hex_zhen_wei_lei": (
        "震为雷", "hex_zhen_zhen",
        "震卦卦象（上震下震，六爻）居中，雷云翻滚电光霹雳横空，金白色闪电"),
    "hex_xun_wei_feng": (
        "巽为风", "hex_xun_xun",
        "巽卦卦象（上巽下巽，六爻）居中，风卷云舒疾风劲草，金白气流旋动"),
    "hex_kan_wei_shui": (
        "坎为水", "hex_kan_kan",
        "坎卦卦象（上坎下坎，六爻）居中，江河奔流深渊暗涌漩涡，金色水光波纹"),
    "hex_li_wei_huo": (
        "离为火", "hex_li_li",
        "离卦卦象（上离下离，六爻）居中，烈焰飞腾火舞苍穹，金红橙色焰光"),
    "hex_gen_wei_shan": (
        "艮为山", "hex_gen_gen",
        "艮卦卦象（上艮下艮，六爻）居中，群山巍峨壁立千仞云海雾绕，金色山脊线"),
    "hex_dui_wei_ze": (
        "兑为泽", "hex_dui_dui",
        "兑卦卦象（上兑下兑，六爻）居中，湖泽映月碧波涟漪，金色月光水纹"),
}

prompts = {kid: f"{subject}，{STYLE}" for kid, (_name, _key, subject) in HEX.items()}

if __name__ == "__main__":
    print(json.dumps(prompts, ensure_ascii=False, indent=2))
