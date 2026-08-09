import { HandType, type HandPattern } from '../models/BattleTypes';
import type { ResponseBlockModifier } from './SkillTypes';
import { LiBaiShiXianBlock } from './LiBaiShiXian';
import { BaozhengTieDuanBlock } from './BaozhengTieDuan';

export type { ResponseBlockModifier };

const PASSIVE_SKILLS = new Map<string, ResponseBlockModifier[]>();

export function registerResponseBlock(characterId: string, modifier: ResponseBlockModifier): void {
  if (!PASSIVE_SKILLS.has(characterId)) {
    PASSIVE_SKILLS.set(characterId, []);
  }
  const arr = PASSIVE_SKILLS.get(characterId)!;
  if (!arr.includes(modifier)) {
    arr.push(modifier);
  }
}

/** 注册所有静态被动技能。每次创建 GameScene 时在 clearPassiveSkills 之后调用。 */
export function registerAllPassiveSkills(): void {
  PASSIVE_SKILLS.clear();
  registerResponseBlock('banner_army', {
    type: 'response_block',
    getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
      const lp = ctx.lastPlay;
      if (lp.type === HandType.Single && lp.cards.length === 1 && lp.cards[0]!.suit === 'diamond') {
        return [HandType.Single];
      }
      return [];
    },
  });
  // 李白「诗仙」：玩家打出 5/7 张牌时，敌方只能以王炸响应
  registerResponseBlock('libai', LiBaiShiXianBlock);
  // 包拯「铁断」：玩家打出单张 9/小王/大王时，对方无法使用任何牌应对（封锁全部牌型）
  registerResponseBlock('baozheng', BaozhengTieDuanBlock);
}

/**
 * 查询某角色注册的响应封锁类型。
 * 注意：该角色既可能是敌方（封锁玩家响应，如八旗军「骑射」），
 * 也可能是玩家（封锁敌方 AI 响应，如李白「诗仙」），调用方需按需传入对应阵营的 id。
 */
export function getBlockedResponseTypes(characterId: string | undefined, lastPlay: HandPattern | null): HandType[] {
  if (!characterId || !lastPlay) return [];
  const modifiers = PASSIVE_SKILLS.get(characterId);
  if (!modifiers) return [];
  const blocked: HandType[] = [];
  for (const mod of modifiers) {
    blocked.push(...mod.getBlockedTypes({ lastPlay }));
  }
  return blocked;
}

export function clearPassiveSkills(): void {
  PASSIVE_SKILLS.clear();
}
