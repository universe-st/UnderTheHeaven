import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillSceneAccess } from '../SkillTypes';
import { XiangYuPoFu } from '../XiangYuPoFu';

type MockGameScene = Phaser.Scene & ActiveSkillSceneAccess & {
  animateHealthBarDepletionAsync(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
  ): Promise<void>;
  showGameOver(win: boolean): void;
};

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function makeBattle(playerVitality: number, enemyVitality: number, hand: Card[] = []): BattleState {
  return {
    player: {
      hand, deck: [], discardPile: [],
      vitality: playerVitality, vitalityMax: playerVitality, name: '玩家',
    },
    enemy: {
      hand: [], deck: [], discardPile: [],
      vitality: enemyVitality, vitalityMax: enemyVitality, name: '敌方',
    },
    turnHolder: 'player',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
  };
}

/** mock 一个支撑弃牌 + 血条动画 + 游戏结束的 scene */
function makeMockScene(battle: BattleState): MockGameScene {
  const container = {
    x: 0,
    y: 0,
    setDepth: vi.fn(() => container),
    setData: vi.fn(() => container),
    setAlpha: vi.fn(() => container),
    setScale: vi.fn(() => container),
    setOrigin: vi.fn(() => container),
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
    add: { container: vi.fn(() => container), text: vi.fn(() => container) },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    getBattle: () => battle,
    renderPlayerHandAfterSkill: vi.fn(),
    initActiveSkills: vi.fn(),
    animateHealthBarDepletionAsync: vi.fn(async () => {}),
    showGameOver: vi.fn(),
  } as unknown as MockGameScene;
}

describe('XiangYuPoFu cardFilter（破釜可用判定）', () => {
  it('选中牌是合法牌型（三张相同点数 = 三张）时可发动', () => {
    expect(XiangYuPoFu.cardFilter([card(7), card(7), card(7)])).toBe(true);
  });

  it('选中牌是非法牌型（两张不同点数）不可发动', () => {
    expect(XiangYuPoFu.cardFilter([card(7), card(9)])).toBe(false);
  });

  it('未选中任何牌不可发动', () => {
    expect(XiangYuPoFu.cardFilter([])).toBe(false);
  });
});

describe('XiangYuPoFu canUseWithSelection（气数门槛）', () => {
  it('气数足以承担扣减时可发动（扣减后仍 > 0）', () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(500, 500, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    // cost = round(21 × 1.5) = 32；500 - 32 = 468 > 0 → 可发动
    expect(XiangYuPoFu.canUseWithSelection!(scene, [p1, p2, p3])).toBe(true);
  });

  it('气数无法承担扣减（扣完 ≤ 0）时不可发动', () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(32, 500, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    // cost = 32；32 - 32 = 0 → 无法承担 → 不可发动
    expect(XiangYuPoFu.canUseWithSelection!(scene, [p1, p2, p3])).toBe(false);
  });

  it('选中非法牌型时不可发动', () => {
    const a = card(7);
    const b = card(9);
    const battle = makeBattle(500, 500, [a, b]);
    const scene = makeMockScene(battle);

    expect(XiangYuPoFu.canUseWithSelection!(scene, [a, b])).toBe(false);
  });
});

describe('XiangYuPoFu execute（破釜直伤）', () => {
  it('扣减自身 cost 气数 + 弃置牌 + 对对方造成两倍伤害', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const extra = card(5);
    const battle = makeBattle(500, 500, [p1, p2, p3, extra]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // cost = round(21 × 1.5) = 32：玩家 500 → 468
    expect(battle.player.vitality).toBe(468);
    // 弃置选中的牌进入弃牌堆，手牌只剩未选中的牌
    expect(battle.player.hand.map((c) => c.uid)).toEqual([extra.uid]);
    expect(battle.player.discardPile.map((c) => c.uid).sort())
      .toEqual([p1.uid, p2.uid, p3.uid].sort());
    // 两倍伤害：damage = 32 × 2 = 64 → 敌方 500 → 436
    expect(battle.enemy.vitality).toBe(436);
    // 血条动画：先扣自身（player），再伤敌方（enemy）；未死亡不触发游戏结束
    expect(scene.animateHealthBarDepletionAsync).toHaveBeenNthCalledWith(1, 'player', 468, 400);
    expect(scene.animateHealthBarDepletionAsync).toHaveBeenNthCalledWith(2, 'enemy', 436, 400);
    expect(scene.showGameOver).not.toHaveBeenCalled();
  });

  it('敌方气数不足以承受两倍伤害时死亡：调用 showGameOver(true)', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(500, 60, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // 64 伤害 → 敌方气数归零
    expect(battle.enemy.vitality).toBe(0);
    expect(scene.showGameOver).toHaveBeenCalledWith(true);
  });

  it('玩家气数为 0 时无法发动（安静返回，不扣血不弃牌）', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(0, 500, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    expect(battle.player.vitality).toBe(0);
    expect(battle.player.hand.length).toBe(3);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.enemy.vitality).toBe(500);
    expect(scene.animateHealthBarDepletionAsync).not.toHaveBeenCalled();
    expect(scene.showGameOver).not.toHaveBeenCalled();
  });

  it('气数不足以承担扣减（扣完 ≤ 0）时无法发动，避免自杀', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(32, 500, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // cost = 32，32 - 32 = 0 → 无法承担 → 不发动
    expect(battle.player.vitality).toBe(32);
    expect(battle.player.hand.length).toBe(3);
    expect(battle.enemy.vitality).toBe(500);
    expect(scene.animateHealthBarDepletionAsync).not.toHaveBeenCalled();
    expect(scene.showGameOver).not.toHaveBeenCalled();
  });
});

describe('XiangYuPoFu 配置', () => {
  it('id / name / maxUses / ownerCharacterId 符合规范', () => {
    expect(XiangYuPoFu.id).toBe('xiangyu_pofu');
    expect(XiangYuPoFu.name).toBe('破釜');
    expect(XiangYuPoFu.maxUses).toBe(1);
    expect(XiangYuPoFu.ownerCharacterId).toBe('xiangyu');
    expect(XiangYuPoFu.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
