import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { LiQingZhaoHaoFang } from '../LiQingZhaoHaoFang';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'heart'): Card {
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
    pattern: patternWith(card(3, 'heart'), card(4, 'diamond'), card(5, 'heart'), card(6, 'diamond'), card(7, 'heart')),
    singleCard: {
      card: {} as never,
      scoreText: {} as never,
      baseScore: 8,
      scoreBonus: 0,
    },
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

function sceneWithTweens(): Phaser.Scene {
  return {
    tweens: {
      addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
    },
  } as unknown as Phaser.Scene;
}

describe('LiQingZhaoHaoFang filter（豪放触发判定）', () => {
  it('打出的牌均为红色且不小于五张时触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'heart'), card(4, 'diamond'), card(5, 'heart'), card(6, 'diamond'), card(7, 'heart')),
    });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(true);
  });

  it('含黑牌不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'heart'), card(4, 'diamond'), card(5, 'spade'), card(6, 'diamond'), card(7, 'heart')),
    });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });

  it('小于五张不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'heart'), card(4, 'diamond'), card(5, 'heart'), card(6, 'diamond')),
    });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });

  it('含王（suit 为 null）不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'heart'), card(4, 'diamond'), card(5, 'heart'), card(6, 'diamond'), card(25, null)),
    });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失不触发', () => {
    const ctx = makeCtx({ singleCard: undefined });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });

  it('pattern 缺失不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(LiQingZhaoHaoFang.filter(ctx)).toBe(false);
  });
});

describe('LiQingZhaoHaoFang execute（豪放分数翻倍）', () => {
  it('scoreBonus += baseScore，最终计分 = 2 × baseScore', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: sceneWithTweens(),
      singleCard: {
        card: {} as never,
        scoreText: {} as never,
        baseScore: 8,
        scoreBonus: 0,
      },
    });
    await LiQingZhaoHaoFang.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(8);
    expect(ctx.singleCard!.baseScore + ctx.singleCard!.scoreBonus).toBe(16);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('LiQingZhaoHaoFang 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(LiQingZhaoHaoFang.id).toBe('liqingzhao_haofang');
    expect(LiQingZhaoHaoFang.name).toBe('豪放');
    expect(LiQingZhaoHaoFang.timing).toBe('on_single_card_settlement');
    expect(LiQingZhaoHaoFang.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
