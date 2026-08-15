import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import { aiPickDefault, type HandSelectOptions } from '../HandSelect';
import { HandSelectManager, type HandSelectHost } from '../../scenes/managers/HandSelectManager';
import type { CardDisplayManager } from '../../scenes/managers/CardDisplayManager';
import { calcHandStartX } from '../../engine/handLayout';
import { CARD_W, CARD_OVERLAP_OFFSET, HAND_AREA_MARGIN } from '../../constants/Layout';

vi.mock('../../utils/GameAudioManager', () => ({
  GameAudioManager: { playSfx: vi.fn() },
}));

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

const sum = (sel: Card[]) => sel.reduce((s, c) => s + (c.score ?? c.rank), 0);

describe('aiPickDefault（敌人侧默认 AI 选牌：直接返回判断，无动画）', () => {
  it('组合大小递增枚举，返回第一个满足 want 的组合', () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const opts: HandSelectOptions = {
      side: 'enemy',
      want: sel => sel.length === 2 && sum(sel) >= 12,
    };
    const result = aiPickDefault(hand, opts);
    // size=2 组合按索引序：{3,5}=8、{3,7}=10、{3,10}=13 → [3,10]
    expect(result!.map(c => c.rank)).toEqual([3, 10]);
  });

  it('filter 排除不可选牌', () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const opts: HandSelectOptions = {
      side: 'enemy',
      filter: c => c.rank !== 10,
      want: sel => sel.length === 2 && sum(sel) >= 12,
    };
    const result = aiPickDefault(hand, opts);
    // 候选 [3,5,7]：{5,7}=12 → [5,7]
    expect(result!.map(c => c.rank)).toEqual([5, 7]);
  });

  it('aiPick 优先于默认枚举', () => {
    const hand = [card(3), card(5)];
    const aiPick = vi.fn(() => [hand[1]!]);
    const opts: HandSelectOptions = { side: 'enemy', want: () => false, aiPick };
    const result = aiPickDefault(hand, opts);
    expect(result!.map(c => c.uid)).toEqual([hand[1]!.uid]);
    expect(aiPick).toHaveBeenCalledWith(hand);
  });

  it('无满足组合 → null', () => {
    const hand = [card(3), card(5)];
    expect(aiPickDefault(hand, { side: 'enemy', want: () => false })).toBeNull();
  });

  it('空手牌 → null', () => {
    expect(aiPickDefault([], { side: 'enemy', want: () => true })).toBeNull();
  });
});

// ── HandSelectManager 玩家侧（手牌区交互）mock ──

interface MockHarness {
  scene: Phaser.Scene & HandSelectHost;
  cardDisplay: CardDisplayManager;
  battle: BattleState;
  pointerHandlers: Array<(p: { x: number; y: number }) => void>;
  zoneHandlers: Array<() => void>;
}

function makeHarness(hand: Card[]): MockHarness {
  const battle: BattleState = {
    player: { hand, deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
    enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
    turnHolder: 'player',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };

  const pointerHandlers: MockHarness['pointerHandlers'] = [];
  const zoneHandlers: MockHarness['zoneHandlers'] = [];

  const baseY = 1080 - 90;
  const cardObjects = hand.map(() => {
    const glow = { alpha: 0 };
    const obj = {
      y: baseY,
      x: 0,
      setAlpha: vi.fn(),
      destroy: vi.fn(),
      setData: vi.fn(),
      setDepth: vi.fn(),
      getData: vi.fn((key: string) => (key === '_glowG' ? glow : undefined)),
    };
    return obj as unknown as Phaser.GameObjects.Container;
  });

  const container = {
    setDepth: vi.fn(() => container),
    add: vi.fn(() => container),
    destroy: vi.fn(),
  };
  const text = {
    setOrigin: vi.fn(() => text),
    setColor: vi.fn(() => text),
    destroy: vi.fn(),
  };
  const gfx = {
    clear: vi.fn(() => gfx),
    fillStyle: vi.fn(() => gfx),
    lineStyle: vi.fn(() => gfx),
    fillRoundedRect: vi.fn(() => gfx),
    strokeRoundedRect: vi.fn(() => gfx),
  };
  const zone = {
    setInteractive: vi.fn(() => zone),
    on: vi.fn((ev: string, cb: () => void) => {
      if (ev === 'pointerdown') zoneHandlers.push(cb);
      return zone;
    }),
    destroy: vi.fn(),
  };

  const scene = {
    battle,
    cardObjects,
    selectedIndices: new Set<number>(),
    handSelectActive: false,
    add: {
      container: vi.fn(() => container),
      text: vi.fn(() => text),
      graphics: vi.fn(() => gfx),
      zone: vi.fn(() => zone),
    },
    tweens: {
      killTweensOf: vi.fn(),
      add: vi.fn(),
    },
    input: {
      on: vi.fn((ev: string, cb: (p: { x: number; y: number }) => void) => {
        if (ev === 'pointerdown') pointerHandlers.push(cb);
        return scene.input;
      }),
      off: vi.fn(),
    },
    scale: { width: 2400, height: 1080 },
  } as unknown as Phaser.Scene & HandSelectHost;

  const cardDisplay = {
    getHandLayout: () => {
      const layout = calcHandStartX(
        hand.length, 2400, 2400 - HAND_AREA_MARGIN * 2,
        CARD_OVERLAP_OFFSET, CARD_W, 0, undefined, HAND_AREA_MARGIN,
      );
      return { startX: layout.startX, offset: layout.offset, scrollable: layout.scrollable };
    },
  } as unknown as CardDisplayManager;

  return { scene, cardDisplay, battle, pointerHandlers, zoneHandlers };
}

/** 点击手牌第 i 张（坐标 = 手牌布局中心 + 基线 Y） */
function clickCardIndex(h: MockHarness, i: number): void {
  const { startX, offset } = h.cardDisplay.getHandLayout();
  h.pointerHandlers[0]!({ x: startX + i * offset, y: 1080 - 90 });
}

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('HandSelectManager 玩家侧（手牌区选牌）', () => {
  it('点选满足 want 的牌 → 点确认 → 返回选中牌', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 3,
      filter: () => true,
      forced: false,
      title: '测试选牌',
    });
    await flush();

    clickCardIndex(h, 0);
    clickCardIndex(h, 1);
    clickCardIndex(h, 2);
    // zone handlers 顺序：确认、取消
    h.zoneHandlers[0]!();

    const result = await p;
    expect(result!.map(c => c.uid)).toEqual([hand[0]!.uid, hand[1]!.uid, hand[2]!.uid]);
  });

  it('点取消 → 返回 null（不发动）', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 3,
      forced: false,
    });
    await flush();

    h.zoneHandlers[1]!();
    expect(await p).toBeNull();
  });

  it('forced=true → 不创建取消按钮（zone 仅有确认）', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 2,
      forced: true,
    });
    await flush();

    expect(h.zoneHandlers.length).toBe(1); // 只有确认
    clickCardIndex(h, 0);
    clickCardIndex(h, 1);
    h.zoneHandlers[0]!();
    expect((await p)!.length).toBe(2);
  });

  it('filter 过滤的牌点击无效；want 不满足时确认无效（不 resolve）', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 2,
      filter: c => c.rank !== 10,
      forced: false,
    });
    await flush();

    clickCardIndex(h, 0); // 3 可选
    clickCardIndex(h, 3); // 10 被过滤，不选中
    h.zoneHandlers[0]!(); // 确认：仅选中 1 张，不满足 want → 不 resolve

    let settled = false;
    void p.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);

    h.zoneHandlers[1]!(); // 取消 → null
    expect(await p).toBeNull();
  });

  it('点选后再点同一张牌取消选中（toggle）；手牌区外点击不生效', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 2,
      forced: false,
    });
    await flush();

    clickCardIndex(h, 0); // 选中 3
    clickCardIndex(h, 0); // 再点 → 取消选中
    h.pointerHandlers[0]!({ x: 100, y: 100 }); // 手牌区外点击不生效
    h.zoneHandlers[0]!(); // 确认：0 张选中，不满足 want → 不 resolve

    let settled = false;
    void p.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);

    // 选两张后确认
    clickCardIndex(h, 1);
    clickCardIndex(h, 2);
    h.zoneHandlers[0]!();
    expect((await p)!.map(c => c.uid)).toEqual([hand[1]!.uid, hand[2]!.uid]);
  });

  it('选牌结束：解除挂起、恢复 selectedIndices 快照与手牌视觉、移除输入监听并销毁 UI', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    h.scene.selectedIndices.add(0); // 选牌前已有普通出牌选中
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const p = manager.selectHandCards({
      side: 'player',
      want: sel => sel.length === 1,
      forced: false,
    });
    await flush();
    expect(h.scene.handSelectActive).toBe(true); // 选牌期间挂起 DragInput

    clickCardIndex(h, 2); // 选 7
    h.zoneHandlers[0]!(); // 确认
    await p;

    expect(h.scene.handSelectActive).toBe(false);
    expect([...h.scene.selectedIndices]).toEqual([0]); // 恢复快照
    expect(h.scene.input.off).toHaveBeenCalled();
    for (const obj of h.scene.cardObjects) {
      expect(obj.setAlpha).toHaveBeenCalledWith(1);
    }
  });

  it('敌人侧：不创建 UI，直接返回 AI 判断（aiPick）', async () => {
    const hand = [card(3), card(5), card(7), card(10)];
    const h = makeHarness(hand);
    h.battle.enemy.hand = [card(20), card(15), card(12)];
    const manager = new HandSelectManager(h.scene, h.cardDisplay);

    const result = await manager.selectHandCards({
      side: 'enemy',
      want: sel => sel.length === 2,
      aiPick: aiHand => aiHand.slice(0, 2),
    });

    // 无 UI：没有创建任何 zone / input 监听
    expect(h.zoneHandlers.length).toBe(0);
    expect(h.pointerHandlers.length).toBe(0);
    expect(result!.map(c => c.rank)).toEqual([20, 15]);
  });
});
