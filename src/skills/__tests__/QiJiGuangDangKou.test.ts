import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { QiJiGuangDangKou } from '../QiJiGuangDangKou';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
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

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'qijiguang',
    target: 'enemy',
    playerCharacterIds: ['qijiguang'],
    pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'heart'), card(6, 'diamond')),
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

describe('QiJiGuangDangKou filter（荡寇触发判定）', () => {
  it('打出牌数量超出对方手牌数时触发', () => {
    // 打出 4 张 > 对方手牌 3 张
    const ctx = makeCtx({
      battle: makeBattle([card(9), card(10), card(11)]),
    });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(true);
  });

  it('打出牌数量等于对方手牌数时不触发（"超出"= 严格大于）', () => {
    const ctx = makeCtx({
      battle: makeBattle([card(9), card(10), card(11), card(12)]),
    });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(false);
  });

  it('打出牌数量少于对方手牌数时不触发', () => {
    const ctx = makeCtx({
      battle: makeBattle([card(9), card(10), card(11), card(12), card(13)]),
    });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）不触发', () => {
    const ctx = makeCtx({
      target: 'player',
      battle: makeBattle([card(9), card(10), card(11)]),
    });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(false);
  });

  it('pattern 缺失不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失不触发', () => {
    const ctx = makeCtx({ singleCard: undefined });
    expect(QiJiGuangDangKou.filter(ctx)).toBe(false);
  });
});

describe('QiJiGuangDangKou execute（荡寇翻倍）', () => {
  it('执行后单牌计分翻倍（scoreBonus += baseScore）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
      gameScene: {
        tweens: {
          addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
        },
      } as unknown as Phaser.Scene,
    });
    await QiJiGuangDangKou.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(8); // 8 + 8 = 16 = 2 × baseScore
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('baseScore 缺失时安静返回，不修改计分', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: undefined, scoreBonus: 0 } as never,
    });
    await QiJiGuangDangKou.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(0);
  });
});

describe('QiJiGuangDangKou 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(QiJiGuangDangKou.id).toBe('qijiguang_dangkou');
    expect(QiJiGuangDangKou.name).toBe('荡寇');
    expect(QiJiGuangDangKou.timing).toBe('on_single_card_settlement');
    expect(QiJiGuangDangKou.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
