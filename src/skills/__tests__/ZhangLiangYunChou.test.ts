import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { ZhangLiangYunChou } from '../ZhangLiangYunChou';

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
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle([card(3), card(4), card(5), card(6), card(7), card(8)]),
    sourceCharacterId: 'player',
    target: 'enemy',
    playerCharacterIds: ['zhangliang'],
    enemyCharacterId: 'huangjinjun',
    pattern: patternWith(card(3, 'spade'), card(4, 'club')),
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

interface MockSceneHandle {
  scene: Phaser.Scene;
  /** 按创建顺序记录的 zone pointerdown 回调：前 cards.length 个是抽牌，最后一个是「确定」 */
  zoneHandlers: Array<(e?: unknown) => void>;
}

/** mock 一个支撑选牌 UI + CardActions 的 scene；所有 tween/delay 即时完成 */
function makeMockScene(battle: BattleState): MockSceneHandle {
  const zoneHandlers: Array<(e?: unknown) => void> = [];

  const container = {
    x: 0,
    y: 0,
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
  const gfx = {
    fillStyle: vi.fn(() => gfx),
    lineStyle: vi.fn(() => gfx),
    fillRoundedRect: vi.fn(() => gfx),
    strokeRoundedRect: vi.fn(() => gfx),
    setVisible: vi.fn(() => gfx),
  };
  const zone = {
    setInteractive: vi.fn(() => zone),
    on: vi.fn((ev: string, cb: (e?: unknown) => void) => {
      if (ev === 'pointerdown') zoneHandlers.push(cb);
      return zone;
    }),
    destroy: vi.fn(),
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
      text: vi.fn(() => container),
      zone: vi.fn(() => zone),
    },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;

  return { scene, zoneHandlers };
}

describe('ZhangLiangYunChou filter（运筹触发判定）', () => {
  it('张良在场且牌堆有牌时触发（玩家获得牌权）', () => {
    const ctx = makeCtx();
    expect(ZhangLiangYunChou.filter(ctx)).toBe(true);
  });

  it('牌堆为空不触发', () => {
    const ctx = makeCtx({ battle: makeBattle([]) });
    expect(ZhangLiangYunChou.filter(ctx)).toBe(false);
  });

  it('张良不在场不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(ZhangLiangYunChou.filter(ctx)).toBe(false);
  });

  it('敌方获得牌权（source=敌方）不触发', () => {
    const ctx = makeCtx({ sourceCharacterId: 'huangjinjun' });
    expect(ZhangLiangYunChou.filter(ctx)).toBe(false);
  });
});

describe('ZhangLiangYunChou execute（运筹抽牌选牌）', () => {
  it('抽 5 张选 2 张：选中加入手牌、其余 3 张弃置、牌堆减少 5', async () => {
    const visuals = makeVisuals();
    const deckCards = [card(3), card(4), card(5), card(6), card(7), card(8)];
    // 执行前保存原始牌堆 uid（execute 内 splice 会原地修改 deckCards 数组）
    const allUids = new Set(deckCards.map((c) => c.uid));
    const battle = makeBattle(deckCards);
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = ZhangLiangYunChou.execute(ctx, visuals);
    // 让同步部分执行到阻塞等待点（zone 已全部创建：5 个牌区 + 1 个确定按钮）
    await Promise.resolve();
    await Promise.resolve();

    expect(zoneHandlers.length).toBe(6); // 5 张抽牌 + 确定

    // 选中第 1、2 张牌
    zoneHandlers[0]!();
    zoneHandlers[1]!();
    // 尝试选第 3 张：最多 2 张，应被忽略
    zoneHandlers[2]!();
    // 点击确定，解除阻塞
    zoneHandlers[5]!();
    await p;

    // 选中 2 张加入手牌
    expect(battle.player.hand.length).toBe(2);
    const handUids = battle.player.hand.map((c) => c.uid);
    // 未选的 3 张进入弃牌堆
    expect(battle.player.discardPile.length).toBe(3);
    // 牌堆减少 5 张（原 6 → 1）
    expect(battle.player.deck.length).toBe(1);
    // 抽出的 5 张 = 手牌 2 + 弃牌 3，且不与剩余牌堆重叠
    const drawnUids = new Set([...handUids, ...battle.player.discardPile.map((c) => c.uid)]);
    const deckUids = new Set(battle.player.deck.map((c) => c.uid));
    expect(drawnUids.size).toBe(5);
    for (const uid of drawnUids) expect(allUids.has(uid)).toBe(true);
    for (const uid of deckUids) {
      expect(drawnUids.has(uid)).toBe(false);
    }
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('取消选择：选中 1 张后取消，则仅 1 张入手、其余 4 张弃置', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(3), card(4), card(5), card(6), card(7), card(8)]);
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = ZhangLiangYunChou.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    zoneHandlers[0]!(); // 选第 1 张
    zoneHandlers[0]!(); // 取消第 1 张
    zoneHandlers[1]!(); // 选第 2 张
    zoneHandlers[5]!(); // 确定
    await p;

    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(4);
    expect(battle.player.deck.length).toBe(1);
  });

  it('一张不选直接确定：全部 5 张弃置', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(3), card(4), card(5), card(6), card(7), card(8)]);
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = ZhangLiangYunChou.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    zoneHandlers[5]!(); // 直接确定
    await p;

    expect(battle.player.hand.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(5);
    expect(battle.player.deck.length).toBe(1);
  });

  it('牌堆不足 5 张时有多少抽多少', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle([card(3), card(4)]);
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = ZhangLiangYunChou.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    expect(zoneHandlers.length).toBe(3); // 2 张抽牌 + 确定
    zoneHandlers[0]!(); // 选第 1 张
    zoneHandlers[2]!(); // 确定
    await p;

    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(1);
    expect(battle.player.deck.length).toBe(0);
  });
});

describe('ZhangLiangYunChou 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(ZhangLiangYunChou.id).toBe('zhangliang_yunchou');
    expect(ZhangLiangYunChou.name).toBe('运筹');
    expect(ZhangLiangYunChou.timing).toBe('on_gain_turn');
    expect(ZhangLiangYunChou.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
