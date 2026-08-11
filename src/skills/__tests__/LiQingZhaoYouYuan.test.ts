import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { LiQingZhaoYouYuan } from '../LiQingZhaoYouYuan';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

function makeBattle(overrides: Partial<BattleState['player']> = {}): BattleState {
  return {
    player: {
      hand: [], deck: [], discardPile: [],
      vitality: 500, vitalityMax: 500, name: '玩家',
      ...overrides,
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

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'liqingzhao',
    target: 'enemy',
    playerCharacterIds: ['liqingzhao'],
    pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'spade'), card(6, 'club'), card(7, 'spade')),
    ...partial,
  };
}

function makeVisuals(): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => ({}) as Phaser.Scene,
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

/** mock 一个 CardActionsHost 形状的 scene：addCardsToHand 内部动画全部即时完成 */
function makeHostScene(battle: BattleState): Phaser.Scene {
  const container = {
    x: 0,
    y: 0,
    setDepth: vi.fn(() => container),
    setData: vi.fn(() => container),
    setAlpha: vi.fn(() => container),
    setScale: vi.fn(() => container),
    destroy: vi.fn(),
  };
  return {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    add: { container: vi.fn(() => container) },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
}

describe('LiQingZhaoYouYuan filter（幽怨触发判定）', () => {
  it('打出的牌均为黑色且不小于五张时触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'spade'), card(6, 'club'), card(7, 'spade')),
    });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(true);
  });

  it('含红牌不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'heart'), card(6, 'club'), card(7, 'spade')),
    });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(false);
  });

  it('小于五张不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'spade'), card(6, 'club')),
    });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(false);
  });

  it('含王（suit 为 null）不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'spade'), card(6, 'club'), card(25, null)),
    });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(false);
  });

  it('pattern 缺失不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(LiQingZhaoYouYuan.filter(ctx)).toBe(false);
  });
});

describe('LiQingZhaoYouYuan execute（幽怨收回最大点数牌）', () => {
  it('按 uid 从弃牌堆移除点数最大的牌并收回手牌', async () => {
    const visuals = makeVisuals();
    // 打出 5 张全黑：最大点数 13（K）
    const played = [card(3, 'spade'), card(5, 'club'), card(13, 'spade'), card(6, 'club'), card(9, 'spade')];
    const pattern = patternWith(...played);
    // 弃牌堆中的牌是不同引用但 uid 相同（模拟 4.27 uid 系统）
    const discardPileCards = played.map((c) => ({ ...c }));
    // 弃牌堆中还有一张与打出牌无关的旧弃牌
    const oldDiscard = card(10, 'club');
    const battle = makeBattle({ discardPile: [...discardPileCards, oldDiscard] });
    const scene = makeHostScene(battle);
    const ctx = makeCtx({ battle, pattern, gameScene: scene });

    await LiQingZhaoYouYuan.execute(ctx, visuals);

    const maxUid = played.find((c) => c.rank === 13)!.uid;
    // 弃牌堆中移除了最大点数牌（按 uid），其余弃牌保留
    expect(battle.player.discardPile.some((c) => c.uid === maxUid)).toBe(false);
    expect(battle.player.discardPile.some((c) => c.uid === oldDiscard.uid)).toBe(true);
    // 手牌新增收回的牌
    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.hand[0]!.uid).toBe(maxUid);
    expect(battle.player.hand[0]!.rank).toBe(13);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('多张并列最大点数时随机收回一张', async () => {
    const visuals = makeVisuals();
    // 打出 5 张全黑：两张 13 并列最大
    const played = [card(13, 'spade'), card(13, 'club'), card(5, 'spade'), card(6, 'club'), card(9, 'spade')];
    const pattern = patternWith(...played);
    const discardPileCards = played.map((c) => ({ ...c }));
    const battle = makeBattle({ discardPile: [...discardPileCards] });
    const scene = makeHostScene(battle);
    const ctx = makeCtx({ battle, pattern, gameScene: scene });

    await LiQingZhaoYouYuan.execute(ctx, visuals);

    // 恰好收回一张：弃牌堆剩 4 张，手牌 1 张，且收回的是最大点数（rank 13）之一
    expect(battle.player.discardPile.length).toBe(4);
    expect(battle.player.hand.length).toBe(1);
    const reclaimed = battle.player.hand[0]!;
    expect(reclaimed.rank).toBe(13);
    // 弃牌堆中不再包含被收回的那张 uid
    expect(battle.player.discardPile.some((c) => c.uid === reclaimed.uid)).toBe(false);
  });

  it('弃牌堆中不存在对应 uid 时安静返回，不改变手牌', async () => {
    const visuals = makeVisuals();
    const pattern = patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'spade'), card(6, 'club'), card(7, 'spade'));
    // 弃牌堆中没有与打出牌相同的 uid
    const battle = makeBattle({ discardPile: [card(10, 'club')] });
    const scene = makeHostScene(battle);
    const ctx = makeCtx({ battle, pattern, gameScene: scene });

    await LiQingZhaoYouYuan.execute(ctx, visuals);

    expect(battle.player.discardPile.length).toBe(1);
    expect(battle.player.hand.length).toBe(0);
  });
});

describe('LiQingZhaoYouYuan 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(LiQingZhaoYouYuan.id).toBe('liqingzhao_youyuan');
    expect(LiQingZhaoYouYuan.name).toBe('幽怨');
    expect(LiQingZhaoYouYuan.timing).toBe('after_damage');
    expect(LiQingZhaoYouYuan.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
