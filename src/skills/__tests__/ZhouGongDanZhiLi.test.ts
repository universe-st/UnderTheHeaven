import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager, ActiveSkillSceneAccess } from '../SkillTypes';
import { ZhouGongDanZhiLi, ZhouGongDanZhiLiNullify, ZhouGongDanZhiLiActive } from '../ZhouGongDanZhiLi';

// 卡面渲染依赖 Phaser 运行时，mock 掉仅保留纯逻辑
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

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  const c = card(8);
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'zhougongdan',
    target: 'enemy',
    playerCharacterIds: ['zhougongdan'],
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

/** mock 支撑 selectHandCards + discardCardsFromHand / drawCardsToHand / showNotice 的 scene；tween/delay 即时完成 */
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
    clear: vi.fn(() => gfx),
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
    },
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

  return { scene, selectHandCards };
}

describe('ZhouGongDanZhiLi filter（制礼发动判定）', () => {
  it('周公旦在场 + 未发动 + 玩家获得牌权 → 触发', () => {
    const ctx = makeCtx({});
    expect(ZhouGongDanZhiLi.filter(ctx)).toBe(true);
  });

  it('已发动（zhiliRanks 已记录）→ 不触发（仅对局开始一次）', () => {
    const battle = makeBattle();
    battle.player.zhiliRanks = [3, 5];
    const ctx = makeCtx({ battle });
    expect(ZhouGongDanZhiLi.filter(ctx)).toBe(false);
  });

  it('敌方获得牌权（sourceCharacterId 非玩家阵容）→ 不触发', () => {
    const ctx = makeCtx({ sourceCharacterId: 'huangjinjun' });
    expect(ZhouGongDanZhiLi.filter(ctx)).toBe(false);
  });

  it('周公旦不在场 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(ZhouGongDanZhiLi.filter(ctx)).toBe(false);
  });
});

describe('ZhouGongDanZhiLi execute（制礼弃牌发动）', () => {
  it('选 2 张点数不同的牌：want/forced/filter 正确、弃牌入堆、zhiliRanks 记录点数', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3);
    const c5 = card(5);
    const king = card(25, null); // 虎（大小王，无点数）
    battle.player.hand = [c3, c5, card(10), king];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue([c3, c5]);
    const ctx = makeCtx({ battle, gameScene: scene });

    await ZhouGongDanZhiLi.execute(ctx, visuals);

    // 公共事件参数：玩家侧、1~5 张、点数互不相同、排除大小王、forced 无取消
    const opts = selectHandCards.mock.calls[0]![0];
    expect(opts.side).toBe('player');
    expect(opts.forced).toBe(true);
    expect(opts.title).toContain('制礼');
    expect(opts.filter(king)).toBe(false); // 大小王不可选
    expect(opts.filter(c3)).toBe(true);
    expect(opts.want([c3])).toBe(true);
    expect(opts.want([c3, c5, card(9)])).toBe(true);
    expect(opts.want([])).toBe(false);
    expect(opts.want([c3, c3])).toBe(false); // 点数重复不可选
    expect(opts.want([c3, c5, card(9), card(10), card(11), card(12)])).toBe(false); // 超过 5 张

    // 弃 2 张：手牌剩 2 张、弃牌堆 2 张、zhiliRanks = [3, 5]
    expect(battle.player.hand.length).toBe(2);
    expect(battle.player.discardPile.length).toBe(2);
    expect(battle.player.zhiliRanks).toEqual([3, 5]);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('手牌无任何点数牌（全为大小王）→ 跳过发动（forced 不卡死）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(25, null), card(30, null)];
    const { scene, selectHandCards } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await ZhouGongDanZhiLi.execute(ctx, visuals);

    expect(selectHandCards).not.toHaveBeenCalled();
    expect(battle.player.zhiliRanks).toBeUndefined();
    expect(battle.player.hand.length).toBe(2);
  });

  it('选牌返回 null（异常放弃）→ 不记录点数', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5)];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene });

    await ZhouGongDanZhiLi.execute(ctx, visuals);

    expect(battle.player.zhiliRanks).toBeUndefined();
    expect(battle.player.hand.length).toBe(2);
  });
});

describe('ZhouGongDanZhiLiNullify（制礼点数归零）', () => {
  function ctxWithCard(rank: number, target: 'enemy' | 'player', zhiliRanks: number[]): SkillContext {
    const battle = makeBattle();
    battle.player.zhiliRanks = zhiliRanks;
    return makeCtx({
      battle,
      target,
      singleCard: {
        card: { getData: vi.fn(() => rank), setAlpha: vi.fn() } as unknown as Phaser.GameObjects.Container,
        scoreText: { setText: vi.fn() } as unknown as Phaser.GameObjects.Text,
        baseScore: rank,
        scoreBonus: 0,
      },
    });
  }

  it('打出的牌属制礼点数（玩家结算）→ 触发', () => {
    const ctx = ctxWithCard(5, 'enemy', [3, 5, 9]);
    expect(ZhouGongDanZhiLiNullify.filter(ctx)).toBe(true);
  });

  it('打出的牌属制礼点数（敌方结算，对双方生效）→ 触发', () => {
    const ctx = ctxWithCard(5, 'player', [3, 5, 9]);
    expect(ZhouGongDanZhiLiNullify.filter(ctx)).toBe(true);
  });

  it('点数不命中 → 不触发', () => {
    const ctx = ctxWithCard(7, 'enemy', [3, 5, 9]);
    expect(ZhouGongDanZhiLiNullify.filter(ctx)).toBe(false);
  });

  it('未发动制礼（zhiliRanks 为空）→ 不触发', () => {
    const ctx = ctxWithCard(5, 'enemy', []);
    expect(ZhouGongDanZhiLiNullify.filter(ctx)).toBe(false);
  });

  it('execute：scoreBonus 覆盖为 -baseScore（伤害归零）', async () => {
    const visuals = makeVisuals();
    const scene = makeMockScene(makeBattle()).scene;
    const ctx = ctxWithCard(5, 'enemy', [5]);
    const fullCtx = { ...ctx, gameScene: scene };

    await ZhouGongDanZhiLiNullify.execute(fullCtx, visuals);

    expect(fullCtx.singleCard!.scoreBonus).toBe(-5);
  });
});

describe('ZhouGongDanZhiLiActive（制礼主动技）', () => {
  it('cardFilter：任意张（≥1）即可进入后续判定', () => {
    expect(ZhouGongDanZhiLiActive.cardFilter([card(3)])).toBe(true);
    expect(ZhouGongDanZhiLiActive.cardFilter([card(3), card(5)])).toBe(true);
    expect(ZhouGongDanZhiLiActive.cardFilter([])).toBe(false);
  });

  it('canUseWithSelection：选中的牌均属制礼点数才可用', () => {
    const battle = makeBattle();
    battle.player.zhiliRanks = [3, 5];
    const scene = {
      getBattle: () => battle,
      renderPlayerHandAfterSkill: vi.fn(),
      initActiveSkills: vi.fn(),
    } as unknown as Phaser.Scene & ActiveSkillSceneAccess;
    expect(ZhouGongDanZhiLiActive.canUseWithSelection!(scene, [card(3), card(5)])).toBe(true);
    expect(ZhouGongDanZhiLiActive.canUseWithSelection!(scene, [card(3), card(7)])).toBe(false);
    expect(ZhouGongDanZhiLiActive.canUseWithSelection!(scene, [card(7)])).toBe(false);
  });

  it('未发动制礼（zhiliRanks 为空）→ 不可用', () => {
    const battle = makeBattle();
    const scene = {
      getBattle: () => battle,
      renderPlayerHandAfterSkill: vi.fn(),
      initActiveSkills: vi.fn(),
    } as unknown as Phaser.Scene & ActiveSkillSceneAccess;
    expect(ZhouGongDanZhiLiActive.canUseWithSelection!(scene, [card(3)])).toBe(false);
  });

  it('execute：弃置选中的制礼点数牌，摸等量的牌', async () => {
    const battle = makeBattle();
    const c3 = card(3);
    const c5 = card(5);
    const c9 = card(9);
    battle.player.zhiliRanks = [3, 5];
    battle.player.hand = [c3, c5, c9];
    battle.player.deck = [card(10), card(11)];

    const { scene } = makeMockScene(battle);
    const renderPlayerHandAfterSkill = vi.fn();
    const skillScene = Object.assign(scene, {
      getBattle: () => battle,
      renderPlayerHandAfterSkill,
    });

    await ZhouGongDanZhiLiActive.execute(skillScene as never, [c3]);

    // 弃 1 张（进弃牌堆）、摸 1 张：手牌仍 3 张、弃牌堆 1 张、牌堆少 1 张
    expect(battle.player.hand.length).toBe(3);
    expect(battle.player.discardPile.length).toBe(1);
    expect(battle.player.discardPile[0]!.uid).toBe(c3.uid);
    expect(battle.player.deck.length).toBe(1);
    expect(renderPlayerHandAfterSkill).toHaveBeenCalled();
  });
});
