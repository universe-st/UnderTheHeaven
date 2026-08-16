import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { HanShiZhongZhongWuMarker, HanShiZhongZhongWuBonus } from '../HanShiZhongZhongWu';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function singlePattern(c: Card): HandPattern {
  return { type: HandType.Single, cards: [c], mainValue: c.rank, length: 1 };
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
  const c = card(8);
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'hanshizhong',
    target: 'enemy',
    playerCharacterIds: ['hanshizhong'],
    enemyCharacterId: 'qiangdao',
    pattern: singlePattern(c),
    damageInfo: { sumRanks: 8, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 8 },
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

/** mock 支撑 animateCoefficientUpdate 的 scene（tween 即时完成） */
function makeMockScene(): Phaser.Scene {
  const text = {
    setOrigin: vi.fn(() => text),
    setDepth: vi.fn(() => text),
    setAlpha: vi.fn(() => text),
    setText: vi.fn(() => text),
    destroy: vi.fn(),
  };
  return {
    add: { text: vi.fn(() => text) },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onUpdate?: (t: { getValue: () => number }) => void; onComplete?: () => void; to: number }) => {
        config.onUpdate?.({ getValue: () => config.to });
        config.onComplete?.();
      },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
}

describe('HanShiZhongZhongWuMarker（忠武标记获取）', () => {
  it('响应出牌（isRespond=true + target=enemy）→ 触发', () => {
    const ctx = makeCtx({ isRespond: true });
    expect(HanShiZhongZhongWuMarker.filter(ctx)).toBe(true);
  });

  it('先手主动出牌（isRespond=false）→ 不触发', () => {
    const ctx = makeCtx({ isRespond: false });
    expect(HanShiZhongZhongWuMarker.filter(ctx)).toBe(false);
  });

  it('缺少 isRespond（旧上下文）→ 不触发', () => {
    const ctx = makeCtx({});
    expect(HanShiZhongZhongWuMarker.filter(ctx)).toBe(false);
  });

  it('敌方结算（target=player）→ 不触发', () => {
    const ctx = makeCtx({ isRespond: true, target: 'player' });
    expect(HanShiZhongZhongWuMarker.filter(ctx)).toBe(false);
  });

  it('韩世忠不在场 → 不触发', () => {
    const ctx = makeCtx({ isRespond: true, playerCharacterIds: ['hanxin'] });
    expect(HanShiZhongZhongWuMarker.filter(ctx)).toBe(false);
  });

  it('execute：标记 +1 并刷新角色标记区', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const ctx = makeCtx({ battle, isRespond: true });

    await HanShiZhongZhongWuMarker.execute(ctx, visuals);

    expect(battle.player.zhongwuMarkers).toBe(1);
    expect(visuals.updateMarker).toHaveBeenCalledWith('hanshizhong', 1);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('HanShiZhongZhongWuBonus（忠武结算加成）', () => {
  it('玩家结算且持有标记 → 触发', () => {
    const battle = makeBattle();
    battle.player.zhongwuMarkers = 2;
    const ctx = makeCtx({ battle });
    expect(HanShiZhongZhongWuBonus.filter(ctx)).toBe(true);
  });

  it('无标记 → 不触发', () => {
    const battle = makeBattle();
    const ctx = makeCtx({ battle });
    expect(HanShiZhongZhongWuBonus.filter(ctx)).toBe(false);
  });

  it('敌方结算（target=player）→ 不触发', () => {
    const battle = makeBattle();
    battle.player.zhongwuMarkers = 2;
    const ctx = makeCtx({ battle, target: 'player' });
    expect(HanShiZhongZhongWuBonus.filter(ctx)).toBe(false);
  });

  it('execute：系数 += 标记数、消耗全部标记并刷新标记区', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.zhongwuMarkers = 3;
    const scene = makeMockScene();
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      damageInfo: { sumRanks: 10, coefficient: 1.5, baseCoefficient: 1, damageMultiplier: 2, finalDamage: 30 },
    });

    await HanShiZhongZhongWuBonus.execute(ctx, visuals);

    expect(ctx.damageInfo!.coefficient).toBe(4.5);
    // finalDamage = round(10 × 4.5 × 2) = 90
    expect(ctx.damageInfo!.finalDamage).toBe(90);
    expect(battle.player.zhongwuMarkers).toBe(0);
    expect(visuals.updateMarker).toHaveBeenCalledWith('hanshizhong', 0);
  });
});
