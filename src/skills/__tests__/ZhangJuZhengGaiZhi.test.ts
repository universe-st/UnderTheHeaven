import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel, CARD_RANKS } from '../../models/Card';
import { nextRank, hasNormalCards } from '../ZhangJuZhengGaiZhiLogic';
import { ZhangJuZhengGaiZhi } from '../ZhangJuZhengGaiZhi';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank) };
}

describe('ZhangJuZhengGaiZhi nextRank（改制点数+1）', () => {
  it('普通点数 +1：3→4、10→J、Q→K', () => {
    expect(nextRank(3)).toBe(4);
    expect(nextRank(4)).toBe(5);
    expect(nextRank(10)).toBe(11);
    expect(nextRank(12)).toBe(13);
  });

  it('K(13) +1 为 A(15)：点数序列中不存在 14', () => {
    expect(CARD_RANKS).not.toContain(14);
    expect(nextRank(13)).toBe(15);
  });

  it('A(15) +1 为 2(20)', () => {
    expect(nextRank(15)).toBe(20);
  });

  it('2(20) 是最大点数，+1 后保持 2，不会继续累加', () => {
    expect(nextRank(20)).toBe(20);
  });

  it('序列中任意点数 +1 后仍在合法点数内（标签不会出现 ?）', () => {
    for (const r of CARD_RANKS) {
      expect(rankToLabel(nextRank(r))).not.toBe('?');
    }
  });

  it('未知点数（大小王 25/30）原样返回（execute 前已被过滤）', () => {
    expect(nextRank(25)).toBe(25);
    expect(nextRank(30)).toBe(30);
  });
});

describe('ZhangJuZhengGaiZhi cardFilter（改制可用判定）', () => {
  it('选中含非大小王的牌时可发动', () => {
    expect(ZhangJuZhengGaiZhi.cardFilter([card(3)])).toBe(true);
    expect(ZhangJuZhengGaiZhi.cardFilter([card(3), card(25, null)])).toBe(true);
  });

  it('仅选中大小王时不可发动', () => {
    expect(ZhangJuZhengGaiZhi.cardFilter([card(25, null)])).toBe(false);
    expect(ZhangJuZhengGaiZhi.cardFilter([card(30, null), card(25, null)])).toBe(false);
  });

  it('未选中任何牌时不可发动（无选牌路径走 canUseWithoutSelection）', () => {
    expect(ZhangJuZhengGaiZhi.cardFilter([])).toBe(false);
  });
});

describe('ZhangJuZhengGaiZhi hasNormalCards / canUseWithoutSelection（无需选牌发动）', () => {
  it('requiresSelection 为 false：改制无需选中牌', () => {
    expect(ZhangJuZhengGaiZhi.requiresSelection).toBe(false);
  });

  it('hasNormalCards：手牌含非大小王时为 true', () => {
    expect(hasNormalCards([card(3)])).toBe(true);
    expect(hasNormalCards([card(25, null), card(3)])).toBe(true);
  });

  it('hasNormalCards：手牌全为大小王时为 false', () => {
    expect(hasNormalCards([card(25, null)])).toBe(false);
    expect(hasNormalCards([])).toBe(false);
  });

  it('canUseWithoutSelection：手牌有非大小王时可发动', () => {
    const fakeScene = {
      getBattle: () => ({ player: { hand: [card(5)] } }),
    } as unknown as Parameters<NonNullable<typeof ZhangJuZhengGaiZhi.canUseWithoutSelection>>[0];
    expect(ZhangJuZhengGaiZhi.canUseWithoutSelection!(fakeScene)).toBe(true);
  });

  it('canUseWithoutSelection：手牌全为大小王时不可发动', () => {
    const fakeScene = {
      getBattle: () => ({ player: { hand: [card(25, null), card(30, null)] } }),
    } as unknown as Parameters<NonNullable<typeof ZhangJuZhengGaiZhi.canUseWithoutSelection>>[0];
    expect(ZhangJuZhengGaiZhi.canUseWithoutSelection!(fakeScene)).toBe(false);
  });
});
