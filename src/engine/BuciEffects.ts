/**
 * 卜辞卦象效果引擎（纯逻辑，可单测）。
 * 全部卦象一次性消耗：主动使用或被动触发都会 consumeBuci（count -1，归零移出栏）。
 * 交互类效果（山泽损选牌 / 巽为风移牌 / 风火家人复制 / 坤为地赐印 / 震为雷选节点等）
 * 由场景弹选择 UI 后调用对应 resolve 函数。
 *
 * 设计定稿：docs/design/game/16-六十四卦卜辞牌设计.md（§16.5 效果 kind 清单）。
 */
import type { RunState, BuCiCard, BuCiEffect, NodeType, BuciModifiers, MapNode } from '../models/RunState';
import { getBuciMods, applyVictory, MAP_FLOORS } from '../models/RunState';
import type { PlayerCharacterId } from '../models/Character';
import type { Card } from '../models/Card';
import { getNextCardId, rankToLabel, SUITS, CARD_RANKS } from '../models/Card';
import { randomFourSeal, randomSeal } from '../models/FourSeal';

// ── 基础工具 ──

/** 出售价 = 购买价一半（向下取整） */
export function buciSellPrice(card: BuCiCard): number {
  return Math.floor(card.price / 2);
}

/** 在栏中定位某卦（count > 0）；无则 null */
export function findBuci(run: RunState, id: string): BuCiCard | null {
  return run.buciCards.find((c) => c.id === id && c.count > 0) ?? null;
}

/** 消耗某卦一张（count -1，归零移出栏）。返回是否成功。 */
export function consumeBuci(run: RunState, id: string): boolean {
  const idx = run.buciCards.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  const card = run.buciCards[idx]!;
  card.count -= 1;
  if (card.count <= 0) run.buciCards.splice(idx, 1);
  return true;
}

/** 写入卦象修饰状态（合并默认值） */
export function applyMods(run: RunState, partial: Partial<BuciModifiers>): void {
  run.buciMods = { ...getBuciMods(run), ...partial };
}

function clampDestiny(run: RunState): void {
  run.destiny = Math.max(0, Math.min(run.destinyMax, run.destiny));
}

/** 直接加天命（含上限截断），不享受恢复加成 */
function addDestiny(run: RunState, amount: number): void {
  run.destiny += amount;
  clampDestiny(run);
}

/** 恢复类加天命：额外叠加兑为泽的"本局恢复效果 +N" */
function healDestiny(run: RunState, amount: number): void {
  const mods = getBuciMods(run);
  run.destiny += amount + mods.regenBonus;
  clampDestiny(run);
}

/** 获得天命护盾：山地剥（获得护盾时触发，护盾量 +50% 常驻） */
function addShield(run: RunState, amount: number): void {
  const bo = findBuci(run, 'hex_shan_di_bo');
  if (bo && bo.effect.kind === 'shield_power_up') {
    applyMods(run, { shieldPowerUp: getBuciMods(run).shieldPowerUp + bo.effect.percent });
    consumeBuci(run, bo.id);
  }
  const mods = getBuciMods(run);
  const boosted = mods.shieldPowerUp > 0 ? Math.round(amount * (1 + mods.shieldPowerUp / 100)) : amount;
  applyMods(run, { destinyShield: mods.destinyShield + boosted });
}

/** 生成一张随机标准扑克牌（风天小畜加牌 / 火天大有掉落用；风山渐加成带印概率） */
function makeRandomCard(rng: () => number, sealChanceExtra = 0): Card {
  const normalCount = SUITS.length * CARD_RANKS.length; // 52
  const total = normalCount + 2; // + 虎 / 龙
  const r = Math.floor(rng() * total);
  if (r >= normalCount) {
    const rank = r === total - 1 ? 30 : 25;
    return {
      uid: getNextCardId(),
      suit: null,
      rank,
      rankLabel: rankToLabel(rank),
      score: rank,
      seal: randomSeal(rng, sealChanceExtra) ?? undefined,
    };
  }
  const suit = SUITS[Math.floor(r / CARD_RANKS.length)]!;
  const rank = CARD_RANKS[r % CARD_RANKS.length]!;
  return {
    uid: getNextCardId(),
    suit,
    rank,
    rankLabel: rankToLabel(rank),
    score: rank,
    seal: randomSeal(rng, sealChanceExtra) ?? undefined,
  };
}

// ── 主动使用（纯数值类） ──

/** 是否为可直接数值结算的主动卦象（含设置一次性/常驻修饰的简单主动） */
export function isSimpleActiveEffect(effect: BuCiEffect): boolean {
  switch (effect.kind) {
    case 'destiny_up':
    case 'destiny_max_down_cur_up':
    case 'destiny_max_up':
    case 'destiny_heal_regen':
    case 'overdraw_heal':
    case 'heal_and_shield':
    case 'destiny_shield':
    case 'tongbao_gain_interest':
    case 'tongbao_gain_discount':
    case 'roster_max_up':
    case 'recruit_discount':
    case 'refresh_free':
    case 'vitality_up_all_battle':
    case 'remove_enemy_card':
      return true;
    default:
      return false;
  }
}

/**
 * 应用不依赖交互选择的卦象效果（纯数值类），返回描述文本。
 */
export function applyDirectEffect(run: RunState, effect: BuCiEffect): string {
  switch (effect.kind) {
    case 'destiny_up': {
      run.destinyMax += effect.maxInc;
      addDestiny(run, effect.curInc);
      return `天命上限 +${effect.maxInc}，天命 +${effect.curInc}`;
    }
    case 'destiny_max_down_cur_up': {
      run.destinyMax = Math.max(0, run.destinyMax - effect.maxDown);
      addDestiny(run, effect.curUp);
      return `天命上限 -${effect.maxDown}，天命 +${effect.curUp}`;
    }
    case 'destiny_max_up': {
      run.destinyMax += effect.amount;
      return `天命上限 +${effect.amount}`;
    }
    case 'destiny_heal_regen': {
      healDestiny(run, effect.heal);
      applyMods(run, { regenBonus: getBuciMods(run).regenBonus + effect.regenBonus });
      return `天命 +${effect.heal}，本局恢复效果 +${effect.regenBonus}`;
    }
    case 'overdraw_heal': {
      healDestiny(run, effect.heal);
      applyMods(run, { nextBattleRewardPenalty: getBuciMods(run).nextBattleRewardPenalty + effect.penalty });
      return `天命 +${effect.heal}，下一场战斗胜利通宝 -${effect.penalty}`;
    }
    case 'heal_and_shield': {
      healDestiny(run, effect.heal);
      addShield(run, effect.shield);
      return `天命 +${effect.heal}，护盾 +${effect.shield}`;
    }
    case 'destiny_shield': {
      addShield(run, effect.amount);
      return `护盾 +${effect.amount}`;
    }
    case 'tongbao_gain_interest': {
      run.tongbao += effect.amount;
      applyMods(run, { interestBonusPercent: getBuciMods(run).interestBonusPercent + effect.interestPercent });
      return `通宝 +${effect.amount}，本局利息 +${effect.interestPercent}%`;
    }
    case 'tongbao_gain_discount': {
      run.tongbao += effect.amount;
      applyMods(run, { nextShopDiscount: getBuciMods(run).nextShopDiscount + effect.nextShopDiscount });
      return `通宝 +${effect.amount}，下次商店商品 -${effect.nextShopDiscount}%`;
    }
    case 'roster_max_up': {
      applyMods(run, { rosterMaxUp: getBuciMods(run).rosterMaxUp + effect.amount });
      return `阵容上限 +${effect.amount}`;
    }
    case 'recruit_discount': {
      applyMods(run, { recruitDiscount: Math.max(getBuciMods(run).recruitDiscount, effect.percent) });
      return `下次招募费用 -${effect.percent}%`;
    }
    case 'refresh_free': {
      applyMods(run, { freeRefreshCount: getBuciMods(run).freeRefreshCount + 1 });
      return '商店刷新免费 1 次';
    }
    case 'vitality_up_all_battle': {
      applyMods(run, { vitalityUpAllBattle: getBuciMods(run).vitalityUpAllBattle + effect.amount });
      return `本局所有战斗气数上限 +${effect.amount}`;
    }
    case 'remove_enemy_card': {
      applyMods(run, { removeEnemyCardNext: true });
      return `下一场战斗开始时移除敌方 ${effect.count} 张牌`;
    }
    default:
      return '';
  }
}

/**
 * 主动使用纯数值类卦象，应用并消耗。
 * 返回效果文本；无此卦、非主动或不可用返回 null。
 */
export function useSimpleActive(run: RunState, id: string): string | null {
  const card = findBuci(run, id);
  if (!card || card.type !== 'active') return null;
  if (!isSimpleActiveEffect(card.effect)) return null;
  const desc = applyDirectEffect(run, card.effect);
  consumeBuci(run, id);
  // 泽山咸：使用其他主动卦时额外回 5 天命（触发即消耗）
  const extra = triggerExtraHealOnActive(run);
  return extra ? `${desc}（${extra}）` : desc;
}

/**
 * 主动使用交互类卦象（选牌/选节点等）：校验为主动卦并消耗，返回该卦。
 * 场景在弹选择 UI 后调用；不可用返回 null（不消耗）。
 */
export function consumeActiveBuci(run: RunState, id: string): BuCiCard | null {
  const card = findBuci(run, id);
  if (!card || card.type !== 'active') return null;
  consumeBuci(run, id);
  return card;
}

// ── 交互类主动 resolve（场景选完数据后调用） ──

/** 山泽损：移除牌库 1 张牌，天命 +N */
export function resolveRemoveCardHeal(run: RunState, cardUid: string): string | null {
  const card = findBuci(run, 'hex_shan_ze_sun');
  if (!card || card.effect.kind !== 'remove_card_heal') return null;
  const idx = run.cardPool.findIndex((c) => c.uid === cardUid);
  if (idx < 0) return null;
  run.cardPool.splice(idx, 1);
  healDestiny(run, card.effect.heal);
  consumeBuci(run, card.id);
  return `移除 1 张牌，天命 +${card.effect.heal}`;
}

/** 巽为风：从牌库移除最多 N 张牌，每张 +通宝 */
export function resolveRemoveCardsForTongbao(run: RunState, cardUids: string[]): string | null {
  const card = findBuci(run, 'hex_xun_wei_feng');
  if (!card || card.effect.kind !== 'remove_cards_for_tongbao') return null;
  const effect = card.effect;
  const removed: string[] = [];
  for (const uid of cardUids.slice(0, effect.max)) {
    const idx = run.cardPool.findIndex((c) => c.uid === uid);
    if (idx >= 0) {
      run.cardPool.splice(idx, 1);
      removed.push(uid);
    }
  }
  const gain = removed.length * effect.per;
  run.tongbao += gain;
  consumeBuci(run, card.id);
  return `移除 ${removed.length} 张牌，通宝 +${gain}`;
}

/** 风火家人：牌库选 1 张复制 1 张加入牌库 */
export function resolveCopyCardToPool(run: RunState, cardUid: string): string | null {
  const card = findBuci(run, 'hex_feng_huo_jia_ren');
  if (!card || card.effect.kind !== 'copy_card_to_pool') return null;
  const src = run.cardPool.find((c) => c.uid === cardUid);
  if (!src) return null;
  for (let i = 0; i < card.effect.count; i++) {
    run.cardPool.push({ ...src, uid: getNextCardId() });
  }
  consumeBuci(run, card.id);
  return `复制 ${card.effect.count} 张【${src.rankLabel}】入牌库`;
}

/** 坤为地：牌库随机 N 张中选 M 张赐玄武印（场景先提供候选池，玩家选完调用） */
export function resolveGrantSealToPool(run: RunState, cardUids: string[]): string | null {
  const card = findBuci(run, 'hex_kun_wei_di');
  if (!card || card.effect.kind !== 'grant_seal_to_pool') return null;
  const picked = cardUids.slice(0, card.effect.pick);
  for (const uid of picked) {
    const c = run.cardPool.find((x) => x.uid === uid);
    if (c) c.seal = 'xuanwu';
  }
  consumeBuci(run, card.id);
  return `牌库 ${picked.length} 张牌获玄武印`;
}

// ── 被动触发：战斗 ──

/** 天水讼：抵挡一次战败天命扣减。命中则消耗并返回 true。 */
export function triggerBlockBattleLose(run: RunState): boolean {
  const card = findBuci(run, 'hex_tian_shui_song');
  if (!card) return false;
  consumeBuci(run, card.id);
  return true;
}

/** 天泽履：天命被扣到 ≤0 时回 1，避免游戏失败。命中则消耗并返回 true。 */
export function triggerSaveFromZero(run: RunState): boolean {
  if (run.destiny > 0) return false;
  const card = findBuci(run, 'hex_tian_ze_lv');
  if (!card) return false;
  run.destiny = 1;
  consumeBuci(run, card.id);
  return true;
}

/** 天火同人：战斗节点（normal/elite/boss）取得胜利则恢复天命。命中则消耗并返回描述。 */
export function triggerDestinyUpOnBattleWin(run: RunState, nodeType: NodeType): string | null {
  const isBattleNode = nodeType === 'normal' || nodeType === 'elite' || nodeType === 'boss';
  if (!isBattleNode) return null;
  const card = findBuci(run, 'hex_tian_huo_tong_ren');
  if (!card) return null;
  const amount = card.effect.kind === 'destiny_up_on_battle_win' ? card.effect.amount : 0;
  healDestiny(run, amount);
  consumeBuci(run, card.id);
  return `【天火同人】天命 +${amount}`;
}

/** 泽水困：天命低于阈值时，战斗节点胜利回天命。命中则消耗并返回描述。 */
export function triggerWinHealIfLow(run: RunState): string | null {
  const card = findBuci(run, 'hex_ze_shui_kun');
  if (!card || card.effect.kind !== 'win_heal_if_low') return null;
  if (run.destiny >= card.effect.threshold) return null;
  healDestiny(run, card.effect.amount);
  consumeBuci(run, card.id);
  return `【泽水困】天命 +${card.effect.amount}`;
}

/**
 * 结算战斗节点胜利通宝奖励的卦象修正：
 * 雷地豫 ×2 / 雷天大壮（Boss）×2 / 雷山小过 +5 / 火地晋（精英）+20 / 火山旅 +25 /
 * 扣除泽风大过的下一场胜利惩罚（一次性）。返回修正后奖励与提示。
 */
export function adjustBattleReward(run: RunState, nodeType: NodeType, baseReward: number): { reward: number; notes: string[] } {
  const notes: string[] = [];
  let mult = 1;
  const yu = findBuci(run, 'hex_lei_di_yu');
  if (yu) {
    mult *= yu.effect.kind === 'battle_reward_mult' ? yu.effect.mult : 1;
    consumeBuci(run, yu.id);
    notes.push('【雷地豫】奖励 ×2');
  }
  const boss = nodeType === 'boss';
  const daZhuang = findBuci(run, 'hex_lei_tian_da_zhuang');
  if (daZhuang && boss) {
    mult *= daZhuang.effect.kind === 'boss_reward_mult' ? daZhuang.effect.mult : 1;
    consumeBuci(run, daZhuang.id);
    notes.push('【雷天大壮】Boss 奖励 ×2');
  }
  let extra = 0;
  const xiaoGuo = findBuci(run, 'hex_lei_shan_xiao_guo');
  if (xiaoGuo) {
    extra += xiaoGuo.effect.kind === 'battle_reward_extra' ? xiaoGuo.effect.amount : 0;
    consumeBuci(run, xiaoGuo.id);
    notes.push('【雷山小过】+5 通宝');
  }
  if (nodeType === 'elite') {
    const jin = findBuci(run, 'hex_huo_di_jin');
    if (jin) {
      extra += jin.effect.kind === 'elite_reward_extra' ? jin.effect.amount : 0;
      consumeBuci(run, jin.id);
      notes.push('【火地晋】精英 +20 通宝');
    }
  }
  const lv = findBuci(run, 'hex_huo_shan_lv');
  if (lv) {
    extra += lv.effect.kind === 'next_battle_reward_extra' ? lv.effect.amount : 0;
    consumeBuci(run, lv.id);
    notes.push('【火山旅】+25 通宝');
  }
  const mods = getBuciMods(run);
  const penalty = mods.nextBattleRewardPenalty;
  if (penalty > 0) {
    applyMods(run, { nextBattleRewardPenalty: 0 });
    notes.push(`【泽风大过】奖励 -${penalty}`);
  }
  const reward = Math.max(1, Math.round(baseReward * mult) + extra - penalty);
  return { reward, notes };
}

/** 火天大有：战斗节点胜利时牌库随机 1 张扑克牌入牌库。命中则消耗并返回描述。 */
export function triggerDropCardOnWin(run: RunState, rng: () => number = Math.random): string | null {
  const card = findBuci(run, 'hex_huo_tian_da_you');
  if (!card || card.effect.kind !== 'drop_card_on_win') return null;
  const mods = getBuciMods(run);
  for (let i = 0; i < card.effect.count; i++) {
    run.cardPool.push(makeRandomCard(rng, mods.sealChanceUp));
  }
  consumeBuci(run, card.id);
  return `【火天大有】牌库 +${card.effect.count} 张扑克牌`;
}

/** 火风鼎：战斗胜利时牌库随机 1 张获得随机四象印。命中则消耗并返回描述。 */
export function triggerSealOnWin(run: RunState, rng: () => number = Math.random): string | null {
  const card = findBuci(run, 'hex_huo_feng_ding');
  if (!card || card.effect.kind !== 'grant_seal_on_win') return null;
  const pool = run.cardPool;
  let granted = 0;
  for (let i = 0; i < card.effect.count && pool.length > 0; i++) {
    const target = pool[Math.floor(rng() * pool.length)]!;
    target.seal = randomFourSeal(rng);
    granted += 1;
  }
  consumeBuci(run, card.id);
  return granted > 0 ? `【火风鼎】牌库 ${granted} 张获四象印` : '【火风鼎】牌库无牌，赐印落空';
}

/** 风泽中孚：战斗胜利时牌库随机 2 张各 +1 点数。命中则消耗并返回描述。 */
export function triggerPoolScoreUpOnWin(run: RunState, rng: () => number = Math.random): string | null {
  const card = findBuci(run, 'hex_feng_ze_zhong_fu');
  if (!card || card.effect.kind !== 'pool_score_up_on_win') return null;
  const pool = [...run.cardPool];
  let boosted = 0;
  for (let i = 0; i < card.effect.count && pool.length > 0; i++) {
    const target = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    target.score += card.effect.inc;
    boosted += 1;
  }
  consumeBuci(run, card.id);
  return boosted > 0 ? `【风泽中孚】牌库 ${boosted} 张各 +${card.effect.inc} 点数` : '【风泽中孚】牌库无牌';
}

/**
 * 战败天命扣减修正链（按优先级）：
 * 山雷颐（本局首败免扣）→ 天水讼（抵挡）→ 火水未济（改扣上限）→ 山风蛊（减半）→ 护盾吸收。
 * 返回修正后的扣减值与提示；调用方将返回值应用到天命后，再调 triggerSaveFromZero。
 */
export function mitigateDefeat(run: RunState, loss: number): { loss: number; notes: string[] } {
  const notes: string[] = [];
  const yi = findBuci(run, 'hex_shan_lei_yi');
  if (yi) {
    consumeBuci(run, yi.id);
    notes.push('【山雷颐】本局首次战败免扣');
    return { loss: 0, notes };
  }
  const song = findBuci(run, 'hex_tian_shui_song');
  if (song) {
    consumeBuci(run, song.id);
    notes.push('【天水讼】抵挡战败扣减');
    return { loss: 0, notes };
  }
  const weiJi = findBuci(run, 'hex_huo_shui_wei_ji');
  if (weiJi && weiJi.effect.kind === 'defeat_loss_to_max') {
    run.destinyMax = Math.max(1, run.destinyMax - weiJi.effect.maxDown);
    consumeBuci(run, weiJi.id);
    notes.push(`【火水未济】天命上限 -${weiJi.effect.maxDown}，免扣天命`);
    return { loss: 0, notes };
  }
  const gu = findBuci(run, 'hex_shan_feng_gu');
  if (gu) {
    consumeBuci(run, gu.id);
    loss = Math.ceil(loss / 2);
    notes.push('【山风蛊】扣减减半');
  }
  const mods = getBuciMods(run);
  if (mods.destinyShield > 0 && loss > 0) {
    const absorbed = Math.min(mods.destinyShield, loss);
    applyMods(run, { destinyShield: mods.destinyShield - absorbed });
    loss -= absorbed;
    notes.push(`【护盾】吸收 ${absorbed} 点扣减`);
  }
  return { loss, notes };
}

/** 地火明夷：战败后下次招募费用 -50%。命中则消耗并返回描述。 */
export function triggerRecruitDiscountAfterDefeat(run: RunState): string | null {
  const card = findBuci(run, 'hex_di_huo_ming_yi');
  if (!card || card.effect.kind !== 'recruit_discount_after_defeat') return null;
  applyMods(run, { recruitDiscountAfterDefeat: Math.max(getBuciMods(run).recruitDiscountAfterDefeat, card.effect.percent) });
  consumeBuci(run, card.id);
  return `【地火明夷】下次招募费用 -${card.effect.percent}%`;
}

// ── 被动触发：事件 / 节点 / 商店 ──

/** 天雷无妄：事件节点需选择选项时回天命（场景随后执行随机选）。命中则消耗并返回描述。 */
export function triggerEventAutopick(run: RunState): string | null {
  const card = findBuci(run, 'hex_tian_lei_wu_wang');
  if (!card) return null;
  const amount = card.effect.kind === 'event_autopick' ? card.effect.amount : 0;
  healDestiny(run, amount);
  consumeBuci(run, card.id);
  return `【天雷无妄】天命 +${amount}`;
}

/** 天山遁：选择战斗节点时跳过战斗并回天命。命中则消耗并返回描述。 */
export function triggerSkipBattle(run: RunState): string | null {
  const card = findBuci(run, 'hex_tian_shan_dun');
  if (!card) return null;
  const amount = card.effect.kind === 'skip_battle' ? card.effect.amount : 0;
  healDestiny(run, amount);
  consumeBuci(run, card.id);
  return `【天山遁】跳过战斗，天命 +${amount}`;
}

/** 雷水解：事件扣天命/通宝类代价减半（一次）。命中则消耗并返回修正后代价。 */
export function applyEventCostHalf(run: RunState, cost: number): number {
  if (cost <= 0) return cost;
  const card = findBuci(run, 'hex_lei_shui_jie');
  if (!card) return cost;
  consumeBuci(run, card.id);
  return Math.max(0, Math.ceil(cost / 2));
}

/** 雷火丰：事件节点获得通宝奖励时翻倍（一次）。命中则消耗并返回修正后奖励。 */
export function applyEventTongbaoMult(run: RunState, base: number): number {
  if (base <= 0) return base;
  const card = findBuci(run, 'hex_lei_huo_feng');
  if (!card || card.effect.kind !== 'event_tongbao_mult') return base;
  consumeBuci(run, card.id);
  return base * card.effect.mult;
}

/** 山水蒙：抵挡一次事件节点造成的天命扣减。命中则消耗并返回 true。 */
export function blockEventDestinyLoss(run: RunState): boolean {
  const card = findBuci(run, 'hex_shan_shui_meng');
  if (!card) return false;
  consumeBuci(run, card.id);
  return true;
}

/** 泽地萃：事件选择非负面选项时额外回 8 天命。命中则消耗并返回描述。 */
export function triggerHealOnGoodEvent(run: RunState): string | null {
  const card = findBuci(run, 'hex_ze_di_cui');
  if (!card || card.effect.kind !== 'heal_on_good_event') return null;
  healDestiny(run, card.effect.amount);
  consumeBuci(run, card.id);
  return `【泽地萃】天命 +${card.effect.amount}`;
}

/** 泽山咸：使用其他主动卦时额外回 5 天命。命中则消耗并返回描述。 */
export function triggerExtraHealOnActive(run: RunState): string | null {
  const card = findBuci(run, 'hex_ze_shan_xian');
  if (!card || card.effect.kind !== 'extra_heal_on_active') return null;
  healDestiny(run, card.effect.amount);
  consumeBuci(run, card.id);
  return `【泽山咸】天命 +${card.effect.amount}`;
}

/**
 * 进入节点时触发：水雷屯 本局每节点 +N 通宝（触发即设置常驻；每次进入的实际发放由场景按
 * mods.tongbaoPerNode 统一处理，避免首次重复发放）。命中则消耗并返回描述。
 */
export function applyNodeEnterHooks(run: RunState): string | null {
  const card = findBuci(run, 'hex_shui_lei_tun');
  if (!card || card.effect.kind !== 'tongbao_per_node') return null;
  const mods = getBuciMods(run);
  applyMods(run, { tongbaoPerNode: mods.tongbaoPerNode + card.effect.amount });
  consumeBuci(run, card.id);
  return `【水雷屯】本局每节点 +${card.effect.amount} 通宝`;
}

/**
 * 进入黄金台时触发（场景在生成库存前调用，每次进店按常驻值统一发放）：
 * 水风井 每次进店 +N 通宝 / 泽雷随 每次进店回 N 天命 /
 * 雷风恒 刷新价固定 / 风山渐 带印概率 +25% / 水地比 商品 -15%。
 */
export function applyShopEnterHooks(run: RunState): string[] {
  const notes: string[] = [];

  const jing = findBuci(run, 'hex_shui_feng_jing');
  if (jing && jing.effect.kind === 'tongbao_per_shop') {
    applyMods(run, { tongbaoPerShop: getBuciMods(run).tongbaoPerShop + jing.effect.amount });
    consumeBuci(run, jing.id);
    notes.push(`【水风井】每次进店 +${jing.effect.amount} 通宝`);
  }
  const sui = findBuci(run, 'hex_ze_lei_sui');
  if (sui && sui.effect.kind === 'heal_on_shop') {
    applyMods(run, { healPerShop: getBuciMods(run).healPerShop + sui.effect.amount });
    consumeBuci(run, sui.id);
    notes.push(`【泽雷随】每次进店回 ${sui.effect.amount} 天命`);
  }
  const heng = findBuci(run, 'hex_lei_feng_heng');
  if (heng && heng.effect.kind === 'refresh_fixed') {
    applyMods(run, { refreshFixed: heng.effect.price });
    consumeBuci(run, heng.id);
    notes.push(`【雷风恒】刷新费用固定为 ${heng.effect.price} 通宝`);
  }
  const jian = findBuci(run, 'hex_feng_shan_jian');
  if (jian && jian.effect.kind === 'seal_chance_up') {
    applyMods(run, { sealChanceUp: getBuciMods(run).sealChanceUp + jian.effect.percent });
    consumeBuci(run, jian.id);
    notes.push(`【风山渐】带印概率 +${jian.effect.percent}%`);
  }
  const bi = findBuci(run, 'hex_shui_di_bi');
  if (bi && bi.effect.kind === 'shop_discount') {
    applyMods(run, { shopDiscount: getBuciMods(run).shopDiscount + bi.effect.percent });
    consumeBuci(run, bi.id);
    notes.push(`【水地比】商店商品 -${bi.effect.percent}%`);
  }
  return notes;
}

// ── 出售 / 购买 / 招募钩子 ──

/** 出售增益：地山谦 额外 +50% / 水天需 返全价。命中则消耗并返回修正后返还。 */
export function applyBuciSellHooks(run: RunState, baseRefund: number): number {
  let refund = baseRefund;
  const xu = findBuci(run, 'hex_shui_tian_xu');
  if (xu) {
    refund = baseRefund * 2;
    consumeBuci(run, xu.id);
  }
  const qian = findBuci(run, 'hex_di_shan_qian');
  if (qian && qian.effect.kind === 'sell_bonus') {
    refund = Math.round(refund * (1 + qian.effect.percent / 100));
    consumeBuci(run, qian.id);
  }
  return refund;
}

/**
 * 购买后触发类卦象：水泽节 返利 / 风雷益 牌价（本次即享）/ 风天小畜 加牌 /
 * 地水师 赐玄武印 / 地风升 回天命 / 地泽临·地火明夷 招募折扣消耗。
 * 返回提示文本数组。
 */
export function applyBuciPurchaseHooks(run: RunState, item: { kind: string; price: number }): string[] {
  const notes: string[] = [];
  const mods = getBuciMods(run);

  if (item.kind === 'card') {
    const yi = findBuci(run, 'hex_feng_lei_yi');
    if (yi && yi.effect.kind === 'card_buy_discount') {
      applyMods(run, { cardBuyDiscount: mods.cardBuyDiscount + yi.effect.amount });
      consumeBuci(run, yi.id);
      notes.push(`【风雷益】扑克牌 -${yi.effect.amount} 通宝`);
    }
    const newMods = getBuciMods(run);
    if (newMods.cardBuyDiscount > 0) {
      // 本次购买即享（价格在生成库存时未含此折扣）
      const rebate = Math.min(newMods.cardBuyDiscount, item.price - 1);
      if (rebate > 0) {
        run.tongbao += rebate;
      }
    }
    const chu = findBuci(run, 'hex_feng_tian_xiao_chu');
    if (chu && chu.effect.kind === 'extra_card_on_buy') {
      applyMods(run, { extraCardOnBuy: getBuciMods(run).extraCardOnBuy + chu.effect.count });
      consumeBuci(run, chu.id);
      notes.push(`【风天小畜】购买扑克牌额外 +${chu.effect.count} 张`);
    }
    const extra = getBuciMods(run).extraCardOnBuy;
    for (let i = 0; i < extra; i++) {
      run.cardPool.push(makeRandomCard(Math.random, getBuciMods(run).sealChanceUp));
    }
  }

  const jie = findBuci(run, 'hex_shui_ze_jie');
  if (jie && jie.effect.kind === 'cashback') {
    applyMods(run, { cashbackPercent: getBuciMods(run).cashbackPercent + jie.effect.percent });
    consumeBuci(run, jie.id);
    notes.push(`【水泽节】购买返还 ${jie.effect.percent}% 通宝`);
  }
  const cashback = getBuciMods(run).cashbackPercent;
  if (cashback > 0) {
    const refund = Math.round((item.price * cashback) / 100);
    if (refund > 0) {
      run.tongbao += refund;
      notes.push(`返利 +${refund} 通宝`);
    }
  }

  if (item.kind === 'character') {
    const shi = findBuci(run, 'hex_di_shui_shi');
    if (shi && shi.effect.kind === 'grant_seal_on_recruit') {
      let granted = 0;
      for (let i = 0; i < shi.effect.count && run.cardPool.length > 0; i++) {
        const target = run.cardPool[Math.floor(Math.random() * run.cardPool.length)]!;
        target.seal = 'xuanwu';
        granted += 1;
      }
      consumeBuci(run, shi.id);
      notes.push(`【地水师】牌库 ${granted} 张获玄武印`);
    }
    const sheng = findBuci(run, 'hex_di_feng_sheng');
    if (sheng && sheng.effect.kind === 'destiny_up_on_recruit') {
      healDestiny(run, sheng.effect.amount);
      consumeBuci(run, sheng.id);
      notes.push(`【地风升】天命 +${sheng.effect.amount}`);
    }
    // 消耗一次性招募折扣（地泽临 / 地火明夷，价格已在库存生成时计入）
    const recruitMods = getBuciMods(run);
    if (recruitMods.recruitDiscount > 0 || recruitMods.recruitDiscountAfterDefeat > 0) {
      applyMods(run, { recruitDiscount: 0, recruitDiscountAfterDefeat: 0 });
    }
  }

  return notes;
}

// ── 地图行动卦（震为雷 / 雷泽归妹，场景选择节点后调用） ──

/**
 * 震为雷：任意通过一个节点（按该节点类型结算胜利：清节点/推进层数/通宝/利息）。
 * 节点不可重复结算；无卦或节点已通过返回 null。
 */
export function resolvePassAnyNode(run: RunState, node: MapNode): { reward: number; interest: number } | null {
  const card = findBuci(run, 'hex_zhen_wei_lei');
  if (!card || node.cleared) return null;
  consumeBuci(run, card.id);
  return applyVictory(run, node, Math.random);
}

/**
 * 雷泽归妹：跳过本层剩余节点，直接推进一层（被跳节点不结算奖励）。
 * 已在最后一层（36）时不可用，返回 null 不消耗。
 */
export function resolveAdvanceFloor(run: RunState): number | null {
  const card = findBuci(run, 'hex_lei_ze_gui_mei');
  if (!card) return null;
  if (run.floor >= MAP_FLOORS) return null;
  for (const layer of run.layers) {
    for (const n of layer) {
      if (!n.cleared && n.floor === run.floor) n.cleared = true;
    }
  }
  run.floor += 1;
  consumeBuci(run, card.id);
  return run.floor;
}

// ── 战斗开始（局内，场景调用） ──

/** 天风姤：移除一张已招募角色牌（场景已选 characterId）并回天命。命中则消耗并返回描述。 */
export function resolveRemoveCharacter(run: RunState, characterId: PlayerCharacterId): string | null {
  const card = findBuci(run, 'hex_tian_feng_gou');
  if (!card) return null;
  const idx = run.roster.indexOf(characterId);
  if (idx < 0) return null;
  run.roster.splice(idx, 1);
  const amount = card.effect.kind === 'remove_character' ? card.effect.amount : 0;
  healDestiny(run, amount);
  consumeBuci(run, card.id);
  // 地雷复：角色被移除时返还通宝
  const fu = findBuci(run, 'hex_di_lei_fu');
  let refundNote = '';
  if (fu && fu.effect.kind === 'refund_on_remove_character') {
    run.tongbao += fu.effect.amount;
    consumeBuci(run, fu.id);
    refundNote = `，返还 ${fu.effect.amount} 通宝`;
  }
  return `【天风姤】移除【${characterId}】，天命 +${amount}${refundNote}`;
}

/**
 * 战斗开始前的卦象修饰（局内，GameScene 调用）：
 * 读取离为火（气数上限常驻）、火泽睽（移除敌方牌一次性）；
 * 触发火雷噬嗑（系数 +1 一次性）、风地观（手牌 +1 一次性）、风水涣（敌方手牌 -1 一次性）。
 */
export function battleStartBuciMods(run: RunState): {
  vitalityBonus: number;
  coefficientBoost: number;
  handBonus: number;
  enemyHandDown: number;
  removeEnemyCards: boolean;
  notes: string[];
} {
  const mods = getBuciMods(run);
  const notes: string[] = [];

  const shiKe = findBuci(run, 'hex_huo_lei_shi_ke');
  let coefficientBoost = 0;
  if (shiKe && shiKe.effect.kind === 'battle_coefficient_boost') {
    coefficientBoost = shiKe.effect.amount;
    consumeBuci(run, shiKe.id);
    notes.push(`【火雷噬嗑】系数 +${coefficientBoost}`);
  }
  const guan = findBuci(run, 'hex_feng_di_guan');
  let handBonus = 0;
  if (guan && guan.effect.kind === 'battle_start_hand') {
    handBonus = guan.effect.amount;
    consumeBuci(run, guan.id);
    notes.push(`【风地观】手牌 +${handBonus}`);
  }
  const huan = findBuci(run, 'hex_feng_shui_huan');
  let enemyHandDown = 0;
  if (huan && huan.effect.kind === 'enemy_hand_down') {
    enemyHandDown = huan.effect.amount;
    consumeBuci(run, huan.id);
    notes.push(`【风水涣】敌方手牌 -${enemyHandDown}`);
  }
  const removeEnemyCards = mods.removeEnemyCardNext;
  if (removeEnemyCards) {
    applyMods(run, { removeEnemyCardNext: false });
    notes.push('【火泽睽】移除敌方 1 张牌');
  }
  return {
    vitalityBonus: mods.vitalityUpAllBattle,
    coefficientBoost,
    handBonus,
    enemyHandDown,
    removeEnemyCards,
    notes,
  };
}
