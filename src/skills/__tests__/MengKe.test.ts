import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { MengKeQuYi, MengKeXingShan } from '../MengKe';

// 卡面渲染（createPokerCardVisual）依赖 Phaser 运行时，node 单测环境不可用，mock 掉仅保留纯逻辑
vi.mock('../../utils/CardVisual', () => ({
  createPokerCardVisual: () => ({ add: vi.fn() }),
}));

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
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
    sourceCharacterId: 'player',
    target: 'enemy',
    playerCharacterIds: ['mengke'],
    enemyCharacterId: 'qiangdao',
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

interface MockSceneHandle {
  scene: Phaser.Scene;
  /** 按创建顺序记录的 zone pointerdown 回调：0=左牌面 1=右牌面 2=取左按钮 3=取右按钮 4=都不要按钮 */
  zoneHandlers: Array<(e?: unknown) => void>;
}

/** mock 一个支撑选牌 UI + addCardsToHand + showNotice 的 scene；tween/delay 即时完成 */
function makeMockScene(battle: BattleState): MockSceneHandle {
  const zoneHandlers: Array<(e?: unknown) => void> = [];

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
    updateHandOverflowHints: vi.fn(),
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    add: {
      container: vi.fn(() => container),
      graphics: vi.fn(() => gfx),
      text: vi.fn(() => text),
      zone: vi.fn(() => zone),
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

  return { scene, zoneHandlers };
}

describe('MengKeQuYi filter（取义触发判定）', () => {
  it('孟轲在场 + 玩家获得牌权 + 牌堆至少两张 → 触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3), card(5), card(10)];
    const ctx = makeCtx({ battle });
    expect(MengKeQuYi.filter(ctx)).toBe(true);
  });

  it('牌堆不足两张 → 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3)];
    const ctx = makeCtx({ battle });
    expect(MengKeQuYi.filter(ctx)).toBe(false);
  });

  it('敌方获得牌权（source=敌方）→ 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3), card(5)];
    const ctx = makeCtx({ battle, sourceCharacterId: 'qiangdao' });
    expect(MengKeQuYi.filter(ctx)).toBe(false);
  });

  it('孟轲不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3), card(5)];
    const ctx = makeCtx({ battle, playerCharacterIds: ['hanxin'] });
    expect(MengKeQuYi.filter(ctx)).toBe(false);
  });
});

describe('MengKeQuYi execute（取义选牌）', () => {
  it('取左牌：获得左牌入手牌，右牌从牌库移除（放逐：不进弃牌堆）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const left = card(3, 'spade');   // 牌堆顶倒数第二
    const right = card(5, 'heart');  // 牌堆顶（最后一张）
    const rest = card(10, 'club');
    battle.player.deck = [rest, left, right];
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = MengKeQuYi.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    expect(zoneHandlers.length).toBe(5); // 左牌面 + 右牌面 + 3 个按钮
    zoneHandlers[0]!(); // 点击左牌面 → 取左牌
    await p;

    // 左牌入手牌，右牌被放逐（不在弃牌堆、不在牌堆）
    expect(battle.player.hand.map(c => c.uid)).toContain(left.uid);
    expect(battle.player.hand).not.toContain(right);
    expect(battle.player.deck.length).toBe(1);
    expect(battle.player.deck[0]!.uid).toBe(rest.uid);
    expect(battle.player.discardPile.length).toBe(0); // 放逐不进弃牌堆
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('取右牌（按钮）：获得右牌入手牌，左牌被放逐', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const left = card(3, 'spade');
    const right = card(5, 'heart');
    battle.player.deck = [left, right];
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = MengKeQuYi.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    zoneHandlers[3]!(); // 点「取右牌」按钮
    await p;

    expect(battle.player.hand.map(c => c.uid)).toContain(right.uid);
    expect(battle.player.deck.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(0);
  });

  it('都不取：两张牌放回牌堆顶原样（顺序不变）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const left = card(3, 'spade');
    const right = card(5, 'heart');
    const rest = card(10, 'club');
    battle.player.deck = [rest, left, right];
    const originalUids = battle.player.deck.map(c => c.uid);
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = MengKeQuYi.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    zoneHandlers[4]!(); // 点「都不要」按钮
    await p;

    // 牌堆不变：数量、顺序、成员全部原样
    expect(battle.player.deck.map(c => c.uid)).toEqual(originalUids);
    expect(battle.player.hand.length).toBe(0);
    expect(battle.player.discardPile.length).toBe(0);
  });
});

describe('MengKeXingShan filter（性善加成判定）', () => {
  it('孟轲在场 + 玩家结算伤害给敌方 → 触发', () => {
    const ctx = makeCtx();
    expect(MengKeXingShan.filter(ctx)).toBe(true);
  });

  it('目标为玩家（敌方打出的牌结算）→ 不触发', () => {
    const ctx = makeCtx({ target: 'player' });
    expect(MengKeXingShan.filter(ctx)).toBe(false);
  });

  it('damageInfo 缺失 → 不触发', () => {
    const ctx = makeCtx({ damageInfo: undefined });
    expect(MengKeXingShan.filter(ctx)).toBe(false);
  });

  it('孟轲不在场 → 不触发', () => {
    const ctx = makeCtx({ playerCharacterIds: ['hanxin'] });
    expect(MengKeXingShan.filter(ctx)).toBe(false);
  });
});

describe('MengKeXingShan execute（性善伤害加成）', () => {
  it('红比黑多 2 张：sumRanks += 10，计数器文本同步更新', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    // 红 3（heart×2 + diamond×1），黑 1（spade×1）→ diff = 2
    battle.player.deck = [
      card(3, 'heart'), card(5, 'heart'), card(7, 'diamond'), card(9, 'spade'),
    ];
    const setText = vi.fn();
    const counterText = { text: '40', setText } as unknown as Phaser.GameObjects.Text;
    const scene = { scale: { width: 2400, height: 1080 } } as unknown as Phaser.Scene;
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 40 },
      damageCounterText: counterText,
    });

    // showNotice 需要 scene.add.text / scale / tweens / time
    const textObj = {
      setOrigin: vi.fn(() => textObj),
      setDepth: vi.fn(() => textObj),
      setAlpha: vi.fn(() => textObj),
      setText: vi.fn(() => textObj),
      destroy: vi.fn(),
      y: 700,
    };
    (scene as { add: unknown }).add = {
      text: vi.fn(() => textObj),
    } as unknown as Phaser.GameObjects.GameObjectFactory;
    (scene as { tweens: unknown }).tweens = {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void; onUpdate?: (t: { getValue: () => number }) => void; to: number }) => {
        config.onUpdate?.({ getValue: () => config.to });
        config.onComplete?.();
      },
    } as unknown as Phaser.Tweens.TweenManager;
    (scene as { time: unknown }).time = {
      delayedCall: (_ms: number, cb: () => void) => { cb(); },
    } as unknown as Phaser.Time.Clock;

    await MengKeXingShan.execute(ctx, visuals);

    expect(ctx.damageInfo!.sumRanks).toBe(50); // 40 + 2×5
    expect(setText).toHaveBeenCalledWith('50');
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('红黑持平（含王不计）：不加成', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    // 红 1 + 黑 1 + 王 1（suit null 不计）→ diff = 0
    battle.player.deck = [
      card(3, 'heart'), card(5, 'spade'), card(25, null),
    ];
    const ctx = makeCtx({
      battle,
      gameScene: {} as Phaser.Scene,
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 40 },
    });

    await MengKeXingShan.execute(ctx, visuals);

    expect(ctx.damageInfo!.sumRanks).toBe(40);
    expect(visuals.playSkillTriggerSound).not.toHaveBeenCalled();
  });

  it('黑比红多：不加成', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(3, 'spade'), card(5, 'club'), card(7, 'heart')];
    const ctx = makeCtx({
      battle,
      gameScene: {} as Phaser.Scene,
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 40 },
    });

    await MengKeXingShan.execute(ctx, visuals);

    expect(ctx.damageInfo!.sumRanks).toBe(40);
  });
});

describe('MengKe 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(MengKeQuYi.id).toBe('mengke_quyi');
    expect(MengKeQuYi.name).toBe('取义');
    expect(MengKeQuYi.timing).toBe('on_gain_turn');
    expect(MengKeQuYi.dialogLines!.length).toBeGreaterThanOrEqual(2);

    expect(MengKeXingShan.id).toBe('mengke_xingshan');
    expect(MengKeXingShan.name).toBe('性善');
    expect(MengKeXingShan.timing).toBe('on_damage_accumulated');
  });
});
