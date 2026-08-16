import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { ChengYaoJinMengFu } from '../ChengYaoJinMengFu';

// 卡面渲染依赖 Phaser 运行时，node 单测环境不可用，mock 掉仅保留纯逻辑
vi.mock('../../utils/CardVisual', () => ({
  createPokerCardVisual: () => ({ add: vi.fn() }),
}));

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

function singleCardObj(rank: number, index: number) {
  return {
    card: { setAlpha: vi.fn() } as unknown as Phaser.GameObjects.Container,
    scoreText: { setText: vi.fn() } as unknown as Phaser.GameObjects.Text,
    baseScore: rank,
    scoreBonus: 0,
    index,
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  const c = card(8);
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'chengyaojin',
    target: 'enemy',
    playerCharacterIds: ['chengyaojin'],
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

/** mock 支撑 modifyCardDamage 的 counter tween 的 scene（即时完成） */
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

describe('ChengYaoJinMengFu filter（猛斧判定）', () => {
  it('玩家结算前 3 张牌（index 0/1/2）→ 触发', () => {
    for (const index of [0, 1, 2]) {
      const ctx = makeCtx({ singleCard: singleCardObj(10, index) });
      expect(ChengYaoJinMengFu.filter(ctx)).toBe(true);
    }
  });

  it('第 4 张（index 3）及以后 → 不触发', () => {
    const ctx = makeCtx({ singleCard: singleCardObj(10, 3) });
    expect(ChengYaoJinMengFu.filter(ctx)).toBe(false);
  });

  it('敌方结算（target = player）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player', singleCard: singleCardObj(10, 0) });
    expect(ChengYaoJinMengFu.filter(ctx)).toBe(false);
  });

  it('程咬金不在场 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'], singleCard: singleCardObj(10, 0) });
    expect(ChengYaoJinMengFu.filter(ctx)).toBe(false);
  });

  it('缺少 index（兼容旧上下文）→ 不触发', () => {
    const ctx = makeCtx({ singleCard: { ...singleCardObj(10, 0), index: undefined } });
    expect(ChengYaoJinMengFu.filter(ctx)).toBe(false);
  });
});

describe('ChengYaoJinMengFu execute（猛斧效果）', () => {
  it('前三张牌 scoreBonus +25', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const ctx = makeCtx({
      gameScene: scene,
      singleCard: singleCardObj(10, 1),
    });

    await ChengYaoJinMengFu.execute(ctx, visuals);

    expect(ctx.singleCard!.scoreBonus).toBe(25);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('无 singleCard 时安全跳过', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({ singleCard: undefined });
    await expect(ChengYaoJinMengFu.execute(ctx, visuals)).resolves.toBeUndefined();
  });
});
