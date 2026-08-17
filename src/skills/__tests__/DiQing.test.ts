import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { DiQingWenJinMarker, DiQingWenJinBonus } from '../DiQing';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade', consideredAsRank?: number): Card {
  idc += 1;
  const c: Card = { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
  if (consideredAsRank !== undefined) {
    c.consideredAs = { rank: consideredAsRank, rankLabel: rankToLabel(consideredAsRank), suit: suit ?? 'spade' };
  }
  return c;
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
    sourceCharacterId: 'diqing',
    target: 'enemy',
    playerCharacterIds: ['diqing'],
    pattern: patternWith(card(3), card(8)),
    singleCard: {
      card: {} as never,
      scoreText: { setText: vi.fn() } as never,
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

/** mock 一个支撑 modifyCardDamage（waitForCounterTween）的 scene；tween/delay 即时完成 */
function makeMockScene(): Phaser.Scene {
  return {
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

describe('DiQingWenJinMarker filter（稳进标记触发判定）', () => {
  it('狄青在场 + 打出牌给敌方 → 触发', () => {
    const ctx = makeCtx();
    expect(DiQingWenJinMarker.filter(ctx)).toBe(true);
  });

  it('非狄青阵容 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(DiQingWenJinMarker.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(DiQingWenJinMarker.filter(ctx)).toBe(false);
  });

  it('pattern 缺失 → 不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(DiQingWenJinMarker.filter(ctx)).toBe(false);
  });
});

describe('DiQingWenJinMarker execute（稳进标记获得与 lastMaxRank 更新）', () => {
  it('对局首手（无上次记录视为 0）：获得 1 个标记，lastMaxRank 更新为本次最大点数', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const ctx = makeCtx({ battle, pattern: patternWith(card(3), card(8)) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(1);
    expect(battle.diqingLastMaxRank).toBe(8);
    expect(visuals.updateMarker).toHaveBeenCalledWith('diqing', 1);
  });

  it('点数递增（上次 5，本次 8）：获得 1 个标记', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingLastMaxRank: 5 });
    const ctx = makeCtx({ battle, pattern: patternWith(card(4), card(8)) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(1);
    expect(battle.diqingLastMaxRank).toBe(8);
  });

  it('点数未递增（等值 8，本次 8）：不获得标记，但仍更新 lastMaxRank', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingLastMaxRank: 8, diqingSteadyMarks: 3 });
    const ctx = makeCtx({ battle, pattern: patternWith(card(8), card(5)) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(3);
    expect(battle.diqingLastMaxRank).toBe(8);
    expect(visuals.updateMarker).not.toHaveBeenCalled();
  });

  it('点数递减（上次 10，本次 8）：不获得标记', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingLastMaxRank: 10 });
    const ctx = makeCtx({ battle, pattern: patternWith(card(8), card(3)) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBeUndefined();
    expect(battle.diqingLastMaxRank).toBe(8);
  });

  it('视为点数优先参与比较：rank 3 视为 13，比上次 10 大 → 获得标记', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingLastMaxRank: 10 });
    const considered = card(3, 'spade', 13);
    const ctx = makeCtx({ battle, pattern: patternWith(considered, card(5)) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(1);
    expect(battle.diqingLastMaxRank).toBe(13);
  });

  it('视为点数优先参与比较：rank 13 视为 3，比上次 10 小 → 不获得标记', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingLastMaxRank: 10 });
    const considered = card(13, 'spade', 3);
    const ctx = makeCtx({ battle, pattern: patternWith(considered) });

    await DiQingWenJinMarker.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBeUndefined();
    expect(battle.diqingLastMaxRank).toBe(3);
  });
});

describe('DiQingWenJinBonus filter（稳进加伤触发判定）', () => {
  it('有稳进标记 → 触发', () => {
    const battle = makeBattle({ diqingSteadyMarks: 2 });
    const ctx = makeCtx({
      battle,
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
    });
    expect(DiQingWenJinBonus.filter(ctx)).toBe(true);
  });

  it('无稳进标记 → 不触发', () => {
    const ctx = makeCtx({
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
    });
    expect(DiQingWenJinBonus.filter(ctx)).toBe(false);
  });

  it('非狄青阵容（有标记但角色不在场）→ 不触发', () => {
    const battle = makeBattle({ diqingSteadyMarks: 1 });
    const ctx = makeCtx({
      battle,
      playerCharacterIds: ['hanxin'],
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
    });
    expect(DiQingWenJinBonus.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const battle = makeBattle({ diqingSteadyMarks: 1 });
    const ctx = makeCtx({
      battle,
      target: 'player',
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
    });
    expect(DiQingWenJinBonus.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失 → 不触发', () => {
    const battle = makeBattle({ diqingSteadyMarks: 1 });
    const ctx = makeCtx({ battle, singleCard: undefined });
    expect(DiQingWenJinBonus.filter(ctx)).toBe(false);
  });
});

describe('DiQingWenJinBonus execute（稳进加伤消耗标记）', () => {
  it('消耗 1 个标记（2 → 1），单牌 scoreBonus +20，updateMarker 显示剩余', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingSteadyMarks: 2 });
    const ctx = makeCtx({
      battle,
      gameScene: makeMockScene(),
    });

    await DiQingWenJinBonus.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(1);
    expect(ctx.singleCard!.scoreBonus).toBe(20);
    expect(visuals.updateMarker).toHaveBeenCalledWith('diqing', 1);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('标记不足（剩余 1）结算多张牌时逐张消耗，消耗后置 0', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({ diqingSteadyMarks: 1 });
    const ctx = makeCtx({
      battle,
      gameScene: makeMockScene(),
    });

    await DiQingWenJinBonus.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBe(0);
    expect(ctx.singleCard!.scoreBonus).toBe(20);
  });

  it('无标记时不消耗也不加伤', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const ctx = makeCtx({
      battle,
      gameScene: makeMockScene(),
    });

    await DiQingWenJinBonus.execute(ctx, visuals);

    expect(battle.diqingSteadyMarks).toBeUndefined();
    expect(ctx.singleCard!.scoreBonus).toBe(0);
    expect(visuals.updateMarker).not.toHaveBeenCalled();
  });
});

describe('DiQing 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(DiQingWenJinMarker.id).toBe('diqing_wenjin_marker');
    expect(DiQingWenJinMarker.name).toBe('稳进');
    expect(DiQingWenJinMarker.timing).toBe('on_play');
    expect(DiQingWenJinMarker.dialogLines!.length).toBeGreaterThanOrEqual(2);
    expect(DiQingWenJinBonus.id).toBe('diqing_wenjin_bonus');
    expect(DiQingWenJinBonus.timing).toBe('on_single_card_settlement');
  });
});
