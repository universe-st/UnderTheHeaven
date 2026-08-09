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
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank) };
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

describe('XiangYuPoFu execute（破釜直伤）', () => {
  it('扣 30% 气数 + 弃置牌 + 直伤计算正确（10×分数×系数）', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const extra = card(5);
    const battle = makeBattle(500, 500, [p1, p2, p3, extra]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // 扣当前气数 30%（向上取整）：500 - ceil(150) = 350
    expect(battle.player.vitality).toBe(350);
    // 弃置选中的牌进入弃牌堆，手牌只剩未选中的牌
    expect(battle.player.hand.map((c) => c.uid)).toEqual([extra.uid]);
    expect(battle.player.discardPile.map((c) => c.uid).sort())
      .toEqual([p1.uid, p2.uid, p3.uid].sort());
    // 直伤：sumRanks = 7+7+7 = 21，Triple 系数 1.5 → round(10×21×1.5) = 315
    expect(battle.enemy.vitality).toBe(500 - 315);
    // 血条动画调用、未死亡不触发游戏结束
    expect(scene.animateHealthBarDepletionAsync).toHaveBeenCalledWith('enemy', 185, 300);
    expect(scene.showGameOver).not.toHaveBeenCalled();
  });

  it('敌方气数不足以承受伤害时死亡：调用 showGameOver(true)', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(500, 100, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // 315 伤害 → 敌方气数归零
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

  it('气数不足以支付 30%（如气数为 1）时无法发动，避免自杀', async () => {
    const p1 = card(7);
    const p2 = card(7);
    const p3 = card(7);
    const battle = makeBattle(1, 500, [p1, p2, p3]);
    const scene = makeMockScene(battle);

    await XiangYuPoFu.execute(scene, [p1, p2, p3]);

    // ceil(1×0.3)=1，扣除后归零 → 不满足"扣除后仍 > 0"，不发动
    expect(battle.player.vitality).toBe(1);
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
