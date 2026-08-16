import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillDefinition } from '../SkillTypes';
import { ZhouYuFanjian } from '../ZhouYu';

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

/** mock 一个支撑 showReveal / showNotice 的 scene；tween/delay 即时完成 */
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
  const zone = {
    setInteractive: vi.fn(() => zone),
    on: vi.fn(() => zone),
    destroy: vi.fn(),
  };

  return {
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
      zone: vi.fn(() => zone),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
}

/** 构造主动技 scene 宿主：getBattle + playerCharacterIds（canUseWithoutSelection 需要） */
function makeHostScene(battle: BattleState): Phaser.Scene & {
  getBattle(): BattleState;
  playerCharacterIds: string[];
  renderPlayerHandAfterSkill(): void;
  initActiveSkills(): void;
} {
  const base = makeMockScene(battle);
  return {
    ...base,
    getBattle: () => battle,
    playerCharacterIds: ['zhouyu'],
    renderPlayerHandAfterSkill: vi.fn(),
    initActiveSkills: vi.fn(),
  } as unknown as Phaser.Scene & {
    getBattle(): BattleState;
    playerCharacterIds: string[];
    renderPlayerHandAfterSkill(): void;
    initActiveSkills(): void;
  };
}

describe('ZhouYuFanjian 配置', () => {
  it('id / name / maxUses / owner / requiresSelection 符合规范', () => {
    const s = ZhouYuFanjian as ActiveSkillDefinition;
    expect(s.id).toBe('zhouyu_fanjian');
    expect(s.name).toBe('反间');
    expect(s.maxUses).toBe(1);
    expect(s.ownerCharacterId).toBe('zhouyu');
    expect(s.requiresSelection).toBe(false);
    expect(s.dialogLines!.length).toBeGreaterThanOrEqual(2);
    // 默认「获得牌权时重置」= 每次牌权限一次；不设 resetOnLostTurn
    expect(s.resetOnLostTurn).toBeUndefined();
  });
});

describe('ZhouYuFanjian canUseWithoutSelection（反间可用性判定）', () => {
  it('周瑜在场 + 无标记 + 敌方有手牌 → 可发动', () => {
    const battle = makeBattle();
    battle.enemy.hand = [card(3), card(5)];
    const scene = makeHostScene(battle);
    expect(ZhouYuFanjian.canUseWithoutSelection!(scene)).toBe(true);
  });

  it('已有标记 → 不可发动（每次牌权只能标记一张）', () => {
    const battle = makeBattle();
    battle.enemy.hand = [card(3), card(5)];
    battle.fanjianMarkedUid = 'c1';
    const scene = makeHostScene(battle);
    expect(ZhouYuFanjian.canUseWithoutSelection!(scene)).toBe(false);
  });

  it('敌方无手牌 → 不可发动', () => {
    const battle = makeBattle();
    battle.enemy.hand = [];
    const scene = makeHostScene(battle);
    expect(ZhouYuFanjian.canUseWithoutSelection!(scene)).toBe(false);
  });

  it('周瑜不在玩家阵容 → 不可发动', () => {
    const battle = makeBattle();
    battle.enemy.hand = [card(3)];
    const scene = makeHostScene(battle);
    scene.playerCharacterIds = ['hanxin'];
    expect(ZhouYuFanjian.canUseWithoutSelection!(scene)).toBe(false);
  });
});

describe('ZhouYuFanjian execute（反间标记）', () => {
  it('随机标记一张敌方手牌：fanjianMarkedUid 命中敌方手牌、敌方手牌不被移除', async () => {
    const battle = makeBattle();
    const enemyCards = [card(3), card(5), card(10), card(20, 'heart')];
    battle.enemy.hand = [...enemyCards];
    const scene = makeHostScene(battle);

    await ZhouYuFanjian.execute(scene, []);

    // 标记牌必须是敌方手牌中的一张
    const enemyUids = new Set(enemyCards.map(c => c.uid));
    expect(battle.fanjianMarkedUid).toBeDefined();
    expect(enemyUids.has(battle.fanjianMarkedUid!)).toBe(true);
    // 仅标记不取走：敌方手牌数量与内容不变
    expect(battle.enemy.hand.length).toBe(4);
    expect(battle.enemy.hand.map(c => c.uid).sort()).toEqual(enemyCards.map(c => c.uid).sort());
  });

  it('敌方无手牌时直接返回，不设置标记', async () => {
    const battle = makeBattle();
    battle.enemy.hand = [];
    const scene = makeHostScene(battle);

    await ZhouYuFanjian.execute(scene, []);

    expect(battle.fanjianMarkedUid).toBeUndefined();
  });
});
