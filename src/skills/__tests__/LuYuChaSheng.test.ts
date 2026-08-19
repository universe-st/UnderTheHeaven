import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel, cardScoreBoostKey } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillSceneAccess } from '../SkillTypes';
import { LuYuChaSheng } from '../LuYuChaSheng';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function makeBattle(hand: Card[] = []): BattleState {
  return {
    player: {
      hand, deck: [], discardPile: [],
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

/** mock 一个 CardActionsHost 形状的 scene：弃置动画即时完成 */
function makeHostScene(battle: BattleState): Phaser.Scene & ActiveSkillSceneAccess {
  const container = {
    x: 0,
    y: 0,
    setDepth: vi.fn(() => container),
    setData: vi.fn(() => container),
    setAlpha: vi.fn(() => container),
    setScale: vi.fn(() => container),
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
    add: { container: vi.fn(() => container) },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
    getBattle: () => battle,
    renderPlayerHandAfterSkill: vi.fn(),
    initActiveSkills: vi.fn(),
  } as unknown as Phaser.Scene & ActiveSkillSceneAccess;
}

describe('LuYuChaSheng cardFilter（茶圣可用判定）', () => {
  it('选一张梅花牌 → 通过', () => {
    expect(LuYuChaSheng.cardFilter([card(5, 'club')])).toBe(true);
  });

  it('选多张梅花牌 → 通过', () => {
    expect(LuYuChaSheng.cardFilter([card(3, 'club'), card(7, 'club'), card(10, 'club')])).toBe(true);
  });

  it('含非梅花牌 → 不通过', () => {
    expect(LuYuChaSheng.cardFilter([card(3, 'club'), card(5, 'spade')])).toBe(false);
  });

  it('非梅花牌（红桃）→ 不通过', () => {
    expect(LuYuChaSheng.cardFilter([card(5, 'heart')])).toBe(false);
  });

  it('未选中任何牌 → 不通过', () => {
    expect(LuYuChaSheng.cardFilter([])).toBe(false);
  });
});

describe('LuYuChaSheng execute（茶圣弃置梅花加分）', () => {
  it('弃置梅花牌：分数 +1（永久）、进入弃牌堆、scoreBoosts 累计、刷新手牌', async () => {
    const a = card(3, 'club');   // 梅花，score 3
    const b = card(5, 'club');   // 梅花，score 5
    const c = card(8, 'spade');  // 黑桃，不动
    const battle = makeBattle([a, b, c]);
    const scene = makeHostScene(battle);

    await LuYuChaSheng.execute(scene, [a, b]);

    // 梅花牌被弃置（离开手牌、进入弃牌堆），黑桃保留
    expect(battle.player.hand.map((h) => h.uid)).toEqual([c.uid]);
    expect(battle.player.discardPile.map((d) => d.uid).sort()).toEqual([a.uid, b.uid].sort());
    // 弃置的梅花牌分数永久 +1
    expect(a.score).toBe(4);
    expect(b.score).toBe(6);
    // scoreBoosts 按卡牌身份键累计（跨战斗持久化用）
    expect(battle.player.scoreBoosts?.[cardScoreBoostKey(a)]).toBe(1);
    expect(battle.player.scoreBoosts?.[cardScoreBoostKey(b)]).toBe(1);
    // 刷新手牌渲染
    expect(scene.renderPlayerHandAfterSkill).toHaveBeenCalled();
  });

  it('多次发动：同一梅花牌分数键累计（同 uid 不可重复，用不同梅花测累计）', async () => {
    const a = card(3, 'club');
    const b = card(4, 'club');
    const battle = makeBattle([a, b]);
    const scene = makeHostScene(battle);

    await LuYuChaSheng.execute(scene, [a, b]);
    // 再放回手牌模拟再次发动（同键累计）
    battle.player.hand.push(a);
    await LuYuChaSheng.execute(scene, [a]);

    expect(a.score).toBe(5); // 3 +1 +1
    expect(battle.player.scoreBoosts?.[cardScoreBoostKey(a)]).toBe(2);
  });

  it('选中牌已不在手牌中（uid 不匹配）→ 无副作用', async () => {
    const a = card(3, 'club');
    const b = card(5, 'spade');
    const battle = makeBattle([b]);
    const scene = makeHostScene(battle);

    await LuYuChaSheng.execute(scene, [a]);

    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(0);
    expect(scene.renderPlayerHandAfterSkill).not.toHaveBeenCalled();
  });
});

describe('LuYuChaSheng 配置', () => {
  it('id / name / maxUses / ownerCharacterId 符合规范', () => {
    expect(LuYuChaSheng.id).toBe('luyu_chasheng');
    expect(LuYuChaSheng.name).toBe('茶圣');
    expect(LuYuChaSheng.maxUses).toBe(1);
    expect(LuYuChaSheng.ownerCharacterId).toBe('luyu');
    expect(LuYuChaSheng.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
