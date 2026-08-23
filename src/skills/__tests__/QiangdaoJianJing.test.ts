import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { QiangdaoJianJing, plunderRandomCardsFromPool } from '../QiangdaoJianJing';

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
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'qiangdao',
    target: 'player',
    playerCharacterIds: ['hanxin'],
    enemyCharacterId: 'qiangdao',
    pattern: singlePattern(card(8)),
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

describe('QiangdaoJianJing filter（剪径触发判定：伤害系数+1）', () => {
  it('强盗对玩家结算伤害（target=player + 有 damageInfo）→ 触发', () => {
    const ctx = makeCtx({
      target: 'player',
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(QiangdaoJianJing.filter(ctx)).toBe(true);
  });

  it('玩家结算对强盗的伤害（target=enemy）→ 不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(QiangdaoJianJing.filter(ctx)).toBe(false);
  });

  it('无 damageInfo → 不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(QiangdaoJianJing.filter(ctx)).toBe(false);
  });
});

describe('QiangdaoJianJing execute（伤害系数+1）', () => {
  it('系数 +1 并重算 finalDamage（sumRanks × coeff × multiplier）', async () => {
    const visuals = makeVisuals();
    const damageInfo = { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 };
    const ctx = makeCtx({ damageInfo, target: 'player' });

    await QiangdaoJianJing.execute(ctx, visuals);

    expect(damageInfo.coefficient).toBe(2);
    expect(damageInfo.finalDamage).toBe(20);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('带系数标签时执行动画不报错（含空手牌倍数 5 时同样按新系数重算）', async () => {
    const visuals = makeVisuals();
    const label = {
      setText: vi.fn(),
      x: 1200, y: 700,
    } as unknown as Phaser.GameObjects.Text;
    const scene = {
      scale: { width: 2400, height: 1080 },
      tweens: {
        addCounter: (config: { onComplete?: () => void; onUpdate?: (t: { getValue: () => number }) => void; to: number }) => {
          config.onUpdate?.({ getValue: () => config.to });
          config.onComplete?.();
        },
        add: () => undefined,
      },
    } as unknown as Phaser.Scene;
    const damageInfo = { sumRanks: 10, coefficient: 3, baseCoefficient: 3, damageMultiplier: 5, finalDamage: 150 };
    const ctx = makeCtx({
      damageInfo,
      target: 'player',
      coefficientLabel: label,
      pattern: singlePattern(card(8)),
    });
    visuals.getScene = () => scene;

    await QiangdaoJianJing.execute(ctx, visuals);

    expect(damageInfo.coefficient).toBe(4);
    expect(damageInfo.finalDamage).toBe(200); // 10 × 4 × 5
  });

  it('无 damageInfo 时不执行（不报错）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({ target: 'player' });
    await QiangdaoJianJing.execute(ctx, visuals);
    expect(visuals.playSkillTriggerSound).not.toHaveBeenCalled();
  });
});

describe('plunderRandomCardsFromPool（击败后抢夺牌库三张）', () => {
  it('从牌库随机移除至多 count 张并返回，原数组同步减少', () => {
    const pool = [card(3), card(5), card(8), card(12), card(20)];
    const originalLen = pool.length;
    const removed = plunderRandomCardsFromPool(pool, 3);

    expect(removed.length).toBe(3);
    expect(pool.length).toBe(originalLen - 3);
    const removedUids = new Set(removed.map(c => c.uid));
    expect(pool.every(c => !removedUids.has(c.uid))).toBe(true);
  });

  it('牌库不足 count 张时全部抢走', () => {
    const pool = [card(3), card(5)];
    const removed = plunderRandomCardsFromPool(pool, 3);
    expect(removed.length).toBe(2);
    expect(pool.length).toBe(0);
  });

  it('空牌库返回空数组、不报错', () => {
    const pool: Card[] = [];
    const removed = plunderRandomCardsFromPool(pool, 3);
    expect(removed.length).toBe(0);
    expect(pool.length).toBe(0);
  });

  it('每次夺走的是原数组中的对象（永久失去，不残留引用）', () => {
    const pool = [card(3), card(5), card(8)];
    const removed = plunderRandomCardsFromPool(pool, 3);
    // 被夺走的 uid 与剩余牌库 uid 完全不重叠
    const removedUids = new Set(removed.map(c => c.uid));
    const poolUids = new Set(pool.map(c => c.uid));
    for (const uid of removedUids) {
      expect(poolUids.has(uid)).toBe(false);
    }
    expect(pool.length).toBe(0);
  });
});

describe('QiangdaoJianJing 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(QiangdaoJianJing.id).toBe('qiangdao_jianjing');
    expect(QiangdaoJianJing.name).toBe('剪径');
    expect(QiangdaoJianJing.timing).toBe('on_coefficient_revealed');
    expect(QiangdaoJianJing.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
