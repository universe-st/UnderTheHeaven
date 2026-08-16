import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import type { PlayerCharacterId } from '../../models/Character';
import { HaiRuiJianShu } from '../HaiRuiJianShu';

// ── mock CardActions：弃置即时生效（动画与 Phaser 依赖不在本测试范围） ──
const { discardMock } = vi.hoisted(() => ({
  discardMock: vi.fn(),
}));
vi.mock('../../utils/CardActions', () => ({
  discardCardsFromHand: (...args: unknown[]) => discardMock(...args),
}));

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function makeBattle(hand: Card[] = [], deck: Card[] = []): BattleState {
  return {
    player: {
      hand, deck, discardPile: [],
      vitality: 500, vitalityMax: 500, name: '玩家',
    },
    enemy: {
      hand: [], deck: [], discardPile: [],
      vitality: 500, vitalityMax: 500, name: '敌方',
    },
    turnHolder: 'player',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };
}

function makeCtx(
  battle: BattleState,
  opts: {
    damageInfo?: NonNullable<SkillContext['damageInfo']>;
    target?: 'enemy' | 'player';
    roster?: PlayerCharacterId[];
    lost?: PlayerCharacterId[];
  } = {},
): SkillContext {
  const b: BattleState = opts.lost
    ? { ...battle, player: { ...battle.player, lostCharacters: opts.lost } }
    : battle;
  const gameScene = {
    battle: b,
    add: {
      text: vi.fn(() => {
        const t = { y: 0, setOrigin: vi.fn(() => t), setDepth: vi.fn(() => t), setAlpha: vi.fn(() => t), destroy: vi.fn() };
        return t;
      }),
    },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    // 公共事件「摸满手牌」：mock 补满实现（对齐 BattleFlowManager.refillPlayerHandAndNotify：
    // 手牌空时补满至 17，牌堆不足则并入弃牌堆）
    refillPlayerHandAndNotify: vi.fn(async () => {
      const player = gameScene.battle.player;
      if (player.hand.length === 0) {
        let needed = 17;
        if (player.deck.length < needed) {
          player.deck = [...player.discardPile.splice(0), ...player.deck];
        }
        while (needed > 0 && player.deck.length > 0) {
          player.hand.push(player.deck.pop()!);
          needed--;
        }
      }
    }),
    skillEventBus: { emit: vi.fn(async () => undefined) },
  };
  return {
    gameScene: gameScene as unknown as Phaser.Scene,
    battle: b,
    sourceCharacterId: 'hairui',
    playerCharacterIds: (opts.roster ?? ['hairui']) as string[],
    enemyCharacterId: 'shizu',
    target: opts.target ?? 'enemy',
    damageInfo: opts.damageInfo ?? { sumRanks: 50, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 50 },
  } as unknown as SkillContext;
}

function makeVisuals(scene: Phaser.Scene): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => scene,
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

const dmg = (finalDamage: number): NonNullable<SkillContext['damageInfo']> => ({
  sumRanks: finalDamage,
  coefficient: 1,
  baseCoefficient: 1,
  damageMultiplier: 1,
  finalDamage,
});

beforeEach(() => {
  discardMock.mockReset();
  // 默认弃置实现：从手牌移除并进弃牌堆（含索引倒序处理）
  discardMock.mockImplementation(async (scene: { battle: BattleState }, _target: string, indices: number[]) => {
    const hand = scene.battle.player.hand;
    const sorted = [...indices].sort((a, b) => b - a);
    const removed: Card[] = [];
    for (const i of sorted) {
      const [c] = hand.splice(i, 1);
      if (c) removed.push(c);
    }
    scene.battle.player.discardPile.push(...removed);
    return removed;
  });
});

describe('海瑞「谏疏」filter（纯判定）', () => {
  it('玩家打出牌造成伤害后触发', () => {
    const battle = makeBattle([card(3)]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { damageInfo: dmg(50) }))).toBe(true);
  });

  it('玩家受到伤害（target=player）不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { damageInfo: dmg(50), target: 'player' }))).toBe(false);
  });

  it('伤害为 0 不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { damageInfo: dmg(0) }))).toBe(false);
  });

  it('海瑞不在阵容不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { roster: ['hanxin'] }))).toBe(false);
  });

  it('海瑞已失去角色牌不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { lost: ['hairui'] }))).toBe(false);
  });

  it('无手牌时不触发（「若你有手牌」）', () => {
    const battle = makeBattle([]);
    expect(HaiRuiJianShu.filter(makeCtx(battle, { damageInfo: dmg(50) }))).toBe(false);
  });
});

describe('海瑞「谏疏」execute（弃牌或移除）', () => {
  it('玩家选择弃置一张牌：弃置进弃牌堆，海瑞保留', async () => {
    const a = card(3);
    const b = card(5);
    const battle = makeBattle([a, b]);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals(ctx.gameScene);

    (ctx.gameScene as unknown as { selectHandCards: (o: { want: (s: Card[]) => boolean }) => Promise<Card[] | null> })
      .selectHandCards = async (o) => (o.want([a]) ? [a] : null);

    await HaiRuiJianShu.execute(ctx, visuals);

    expect(battle.player.hand.map((c) => c.uid)).toEqual([b.uid]);
    expect(battle.player.discardPile.map((c) => c.uid)).toContain(a.uid);
    expect(battle.player.lostCharacters ?? []).not.toContain('hairui');
    expect(visuals.markCharacterLost as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    // 弃 1 张后手牌仍非空：不触发摸满（公共事件 refillPlayerHandAndNotify 不调用）
    const notify = (ctx.gameScene as unknown as { refillPlayerHandAndNotify: ReturnType<typeof vi.fn> }).refillPlayerHandAndNotify;
    expect(notify).not.toHaveBeenCalled();
  });

  it('玩家取消（选择移除）：海瑞进入 lostCharacters 并从角色区消失', async () => {
    const battle = makeBattle([card(3), card(5)]);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals(ctx.gameScene);

    (ctx.gameScene as unknown as { selectHandCards: () => Promise<Card[] | null> })
      .selectHandCards = async () => null;

    await HaiRuiJianShu.execute(ctx, visuals);

    expect(battle.player.lostCharacters).toContain('hairui');
    expect(visuals.markCharacterLost as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('hairui');
  });

  it('弃置后失去最后一张手牌：触发公共事件摸满手牌', async () => {
    const only = card(3);
    // 16 张牌堆 + 弃掉的 1 张（入弃牌堆）→ 补满 17
    const deck = Array.from({ length: 16 }, (_, i) => card(5 + i));
    const battle = makeBattle([only], deck);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals(ctx.gameScene);

    (ctx.gameScene as unknown as { selectHandCards: (o: { want: (s: Card[]) => boolean }) => Promise<Card[] | null> })
      .selectHandCards = async (o) => (o.want([only]) ? [only] : null);

    await HaiRuiJianShu.execute(ctx, visuals);

    // 弃置唯一手牌 → 触发公共事件「摸满手牌」（补满至 17 + 广播 ON_HAND_REFILLED）
    const notify = (ctx.gameScene as unknown as { refillPlayerHandAndNotify: ReturnType<typeof vi.fn> }).refillPlayerHandAndNotify;
    expect(notify).toHaveBeenCalledTimes(1);
    // mock 补满实现把 3 张牌堆摸入，达到 17 上限
    expect(battle.player.hand).toHaveLength(17);
    // 海瑞保留
    expect(battle.player.lostCharacters ?? []).not.toContain('hairui');
  });
});

describe('海瑞「谏疏」配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(HaiRuiJianShu.id).toBe('hairui_jianshu');
    expect(HaiRuiJianShu.name).toBe('谏疏');
    expect(HaiRuiJianShu.timing).toBe('after_damage');
    expect(HaiRuiJianShu.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
