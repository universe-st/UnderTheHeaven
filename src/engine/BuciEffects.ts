/**
 * 卜辞卦象效果引擎（纯逻辑，可单测）。
 * 所有卦象一次性消耗：主动使用或被动触发都会 consumeBuci（count -1，归零移出栏）。
 * 交互类效果（天风姤选角色、后续坤为地选牌）由场景弹选择 UI 后再调用对应 resolve 函数。
 */
import type { RunState, BuCiCard, BuCiEffect, NodeType } from '../models/RunState';
import type { PlayerCharacterId } from '../models/Character';

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

function clampDestiny(run: RunState): void {
  run.destiny = Math.max(0, Math.min(run.destinyMax, run.destiny));
}

/**
 * 应用不依赖交互选择的卦象效果（纯数值类），返回描述文本。
 */
export function applyDirectEffect(run: RunState, effect: BuCiEffect): string {
  switch (effect.kind) {
    case 'destiny_up': {
      run.destinyMax += effect.maxInc;
      run.destiny += effect.curInc;
      clampDestiny(run);
      return `天命上限 +${effect.maxInc}，天命 +${effect.curInc}`;
    }
    case 'destiny_max_down_cur_up': {
      run.destinyMax = Math.max(0, run.destinyMax - effect.maxDown);
      run.destiny += effect.curUp;
      clampDestiny(run);
      return `天命上限 -${effect.maxDown}，天命 +${effect.curUp}`;
    }
    default:
      return '';
  }
}

/** 是否为可直接数值结算的主动卦象 */
export function isSimpleActiveEffect(effect: BuCiEffect): boolean {
  return effect.kind === 'destiny_up' || effect.kind === 'destiny_max_down_cur_up';
}

/**
 * 主动使用纯数值类卦象（乾为天 / 天地否），应用并消耗。
 * 返回效果文本；无此卦、非主动或不可用返回 null。
 */
export function useSimpleActive(run: RunState, id: string): string | null {
  const card = findBuci(run, id);
  if (!card || card.type !== 'active') return null;
  if (!isSimpleActiveEffect(card.effect)) return null;
  const desc = applyDirectEffect(run, card.effect);
  consumeBuci(run, id);
  return desc;
}

// ── 被动触发 ──

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
  run.destiny += amount;
  clampDestiny(run);
  consumeBuci(run, card.id);
  return `【天火同人】天命 +${amount}`;
}

/** 天雷无妄：事件节点需选择选项时回天命（场景随后执行随机选）。命中则消耗并返回描述。 */
export function triggerEventAutopick(run: RunState): string | null {
  const card = findBuci(run, 'hex_tian_lei_wu_wang');
  if (!card) return null;
  const amount = card.effect.kind === 'event_autopick' ? card.effect.amount : 0;
  run.destiny += amount;
  clampDestiny(run);
  consumeBuci(run, card.id);
  return `【天雷无妄】天命 +${amount}`;
}

/** 天山遁：选择战斗节点时跳过战斗并回天命。命中则消耗并返回描述。 */
export function triggerSkipBattle(run: RunState): string | null {
  const card = findBuci(run, 'hex_tian_shan_dun');
  if (!card) return null;
  const amount = card.effect.kind === 'skip_battle' ? card.effect.amount : 0;
  run.destiny += amount;
  clampDestiny(run);
  consumeBuci(run, card.id);
  return `【天山遁】跳过战斗，天命 +${amount}`;
}

/** 天风姤：移除一张已招募角色牌（场景已选 characterId）并回天命。命中则消耗并返回描述。 */
export function resolveRemoveCharacter(run: RunState, characterId: PlayerCharacterId): string | null {
  const card = findBuci(run, 'hex_tian_feng_gou');
  if (!card) return null;
  const idx = run.roster.indexOf(characterId);
  if (idx < 0) return null;
  run.roster.splice(idx, 1);
  const amount = card.effect.kind === 'remove_character' ? card.effect.amount : 0;
  run.destiny += amount;
  clampDestiny(run);
  consumeBuci(run, card.id);
  return `【天风姤】移除【${characterId}】，天命 +${amount}`;
}
