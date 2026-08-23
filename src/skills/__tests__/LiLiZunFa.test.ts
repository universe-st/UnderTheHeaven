import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import type { PlayerCharacterId } from '../../models/Character';
import { LiLiZunFa } from '../LiLiZunFa';

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

function joker(rank: 25 | 30): Card {
  idc += 1;
  return { uid: `c${idc}`, suit: null, rank, rankLabel: rankToLabel(rank), score: rank };
}

function makeBattle(enemyHand: Card[] = []): BattleState {
  return {
    player: {
      hand: [], deck: [], discardPile: [],
      vitality: 500, vitalityMax: 500, name: '玩家',
    },
    enemy: {
      hand: enemyHand, deck: [], discardPile: [],
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
    roster?: PlayerCharacterId[];
    sourceCharacterId?: string;
    enemyCharacterId?: string;
  } = {},
): SkillContext {
  return {
    gameScene: {
      battle,
      scale: { width: 2400, height: 1080 },
      time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    } as unknown as Phaser.Scene,
    battle,
    sourceCharacterId: opts.sourceCharacterId ?? 'lili',
    playerCharacterIds: (opts.roster ?? ['lili']) as string[],
    enemyCharacterId: opts.enemyCharacterId ?? 'qiangdao',
  } as unknown as SkillContext;
}

function makeVisuals(): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => ({
      scale: { width: 2400, height: 1080 },
      time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    }) as Phaser.Scene,
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

beforeEach(() => {
  discardMock.mockReset();
  // 默认弃置实现：从敌方手牌移除并进弃牌堆（含索引倒序处理）
  discardMock.mockImplementation(async (scene: { battle: BattleState }, target: string, indices: number[]) => {
    const state = target === 'enemy' ? scene.battle.enemy : scene.battle.player;
    const sorted = [...indices].sort((a, b) => b - a);
    const removed: Card[] = [];
    for (const i of sorted) {
      const [c] = state.hand.splice(i, 1);
      if (c) removed.push(c);
    }
    state.discardPile.push(...removed);
    return removed;
  });
});

describe('李离「尊法」filter（纯判定）', () => {
  it('李离在阵容 + 玩家获得牌权 + 对方有手牌 → 触发', () => {
    const battle = makeBattle([card(3), card(5)]);
    expect(LiLiZunFa.filter(makeCtx(battle))).toBe(true);
  });

  it('敌方获得牌权（sourceCharacterId 为敌方）→ 不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(LiLiZunFa.filter(makeCtx(battle, { sourceCharacterId: 'qiangdao' }))).toBe(false);
  });

  it('对方无手牌 → 不触发（条件是对方有手牌）', () => {
    const battle = makeBattle([]);
    expect(LiLiZunFa.filter(makeCtx(battle))).toBe(false);
  });

  it('李离不在阵容 → 不触发', () => {
    const battle = makeBattle([card(3)]);
    expect(LiLiZunFa.filter(makeCtx(battle, { roster: ['hanxin'] }))).toBe(false);
  });
});

describe('李离「尊法」execute（弃置对方手牌 + 记录）', () => {
  it('弃置对方分数最低的一张，记录花色/点数/触发标记', async () => {
    const battle = makeBattle([card(10, 'heart'), card(3, 'spade'), card(5, 'club')]);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals();

    // mock discardCardsFromHand 返回被弃的牌（spade 3，分数最低）
    discardMock.mockImplementation(async (scene: { battle: BattleState }, target: string, indices: number[]) => {
      const state = scene.battle.enemy;
      const sorted = [...indices].sort((a, b) => b - a);
      const removed: Card[] = [];
      for (const i of sorted) {
        const [c] = state.hand.splice(i, 1);
        if (c) removed.push(c);
      }
      state.discardPile.push(...removed);
      return removed;
    });

    await LiLiZunFa.execute(ctx, visuals);

    expect(discardMock).toHaveBeenCalledWith(ctx.gameScene, 'enemy', [1]); // spade 3（最低分）
    expect(ctx.battle.liliZunfaSuit).toBe('spade');
    expect(ctx.battle.liliZunfaRank).toBe(3);
    expect(ctx.battle.liliZunfaTriggered).toBe(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('被弃牌为大小王（suit null）：不设禁花色，但伏剑前置条件照常记录', async () => {
    // 手牌只有王：AI 弃唯一牌（虎 25），suit 为 null
    const battle = makeBattle([joker(25)]);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals();

    await LiLiZunFa.execute(ctx, visuals);

    expect(ctx.battle.liliZunfaSuit).toBeUndefined();
    expect(ctx.battle.liliZunfaRank).toBe(25);
    expect(ctx.battle.liliZunfaTriggered).toBe(true);
  });

  it('敌方无手牌：直接返回，不记录', async () => {
    const battle = makeBattle([]);
    const ctx = makeCtx(battle);
    const visuals = makeVisuals();

    await LiLiZunFa.execute(ctx, visuals);

    expect(discardMock).not.toHaveBeenCalled();
    expect(ctx.battle.liliZunfaTriggered).toBeUndefined();
  });
});

describe('李离「尊法」配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(LiLiZunFa.id).toBe('lili_zunfa');
    expect(LiLiZunFa.name).toBe('尊法');
    expect(LiLiZunFa.timing).toBe('on_gain_turn');
    expect(LiLiZunFa.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
