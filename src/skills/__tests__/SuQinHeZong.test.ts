import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { SuQinHeZong } from '../SuQinHeZong';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

function makeBattle(): BattleState {
  return {
    player: {
      hand: [], deck: [], discardPile: [],
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

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  const battle = makeBattle();
  return {
    gameScene: {} as Phaser.Scene,
    battle,
    sourceCharacterId: 'suqin',
    target: 'enemy',
    playerCharacterIds: ['suqin'],
    pattern: patternWith(card(3), card(4), card(5), card(6)),
    damageInfo: { sumRanks: 18, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 18 },
    centerCardContainers: [{} as never, {} as never, {} as never, {} as never],
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

describe('SuQinHeZong filter（合纵触发判定）', () => {
  it('你打出的牌全部点数≤6 时触发', () => {
    expect(SuQinHeZong.filter(makeCtx())).toBe(true);
  });

  it('包含点数>6 的牌不触发（7 不满足）', () => {
    const ctx = makeCtx({ pattern: patternWith(card(3), card(4), card(7)) });
    expect(SuQinHeZong.filter(ctx)).toBe(false);
  });

  it('王（无点数，rank 25/30）不满足「均有点数且不大于6」', () => {
    const ctx = makeCtx({ pattern: patternWith(card(3), card(25, null)) });
    expect(SuQinHeZong.filter(ctx)).toBe(false);
  });

  it('敌方结算（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(SuQinHeZong.filter(ctx)).toBe(false);
  });

  it('苏秦不在场不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(SuQinHeZong.filter(ctx)).toBe(false);
  });

  it('单张点数≤6 也触发（X=1）', () => {
    const ctx = makeCtx({ pattern: patternWith(card(3)) });
    expect(SuQinHeZong.filter(ctx)).toBe(true);
  });
});

describe('SuQinHeZong execute（合纵系数加成）', () => {
  it('系数 +X（X=牌数）并同步重算 finalDamage', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx();
    const { damageInfo, pattern } = ctx;
    expect(damageInfo).toBeDefined();
    expect(pattern).toBeDefined();

    await SuQinHeZong.execute(ctx, visuals);

    // 4 张牌 → 系数 +4：1 → 5；finalDamage = 18 × 5 × 1 = 90
    expect(damageInfo!.coefficient).toBe(5);
    expect(damageInfo!.finalDamage).toBe(90);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
    expect(visuals.animateCardScale).toHaveBeenCalled();
  });

  it('在已有系数上叠加（不基于 baseCoefficient 重算，保留其他技能加成）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      damageInfo: { sumRanks: 18, coefficient: 1.6, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 29 },
    });

    await SuQinHeZong.execute(ctx, visuals);

    expect(ctx.damageInfo!.coefficient).toBeCloseTo(1.6 + 4);
    expect(ctx.damageInfo!.finalDamage).toBe(Math.round(18 * (1.6 + 4)));
  });
});

describe('SuQinHeZong 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(SuQinHeZong.id).toBe('suqin_hezong');
    expect(SuQinHeZong.name).toBe('合纵');
    expect(SuQinHeZong.timing).toBe('on_coefficient_revealed');
    expect(SuQinHeZong.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
