import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { SunWuLianBing, SunWuLianBingBonus } from '../SunWu';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return {
    type: HandType.Single,
    cards,
    mainValue: Math.max(...cards.map(c => c.rank)),
    length: cards.length,
  };
}

function makeBattle(overrides: Partial<BattleState> = {}): BattleState {
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
    ...overrides,
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'sunwu',
    target: 'enemy',
    playerCharacterIds: ['sunwu'],
    pattern: patternWith(card(3, 'spade'), card(8, 'heart')),
    damageInfo: { sumRanks: 11, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 11 },
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

/** mock 一个支撑 renderPlayerHand（可选）+ waitForCounterTween + showNotice 的 scene；tween/delay 即时完成 */
function makeMockScene(): Phaser.Scene {
  const text = {
    setOrigin: vi.fn(() => text),
    setDepth: vi.fn(() => text),
    setAlpha: vi.fn(() => text),
    setText: vi.fn(() => text),
    destroy: vi.fn(),
    x: 1200,
    y: 700,
  };
  return {
    renderPlayerHand: vi.fn(),
    add: {
      text: vi.fn(() => text),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void; onUpdate?: (t: { getValue: () => number }) => void; to: number }) => {
        config.onUpdate?.({ getValue: () => config.to });
        config.onComplete?.();
      },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
}

describe('SunWuLianBing filter（练兵打出加成触发判定）', () => {
  it('孙武在场 + 打出牌给敌方 → 触发', () => {
    const ctx = makeCtx();
    expect(SunWuLianBing.filter(ctx)).toBe(true);
  });

  it('非孙武阵容 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(SunWuLianBing.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(SunWuLianBing.filter(ctx)).toBe(false);
  });

  it('pattern 缺失 → 不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(SunWuLianBing.filter(ctx)).toBe(false);
  });
});

describe('SunWuLianBing execute（练兵打出永久加分）', () => {
  it('打出后每张牌 score +3，scoreBoosts 按卡牌键累计 +3', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3, 'spade');
    const c8 = card(8, 'heart');
    const ctx = makeCtx({ battle, gameScene: makeMockScene(), pattern: patternWith(c3, c8) });

    await SunWuLianBing.execute(ctx, visuals);

    expect(c3.score).toBe(6);   // 3 + 3
    expect(c8.score).toBe(11);  // 8 + 3
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 3, heart_8: 3 });
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('已有 scoreBoosts 时累加（不覆盖）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.scoreBoosts = { spade_3: 2 };
    const c3 = card(3, 'spade');
    const ctx = makeCtx({ battle, gameScene: makeMockScene(), pattern: patternWith(c3) });

    await SunWuLianBing.execute(ctx, visuals);

    expect(c3.score).toBe(6);
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 5 });
  });
});

describe('SunWuLianBingBonus filter（练兵结算加成触发判定）', () => {
  it('玩家结算伤害给敌方 + damageInfo + pattern → 触发', () => {
    const ctx = makeCtx();
    expect(SunWuLianBingBonus.filter(ctx)).toBe(true);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(SunWuLianBingBonus.filter(ctx)).toBe(false);
  });

  it('非孙武阵容 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(SunWuLianBingBonus.filter(ctx)).toBe(false);
  });

  it('damageInfo 缺失 → 不触发', () => {
    const ctx = makeCtx({ damageInfo: undefined });
    expect(SunWuLianBingBonus.filter(ctx)).toBe(false);
  });

  it('pattern 缺失 → 不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(SunWuLianBingBonus.filter(ctx)).toBe(false);
  });
});

describe('SunWuLianBingBonus execute（练兵结算成功再永久加分）', () => {
  it('结算成功后每张再 +3，sumRanks 增加 3×张数，scoreBoosts 再累计，计数器同步', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3, 'spade');
    const c8 = card(8, 'heart');
    const setText = vi.fn();
    const counterText = { text: '11', setText } as unknown as Phaser.GameObjects.Text;
    const ctx = makeCtx({
      battle,
      gameScene: makeMockScene(),
      pattern: patternWith(c3, c8),
      damageInfo: { sumRanks: 11, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 11 },
      damageCounterText: counterText,
    });

    await SunWuLianBingBonus.execute(ctx, visuals);

    expect(c3.score).toBe(6);   // 3 + 3
    expect(c8.score).toBe(11);  // 8 + 3
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 3, heart_8: 3 });
    expect(ctx.damageInfo!.sumRanks).toBe(17); // 11 + 3×2
    expect(setText).toHaveBeenCalledWith('17');
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('SunWu 两段叠加（练兵完整效果）', () => {
  it('先 ON_PLAY 后 ON_DAMAGE_ACCUMULATED：每张总共 +6', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3, 'spade');
    const c8 = card(8, 'heart');
    const scene = makeMockScene();

    // 段一：打出时
    await SunWuLianBing.execute(
      makeCtx({ battle, gameScene: scene, pattern: patternWith(c3, c8) }),
      visuals,
    );
    expect(c3.score).toBe(6);
    expect(c8.score).toBe(11);

    // 段二：结算成功时
    const setText = vi.fn();
    const counterText = { text: '17', setText } as unknown as Phaser.GameObjects.Text;
    const bonusCtx = makeCtx({
      battle,
      gameScene: scene,
      pattern: patternWith(c3, c8),
      damageInfo: { sumRanks: 17, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 17 },
      damageCounterText: counterText,
    });
    await SunWuLianBingBonus.execute(bonusCtx, visuals);

    // 每张总共 +6
    expect(c3.score).toBe(9);   // 3 + 3 + 3
    expect(c8.score).toBe(14);  // 8 + 3 + 3
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 6, heart_8: 6 });
    expect(bonusCtx.damageInfo!.sumRanks).toBe(23); // 17 + 3×2
    expect(setText).toHaveBeenCalledWith('23');
  });
});

describe('SunWu 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(SunWuLianBing.id).toBe('sunwu_lianbing');
    expect(SunWuLianBing.name).toBe('练兵');
    expect(SunWuLianBing.timing).toBe('on_play');
    expect(SunWuLianBing.dialogLines!.length).toBeGreaterThanOrEqual(2);
    expect(SunWuLianBingBonus.id).toBe('sunwu_lianbing_bonus');
    expect(SunWuLianBingBonus.timing).toBe('on_damage_accumulated');
  });
});
