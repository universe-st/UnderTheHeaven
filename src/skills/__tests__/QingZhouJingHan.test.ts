import { describe, it, expect, vi } from 'vitest';
import { QingZhouJingHan } from '../QingZhouJingHan';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

function makeBattle(enemyVitality: number = 500, enemyVitalityMax: number = 500): BattleState {
  return {
    player: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '玩家',
      characterId: 'hanxin',
    },
    enemy: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: enemyVitality,
      vitalityMax: enemyVitalityMax,
      name: '敌人',
    },
    enemyCharacterId: 'qingzhou',
    turnHolder: 'enemy',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };
}

function makeCtx(battle: BattleState, damageInfo?: NonNullable<SkillContext['damageInfo']>, target: 'enemy' | 'player' = 'enemy'): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle,
    sourceCharacterId: 'qingzhou',
    playerCharacterIds: ['hanxin'],
    enemyCharacterId: 'qingzhou',
    target,
    ...(damageInfo ? { damageInfo } : {}),
  };
}

/**
 * mock showHeal 复刻 SkillVisualManagerImpl 的 clamp 语义：
 * vitality = min(vitalityMax, vitality + amount)
 */
function makeVisuals(battle: BattleState): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn((_target: 'enemy' | 'player', amount: number) => {
      battle.enemy.vitality = Math.min(battle.enemy.vitalityMax, battle.enemy.vitality + amount);
    }),
    playSkillTriggerSound: vi.fn<() => void>(),
    playSfx: vi.fn<(key: string) => void>(),
    getScene: () => ({}) as Phaser.Scene,
    cancelDamageSettlement: vi.fn<(gainTurn?: boolean) => void>(),
    updateMarker: vi.fn<(characterId: string, count: number) => void>(),
    markCharacterLost: vi.fn<(characterId: string) => void>(),
    showDialog: vi.fn<(characterId: string, text: string) => void>(),
  };
}

const dmg = (finalDamage: number): NonNullable<SkillContext['damageInfo']> => ({
  sumRanks: finalDamage,
  coefficient: 1,
  baseCoefficient: 1,
  damageMultiplier: 1,
  finalDamage,
});

describe('青州兵「精悍」filter（纯判定）', () => {
  it('敌方受到伤害时触发', () => {
    const battle = makeBattle();
    expect(QingZhouJingHan.filter(makeCtx(battle, dmg(100)))).toBe(true);
  });

  it('玩家（target=player）受伤害不触发', () => {
    const battle = makeBattle();
    expect(QingZhouJingHan.filter(makeCtx(battle, dmg(100), 'player'))).toBe(false);
  });
});

describe('青州兵「精悍」execute', () => {
  it('受伤后回复 finalDamage × 20% 的气数（四舍五入）', async () => {
    const battle = makeBattle();
    const visuals = makeVisuals(battle);

    await QingZhouJingHan.execute(makeCtx(battle, dmg(100)), visuals);

    expect(visuals.showHeal).toHaveBeenCalledWith('enemy', 20);

    // 非整除时四舍五入：37 × 20% = 7.4 → 7
    const battle2 = makeBattle();
    const visuals2 = makeVisuals(battle2);
    await QingZhouJingHan.execute(makeCtx(battle2, dmg(37)), visuals2);
    expect(visuals2.showHeal).toHaveBeenCalledWith('enemy', 7);
  });

  it('回血不超 vitalityMax（showHeal 内 clamp）', async () => {
    // 残血 90/100，伤害 100 → 回 20 → 110 被 clamp 到 100
    const battle = makeBattle(90, 100);
    const visuals = makeVisuals(battle);

    await QingZhouJingHan.execute(makeCtx(battle, dmg(100)), visuals);

    expect(visuals.showHeal).toHaveBeenCalledWith('enemy', 20);
    expect(battle.enemy.vitality).toBe(100);
    expect(battle.enemy.vitality).toBeLessThanOrEqual(battle.enemy.vitalityMax);
  });

  it('damageInfo 缺失时不报错且不回血', async () => {
    const battle = makeBattle();
    const visuals = makeVisuals(battle);

    await expect(QingZhouJingHan.execute(makeCtx(battle), visuals)).resolves.toBeUndefined();
    expect(visuals.showHeal).not.toHaveBeenCalled();
  });

  it('timing 为 AFTER_DAMAGE，id 唯一', () => {
    expect(QingZhouJingHan.timing).toBe('after_damage');
    expect(QingZhouJingHan.id).toBe('qingzhou_jinghan');
  });
});
