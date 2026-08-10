import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { HuaMulanCongJun } from '../HuaMulanCongJun';

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
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'huamulan',
    target: 'enemy',
    playerCharacterIds: ['huamulan'],
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

describe('HuaMulanCongJun filter（从军触发判定）', () => {
  it('打出的牌包含四种花色时触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'heart'), card(6, 'diamond')),
    });
    expect(HuaMulanCongJun.filter(ctx)).toBe(true);
  });

  it('仅三种花色不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'heart')),
    });
    expect(HuaMulanCongJun.filter(ctx)).toBe(false);
  });

  it('三种花色 + 王（suit 为 null 不参与统计）不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3, 'spade'), card(4, 'club'), card(5, 'heart'), card(25, null)),
    });
    expect(HuaMulanCongJun.filter(ctx)).toBe(false);
  });

  it('pattern 缺失不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(HuaMulanCongJun.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(HuaMulanCongJun.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失不触发', () => {
    const ctx = makeCtx({ singleCard: undefined });
    expect(HuaMulanCongJun.filter(ctx)).toBe(false);
  });
});

describe('HuaMulanCongJun execute（从军加分）', () => {
  it('执行后单牌分数 +20', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: {
        tweens: {
          addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
        },
      } as unknown as Phaser.Scene,
    });
    await HuaMulanCongJun.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(20);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('HuaMulanCongJun 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(HuaMulanCongJun.id).toBe('huamulan_congjun');
    expect(HuaMulanCongJun.name).toBe('从军');
    expect(HuaMulanCongJun.timing).toBe('on_single_card_settlement');
    expect(HuaMulanCongJun.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
