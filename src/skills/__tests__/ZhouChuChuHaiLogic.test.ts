import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import {
  pickRandomIndices,
  isJoker,
  isBigJoker,
  isSmallJoker,
  hasAnyJoker,
  hasBothJokers,
  heartCards,
  hasRemovedBothJokers,
  hasLiXin,
  applyLiXinMultiplier,
  ZHOUCHU_FLAG_HAS_LIXIN,
  ZHOUCHU_FLAG_BIG_JOKER,
  ZHOUCHU_FLAG_SMALL_JOKER,
} from '../ZhouChuChuHaiLogic';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

const bigJoker = () => card(30, null); // 大王（龍）
const smallJoker = () => card(25, null); // 小王（虎）

describe('ZhouChuChuHai 大小王判定', () => {
  it('isJoker：无花色为真', () => {
    expect(isJoker(bigJoker())).toBe(true);
    expect(isJoker(smallJoker())).toBe(true);
  });

  it('isBigJoker / isSmallJoker：按点数区分大王（30）与小王（25）', () => {
    expect(isBigJoker(bigJoker())).toBe(true);
    expect(isBigJoker(smallJoker())).toBe(false);
    expect(isSmallJoker(smallJoker())).toBe(true);
    expect(isSmallJoker(bigJoker())).toBe(false);
    expect(isBigJoker(card(15))).toBe(false);
    expect(isSmallJoker(card(3))).toBe(false);
  });

  it('hasAnyJoker：含任一王即真（单张王也算）', () => {
    expect(hasAnyJoker([bigJoker()])).toBe(true);
    expect(hasAnyJoker([smallJoker()])).toBe(true);
    expect(hasAnyJoker([bigJoker(), card(3)])).toBe(true);
    expect(hasAnyJoker([card(3), card(10)])).toBe(false);
    expect(hasAnyJoker([])).toBe(false);
  });

  it('hasBothJokers：同时含大小王才为真', () => {
    expect(hasBothJokers([bigJoker(), smallJoker()])).toBe(true);
    expect(hasBothJokers([bigJoker(), bigJoker(), smallJoker()])).toBe(true);
    expect(hasBothJokers([bigJoker()])).toBe(false);
    expect(hasBothJokers([smallJoker()])).toBe(false);
    expect(hasBothJokers([card(3), card(10)])).toBe(false);
    expect(hasBothJokers([])).toBe(false);
  });

  it('heartCards：只筛红桃，王不参与', () => {
    const hearts = [card(8, 'heart'), card(12, 'heart')];
    const mixed = [...hearts, card(5, 'spade'), bigJoker(), smallJoker()];
    expect(heartCards(mixed)).toHaveLength(2);
    expect(heartCards(mixed).every(c => c.suit === 'heart')).toBe(true);
    expect(heartCards([])).toHaveLength(0);
  });
});

describe('ZhouChuChuHai pickRandomIndices（随机选三张）', () => {
  it('手牌充足时返回 count 个不重复索引，且在合法范围内', () => {
    for (let i = 0; i < 50; i++) {
      const idxs = pickRandomIndices(3, 17);
      expect(idxs).toHaveLength(3);
      expect(new Set(idxs).size).toBe(3);
      for (const idx of idxs) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(17);
      }
    }
  });

  it('手牌不足时返回全部', () => {
    expect(pickRandomIndices(3, 2)).toHaveLength(2);
    expect(pickRandomIndices(3, 0)).toHaveLength(0);
  });

  it('count 为 0 时返回空数组', () => {
    expect(pickRandomIndices(0, 5)).toHaveLength(0);
  });
});

describe('ZhouChuChuHai 跨战斗状态判定', () => {
  it('hasRemovedBothJokers：需同时移除过大王与小王（跨战斗累积）', () => {
    expect(hasRemovedBothJokers({ [ZHOUCHU_FLAG_BIG_JOKER]: true, [ZHOUCHU_FLAG_SMALL_JOKER]: true })).toBe(true);
    expect(hasRemovedBothJokers({ [ZHOUCHU_FLAG_BIG_JOKER]: true })).toBe(false);
    expect(hasRemovedBothJokers({ [ZHOUCHU_FLAG_SMALL_JOKER]: true })).toBe(false);
    expect(hasRemovedBothJokers({})).toBe(false);
    expect(hasRemovedBothJokers(undefined)).toBe(false);
  });

  it('hasLiXin：获得励心标记为真', () => {
    expect(hasLiXin({ [ZHOUCHU_FLAG_HAS_LIXIN]: true })).toBe(true);
    expect(hasLiXin({ [ZHOUCHU_FLAG_HAS_LIXIN]: 1 })).toBe(true);
    expect(hasLiXin({})).toBe(false);
    expect(hasLiXin(undefined)).toBe(false);
  });
});

describe('ZhouChuChuHai 励心倍率（已累加伤害 ×1.5）', () => {
  it('基础倍率四舍五入取整', () => {
    expect(applyLiXinMultiplier(10)).toBe(15);
    expect(applyLiXinMultiplier(15)).toBe(23); // 22.5 → 23
    expect(applyLiXinMultiplier(18)).toBe(27);
    expect(applyLiXinMultiplier(25)).toBe(38); // 37.5 → 38
    expect(applyLiXinMultiplier(20)).toBe(30);
  });

  it('0 与负值按倍率处理', () => {
    expect(applyLiXinMultiplier(0)).toBe(0);
    expect(applyLiXinMultiplier(-5)).toBe(-7); // -7.5 → -7
  });

  it('连续触发逐次取整累积', () => {
    // 第一张红桃后累加 10 → 15；第二张红桃再对 15 ×1.5 = 22.5 → 23
    expect(applyLiXinMultiplier(applyLiXinMultiplier(10))).toBe(23);
  });
});
