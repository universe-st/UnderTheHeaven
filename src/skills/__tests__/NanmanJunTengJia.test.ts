import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { SkillTiming } from '../SkillTypes';
import { SkillRegistry } from '../SkillRegistry';
import { SkillEventBus } from '../SkillEventBus';
import { SkillRunner } from '../SkillRunner';
import { NanmanJunTengJiaBlack, NanmanJunTengJiaHeart } from '../NanmanJunTengJia';
import { ChengYaoJinMengFu } from '../ChengYaoJinMengFu';

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

function singleCardObj(rank: number, suit: string, index = 0) {
  return {
    card: { getData: (key: string) => (key === 'suit' ? suit : undefined), setAlpha: vi.fn() } as unknown as Phaser.GameObjects.Container,
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
    enemyCharacterId: 'nanmanjun',
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

/** mock 支撑 nullifyCardDamage / modifyCardDamage 的 counter tween 的 scene（即时完成） */
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

function makeSlotManager() {
  return {
    glowOn: vi.fn(async () => {}),
    glowOff: vi.fn(async () => {}),
    moveToFront: vi.fn(async () => {}),
    shakeAndPulse: vi.fn(async () => {}),
    restoreSlot: vi.fn(async () => {}),
    isPlayerCharacter: vi.fn((id: string) => id === 'chengyaojin'),
    getCharacterOrder: vi.fn(() => 0),
    showDialog: vi.fn(),
  };
}

describe('NanmanJunTengJiaBlack filter（藤甲·黑判定）', () => {
  it('黑色牌（黑桃/梅花）对玩家结算 → 触发', () => {
    for (const suit of ['spade', 'club']) {
      const ctx = makeCtx({ singleCard: singleCardObj(10, suit) });
      expect(NanmanJunTengJiaBlack.filter(ctx)).toBe(true);
    }
  });

  it('红桃牌 → 不触发（由藤甲·红桃处理）', () => {
    const ctx = makeCtx({ singleCard: singleCardObj(10, 'heart') });
    expect(NanmanJunTengJiaBlack.filter(ctx)).toBe(false);
  });

  it('方块牌 → 不触发', () => {
    const ctx = makeCtx({ singleCard: singleCardObj(10, 'diamond') });
    expect(NanmanJunTengJiaBlack.filter(ctx)).toBe(false);
  });

  it('敌方结算（target = player）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player', singleCard: singleCardObj(10, 'spade') });
    expect(NanmanJunTengJiaBlack.filter(ctx)).toBe(false);
  });
});

describe('NanmanJunTengJiaHeart filter（藤甲·红桃判定）', () => {
  it('红桃牌 → 触发', () => {
    const ctx = makeCtx({ singleCard: singleCardObj(10, 'heart') });
    expect(NanmanJunTengJiaHeart.filter(ctx)).toBe(true);
  });

  it('非红桃牌 → 不触发', () => {
    for (const suit of ['spade', 'club', 'diamond']) {
      const ctx = makeCtx({ singleCard: singleCardObj(10, suit) });
      expect(NanmanJunTengJiaHeart.filter(ctx)).toBe(false);
    }
  });
});

describe('NanmanJunTengJia execute（藤甲效果）', () => {
  it('黑：scoreBonus 覆盖为 -baseScore（伤害归零）', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const ctx = makeCtx({ gameScene: scene, singleCard: singleCardObj(10, 'spade') });

    await NanmanJunTengJiaBlack.execute(ctx, visuals);

    expect(ctx.singleCard!.scoreBonus).toBe(-10);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('红桃：计分 ×3（scoreBonus = base × 2）', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const ctx = makeCtx({ gameScene: scene, singleCard: singleCardObj(10, 'heart') });

    await NanmanJunTengJiaHeart.execute(ctx, visuals);

    expect(ctx.singleCard!.scoreBonus).toBe(20); // 10 × 3 = 30 → bonus 20
  });
});

describe('程咬金「猛斧」× 南蛮军「藤甲·黑」结算顺序（回归）', () => {
  it('priority：藤甲·黑（200）晚于猛斧（100）执行', () => {
    // 若藤甲·黑先归零、猛斧后加分，黑色牌最终会得到 +25 而非 0 —— 回归该 bug
    expect(NanmanJunTengJiaBlack.priority).toBeGreaterThan(ChengYaoJinMengFu.priority ?? 100);
  });

  it('前三张黑色牌：猛斧 +25 后仍被藤甲·黑归零，最终不计算分数', async () => {
    const registry = new SkillRegistry();
    registry.registerForBattle(
      [ChengYaoJinMengFu, NanmanJunTengJiaBlack],
      [{ id: 'chengyaojin', abilities: [{ skillId: 'chengyaojin_mengfu' }] }],
      [{ id: 'nanmanjun', abilities: [{ skillId: 'nanmanjun_tengjia_black' }] }],
    );
    const eventBus = new SkillEventBus();
    const visuals = makeVisuals();
    const slotManager = makeSlotManager();
    new SkillRunner(registry, eventBus, visuals, slotManager);

    const ctx = makeCtx({
      gameScene: makeMockScene(),
      singleCard: singleCardObj(10, 'spade', 0), // 前三张黑色牌之一
    });

    await eventBus.emit(SkillTiming.ON_SINGLE_CARD_SETTLEMENT, ctx);

    // 猛斧先 +25（scoreBonus = 25），藤甲·黑随后覆盖为 -baseScore → 总分 0
    expect(ctx.singleCard!.scoreBonus).toBe(-10);
  });
});
