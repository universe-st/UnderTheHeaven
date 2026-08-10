import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { canUseChouCe, middleRanksBetween, PLAYABLE_RANKS } from '../LiuBoWenChouSuanLogic';

let idc = 0;
function card(rank: number): Card {
  idc += 1;
  return { uid: `c${idc}`, suit: 'spade', rank, rankLabel: rankToLabel(rank), score: rank };
}

const R = { THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, J: 11, Q: 12, K: 13, A: 15, TWO: 20 };

describe('LiuBoWenChouSuan middleRanksBetween (筹策中间点数)', () => {
  it('点数序列中不存在 14：K(13) 与 A(15) 之间无有效点数', () => {
    expect(PLAYABLE_RANKS).not.toContain(14);
    expect(middleRanksBetween(R.K, R.A)).toEqual([]);
  });

  it('3 与 6 之间的有效点数为 [4, 5]', () => {
    expect(middleRanksBetween(R.THREE, R.SIX)).toEqual([R.FOUR, R.FIVE]);
    expect(middleRanksBetween(R.SIX, R.THREE)).toEqual([R.FOUR, R.FIVE]); // 顺序无关
  });

  it('Q(12) 与 A(15) 之间的有效点数为 [K]', () => {
    expect(middleRanksBetween(R.Q, R.A)).toEqual([R.K]);
  });

  it('相邻点数之间无有效点数', () => {
    expect(middleRanksBetween(R.THREE, R.FOUR)).toEqual([]);
  });

  it('所有中间点数都能映射为合法标签（不会出现 ?）', () => {
    for (const r of PLAYABLE_RANKS) {
      expect(rankToLabel(r)).not.toBe('?');
    }
  });
});

describe('LiuBoWenChouSuan canUseChouCe (筹策选牌判定)', () => {
  it('拒绝 K + A：两点数之间没有有效点数（原 bug：会生成点数 14 显示为 ?）', () => {
    expect(canUseChouCe([card(R.K), card(R.A)])).toBe(false);
    expect(canUseChouCe([card(R.A), card(R.K)])).toBe(false);
  });

  it('接受 Q + A：中间有效点数为 K', () => {
    expect(canUseChouCe([card(R.Q), card(R.A)])).toBe(true);
  });

  it('接受 3 + 6：中间有效点数为 4、5', () => {
    expect(canUseChouCe([card(R.THREE), card(R.SIX)])).toBe(true);
  });

  it('拒绝相邻点数（差 1）', () => {
    expect(canUseChouCe([card(R.THREE), card(R.FOUR)])).toBe(false);
  });

  it('拒绝含 2 或王的组合', () => {
    expect(canUseChouCe([card(R.TWO), card(R.THREE)])).toBe(false);
    expect(canUseChouCe([card(R.THREE), card(25)])).toBe(false); // 虎
    expect(canUseChouCe([card(R.THREE), card(30)])).toBe(false); // 龍
  });

  it('拒绝非两张牌的选择', () => {
    expect(canUseChouCe([card(R.THREE)])).toBe(false);
    expect(canUseChouCe([card(R.THREE), card(R.FIVE), card(R.SEVEN)])).toBe(false);
    expect(canUseChouCe([])).toBe(false);
  });
});
