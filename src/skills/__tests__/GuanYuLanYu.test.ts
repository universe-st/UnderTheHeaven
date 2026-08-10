import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { HandType, type BattleState, type HandPattern } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { GuanYuWuSheng } from '../GuanYuWuSheng';
import { LanYuJieAoMarker, LanYuJieAoBonus, LanYuJieAoLost } from '../LanYuJieAo';

let idc = 0;
function card(suit: Card['suit'], rank: number = 10): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: String(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

function makeBattle(overrides: Partial<BattleState['player']> = {}): BattleState {
  return {
    player: {
      hand: [], deck: [], discardPile: [],
      vitality: 500, vitalityMax: 500, name: 'player',
      pendingRedCount: 0, aoMarkers: 0, lostCharacters: [],
      ...overrides,
    },
    enemy: {
      hand: [], deck: [], discardPile: [],
      vitality: 500, vitalityMax: 500, name: 'enemy',
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
    sourceCharacterId: 'guanyu',
    playerCharacterIds: ['guanyu'],
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

describe('关羽「武圣」', () => {
  it('持有牌权主动出牌（pendingRedCount>0）且打出红牌时触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      pattern: patternWith(card('heart'), card('diamond'), card('spade')),
      damageInfo: { sumRanks: 30, coefficient: 1.5, baseCoefficient: 1.5, damageMultiplier: 1, finalDamage: 45 },
      battle: makeBattle({ pendingRedCount: 2 }),
    });
    expect(GuanYuWuSheng.filter(ctx)).toBe(true);
  });

  it('跟牌/非主动出牌（pendingRedCount=0）不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      pattern: patternWith(card('heart')),
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
      battle: makeBattle({ pendingRedCount: 0 }),
    });
    expect(GuanYuWuSheng.filter(ctx)).toBe(false);
  });

  it('打出牌中没有红牌不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      pattern: patternWith(card('spade'), card('club')),
      damageInfo: { sumRanks: 20, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 20 },
      battle: makeBattle({ pendingRedCount: 2 }),
    });
    expect(GuanYuWuSheng.filter(ctx)).toBe(false);
  });

  it('敌方结算（target=player）不触发', () => {
    const ctx = makeCtx({
      target: 'player',
      pattern: patternWith(card('heart')),
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
      battle: makeBattle({ pendingRedCount: 2 }),
    });
    expect(GuanYuWuSheng.filter(ctx)).toBe(false);
  });

  it('执行时系数增加红牌数并清零判定依据', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ pendingRedCount: 2 });
    const damageInfo = { sumRanks: 30, coefficient: 1.5, baseCoefficient: 1.5, damageMultiplier: 1, finalDamage: 45 };
    const ctx = makeCtx({
      target: 'enemy',
      pattern: patternWith(card('heart'), card('diamond'), card('spade')),
      damageInfo,
      battle,
    });
    await GuanYuWuSheng.execute(ctx, visuals);
    expect(damageInfo.coefficient).toBe(3.5); // 1.5 + 2 张红牌
    expect(damageInfo.finalDamage).toBe(Math.round(30 * 3.5 * 1));
    expect(battle.player.pendingRedCount).toBe(0);
  });
});

describe('蓝玉「桀骜」', () => {
  const LAN_YU = 'lanyu';

  it('marker：造成伤害（target=enemy 且 finalDamage>0）后触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(LanYuJieAoMarker.filter(ctx)).toBe(true);
  });

  it('marker：伤害为 0 不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      damageInfo: { sumRanks: 0, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 0 },
    });
    expect(LanYuJieAoMarker.filter(ctx)).toBe(false);
  });

  it('marker：自身受伤（target=player）不触发', () => {
    const ctx = makeCtx({
      target: 'player',
      playerCharacterIds: [LAN_YU],
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(LanYuJieAoMarker.filter(ctx)).toBe(false);
  });

  it('marker：蓝玉不在阵容或已失去角色牌时不触发', () => {
    const notInRoster = makeCtx({
      target: 'enemy',
      playerCharacterIds: ['guanyu'],
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(LanYuJieAoMarker.filter(notInRoster)).toBe(false);

    const lost = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ lostCharacters: [LAN_YU as never] }),
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(LanYuJieAoMarker.filter(lost)).toBe(false);
  });

  it('marker：执行后获得一个"骜"标记并更新 UI', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ aoMarkers: 0 });
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
      battle,
    });
    await LanYuJieAoMarker.execute(ctx, visuals);
    expect(battle.player.aoMarkers).toBe(1);
    expect(visuals.updateMarker).toHaveBeenCalledWith(LAN_YU, 1);
  });

  it('bonus：单牌结算且有标记时触发，X=标记数量', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ aoMarkers: 3 }),
      singleCard: {
        card: {} as never, scoreText: {} as never,
        baseScore: 10, scoreBonus: 0,
      },
    });
    expect(LanYuJieAoBonus.filter(ctx)).toBe(true);
  });

  it('bonus：无标记、非攻击方向或已失去时不触发', () => {
    const noMarker = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 10, scoreBonus: 0 },
    });
    expect(LanYuJieAoBonus.filter(noMarker)).toBe(false);

    const noSingle = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ aoMarkers: 2 }),
    });
    expect(LanYuJieAoBonus.filter(noSingle)).toBe(false);

    const lost = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ aoMarkers: 2, lostCharacters: [LAN_YU as never] }),
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 10, scoreBonus: 0 },
    });
    expect(LanYuJieAoBonus.filter(lost)).toBe(false);
  });

  it('lost：一次伤害大于自己气数时触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ vitality: 500 }),
      damageInfo: { sumRanks: 100, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 600 },
    });
    expect(LanYuJieAoLost.filter(ctx)).toBe(true);
  });

  it('lost：伤害不大于自己气数时不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ vitality: 500 }),
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 400 },
    });
    expect(LanYuJieAoLost.filter(ctx)).toBe(false);
  });

  it('lost：蓝玉已失去角色牌后不再重复判定', () => {
    const ctx = makeCtx({
      target: 'enemy',
      playerCharacterIds: [LAN_YU],
      battle: makeBattle({ vitality: 500, lostCharacters: [LAN_YU as never] }),
      damageInfo: { sumRanks: 100, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 600 },
    });
    expect(LanYuJieAoLost.filter(ctx)).toBe(false);
  });
});
