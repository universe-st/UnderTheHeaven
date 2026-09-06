import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HEXAGRAM_CATALOG } from '../Shop';
import type { BuCiEffect } from '../RunState';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** 效果结算可能出现的所有运行时源码（引擎 + 场景挂点 + 模型结算） */
const RUNTIME_SRC = [
  'engine/BuciEffects.ts',
  'scenes/managers/BuciBarManager.ts',
  'scenes/MapScene.ts',
  'scenes/ShopScene.ts',
  'scenes/GameScene.ts',
  'models/Events.ts',
  'models/Shop.ts',
  'models/RunManager.ts',
].map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n');

function kindsOf(effect: BuCiEffect): string[] {
  return [effect.kind];
}

describe('六十四卦目录接线完整性', () => {
  it('每个卦象的 effect.kind 都必须在运行时源码中被接线（无死效果）', () => {
    const kinds = new Set<string>();
    for (const e of HEXAGRAM_CATALOG) {
      for (const k of kindsOf(e.buci.effect)) kinds.add(k);
    }
    const missing = [...kinds].filter((k) => !RUNTIME_SRC.includes(`'${k}'`) && !RUNTIME_SRC.includes(`"${k}"`));
    expect(missing).toEqual([]);
  });

  it('64 卦 id 唯一且目录与设计档一致（主动 23 / 被动 41 / 传说 8）', () => {
    const ids = new Set(HEXAGRAM_CATALOG.map((e) => e.buci.id));
    expect(ids.size).toBe(64);
    expect(HEXAGRAM_CATALOG.filter((e) => e.buci.type === 'active')).toHaveLength(23);
    expect(HEXAGRAM_CATALOG.filter((e) => e.buci.type === 'passive')).toHaveLength(41);
    expect(HEXAGRAM_CATALOG.filter((e) => e.buci.rarity === 'legendary')).toHaveLength(8);
  });
});
