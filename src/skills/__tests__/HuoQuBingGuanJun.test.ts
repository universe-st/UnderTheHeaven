import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import {
  HuoQuBingGuanJun,
  HUO_QU_BING_GUANJUN_COUNT_KEY,
  HUO_QU_BING_LIMIT,
} from '../HuoQuBingGuanJun';

const HUO_QU_BING = 'huoqubing';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

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
  const battle = makeBattle();
  return {
    gameScene: {} as Phaser.Scene,
    battle,
    sourceCharacterId: HUO_QU_BING,
    target: 'enemy',
    playerCharacterIds: [HUO_QU_BING],
    pattern: patternWith(card(3), card(4), card(5)),
    damageInfo: { sumRanks: 12, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 12 },
    centerCardContainers: [{} as never, {} as never, {} as never],
    ...partial,
  };
}

function makeVisuals(scene?: Phaser.Scene): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => scene ?? ({} as Phaser.Scene),
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

describe('HuoQuBingGuanJun filter（冠军触发判定）', () => {
  it('玩家造成伤害结算时触发', () => {
    expect(HuoQuBingGuanJun.filter(makeCtx())).toBe(true);
  });

  it('本次牌数不足 X+3 不触发（X=0 需 3 张，打出 2 张不触发）', () => {
    const ctx = makeCtx({ pattern: patternWith(card(3), card(4)) });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });

  it('本次牌数恰好等于 X+3 触发（X=1 需 4 张，打出 4 张触发）', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3), card(4), card(5), card(6)),
      battle: makeBattle({ skillFlags: { [HUO_QU_BING_GUANJUN_COUNT_KEY]: 1 } }),
    });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(true);
  });

  it('X 累计后门槛递增：X=2 需 5 张，打出 4 张不触发', () => {
    const ctx = makeCtx({
      pattern: patternWith(card(3), card(4), card(5), card(6)),
      battle: makeBattle({ skillFlags: { [HUO_QU_BING_GUANJUN_COUNT_KEY]: 2 } }),
    });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });

  it('敌方结算（target=player）不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });

  it('霍去病不在场不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });

  it('霍去病已失去（lostCharacters）不触发', () => {
    const ctx = makeCtx({
      battle: makeBattle({ lostCharacters: [HUO_QU_BING as never] }),
    });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });

  it('无 pattern 不触发', () => {
    const ctx = makeCtx({ pattern: undefined });
    expect(HuoQuBingGuanJun.filter(ctx)).toBe(false);
  });
});

describe('HuoQuBingGuanJun execute（冠军系数加成与计数）', () => {
  it('首次触发：X=1，系数 +2（1→3），计数写回 skillFlags', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx();
    const { damageInfo, pattern, battle } = ctx;
    expect(damageInfo).toBeDefined();
    expect(pattern).toBeDefined();

    await HuoQuBingGuanJun.execute(ctx, visuals);

    expect(damageInfo!.coefficient).toBe(3); // 1 + 2*1
    expect(damageInfo!.finalDamage).toBe(Math.round(12 * 3));
    expect(battle.player.skillFlags?.[HUO_QU_BING_GUANJUN_COUNT_KEY]).toBe(1);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
    expect(visuals.animateCardScale).toHaveBeenCalled();
    expect(visuals.markCharacterLost).not.toHaveBeenCalled();
  });

  it('第 3 次触发：X=3，系数 +6，计数为 3', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle({
      skillFlags: { [HUO_QU_BING_GUANJUN_COUNT_KEY]: 2 },
    });
    const ctx = makeCtx({ battle });
    const { damageInfo } = ctx;
    // 前累计 X=2，门槛为 5 张，本次打出 5 张满足触发条件
    ctx.pattern = patternWith(card(3), card(4), card(5), card(6), card(7));

    await HuoQuBingGuanJun.execute(ctx, visuals);

    expect(damageInfo!.coefficient).toBe(7); // 1 + 2*3
    expect(battle.player.skillFlags?.[HUO_QU_BING_GUANJUN_COUNT_KEY]).toBe(3);
    expect(visuals.markCharacterLost).not.toHaveBeenCalled();
  });

  it('在已有系数上叠加（保留其他技能加成）', async () => {
    const visuals = makeVisuals();
    const ctx = makeCtx({
      damageInfo: { sumRanks: 12, coefficient: 1.6, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 19 },
      battle: makeBattle({ skillFlags: { [HUO_QU_BING_GUANJUN_COUNT_KEY]: 0 } }),
    });

    await HuoQuBingGuanJun.execute(ctx, visuals);

    expect(ctx.damageInfo!.coefficient).toBeCloseTo(1.6 + 2);
    expect(ctx.damageInfo!.finalDamage).toBe(Math.round(12 * (1.6 + 2)));
  });

  it('X 达到 6：系数 +12 后移除此角色（lostCharacters + markCharacterLost）', async () => {
    const textObj = {
      y: 0,
      setOrigin: vi.fn(() => textObj),
      setDepth: vi.fn(() => textObj),
      setAlpha: vi.fn(() => textObj),
      destroy: vi.fn(),
    };
    const scene = {
      add: { text: vi.fn(() => textObj) },
      scale: { width: 2400, height: 1080 },
      tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
      time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    } as unknown as Phaser.Scene;
    const visuals = makeVisuals(scene);
    const battle = makeBattle({
      skillFlags: { [HUO_QU_BING_GUANJUN_COUNT_KEY]: 5 },
    });
    const ctx = makeCtx({ battle });
    const { damageInfo } = ctx;
    // 前累计 X=5，门槛为 8 张，本次打出 8 张满足触发条件
    ctx.pattern = patternWith(
      card(3), card(4), card(5), card(6), card(7), card(8), card(9), card(10),
    );

    await HuoQuBingGuanJun.execute(ctx, visuals);

    // 第 6 次：X=6，系数 1+12=13
    expect(damageInfo!.coefficient).toBe(13);
    // 移除此角色
    expect(battle.player.lostCharacters).toContain(HUO_QU_BING);
    expect(visuals.markCharacterLost).toHaveBeenCalledWith(HUO_QU_BING);
    // 移除后清零计数（黄金台重新招募后从头计数，避免一触发就再次移除）
    expect(battle.player.skillFlags?.[HUO_QU_BING_GUANJUN_COUNT_KEY]).toBe(0);
  });

  it('X 上限常量 = 6', () => {
    expect(HUO_QU_BING_LIMIT).toBe(6);
  });
});

describe('HuoQuBingGuanJun 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(HuoQuBingGuanJun.id).toBe('huoqubing_guanjun');
    expect(HuoQuBingGuanJun.name).toBe('冠军');
    expect(HuoQuBingGuanJun.timing).toBe('on_coefficient_revealed');
    expect(HuoQuBingGuanJun.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
