import { describe, it, expect } from 'vitest';
import { HandType } from '../BattleTypes';
import { PLAYER_CHARACTERS } from '../Character';
import { createNewRun } from '../RunState';
import { BUCI_CATALOG, generateShopStock, purchase, characterPrice, cardPrice, randomShopCard, CHARACTER_PRICES, refreshPrice } from '../Shop';
import type { ShopItem } from '../Shop';
import { SEAL_PRICE_EXTRA } from '../FourSeal';
import { createRng } from '../../engine/MapGenerator';

describe('BUCI_CATALOG', () => {
  it('contains 5 buci cards with expected hand types and bonuses', () => {
    expect(BUCI_CATALOG).toHaveLength(5);
    const byType = new Map(BUCI_CATALOG.map((e) => [e.buci.handType, e]));
    expect(byType.get(HandType.Single)!.buci.coefficientBonus).toBe(0.5);
    expect(byType.get(HandType.Pair)!.buci.coefficientBonus).toBe(0.4);
    expect(byType.get(HandType.Triple)!.buci.coefficientBonus).toBe(0.4);
    expect(byType.get(HandType.Straight)!.buci.coefficientBonus).toBe(0.4);
    expect(byType.get(HandType.Bomb)!.buci.coefficientBonus).toBe(0.3);
    for (const e of BUCI_CATALOG) {
      expect(e.price).toBeGreaterThanOrEqual(30);
      expect(e.price).toBeLessThanOrEqual(80);
    }
  });
});

describe('generateShopStock', () => {
  it('returns exactly 4 items', () => {
    const run = createNewRun(createRng(1));
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateShopStock(run, createRng(seed))).toHaveLength(4);
    }
  });

  it('prices characters from CHARACTER_PRICES', () => {
    const run = createNewRun(createRng(1));
    for (let seed = 1; seed <= 50; seed++) {
      const stock = generateShopStock(run, createRng(seed));
      for (const item of stock) {
        if (item.kind === 'character') {
          expect(item.price).toBe(CHARACTER_PRICES[item.characterId]);
        }
      }
    }
  });

  it('offers no characters when roster is full (10)', () => {
    const run = createNewRun(createRng(1));
    run.roster = Object.keys(PLAYER_CHARACTERS).slice(0, 10) as typeof run.roster;
    expect(run.roster).toHaveLength(10);
    for (let seed = 1; seed <= 20; seed++) {
      const stock = generateShopStock(run, createRng(seed));
      expect(stock).toHaveLength(4);
      expect(stock.some((i) => i.kind === 'character')).toBe(false);
    }
  });

  it('does not offer already-recruited characters', () => {
    const run = createNewRun(createRng(1));
    for (let seed = 1; seed <= 50; seed++) {
      const stock = generateShopStock(run, createRng(seed));
      for (const item of stock) {
        if (item.kind === 'character') {
          expect(run.roster).not.toContain(item.characterId);
        }
      }
    }
  });
});

describe('characterPrice', () => {
  it('returns the fixed price table value', () => {
    expect(characterPrice('hanxin')).toBe(120);
    expect(characterPrice('bianque')).toBe(45);
  });
});

describe('refreshPrice', () => {
  it('starts at 5 and increases by 1 per refresh', () => {
    expect(refreshPrice(0)).toBe(5);
    expect(refreshPrice(1)).toBe(6);
    expect(refreshPrice(2)).toBe(7);
    expect(refreshPrice(9)).toBe(14);
  });
});

describe('purchase', () => {
  it('deducts tongbao and adds a character to the roster', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 200;
    const item: ShopItem = { kind: 'character', characterId: 'zhangfei', price: 75 };
    expect(purchase(run, item)).toBe(true);
    expect(run.tongbao).toBe(125);
    expect(run.roster).toContain('zhangfei');
  });

  it('adds buci cards (stackable)', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 200;
    const buci = BUCI_CATALOG[0]!;
    const item: ShopItem = { kind: 'buci', buci: buci.buci, price: buci.price };
    expect(purchase(run, item)).toBe(true);
    expect(purchase(run, item)).toBe(true);
    expect(run.buciCards).toHaveLength(2);
    expect(run.tongbao).toBe(200 - buci.price * 2);
  });

  it('heals destiny up to destinyMax', () => {
    const run = createNewRun(createRng(1));
    run.destiny = 95;
    run.tongbao = 100;
    expect(purchase(run, { kind: 'heal', amount: 10, price: 30 })).toBe(true);
    expect(run.destiny).toBe(100);
    expect(run.tongbao).toBe(70);
  });

  it('returns false and leaves state unchanged when tongbao is insufficient', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 10;
    const snapshot = JSON.parse(JSON.stringify(run)) as unknown;
    const item: ShopItem = { kind: 'character', characterId: 'zhangfei', price: 75 };
    expect(purchase(run, item)).toBe(false);
    expect(JSON.parse(JSON.stringify(run))).toEqual(snapshot);
  });

  it('refuses to sell a character when roster is full', () => {
    const run = createNewRun(createRng(1));
    run.roster = Object.keys(PLAYER_CHARACTERS).slice(0, 10) as typeof run.roster;
    run.tongbao = 500;
    const item: ShopItem = { kind: 'character', characterId: 'zhangfei', price: 75 };
    expect(purchase(run, item)).toBe(false);
    expect(run.tongbao).toBe(500);
    expect(run.roster).toHaveLength(10);
  });
});

describe('扑克牌商品（四象印）', () => {
  it('cardPrice 按点数定价，带印再加 10', () => {
    expect(cardPrice({ uid: 'x', suit: 'spade', rank: 7, rankLabel: '7', score: 7 })).toBe(7);
    expect(cardPrice({ uid: 'x', suit: null, rank: 25, rankLabel: '虎', score: 25 })).toBe(25);
    expect(cardPrice({ uid: 'x', suit: null, rank: 30, rankLabel: '龍', score: 30 })).toBe(30);
    expect(cardPrice({ uid: 'x', suit: 'heart', rank: 7, rankLabel: '7', score: 7, seal: 'qinglong' })).toBe(17);
    expect(cardPrice({ uid: 'x', suit: null, rank: 30, rankLabel: '龍', score: 30, seal: 'xuanwu' })).toBe(40);
  });

  it('randomShopCard 生成标准牌（54 张范围内），约 25% 带印', () => {
    const rng = createRng(42);
    const seen = new Set<string>();
    let sealed = 0;
    for (let i = 0; i < 2000; i++) {
      const c = randomShopCard(rng);
      expect(c.rank).toBeGreaterThanOrEqual(3);
      expect(c.rank).toBeLessThanOrEqual(30);
      expect(c.uid).toBeTruthy();
      if (c.seal) {
        sealed += 1;
        expect(['qinglong', 'baihu', 'zhuque', 'xuanwu']).toContain(c.seal);
      }
      seen.add(`${c.suit ?? 'joker'}:${c.rank}`);
    }
    expect(seen.size).toBeGreaterThan(40); // 覆盖多种牌面
    expect(sealed / 2000).toBeGreaterThan(0.2);
    expect(sealed / 2000).toBeLessThan(0.3);
  });

  it('generateShopStock 可能刷出扑克牌商品，价格与 cardPrice 一致', () => {
    const run = createNewRun(createRng(7));
    let foundCard = false;
    for (let seed = 1; seed <= 200; seed++) {
      const stock = generateShopStock(run, createRng(seed));
      for (const item of stock) {
        if (item.kind === 'card') {
          foundCard = true;
          expect(item.price).toBe(cardPrice(item.card));
        }
      }
    }
    expect(foundCard).toBe(true); // 大样本下必出扑克牌
  });

  it('purchase 将扑克牌放入 cardPool 并扣款', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 200;
    const card = randomShopCard(createRng(99));
    const item: ShopItem = { kind: 'card', card, price: cardPrice(card) };
    expect(purchase(run, item)).toBe(true);
    expect(run.tongbao).toBe(200 - item.price);
    expect(run.cardPool).toHaveLength(1);
    expect(run.cardPool[0]!.uid).toBe(card.uid);
    expect(run.cardPool[0]!.seal).toBe(card.seal);
  });

  it('purchase 扑克牌通宝不足时状态不变', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 3;
    const card = randomShopCard(createRng(5));
    const item: ShopItem = { kind: 'card', card, price: cardPrice(card) };
    const snapshot = JSON.parse(JSON.stringify(run)) as unknown;
    expect(purchase(run, item)).toBe(false);
    expect(JSON.parse(JSON.stringify(run))).toEqual(snapshot);
  });
});

describe('SEAL_PRICE_EXTRA', () => {
  it('带印加价为 10', () => {
    expect(SEAL_PRICE_EXTRA).toBe(10);
  });
});
