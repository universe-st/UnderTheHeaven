import { describe, it, expect, vi } from 'vitest';
import type { BattleState } from '../../models/BattleTypes';
import type { PlayerCharacterId } from '../../models/Character';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { ShangguanWanErChengLiang } from '../ShangguanWanErChengLiang';

const SHANGGUAN = 'shangguanwaner' as const;

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
    sourceCharacterId: SHANGGUAN,
    target: 'enemy',
    playerCharacterIds: [SHANGGUAN],
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

describe('ShangguanWanErChengLiang filter（称量触发判定）', () => {
  it('阵容含上官婉儿时触发', () => {
    const ctx = makeCtx({
      playerCharacterIds: ['hanxin', SHANGGUAN],
      singleCard: { card: {} as never, scoreText: {} as never, baseScore: 8, scoreBonus: 0 },
    });
    expect(ShangguanWanErChengLiang.filter(ctx)).toBe(true);
  });

  it('阵容不含上官婉儿不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin', 'guanyu'] });
    expect(ShangguanWanErChengLiang.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(ShangguanWanErChengLiang.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失不触发', () => {
    const ctx = makeCtx({ singleCard: undefined });
    expect(ShangguanWanErChengLiang.filter(ctx)).toBe(false);
  });
});

describe('ShangguanWanErChengLiang execute（称量加分）', () => {
  it('3 个角色（无失去）→ 每张牌 +15', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: sceneWithTweens(),
      playerCharacterIds: ['hanxin', 'guanyu', SHANGGUAN],
    });
    await ShangguanWanErChengLiang.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(15);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('5 个角色失去 1 个 → 每张牌 +20', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: sceneWithTweens(),
      playerCharacterIds: ['hanxin', 'guanyu', 'libai', 'niugao', SHANGGUAN],
      battle: makeBattle({
        lostCharacters: ['hanxin' as PlayerCharacterId],
      }),
    });
    await ShangguanWanErChengLiang.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(20);
  });

  it('lostCharacters 为 undefined 时按全部角色数加成（2 个角色 → +10/张）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: sceneWithTweens(),
      playerCharacterIds: ['hanxin', SHANGGUAN],
    });
    expect(ctx.battle.player.lostCharacters).toBeUndefined();
    await ShangguanWanErChengLiang.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(10);
  });

  it('失去的角色不在当前阵容中不扣除（如阵容外角色牌）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      gameScene: sceneWithTweens(),
      playerCharacterIds: ['hanxin', SHANGGUAN],
      battle: makeBattle({
        lostCharacters: ['zhangfei' as PlayerCharacterId],
      }),
    });
    await ShangguanWanErChengLiang.execute(ctx, visuals);
    expect(ctx.singleCard!.scoreBonus).toBe(10);
  });
});

describe('ShangguanWanErChengLiang 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(ShangguanWanErChengLiang.id).toBe('shangguanwaner_chengliang');
    expect(ShangguanWanErChengLiang.name).toBe('称量');
    expect(ShangguanWanErChengLiang.timing).toBe('on_single_card_settlement');
    expect(ShangguanWanErChengLiang.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
