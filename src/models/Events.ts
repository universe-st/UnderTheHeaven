import type { RunState } from './RunState';
import type { ShopItem } from './Shop';
import { BUCI_CATALOG, characterPrice } from './Shop';
import { PLAYER_CHARACTER_LIST } from './Character';

export type EventEffect =
  | { type: 'none' }
  | { type: 'tongbao'; amount: number; amountMax?: number }
  | { type: 'destiny'; amount: number }
  | { type: 'buci' }
  | { type: 'battle' }
  | { type: 'recruit'; discount: number }
  | { type: 'trade'; tongbaoCost: number; destinyGain: number }
  | { type: 'gamble'; tongbaoCost: number; winAmount: number; winChance: number }
  | { type: 'destiny_buci'; amount: number };

export interface EventChoice {
  label: string;
  effect: EventEffect;
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
}

/** 供场景层消费的事件结算结果 */
export interface EventResult {
  success: boolean;
  description: string;
  startBattle?: boolean;
  shopItem?: ShopItem;
}

export const GAME_EVENTS: GameEvent[] = [
  {
    id: 'shan_shen_miao',
    title: '山神庙',
    description: '一座香火凋零的山神庙，神像前的供桌上还摆着新鲜的贡品。',
    choices: [
      { label: '虔诚祭拜（天命+15）', effect: { type: 'destiny', amount: 15 } },
      { label: '离开', effect: { type: 'none' } },
    ],
  },
  {
    id: 'shihuang',
    title: '拾荒',
    description: '路边的废墟中散落着前人留下的遗物，或许能翻出一些值钱的东西。',
    choices: [{ label: '搜刮一番（通宝+10~20）', effect: { type: 'tongbao', amount: 10, amountMax: 20 } }],
  },
  {
    id: 'qiyu_laozhe',
    title: '奇遇老者',
    description: '一位鹤发童颜的老者拦住去路，笑吟吟地看着你，似乎愿意指点一二。',
    choices: [
      { label: '收下赠礼（通宝+25）', effect: { type: 'tongbao', amount: 25 } },
      { label: '请教天机（天命-5，获得随机卜辞）', effect: { type: 'destiny_buci', amount: -5 } },
    ],
  },
  {
    id: 'dufang',
    title: '赌坊',
    description: '喧闹的赌坊里骰子声不绝于耳，庄家向你招了招手。',
    choices: [
      { label: '押 15 通宝（50% 得 35）', effect: { type: 'gamble', tongbaoCost: 15, winAmount: 35, winChance: 0.5 } },
      { label: '离开', effect: { type: 'none' } },
    ],
  },
  {
    id: 'fubing',
    title: '伏兵',
    description: '行至险隘，两侧杀声骤起——中了埋伏！',
    choices: [{ label: '迎战', effect: { type: 'battle' } }],
  },
  {
    id: 'liulang_wushi',
    title: '流浪武士',
    description: '一位落魄的武士正在兜售自己的武艺，只要价钱合适，他愿意随行。',
    choices: [
      { label: '打折招募（8 折）', effect: { type: 'recruit', discount: 0.8 } },
      { label: '离开', effect: { type: 'none' } },
    ],
  },
  {
    id: 'baoxiang',
    title: '宝箱',
    description: '草丛中藏着一只上锁的木箱，锁已经锈得不成样子了。',
    choices: [{ label: '撬开（获得随机卜辞）', effect: { type: 'buci' } }],
  },
  {
    id: 'xingjiao_shang',
    title: '行脚商',
    description: '一位走南闯北的行脚商向你兜售一包"续命丹"，号称能稳固气运。',
    choices: [
      { label: '30 通宝换 15 天命', effect: { type: 'trade', tongbaoCost: 30, destinyGain: 15 } },
      { label: '离开', effect: { type: 'none' } },
    ],
  },
];

export function randomEvent(rng: () => number): GameEvent {
  return GAME_EVENTS[Math.floor(rng() * GAME_EVENTS.length)]!;
}

function clampDestiny(run: RunState): void {
  run.destiny = Math.max(0, Math.min(run.destinyMax, run.destiny));
}

function gainRandomBuci(run: RunState, rng: () => number): string {
  const entry = BUCI_CATALOG[Math.floor(rng() * BUCI_CATALOG.length)]!;
  run.buciCards.push({ ...entry.buci });
  return entry.buci.name;
}

/**
 * 应用事件选项并结算效果。保证通宝不为负、天命在 [0, destinyMax]。
 * 资源不足（赌坊/行脚商）时返回 success: false 且状态不变。
 */
export function applyEventChoice(run: RunState, event: GameEvent, choiceIdx: number, rng: () => number): EventResult {
  const choice = event.choices[choiceIdx];
  if (!choice) {
    return { success: false, description: '无效的选择。' };
  }
  const effect = choice.effect;

  switch (effect.type) {
    case 'none':
      return { success: true, description: '你没有停留，继续赶路。' };

    case 'tongbao': {
      const amount =
        effect.amountMax !== undefined
          ? effect.amount + Math.floor(rng() * (effect.amountMax - effect.amount + 1))
          : effect.amount;
      run.tongbao = Math.max(0, run.tongbao + amount);
      return { success: true, description: `获得了 ${amount} 通宝。` };
    }

    case 'destiny': {
      run.destiny += effect.amount;
      clampDestiny(run);
      return {
        success: true,
        description: effect.amount >= 0 ? `天命回复了 ${effect.amount} 点。` : `天命损失了 ${-effect.amount} 点。`,
      };
    }

    case 'destiny_buci': {
      run.destiny += effect.amount;
      clampDestiny(run);
      const name = gainRandomBuci(run, rng);
      return {
        success: true,
        description: `天命损失了 ${-effect.amount} 点，获得卜辞【${name}】。`,
      };
    }

    case 'buci': {
      const name = gainRandomBuci(run, rng);
      return { success: true, description: `获得了卜辞【${name}】。` };
    }

    case 'battle':
      return { success: true, description: '伏兵杀出，准备战斗！', startBattle: true };

    case 'recruit': {
      const unrecruited = PLAYER_CHARACTER_LIST.filter((c) => !run.roster.includes(c.id));
      const first = unrecruited[Math.floor(rng() * unrecruited.length)];
      if (!first) {
        return { success: false, description: '已没有可招募的角色。' };
      }
      const shopItem: ShopItem = {
        kind: 'character',
        characterId: first.id,
        price: Math.ceil(characterPrice(first.id) * effect.discount),
      };
      return {
        success: true,
        description: `武士愿以 ${shopItem.price} 通宝的折价为【${first.name}】引荐随行。`,
        shopItem,
      };
    }

    case 'trade': {
      if (run.tongbao < effect.tongbaoCost) {
        return { success: false, description: '通宝不足，交易作罢。' };
      }
      run.tongbao -= effect.tongbaoCost;
      run.destiny += effect.destinyGain;
      clampDestiny(run);
      return { success: true, description: `以 ${effect.tongbaoCost} 通宝换得 ${effect.destinyGain} 点天命。` };
    }

    case 'gamble': {
      if (run.tongbao < effect.tongbaoCost) {
        return { success: false, description: '通宝不足，无法下注。' };
      }
      run.tongbao -= effect.tongbaoCost;
      if (rng() < effect.winChance) {
        run.tongbao += effect.winAmount;
        return { success: true, description: `赌赢了！获得 ${effect.winAmount} 通宝。` };
      }
      return { success: true, description: '赌输了，血本无归。' };
    }
  }
}
