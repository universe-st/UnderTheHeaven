#!/usr/bin/env bash
# -*- coding: utf-8 -*-
# 阶段4：批量生成 8 张纯卦专属主视觉原始图（已生成的跳过），存 /tmp/hexgen/raw_<图键>.png
set -u
cd /Users/kuangshensheng/codes/UnderTheHeaven
source ~/.bash_profile
SCRIPT=.dsh/skills/seedream-image/scripts/seedream_generate.py
mkdir -p /tmp/hexgen

python3 - <<'PY' > /tmp/hexgen/prompts.txt
import sys
sys.path.insert(0, 'scripts')
from buci_pure_prompts import HEX, STYLE
for kid, (_name, key, subject) in HEX.items():
    print(f"{key}\t{kid}\t{subject}，{STYLE}")
PY

while IFS=$'\t' read -r key kid subject; do
  out="/tmp/hexgen/raw_${key}.png"
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "SKIP ${key} (exists)"
    continue
  fi
  echo "=== 生成 ${kid} -> ${key} ==="
  python3 "$SCRIPT" --prompt "$subject" --size "1024x1024" --image-format png --output "$out" \
    > "/tmp/hexgen/gen_${key}.log" 2>&1
  rc=$?
  if [ $rc -eq 0 ] && [ -s "$out" ]; then
    echo "OK ${key} ($(stat -f%z "$out") bytes)"
  else
    echo "FAIL ${key} rc=$rc"; tail -3 "/tmp/hexgen/gen_${key}.log"
  fi
done < /tmp/hexgen/prompts.txt
echo "ALL_DONE"
