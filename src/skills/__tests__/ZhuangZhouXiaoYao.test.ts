import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { ZhuangZhouXiaoYao } from '../ZhuangZhouXiaoYao';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

function makeBattle(deck: Card[] = []): BattleState {
  return {
    player: {
      hand: [], deck, discardPile: [],
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
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle([card(7, 'spade')]),
    sourceCharacterId: 'zhuangzhou',
    target: 'player',
    playerCharacterIds: ['zhuangzhou'],
    pattern: patternWith(card(3, 'spade'), card(4, 'club')),
    singleCard: {
      card: {} as never,
      scoreText: {} as never,
      baseScore: 5,
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

/** mock 一个支撑判定展示动画（tween/delay 即时完成）的 scene */
function makeMockScene(): Phaser.Scene {
  const obj: Record<string, unknown> = {
    x: 0, y: 0,
    setDepth: vi.fn(() => obj),
    setAlpha: vi.fn(() => obj),
    setScale: vi.fn(() => obj),
    setOrigin: vi.fn(() => obj),
    setVisible: vi.fn(() => obj),
    setText: vi.fn(() => obj),
    add: vi.fn(() => obj),
    destroy: vi.fn(),
  };
  const gfx = {
    fillStyle: vi.fn(() => gfx),
    lineStyle: vi.fn(() => gfx),
    fillRoundedRect: vi.fn(() => gfx),
    strokeRoundedRect: vi.fn(() => gfx),
    setVisible: vi.fn(() => gfx),
  };
  return {
    scale: { width: 2400, height: 1080 },
    add: {
      container: vi.fn(() => obj),
      graphics: vi.fn(() => gfx),
      text: vi.fn(() => obj),
    },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
}

describe('ZhuangZhouXiaoYao filter（逍遥触发判定）', () => {
  it('敌方对你结算伤害（target=player）且牌库有牌时触发', () => {
    const ctx = makeCtx();
    expect(ZhuangZhouXiaoYao.filter(ctx)).toBe(true);
  });

  it('我方攻击（target=enemy）不触发', () => {
    const ctx = makeCtx({ target: 'enemy' });
    expect(ZhuangZhouXiaoYao.filter(ctx)).toBe(false);
  });

  it('牌库为空不触发（伤害照常结算）', () => {
    const ctx = makeCtx({ battle: makeBattle([]) });
    expect(ZhuangZhouXiaoYao.filter(ctx)).toBe(false);
  });

  it('庄周不在场不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(ZhuangZhouXiaoYao.filter(ctx)).toBe(false);
  });

  it('singleCard 缺失仍触发（ON_COEFFICIENT_REVEALED 时机无 singleCard，判定只看 target/阵容/牌库）', () => {
    const ctx = makeCtx({ singleCard: undefined });
    expect(ZhuangZhouXiaoYao.filter(ctx)).toBe(true);
  });
});

describe('ZhuangZhouXiaoYao execute（逍遥判定）', () => {
  it('判定牌为黑色（黑桃）：伤害无效 + 判定牌进弃牌堆', async () => {
    const visuals = makeVisuals();
    const blackCard = card(9, 'spade');
    const battle = makeBattle([blackCard]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await ZhuangZhouXiaoYao.execute(ctx, visuals);

    // 判定牌从牌库取出并进入己方弃牌堆
    expect(battle.player.deck.length).toBe(0);
    expect(battle.player.discardPile.map((c) => c.uid)).toContain(blackCard.uid);
    // 黑色 → 伤害无效（传 false：仅无效伤害，不获得牌权——区别于张飞断喝的 true）
    expect(visuals.cancelDamageSettlement).toHaveBeenCalledWith(false);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('判定牌为梅花：伤害无效', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(9, 'club')]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await ZhuangZhouXiaoYao.execute(ctx, visuals);

    expect(battle.player.discardPile.length).toBe(1);
    // 梅花也是黑色 → 伤害无效（不获得牌权）
    expect(visuals.cancelDamageSettlement).toHaveBeenCalledWith(false);
  });

  it('判定牌为红色（红桃）：伤害照常（不取消）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(9, 'heart')]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await ZhuangZhouXiaoYao.execute(ctx, visuals);

    expect(battle.player.discardPile.length).toBe(1);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });

  it('判定牌为王（suit null）：伤害照常（不取消）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(25, null)]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await ZhuangZhouXiaoYao.execute(ctx, visuals);

    expect(battle.player.discardPile.length).toBe(1);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });

  it('牌库为空时安静返回（跳过 execute）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await ZhuangZhouXiaoYao.execute(ctx, visuals);

    expect(battle.player.discardPile.length).toBe(0);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });
});

describe('ZhuangZhouXiaoYao 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(ZhuangZhouXiaoYao.id).toBe('zhuangzhou_xiaoyao');
    expect(ZhuangZhouXiaoYao.name).toBe('逍遥');
    expect(ZhuangZhouXiaoYao.timing).toBe('on_coefficient_revealed');
    expect(ZhuangZhouXiaoYao.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
