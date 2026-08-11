import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { JiangShangChuiDiao, JiangShangFuWang } from '../JiangShang';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade', isTemp = false): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank, isTemp };
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
    sourceCharacterId: 'jiangshang',
    target: 'enemy',
    playerCharacterIds: ['jiangshang'],
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

/** mock 一个支撑 addCardsToHand / showNotice 的 scene；所有 tween/delay 即时完成 */
function makeMockScene(battle: BattleState): Phaser.Scene {
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

  const scene = {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    add: {
      container: vi.fn(() => container),
      graphics: vi.fn(() => gfx),
      text: vi.fn(() => text),
      zone: vi.fn(() => ({ setInteractive: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() })) })),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void; onUpdate?: (t: { getValue: () => number }) => void; to: number }) => {
        config.onUpdate?.({ getValue: () => config.to });
        config.onComplete?.();
      },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;

  return scene;
}

describe('JiangShangChuiDiao filter（垂钓触发判定）', () => {
  it('单张牌型 + 对方这一圈打出过非临时牌 → 触发', () => {
    const ctx = makeCtx({
      pattern: singlePattern(card(8)),
      roundEnemyCards: [card(5), card(25, null)],
    });
    expect(JiangShangChuiDiao.filter(ctx)).toBe(true);
  });

  it('非单张牌型 → 不触发', () => {
    const a = card(5); const b = card(5, 'club');
    const pair = { type: HandType.Pair, cards: [a, b], mainValue: 5, length: 2 };
    const ctx = makeCtx({ pattern: pair, roundEnemyCards: [card(6)] });
    expect(JiangShangChuiDiao.filter(ctx)).toBe(false);
  });

  it('对方这一圈没有打出过牌 → 不触发', () => {
    const ctx = makeCtx({ pattern: singlePattern(card(8)), roundEnemyCards: [] });
    expect(JiangShangChuiDiao.filter(ctx)).toBe(false);
  });

  it('对方这一圈打出的全是临时牌 → 不触发', () => {
    const ctx = makeCtx({
      pattern: singlePattern(card(8)),
      roundEnemyCards: [card(7, 'heart', true)],
    });
    expect(JiangShangChuiDiao.filter(ctx)).toBe(false);
  });

  it('姜尚不在场 → 不触发', () => {
    const ctx = makeCtx({
      playerCharacterIds: ['hanxin'],
      pattern: singlePattern(card(8)),
      roundEnemyCards: [card(5)],
    });
    expect(JiangShangChuiDiao.filter(ctx)).toBe(false);
  });
});

describe('JiangShangChuiDiao execute（垂钓获得对方的牌）', () => {
  it('获得圈内非临时牌：置 isTemp、移出敌方弃牌堆、加入玩家手牌；临时牌不获得', async () => {
    const visuals = makeVisuals();
    const nonTempA = card(5);
    const nonTempB = card(25, null);
    const enemyTemp = card(9, 'heart', true);
    const battle = makeBattle();
    // 敌方出牌已 push 进弃牌堆（含临时牌）；roundEnemyCards 记录整圈
    battle.enemy.discardPile = [nonTempA, nonTempB, enemyTemp].map(c => ({ ...c }));
    const roundCards = [nonTempA, nonTempB, enemyTemp];
    battle.roundEnemyCards = roundCards;

    const scene = makeMockScene(battle);
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      pattern: singlePattern(card(8)),
      roundEnemyCards: roundCards,
    });

    await JiangShangChuiDiao.execute(ctx, visuals);

    // 非临时牌变为临时牌
    expect(nonTempA.isTemp).toBe(true);
    expect(nonTempB.isTemp).toBe(true);
    // 敌方打出的临时牌保持临时，不被获得
    expect(enemyTemp.isTemp).toBe(true);

    // 从敌方弃牌堆按 uid 移除非临时牌；临时牌仍留在弃牌堆
    const discardUids = battle.enemy.discardPile.map(c => c.uid);
    expect(discardUids).not.toContain(nonTempA.uid);
    expect(discardUids).not.toContain(nonTempB.uid);
    expect(discardUids).toContain(enemyTemp.uid);

    // 加入玩家手牌（仅非临时牌）
    const handUids = battle.player.hand.map(c => c.uid);
    expect(handUids).toContain(nonTempA.uid);
    expect(handUids).toContain(nonTempB.uid);
    expect(handUids).not.toContain(enemyTemp.uid);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('圈内无牌时不执行（不报错）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const scene = makeMockScene(battle);
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      pattern: singlePattern(card(8)),
      roundEnemyCards: [],
    });
    await JiangShangChuiDiao.execute(ctx, visuals);
    expect(battle.player.hand.length).toBe(0);
  });
});

describe('JiangShangFuWang filter（辅王触发判定）', () => {
  it('手牌有大王有3 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(30, null), card(3)];
    const ctx = makeCtx({ battle });
    expect(JiangShangFuWang.filter(ctx)).toBe(false);
  });

  it('手牌无大王有3 → 触发（缺王补王）', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3), card(4)];
    const ctx = makeCtx({ battle });
    expect(JiangShangFuWang.filter(ctx)).toBe(true);
  });

  it('手牌有大王无3 → 触发（缺3补3）', () => {
    const battle = makeBattle();
    battle.player.hand = [card(30, null), card(4)];
    const ctx = makeCtx({ battle });
    expect(JiangShangFuWang.filter(ctx)).toBe(true);
  });

  it('手牌大王3都无 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(4), card(5)];
    const ctx = makeCtx({ battle });
    expect(JiangShangFuWang.filter(ctx)).toBe(true);
  });

  it('姜尚不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(4)];
    const ctx = makeCtx({ battle, playerCharacterIds: ['sunbin'] });
    expect(JiangShangFuWang.filter(ctx)).toBe(false);
  });
});

describe('JiangShangFuWang execute（辅王缺什么补什么）', () => {
  it('大王3都缺：从牌堆各获得一张，deck 减少', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const deck = [card(3, 'heart'), card(30, null), card(7)];
    const remainingUid = deck[2]!.uid;
    battle.player.deck = deck;
    battle.player.hand = [card(4), card(5)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JiangShangFuWang.execute(ctx, visuals);

    expect(battle.player.hand.some(c => c.rank === 30)).toBe(true);
    expect(battle.player.hand.some(c => c.rank === 3)).toBe(true);
    // 牌堆 3 张 → 1 张（剩余 7）
    expect(battle.player.deck.length).toBe(1);
    expect(battle.player.deck[0]!.uid).toBe(remainingUid);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('只缺大王：只补大王，3 不动', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(30, null), card(7)];
    battle.player.hand = [card(3), card(4)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JiangShangFuWang.execute(ctx, visuals);

    expect(battle.player.hand.some(c => c.rank === 30)).toBe(true);
    // 手牌原有 3 仍在
    expect(battle.player.hand.some(c => c.rank === 3)).toBe(true);
    // 牌堆 2 张 → 1 张
    expect(battle.player.deck.length).toBe(1);
  });

  it('只缺3：只补3，大王不动', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(3, 'heart'), card(7)];
    battle.player.hand = [card(30, null), card(4)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JiangShangFuWang.execute(ctx, visuals);

    expect(battle.player.hand.some(c => c.rank === 3)).toBe(true);
    expect(battle.player.hand.some(c => c.rank === 30)).toBe(true);
    expect(battle.player.deck.length).toBe(1);
  });

  it('牌堆没有对应的牌则不补（不强造）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(7), card(8)];
    battle.player.hand = [card(4), card(5)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JiangShangFuWang.execute(ctx, visuals);

    expect(battle.player.hand.some(c => c.rank === 30)).toBe(false);
    expect(battle.player.hand.some(c => c.rank === 3)).toBe(false);
    expect(battle.player.hand.length).toBe(2);
    expect(battle.player.deck.length).toBe(2);
  });

  it('手牌不缺任何项则不执行', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(3, 'heart'), card(30, null)];
    battle.player.hand = [card(30, null), card(3)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await JiangShangFuWang.execute(ctx, visuals);
    expect(battle.player.deck.length).toBe(2);
  });
});

describe('JiangShang 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(JiangShangChuiDiao.id).toBe('jiangshang_chuidiao');
    expect(JiangShangChuiDiao.name).toBe('垂钓');
    expect(JiangShangChuiDiao.timing).toBe('on_enemy_pass');
    expect(JiangShangChuiDiao.dialogLines!.length).toBeGreaterThanOrEqual(2);

    expect(JiangShangFuWang.id).toBe('jiangshang_fuwang');
    expect(JiangShangFuWang.name).toBe('辅王');
    expect(JiangShangFuWang.timing).toBe('on_hand_refilled');
    expect(JiangShangFuWang.priority).toBeLessThan(100);
    expect(JiangShangFuWang.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
