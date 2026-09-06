/**
 * 四象印：青龙 / 白虎 / 朱雀 / 玄武。
 * 印盖在扑克牌上（Card.seal），黄金台扑克牌商品 25% 概率带印、价格 +10；
 * 带印牌打出时触发对应四印效果（见 engine/FourSealEffects.ts）。
 */

export type FourSeal = 'qinglong' | 'baihu' | 'zhuque' | 'xuanwu';

export const FOUR_SEALS: readonly FourSeal[] = ['qinglong', 'baihu', 'zhuque', 'xuanwu'];

/** 四印中文名（青龙与素材一致，用户确认） */
export const SEAL_LABELS: Record<FourSeal, string> = {
  qinglong: '青龙',
  baihu: '白虎',
  zhuque: '朱雀',
  xuanwu: '玄武',
};

/** 四印效果描述（商店/战斗展示用） */
export const SEAL_DESCRIPTIONS: Record<FourSeal, string> = {
  qinglong: '打出时伤害得分 +10',
  baihu: '打出时伤害结算两次',
  zhuque: '打出时牌型系数 +1',
  xuanwu: '打出时回复等同得分的气数',
};

/** 对应加载到 Texture 的图片 key（见 LoadingScene.loadAssets） */
export const SEAL_IMAGE_KEYS: Record<FourSeal, string> = {
  qinglong: 'seal_qinglong',
  baihu: 'seal_baihu',
  zhuque: 'seal_zhuque',
  xuanwu: 'seal_xuanwu',
};

/** 四印源图尺寸（public/seal_*.png），缩放统一用 setScale(size / SEAL_SOURCE_SIZE) */
export const SEAL_SOURCE_SIZE = 800;

/** 黄金台扑克牌带印概率（25%） */
export const SEAL_CHANCE = 0.25;

/** 带印商品加价 */
export const SEAL_PRICE_EXTRA = 10;

/** 黄金台货架卜辞槽位变为扑克牌槽位的概率（扑克牌按概率随机出现，可能一台都不出） */
export const CARD_SLOT_CHANCE = 0.35;

/**
 * 掷印：SEAL_CHANCE 概率返回四印之一（等概率），否则 null。
 * extraChance 为卦象（风山渐）带来的带印概率额外加成（百分数，如 25）。
 */
export function randomSeal(rng: () => number, extraChance = 0): FourSeal | null {
  const chance = Math.min(1, SEAL_CHANCE + extraChance / 100);
  if (rng() >= chance) {
    return null;
  }
  return FOUR_SEALS[Math.floor(rng() * FOUR_SEALS.length)]!;
}

/**
 * 必带印：等概率返回四印之一（用于"附带随机四象印"的技能效果，
 * 与 randomSeal 的 25% 概率语义不同）。
 */
export function randomFourSeal(rng: () => number = Math.random): FourSeal {
  return FOUR_SEALS[Math.floor(rng() * FOUR_SEALS.length)]!;
}
