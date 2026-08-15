import type { Card } from '../models/Card';

/**
 * 公共事件「选择手牌」：在玩家手牌区点选符合要求的牌，点「确定」确认
 * （符合要求时确认键亮起），或点「取消」放弃（forced 时禁止取消）。
 *
 * - 由玩家执行：在手牌区交互选牌（阻塞等待玩家确认/取消，无中央临时展示）。
 * - 由敌人执行：直接返回 AI 的判断（无 UI、无动画）。
 *
 * 技能通过宿主（GameScene 实现 HandSelectEvent）调用：
 *   const chosen = await (ctx.gameScene as Phaser.Scene & HandSelectEvent)
 *     .selectHandCards({ side, want, filter, forced, title, aiPick });
 */
export interface HandSelectOptions {
  /** 执行方：玩家 → 手牌区交互选牌；敌人 → 直接返回 AI 判断（无动画） */
  side: 'player' | 'enemy';
  /**
   * 判断所选牌是否符合要求（如"恰好三张"、"分数不低于 X"）。
   * 玩家侧：符合时确认键亮起（可确认），不符合时确认键置灰（点击无效）。
   * 敌人侧：作为 AI 选牌的判定标准。
   */
  want: (selected: Card[]) => boolean;
  /** 单牌可选过滤；返回 false 的牌不可选（置灰、点击无效）。缺省全部可选 */
  filter?: (card: Card) => boolean;
  /** 是否禁止取消：true 时不显示取消按钮（forced）。缺省 false */
  forced?: boolean;
  /** 选牌提示文案（玩家侧显示在手牌区上方） */
  title?: string;
  /**
   * 敌人侧 AI 选牌策略；缺省用 aiPickDefault（组合枚举，返回第一个满足
   * want 的最小组合）。
   */
  aiPick?: (hand: Card[]) => Card[] | null;
}

/** 公共事件宿主：由对战场景（GameScene）实现，技能经由 ctx.gameScene 调用 */
export interface HandSelectEvent {
  selectHandCards(options: HandSelectOptions): Promise<Card[] | null>;
}

/** AI 组合枚举上限（防止组合爆炸拖垮决策） */
const AI_COMBO_LIMIT = 20000;

/** 组合枚举生成器（按索引递增顺序，每个组合恰好一次） */
function* combinations<T>(arr: T[], size: number): Generator<T[]> {
  const n = arr.length;
  if (size <= 0 || size > n) return;
  const idx = Array.from({ length: size }, (_, i) => i);
  for (;;) {
    yield idx.map(i => arr[i]!);
    let i = size - 1;
    while (i >= 0 && idx[i] === n - size + i) i--;
    if (i < 0) break;
    idx[i]!++;
    for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1]! + 1;
  }
}

/**
 * 敌人侧默认 AI 选牌：从可选牌中按组合大小从小到大枚举，
 * 返回第一个满足 want 的组合；无满足组合（或超出组合上限）返回 null。
 * 若 options.aiPick 提供，则直接使用（技能自定义 AI 策略优先）。
 */
export function aiPickDefault(hand: Card[], options: HandSelectOptions): Card[] | null {
  if (options.aiPick) return options.aiPick(hand);
  const filter = options.filter ?? (() => true);
  const candidates = hand.filter(filter);
  if (candidates.length === 0) return null;
  let totalTried = 0;
  for (let size = 1; size <= candidates.length; size++) {
    for (const combo of combinations(candidates, size)) {
      if (++totalTried > AI_COMBO_LIMIT) return null;
      if (options.want(combo)) return combo;
    }
  }
  return null;
}
