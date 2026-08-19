import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { HandType } from '../../models/BattleTypes';
import { XianGaoZhaKao } from '../XianGaoZhaKao';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function pattern(cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]?.rank ?? 0, length: cards.length };
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
    sourceCharacterId: 'enemy',
    target: 'player',
    playerCharacterIds: ['xiangao'],
    enemyCharacterId: 'qiangdao',
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

/** mock 一个支撑 discardCardsFromHand / addCardsToHand / selectHandCards 的 scene；tween/delay 即时完成 */
function makeMockScene(battle: BattleState): { scene: Phaser.Scene; selectHandCards: ReturnType<typeof vi.fn> } {
  const container = {
    x: 0, y: 0,
    setDepth: vi.fn(() => container),
    setData: vi.fn(() => container),
    getData: vi.fn(() => undefined),
    setAlpha: vi.fn(() => container),
    setScale: vi.fn(() => container),
    setVisible: vi.fn(() => container),
    setOrigin: vi.fn(() => container),
    setText: vi.fn(() => container),
    setDisplaySize: vi.fn(() => container),
    add: vi.fn(() => container),
    destroy: vi.fn(),
  };
  const text = {
    setOrigin: vi.fn(() => text),
    setDepth: vi.fn(() => text),
    setAlpha: vi.fn(() => text),
    setText: vi.fn(() => text),
    destroy: vi.fn(),
    x: 1200, y: 700,
  };
  const gfx = {
    fillStyle: vi.fn(() => gfx),
    lineStyle: vi.fn(() => gfx),
    fillRoundedRect: vi.fn(() => gfx),
    strokeRoundedRect: vi.fn(() => gfx),
    setVisible: vi.fn(() => gfx),
  };
  const zone = {
    setInteractive: vi.fn(() => zone),
    on: vi.fn(() => zone),
    destroy: vi.fn(),
  };

  const selectHandCards = vi.fn();
  const scene = {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    updateHandOverflowHints: vi.fn(),
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    selectHandCards,
    add: {
      container: vi.fn(() => container),
      graphics: vi.fn(() => gfx),
      text: vi.fn(() => text),
      zone: vi.fn(() => zone),
      image: vi.fn(() => container),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;

  return { scene, selectHandCards };
}

describe('XianGaoZhaKao filter（诈犒触发判定）', () => {
  it('敌方对玩家结算 + 弦高在场 + 黑色牌足够 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade'), card(5, 'club')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart')]) });
    expect(XianGaoZhaKao.filter(ctx)).toBe(true);
  });

  it('攻击方向为敌方（target=enemy，玩家造成伤害）→ 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart')]), target: 'enemy' });
    expect(XianGaoZhaKao.filter(ctx)).toBe(false);
  });

  it('弦高不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart')]), playerCharacterIds: ['hanxin'] });
    expect(XianGaoZhaKao.filter(ctx)).toBe(false);
  });

  it('pattern 缺失 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade')];
    const ctx = makeCtx({ battle });
    expect(XianGaoZhaKao.filter(ctx)).toBe(false);
  });

  it('黑色牌数量不足（少于敌方出牌张数）→ 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart'), card(8, 'diamond')]) });
    expect(XianGaoZhaKao.filter(ctx)).toBe(false);
  });

  it('王（suit null）不算黑色 → 黑色牌不足不触发', () => {
    const battle = makeBattle();
    // 手牌只有 2 张王（suit null）+ 1 张黑桃，敌方出 2 张
    battle.player.hand = [card(25, null), card(30, null), card(3, 'spade')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart'), card(8, 'diamond')]) });
    expect(XianGaoZhaKao.filter(ctx)).toBe(false);
  });

  it('黑色牌数量恰好等于敌方出牌张数 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade'), card(5, 'club'), card(7, 'heart')];
    const ctx = makeCtx({ battle, pattern: pattern([card(7, 'heart'), card(8, 'diamond')]) });
    expect(XianGaoZhaKao.filter(ctx)).toBe(true);
  });
});

describe('XianGaoZhaKao execute（诈犒交牌免伤）', () => {
  it('选够 N 张黑牌 → 交给敌方 + 取消伤害 + 获得牌权', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const blackA = card(3, 'spade');
    const blackB = card(5, 'club');
    const redC = card(7, 'heart');
    battle.player.hand = [blackA, redC, blackB];
    const enemyHandBefore = [...battle.enemy.hand];
    const { scene, selectHandCards } = makeMockScene(battle);
    // 敌方出 2 张，玩家选 2 张黑牌
    selectHandCards.mockResolvedValue([blackA, blackB]);
    const ctx = makeCtx({ battle, gameScene: scene, pattern: pattern([card(9, 'diamond'), card(10, 'heart')]) });

    await XianGaoZhaKao.execute(ctx, visuals);

    // 手牌只剩红色牌
    expect(battle.player.hand.map(c => c.uid)).toEqual([redC.uid]);
    // 被交出的牌进了敌方手牌（不进入玩家弃牌堆）
    const enemyUids = battle.enemy.hand.map(c => c.uid);
    expect(enemyUids).toContain(blackA.uid);
    expect(enemyUids).toContain(blackB.uid);
    expect(enemyUids.length).toBe(enemyHandBefore.length + 2);
    // 玩家弃牌堆为空（skipDiscardPile）
    expect(battle.player.discardPile.length).toBe(0);
    // 取消伤害 + 获得牌权
    expect(visuals.cancelDamageSettlement).toHaveBeenCalledWith(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('取消（返回 null）→ 不交牌、不取消伤害', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const blackA = card(3, 'spade');
    const blackB = card(5, 'club');
    const redC = card(7, 'heart');
    battle.player.hand = [blackA, redC, blackB];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene, pattern: pattern([card(9, 'diamond'), card(10, 'heart')]) });

    await XianGaoZhaKao.execute(ctx, visuals);

    // 手牌不变
    expect(battle.player.hand.map(c => c.uid)).toEqual([blackA.uid, redC.uid, blackB.uid]);
    expect(battle.enemy.hand.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(0);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });

  it('选牌交互：want 恰好 N 张、filter 只能选黑色、forced=false 可取消', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade'), card(5, 'club'), card(7, 'heart')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene, pattern: pattern([card(9, 'diamond')]) });

    await XianGaoZhaKao.execute(ctx, visuals);

    const opts = selectHandCards.mock.calls[0]![0];
    expect(opts.side).toBe('player');
    // N = 敌方出牌张数 = 1
    expect(opts.want([])).toBe(false);
    expect(opts.want([card(3, 'spade')])).toBe(true);
    expect(opts.want([card(3, 'spade'), card(5, 'club')])).toBe(false);
    // filter：黑桃/梅花可选，红桃/方片/王不可选
    expect(opts.filter(card(3, 'spade'))).toBe(true);
    expect(opts.filter(card(5, 'club'))).toBe(true);
    expect(opts.filter(card(7, 'heart'))).toBe(false);
    expect(opts.filter(card(8, 'diamond'))).toBe(false);
    expect(opts.filter(card(25, null))).toBe(false);
    expect(opts.forced).toBe(false);
    expect(opts.title).toContain('诈犒');
  });

  it('未选满 N 张（长度不足）→ 不交牌、不取消伤害', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3, 'spade'), card(5, 'club')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue([card(3, 'spade')]); // 只选 1 张，敌方出 2 张
    const ctx = makeCtx({ battle, gameScene: scene, pattern: pattern([card(9, 'diamond'), card(10, 'heart')]) });

    await XianGaoZhaKao.execute(ctx, visuals);

    expect(battle.player.hand.length).toBe(2);
    expect(battle.enemy.hand.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(0);
    expect(visuals.cancelDamageSettlement).not.toHaveBeenCalled();
  });
});

describe('XianGaoZhaKao 配置', () => {
  it('id / name / timing / description 符合规范', () => {
    expect(XianGaoZhaKao.id).toBe('xiangao_zhakao');
    expect(XianGaoZhaKao.name).toBe('诈犒');
    expect(XianGaoZhaKao.timing).toBe('on_coefficient_revealed');
    expect(XianGaoZhaKao.description).toBe('你即将受到对方的卡牌伤害时，你可以将等量的黑色牌交给对方，不进行伤害结算，随后你获得牌权');
    expect(XianGaoZhaKao.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
