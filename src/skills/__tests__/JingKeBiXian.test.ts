import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { JingKeBiXian } from '../JingKeBiXian';

// 卡面渲染（createPokerCardVisual）依赖 Phaser 运行时，node 单测环境不可用，mock 掉仅保留纯逻辑
vi.mock('../../utils/CardVisual', () => ({
  createPokerCardVisual: () => ({ add: vi.fn() }),
}));

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
}

function makeBattle(deck: Card[] = [], enemyVitality = 500): BattleState {
  return {
    player: {
      hand: [], deck, discardPile: [],
      vitality: 500, vitalityMax: 500, name: '玩家',
    },
    enemy: {
      hand: [], deck: [], discardPile: [],
      vitality: enemyVitality, vitalityMax: 500, name: '敌方',
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

/** 最后一张结算牌为黑桃 9（score 9）的上下文；判定牌由 battle.player.deck 提供 */
function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle([card(7, 'spade')]),
    sourceCharacterId: 'jingke',
    target: 'player',
    playerCharacterIds: ['jingke'],
    pattern: patternWith(card(3, 'spade'), card(9, 'spade')),
    singleCard: {
      card: { getData: () => 'spade' } as never,
      scoreText: {} as never,
      baseScore: 9,
      scoreBonus: 0,
      isLastCard: true,
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

/** mock 一个支撑判定/提示/伤害数字动画（tween/delay 即时完成）的 scene，含 GameScene 接口 */
function makeMockScene(): Phaser.Scene & {
  animateHealthBarDepletionAsync: ReturnType<typeof vi.fn>;
  showGameOver: ReturnType<typeof vi.fn>;
} {
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
    animateHealthBarDepletionAsync: vi.fn(),
    showGameOver: vi.fn(),
  } as unknown as Phaser.Scene & {
    animateHealthBarDepletionAsync: ReturnType<typeof vi.fn>;
    showGameOver: ReturnType<typeof vi.fn>;
  };
}

describe('JingKeBiXian filter（匕现触发判定）', () => {
  it('敌方结算且结算到最后一张牌、牌库有牌时触发', () => {
    expect(JingKeBiXian.filter(makeCtx())).toBe(true);
  });

  it('非最后一张牌不触发（仍可继续结算后续牌）', () => {
    const ctx = makeCtx({
      singleCard: {
        card: { getData: () => 'spade' } as never,
        scoreText: {} as never,
        baseScore: 9,
        scoreBonus: 0,
        isLastCard: false,
      },
    });
    expect(JingKeBiXian.filter(ctx)).toBe(false);
  });

  it('我方攻击（target=enemy）不触发', () => {
    const ctx = makeCtx({ target: 'enemy' });
    expect(JingKeBiXian.filter(ctx)).toBe(false);
  });

  it('牌库为空不触发（伤害照常结算）', () => {
    const ctx = makeCtx({ battle: makeBattle([]) });
    expect(JingKeBiXian.filter(ctx)).toBe(false);
  });

  it('荆轲不在场不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(JingKeBiXian.filter(ctx)).toBe(false);
  });
});

describe('JingKeBiXian execute（匕现判定与反伤）', () => {
  it('花色相同：对敌方造成此牌分数×30 的伤害，结束结算并令玩家获得牌权', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const battle = makeBattle([card(7, 'spade')], 500);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JingKeBiXian.execute(ctx, visuals);

    // 判定牌黑桃 7 与最后一张黑桃 9 花色相同 → 9 × 30 = 270 伤害
    expect(battle.enemy.vitality).toBe(230);
    // 判定牌进己方弃牌堆、牌库清空
    expect(battle.player.deck.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(1);
    // 结束伤害结算 + 获得牌权（cancelDamageSettlement(true)，同张飞「断喝」）
    expect(visuals.cancelDamageSettlement).toHaveBeenCalledWith(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
    // 未击杀，不触发胜利
    expect(scene.showGameOver).not.toHaveBeenCalled();
  });

  it('花色不同：仅提示，不取消结算、不扣敌方气数', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const battle = makeBattle([card(7, 'heart')], 500); // 判定牌红桃
    const ctx = makeCtx({ battle, gameScene: scene });

    await JingKeBiXian.execute(ctx, visuals);

    expect(battle.enemy.vitality).toBe(500);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
    expect(battle.player.discardPile.length).toBe(1); // 判定牌仍进弃牌堆
  });

  it('反伤击杀敌方（花色相同且敌方低血量）：调用 showGameOver(true)', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene();
    const battle = makeBattle([card(7, 'spade')], 100); // 30×9=270 > 100
    const ctx = makeCtx({ battle, gameScene: scene });

    await JingKeBiXian.execute(ctx, visuals);

    expect(battle.enemy.vitality).toBe(0);
    expect(visuals.cancelDamageSettlement).toHaveBeenCalledWith(true);
    expect(scene.showGameOver).toHaveBeenCalledWith(true);
  });

  it('牌库为空时安静返回（跳过 execute）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([]);
    const ctx = makeCtx({ battle, gameScene: makeMockScene() });

    await JingKeBiXian.execute(ctx, visuals);

    expect(battle.enemy.vitality).toBe(500);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });
});

describe('JingKeBiXian 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(JingKeBiXian.id).toBe('jingke_bixian');
    expect(JingKeBiXian.name).toBe('匕现');
    expect(JingKeBiXian.timing).toBe('on_single_card_settlement');
    expect(JingKeBiXian.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
