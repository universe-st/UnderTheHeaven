import { describe, it, expect } from 'vitest';
import { createNewRun, getBuciMods } from '../../models/RunState';
import type { BuCiCard, RunState, MapNode } from '../../models/RunState';
import { HEXAGRAM_CATALOG, generateShopStock, purchase, sellBuci, effectiveRefreshPrice, REFRESH_BASE_PRICE } from '../../models/Shop';
import type { ShopItem } from '../../models/Shop';
import { createRng } from '../MapGenerator';
import { applyEventChoice } from '../../models/Events';
import type { GameEvent } from '../../models/Events';
import {
  useSimpleActive,
  findBuci,
  triggerDestinyUpOnBattleWin,
  triggerWinHealIfLow,
  adjustBattleReward,
  triggerDropCardOnWin,
  triggerSealOnWin,
  triggerPoolScoreUpOnWin,
  mitigateDefeat,
  triggerRecruitDiscountAfterDefeat,
  applyBuciSellHooks,
  applyBuciPurchaseHooks,
  applyNodeEnterHooks,
  applyShopEnterHooks,
  resolveRemoveCharacter,
  resolveRemoveCardsForTongbao,
  resolveGrantSealToPool,
  resolveCopyCardToPool,
  resolveRemoveCardHeal,
  battleStartBuciMods,
  resolvePassAnyNode,
  resolveAdvanceFloor,
} from '../BuciEffects';

/** 从目录取一张卦，注入栏位 */
function cardFromCatalog(id: string, count = 1): BuCiCard {
  const entry = HEXAGRAM_CATALOG.find((e) => e.buci.id === id);
  if (!entry) throw new Error(`目录无此卦: ${id}`);
  return { ...entry.buci, count };
}

function makeRun(cards: BuCiCard[]): RunState {
  const run = createNewRun(createRng(1));
  run.buciCards = cards;
  run.tongbao = 1000;
  return run;
}

// ═══ 新主动（纯数值）═══

describe('新主动卦（useSimpleActive）', () => {
  it('山天大畜：天命上限 +20', () => {
    const run = makeRun([cardFromCatalog('hex_shan_tian_da_xu')]);
    const m0 = run.destinyMax;
    expect(useSimpleActive(run, 'hex_shan_tian_da_xu')).toContain('+20');
    expect(run.destinyMax).toBe(m0 + 20);
    expect(findBuci(run, 'hex_shan_tian_da_xu')).toBeNull();
  });

  it('艮为山：获得 60 护盾；先有山地剥则护盾 +50%（90）且被动消耗', () => {
    const run = makeRun([cardFromCatalog('hex_gen_wei_shan'), cardFromCatalog('hex_shan_di_bo')]);
    useSimpleActive(run, 'hex_gen_wei_shan');
    expect(getBuciMods(run).destinyShield).toBe(90); // 60 × 1.5
    expect(run.buciCards.find((c) => c.id === 'hex_shan_di_bo')).toBeUndefined(); // 山地剥已消耗
  });

  it('兑为泽：天命 +40 且本局恢复效果 +5；后续天火同人胜利回 10+5=15', () => {
    const run = makeRun([cardFromCatalog('hex_dui_wei_ze'), cardFromCatalog('hex_tian_huo_tong_ren')]);
    run.destinyMax = 200;
    run.destiny = 50;
    useSimpleActive(run, 'hex_dui_wei_ze');
    expect(run.destiny).toBe(90);
    expect(getBuciMods(run).regenBonus).toBe(5);
    const d0 = run.destiny;
    triggerDestinyUpOnBattleWin(run, 'normal');
    expect(run.destiny).toBe(d0 + 15); // 10 + regen 5
  });

  it('泽风大过：天命 +35，下一场战斗胜利奖励 -20', () => {
    const run = makeRun([cardFromCatalog('hex_ze_feng_da_guo')]);
    run.destiny = 50;
    useSimpleActive(run, 'hex_ze_feng_da_guo');
    expect(run.destiny).toBe(85);
    expect(getBuciMods(run).nextBattleRewardPenalty).toBe(20);
  });

  it('坎为水：通宝 +60 且利息 +50%', () => {
    const run = makeRun([cardFromCatalog('hex_kan_wei_shui')]);
    const t0 = run.tongbao;
    useSimpleActive(run, 'hex_kan_wei_shui');
    expect(run.tongbao).toBe(t0 + 60);
    expect(getBuciMods(run).interestBonusPercent).toBe(50);
  });

  it('地天泰：阵容上限 +1；地泽临：下次招募折扣；水山蹇：免费刷新；离为火：气数上限；火泽睽：移敌牌', () => {
    const run = makeRun([
      cardFromCatalog('hex_di_tian_tai'),
      cardFromCatalog('hex_di_ze_lin'),
      cardFromCatalog('hex_shui_shan_jian'),
      cardFromCatalog('hex_li_wei_huo'),
      cardFromCatalog('hex_huo_ze_kui'),
    ]);
    useSimpleActive(run, 'hex_di_tian_tai');
    useSimpleActive(run, 'hex_di_ze_lin');
    useSimpleActive(run, 'hex_shui_shan_jian');
    useSimpleActive(run, 'hex_li_wei_huo');
    useSimpleActive(run, 'hex_huo_ze_kui');
    const mods = getBuciMods(run);
    expect(mods.rosterMaxUp).toBe(1);
    expect(mods.recruitDiscount).toBe(30);
    expect(mods.freeRefreshCount).toBe(1);
    expect(mods.vitalityUpAllBattle).toBe(150);
    expect(mods.removeEnemyCardNext).toBe(true);
  });

  it('泽山咸：使用其他主动卦时额外回 5 天命', () => {
    const run = makeRun([cardFromCatalog('hex_shan_tian_da_xu'), cardFromCatalog('hex_ze_shan_xian')]);
    run.destiny = 50;
    useSimpleActive(run, 'hex_shan_tian_da_xu');
    expect(run.destiny).toBe(55); // +5 泽山咸
    expect(findBuci(run, 'hex_ze_shan_xian')).toBeNull();
  });
});

// ═══ 战败修正链 ═══

describe('mitigateDefeat 战败扣减修正链', () => {
  it('山雷颐：本局首次战败免扣', () => {
    const run = makeRun([cardFromCatalog('hex_shan_lei_yi')]);
    const { loss } = mitigateDefeat(run, 20);
    expect(loss).toBe(0);
    expect(findBuci(run, 'hex_shan_lei_yi')).toBeNull();
  });

  it('天水讼：抵挡战败扣减', () => {
    const run = makeRun([cardFromCatalog('hex_tian_shui_song')]);
    const { loss } = mitigateDefeat(run, 20);
    expect(loss).toBe(0);
  });

  it('火水未济：战败改为天命上限 -10', () => {
    const run = makeRun([cardFromCatalog('hex_huo_shui_wei_ji')]);
    const m0 = run.destinyMax;
    const { loss } = mitigateDefeat(run, 20);
    expect(loss).toBe(0);
    expect(run.destinyMax).toBe(m0 - 10);
  });

  it('山风蛊：扣减减半（向上取整）', () => {
    const run = makeRun([cardFromCatalog('hex_shan_feng_gu')]);
    const { loss } = mitigateDefeat(run, 21);
    expect(loss).toBe(11); // ceil(21/2)
  });

  it('护盾吸收扣减', () => {
    const run = makeRun([]);
    run.buciMods = { destinyShield: 30 };
    const { loss, notes } = mitigateDefeat(run, 20);
    expect(loss).toBe(0);
    expect(getBuciMods(run).destinyShield).toBe(10);
    expect(notes.some((n) => n.includes('护盾'))).toBe(true);
  });

  it('地火明夷：战败后下次招募 -50%', () => {
    const run = makeRun([cardFromCatalog('hex_di_huo_ming_yi')]);
    triggerRecruitDiscountAfterDefeat(run);
    expect(getBuciMods(run).recruitDiscountAfterDefeat).toBe(50);
    expect(findBuci(run, 'hex_di_huo_ming_yi')).toBeNull();
  });
});

// ═══ 战斗胜利奖励 ═══

describe('adjustBattleReward 战斗胜利奖励', () => {
  it('雷地豫 ×2 且消耗', () => {
    const run = makeRun([cardFromCatalog('hex_lei_di_yu')]);
    const { reward } = adjustBattleReward(run, 'normal', 10);
    expect(reward).toBe(20);
    expect(findBuci(run, 'hex_lei_di_yu')).toBeNull();
  });

  it('雷天大壮仅 Boss 节点 ×2', () => {
    const run = makeRun([cardFromCatalog('hex_lei_tian_da_zhuang')]);
    expect(adjustBattleReward(run, 'normal', 10).reward).toBe(10); // 非 Boss 不触发（卦保留）
    expect(findBuci(run, 'hex_lei_tian_da_zhuang')).not.toBeNull();
    expect(adjustBattleReward(run, 'boss', 10).reward).toBe(20);
    expect(findBuci(run, 'hex_lei_tian_da_zhuang')).toBeNull();
  });

  it('雷山小过 +5、火地晋精英 +20、火山旅 +25、泽风大过 -20 组合', () => {
    const run = makeRun([
      cardFromCatalog('hex_lei_shan_xiao_guo'),
      cardFromCatalog('hex_huo_di_jin'),
      cardFromCatalog('hex_huo_shan_lv'),
    ]);
    run.buciMods = { nextBattleRewardPenalty: 20 };
    const { reward } = adjustBattleReward(run, 'elite', 10);
    expect(reward).toBe(10 + 5 + 20 + 25 - 20); // 40
    expect(getBuciMods(run).nextBattleRewardPenalty).toBe(0);
  });

  it('泽水困：天命 <30 时胜利回 20，否则不触发', () => {
    const run = makeRun([cardFromCatalog('hex_ze_shui_kun')]);
    run.destiny = 20;
    triggerWinHealIfLow(run);
    expect(run.destiny).toBe(40);
    expect(findBuci(run, 'hex_ze_shui_kun')).toBeNull();
    // 再买一张，天命高于阈值不触发
    run.buciCards.push(cardFromCatalog('hex_ze_shui_kun'));
    run.destiny = 50;
    expect(triggerWinHealIfLow(run)).toBeNull();
    expect(findBuci(run, 'hex_ze_shui_kun')).not.toBeNull();
  });
});

// ═══ 牌库类胜利效果 ═══

describe('牌库类胜利/交互效果', () => {
  it('火天大有：胜利掉 1 张随机扑克牌入牌库', () => {
    const run = makeRun([cardFromCatalog('hex_huo_tian_da_you')]);
    const n0 = run.cardPool.length;
    triggerDropCardOnWin(run, createRng(7));
    expect(run.cardPool.length).toBe(n0 + 1);
    expect(findBuci(run, 'hex_huo_tian_da_you')).toBeNull();
  });

  it('火风鼎：胜利时牌库随机 1 张获四象印', () => {
    const run = makeRun([cardFromCatalog('hex_huo_feng_ding')]);
    run.cardPool = [
      { uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 },
      { uid: 'b', suit: 'heart', rank: 9, rankLabel: '9', score: 9 },
    ];
    triggerSealOnWin(run, createRng(3));
    expect(run.cardPool.some((c) => c.seal !== undefined)).toBe(true);
  });

  it('风泽中孚：胜利时牌库随机 2 张各 +1 点数', () => {
    const run = makeRun([cardFromCatalog('hex_feng_ze_zhong_fu')]);
    run.cardPool = [
      { uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 },
      { uid: 'b', suit: 'heart', rank: 9, rankLabel: '9', score: 9 },
      { uid: 'c', suit: 'club', rank: 5, rankLabel: '5', score: 5 },
    ];
    triggerPoolScoreUpOnWin(run, createRng(5));
    const boosted = run.cardPool.filter((c) => c.score > c.rank).length;
    expect(boosted).toBe(2);
  });

  it('巽为风：移除最多 3 张牌，每张 +8 通宝', () => {
    const run = makeRun([cardFromCatalog('hex_xun_wei_feng')]);
    run.cardPool = [
      { uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 },
      { uid: 'b', suit: 'heart', rank: 9, rankLabel: '9', score: 9 },
    ];
    const t0 = run.tongbao;
    resolveRemoveCardsForTongbao(run, ['a', 'b', 'missing']);
    expect(run.cardPool).toHaveLength(0);
    expect(run.tongbao).toBe(t0 + 16);
    expect(findBuci(run, 'hex_xun_wei_feng')).toBeNull();
  });

  it('坤为地：牌库 7 选 2 赐玄武印', () => {
    const run = makeRun([cardFromCatalog('hex_kun_wei_di')]);
    run.cardPool = [
      { uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 },
      { uid: 'b', suit: 'heart', rank: 9, rankLabel: '9', score: 9 },
      { uid: 'c', suit: 'club', rank: 5, rankLabel: '5', score: 5 },
    ];
    resolveGrantSealToPool(run, ['a', 'c']);
    expect(run.cardPool.find((c) => c.uid === 'a')!.seal).toBe('xuanwu');
    expect(run.cardPool.find((c) => c.uid === 'c')!.seal).toBe('xuanwu');
    expect(run.cardPool.find((c) => c.uid === 'b')!.seal).toBeUndefined();
  });

  it('风火家人：复制 1 张入牌库', () => {
    const run = makeRun([cardFromCatalog('hex_feng_huo_jia_ren')]);
    run.cardPool = [{ uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 }];
    resolveCopyCardToPool(run, 'a');
    expect(run.cardPool).toHaveLength(2);
    expect(run.cardPool[1]!.uid).not.toBe('a');
  });

  it('山泽损：移除 1 张牌，天命 +20', () => {
    const run = makeRun([cardFromCatalog('hex_shan_ze_sun')]);
    run.cardPool = [{ uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 }];
    run.destiny = 50;
    resolveRemoveCardHeal(run, 'a');
    expect(run.cardPool).toHaveLength(0);
    expect(run.destiny).toBe(70);
  });

  it('天风姤 + 地雷复：移除角色回天命并返还 15 通宝', () => {
    const run = makeRun([cardFromCatalog('hex_tian_feng_gou'), cardFromCatalog('hex_di_lei_fu')]);
    run.roster = ['hanxin', 'zhangfei'];
    run.destiny = 50;
    const t0 = run.tongbao;
    const desc = resolveRemoveCharacter(run, 'zhangfei');
    expect(desc).toContain('返还 15 通宝');
    expect(run.roster).toEqual(['hanxin']);
    expect(run.tongbao).toBe(t0 + 15);
  });
});

// ═══ 商店钩子 ═══

describe('商店 / 出售 / 刷新钩子', () => {
  it('applyBuciSellHooks：水天需返全价 + 地山谦额外 50%', () => {
    const run = makeRun([cardFromCatalog('hex_shui_tian_xu'), cardFromCatalog('hex_di_shan_qian')]);
    expect(applyBuciSellHooks(run, 10)).toBe(30); // 10×2×1.5
    expect(run.buciCards).toHaveLength(0);
    // 无增益卦
    expect(applyBuciSellHooks(makeRun([]), 10)).toBe(10);
  });

  it('sellBuci：出售返还并入账（地山谦 +50%）', () => {
    const run = makeRun([cardFromCatalog('hex_di_shan_qian'), cardFromCatalog('hex_qian_wei_tian')]);
    const t0 = run.tongbao;
    const refund = sellBuci(run, 'hex_qian_wei_tian'); // 50/2=25 → ×1.5 = 38（round）
    expect(refund).toBe(38);
    expect(run.tongbao).toBe(t0 + 38);
    expect(run.buciCards.some((c) => c.id === 'hex_qian_wei_tian')).toBe(false);
  });

  it('purchase 角色：地水师赐印 + 地风升回天命 + 招募折扣消耗', () => {
    const run = makeRun([cardFromCatalog('hex_di_shui_shi'), cardFromCatalog('hex_di_feng_sheng')]);
    run.cardPool = [{ uid: 'a', suit: 'spade', rank: 7, rankLabel: '7', score: 7 }];
    run.destiny = 50;
    run.buciMods = { recruitDiscount: 30, recruitDiscountAfterDefeat: 50 };
    const item: ShopItem = { kind: 'character', characterId: 'zhangfei', price: 75 };
    expect(purchase(run, item)).toBe(true);
    expect(run.roster).toContain('zhangfei');
    expect(run.cardPool[0]!.seal).toBe('xuanwu');
    expect(run.destiny).toBe(55);
    expect(getBuciMods(run).recruitDiscount).toBe(0);
    expect(getBuciMods(run).recruitDiscountAfterDefeat).toBe(0);
  });

  it('purchase 扑克牌：风雷益本次即享 -5，风天小畜额外 +1 张，水泽节返利', () => {
    const run = makeRun([cardFromCatalog('hex_feng_lei_yi'), cardFromCatalog('hex_feng_tian_xiao_chu'), cardFromCatalog('hex_shui_ze_jie')]);
    const t0 = run.tongbao;
    const item: ShopItem = { kind: 'card', card: { uid: 'x', suit: 'spade', rank: 10, rankLabel: '10', score: 10 }, price: 10 };
    expect(purchase(run, item)).toBe(true);
    // 10 支出；风雷益 -5（返 5）；水泽节返利 10%×10=1；风天小畜 +1 张随机
    expect(run.tongbao).toBe(t0 - 10 + 5 + 1);
    expect(run.cardPool.length).toBe(2);
    expect(getBuciMods(run).cardBuyDiscount).toBe(5);
    expect(getBuciMods(run).extraCardOnBuy).toBe(1);
  });

  it('effectiveRefreshPrice：雷风恒固定 5 / 水山蹇免费优先', () => {
    const run = makeRun([]);
    run.buciMods = { refreshFixed: 5 };
    expect(effectiveRefreshPrice(run, 9)).toBe(5);
    run.buciMods = { refreshFixed: 5, freeRefreshCount: 1 };
    expect(effectiveRefreshPrice(run, 9)).toBe(0);
    expect(effectiveRefreshPrice(makeRun([]), 3)).toBe(REFRESH_BASE_PRICE + 3);
  });

  it('generateShopStock：水地比折扣计入商品价', () => {
    const run = makeRun([cardFromCatalog('hex_shui_di_bi')]);
    applyShopEnterHooks(run);
    for (let seed = 1; seed <= 30; seed++) {
      const stock = generateShopStock(run, createRng(seed));
      for (const item of stock) {
        if (item.kind === 'heal') {
          expect(item.price).toBe(26); // 30 × 0.85 = 25.5 → round 26
        }
      }
    }
    expect(getBuciMods(run).shopDiscount).toBe(15);
  });

  it('applyShopEnterHooks：只触发+设置常驻（水风井/泽雷随/雷风恒/风山渐/水地比），发放由场景按常驻值统一处理', () => {
    const run = makeRun([
      cardFromCatalog('hex_shui_feng_jing'),
      cardFromCatalog('hex_ze_lei_sui'),
      cardFromCatalog('hex_lei_feng_heng'),
      cardFromCatalog('hex_feng_shan_jian'),
      cardFromCatalog('hex_shui_di_bi'),
    ]);
    const t0 = run.tongbao;
    applyShopEnterHooks(run);
    const mods = getBuciMods(run);
    // 不重复发放：本次进店实际加成由场景读取常驻值执行
    expect(run.tongbao).toBe(t0);
    expect(mods.tongbaoPerShop).toBe(10);
    expect(mods.healPerShop).toBe(10);
    expect(mods.refreshFixed).toBe(5);
    expect(mods.sealChanceUp).toBe(25);
    expect(mods.shopDiscount).toBe(15);
    expect(run.buciCards).toHaveLength(0); // 全部消耗
  });

  it('applyNodeEnterHooks：水雷屯 只设置常驻每节点 +2', () => {
    const run = makeRun([cardFromCatalog('hex_shui_lei_tun')]);
    const t0 = run.tongbao;
    applyNodeEnterHooks(run);
    expect(getBuciMods(run).tongbaoPerNode).toBe(2);
    expect(run.tongbao).toBe(t0); // 实际发放由场景按常驻值执行
    expect(findBuci(run, 'hex_shui_lei_tun')).toBeNull();
  });

  it('场景按常驻值发放：水雷屯每节点 / 水风井每进店 / 泽雷随每进店', () => {
    const run = makeRun([cardFromCatalog('hex_shui_lei_tun'), cardFromCatalog('hex_shui_feng_jing'), cardFromCatalog('hex_ze_lei_sui')]);
    run.destiny = 50;
    applyNodeEnterHooks(run);
    applyShopEnterHooks(run);
    // 场景统一发放
    const mods = getBuciMods(run);
    run.tongbao += mods.tongbaoPerNode;
    run.tongbao += mods.tongbaoPerShop;
    run.destiny = Math.min(run.destinyMax, run.destiny + mods.healPerShop);
    expect(run.tongbao).toBe(1000 + 2 + 10);
    expect(run.destiny).toBe(60);
  });
});

// ═══ 战斗开始（局内）═══

describe('battleStartBuciMods 局内战斗开始', () => {
  it('读取离为火气数上限、触发火雷噬嗑/风地观/风水涣/火泽睽', () => {
    const run = makeRun([
      cardFromCatalog('hex_li_wei_huo'),
      cardFromCatalog('hex_huo_lei_shi_ke'),
      cardFromCatalog('hex_feng_di_guan'),
      cardFromCatalog('hex_feng_shui_huan'),
      cardFromCatalog('hex_huo_ze_kui'),
    ]);
    // 主动卦先使用（离为火设常驻气数、火泽睽设移敌牌标记）
    useSimpleActive(run, 'hex_li_wei_huo');
    useSimpleActive(run, 'hex_huo_ze_kui');
    const mods = battleStartBuciMods(run);
    expect(mods.vitalityBonus).toBe(150);
    expect(mods.coefficientBoost).toBe(1);
    expect(mods.handBonus).toBe(1);
    expect(mods.enemyHandDown).toBe(1);
    expect(mods.removeEnemyCards).toBe(true);
    expect(run.buciCards).toHaveLength(0); // 一次性全部消耗
    // 二次调用不再有一/次性效果
    const mods2 = battleStartBuciMods(run);
    expect(mods2.coefficientBoost).toBe(0);
    expect(mods2.removeEnemyCards).toBe(false);
    expect(mods2.vitalityBonus).toBe(150); // 离为火常驻仍在
  });
});

// ═══ 地图行动卦 ═══

describe('地图行动卦（震为雷 / 雷泽归妹）', () => {
  it('震为雷：任意通过一个节点，按类型结算胜利并消耗', () => {
    const run = makeRun([cardFromCatalog('hex_zhen_wei_lei')]);
    const node: MapNode = { id: 'n1', type: 'normal', floor: 1, index: 0, cleared: false };
    const t0 = run.tongbao;
    const result = resolvePassAnyNode(run, node);
    expect(result).not.toBeNull();
    expect(node.cleared).toBe(true);
    expect(run.tongbao).toBeGreaterThan(t0); // 通宝 + 利息
    expect(findBuci(run, 'hex_zhen_wei_lei')).toBeNull();
    // 已通过节点不可重复结算
    expect(resolvePassAnyNode(run, node)).toBeNull();
  });

  it('雷泽归妹：跳过本层剩余节点，推进一层；最后一层不可用', () => {
    const run = makeRun([cardFromCatalog('hex_lei_ze_gui_mei')]);
    run.layers[0] = [
      { id: 'a', type: 'normal', floor: 1, index: 0, cleared: false },
      { id: 'b', type: 'normal', floor: 1, index: 1, cleared: true },
    ];
    const f0 = run.floor;
    expect(resolveAdvanceFloor(run)).toBe(f0 + 1);
    expect(run.layers[0]!.find((n) => n.id === 'a')!.cleared).toBe(true); // 被跳节点标记为通过
    expect(findBuci(run, 'hex_lei_ze_gui_mei')).toBeNull();
    // 最后一层不可推进
    const run2 = makeRun([cardFromCatalog('hex_lei_ze_gui_mei')]);
    run2.floor = 36;
    expect(resolveAdvanceFloor(run2)).toBeNull();
    expect(findBuci(run2, 'hex_lei_ze_gui_mei')).not.toBeNull(); // 不消耗
  });
});

// ═══ 事件卦象钩子（Events.applyEventChoice 集成） ═══

describe('事件卦象钩子', () => {
  function eventWith(choice: { label: string; effect: GameEvent['choices'][0]['effect'] }): GameEvent {
    return {
      id: 'test_event', title: '测试事件', pool: 'common', floors: [1, 36],
      trigger: [], oncePerRun: false, description: '测试',
      choices: [choice],
    };
  }

  it('雷水解：事件通宝代价减半（问前程 10 → 5）', () => {
    const run = makeRun([cardFromCatalog('hex_lei_shui_jie')]);
    const t0 = run.tongbao;
    const result = applyEventChoice(run, eventWith({ label: 'x', effect: { type: 'destiny_random', cost: 10, winChance: 1, win: 15, lose: 0 } }), 0, createRng(1));
    expect(result.success).toBe(true);
    expect(run.tongbao).toBe(t0 - 5);
    expect(findBuci(run, 'hex_lei_shui_jie')).toBeNull();
  });

  it('山水蒙：抵挡一次事件天命扣减（天命 -8 → 0）', () => {
    const run = makeRun([cardFromCatalog('hex_shan_shui_meng')]);
    run.destiny = 50;
    applyEventChoice(run, eventWith({ label: 'x', effect: { type: 'destiny', amount: -8 } }), 0, createRng(1));
    expect(run.destiny).toBe(50);
    expect(findBuci(run, 'hex_shan_shui_meng')).toBeNull();
  });

  it('雷火丰：事件通宝奖励翻倍（+10 → +20）', () => {
    const run = makeRun([cardFromCatalog('hex_lei_huo_feng')]);
    const t0 = run.tongbao;
    applyEventChoice(run, eventWith({ label: 'x', effect: { type: 'tongbao', amount: 10 } }), 0, createRng(1));
    expect(run.tongbao).toBe(t0 + 20);
    expect(findBuci(run, 'hex_lei_huo_feng')).toBeNull();
  });

  it('泽地萃：非负面选项额外回 8 天命（天命 +8 → +16）', () => {
    const run = makeRun([cardFromCatalog('hex_ze_di_cui')]);
    run.destiny = 50;
    applyEventChoice(run, eventWith({ label: 'x', effect: { type: 'destiny', amount: 8 } }), 0, createRng(1));
    expect(run.destiny).toBe(66);
    expect(findBuci(run, 'hex_ze_di_cui')).toBeNull();
  });

  it('泽地萃：负面选项不触发（未消耗）', () => {
    const run = makeRun([cardFromCatalog('hex_ze_di_cui')]);
    run.destiny = 50;
    applyEventChoice(run, eventWith({ label: 'x', effect: { type: 'destiny', amount: -8 } }), 0, createRng(1));
    expect(run.destiny).toBe(42);
    expect(findBuci(run, 'hex_ze_di_cui')).not.toBeNull();
  });
});

// ═══ 交互 resolve 边界 ═══

describe('交互 resolve 边界', () => {
  it('无对应卦或不可用时返回 null 且不消耗', () => {
    const run = makeRun([]);
    expect(resolveRemoveCardsForTongbao(run, ['x'])).toBeNull();
    expect(resolveGrantSealToPool(run, ['x'])).toBeNull();
    expect(resolveCopyCardToPool(run, 'x')).toBeNull();
    expect(resolveRemoveCardHeal(run, 'x')).toBeNull();
  });
});
