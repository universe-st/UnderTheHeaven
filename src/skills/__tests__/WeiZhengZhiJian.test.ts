import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillSceneAccess } from '../SkillTypes';
import { WeiZhengZhiJian } from '../WeiZhengZhiJian';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank) };
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

describe('WeiZhengZhiJian cardFilter（直谏可用判定）', () => {
  it('选中一张牌时可发动', () => {
    expect(WeiZhengZhiJian.cardFilter([card(3)])).toBe(true);
  });

  it('选中两张牌不可发动', () => {
    expect(WeiZhengZhiJian.cardFilter([card(3), card(5)])).toBe(false);
  });

  it('未选中任何牌不可发动', () => {
    expect(WeiZhengZhiJian.cardFilter([])).toBe(false);
  });
});

describe('WeiZhengZhiJian execute（直谏弃置手牌）', () => {
  it('弃置选中的一张手牌（进入弃牌堆），并刷新手牌', async () => {
    const a = card(3);
    const b = card(5);
    const battle = makeBattle([a, b]);
    const scene = makeHostScene(battle);

    await WeiZhengZhiJian.execute(scene, [a]);

    // 手牌移除选中牌，弃牌堆新增
    expect(battle.player.hand.map((c) => c.uid)).not.toContain(a.uid);
    expect(battle.player.hand.map((c) => c.uid)).toContain(b.uid);
    expect(battle.player.discardPile.map((c) => c.uid)).toContain(a.uid);
    // 刷新手牌渲染
    expect(scene.renderPlayerHandAfterSkill).toHaveBeenCalled();
  });

  it('选中牌不在手牌中时安静返回，不改变手牌', async () => {
    const a = card(3);
    const b = card(5);
    const battle = makeBattle([a]);
    const scene = makeHostScene(battle);

    await WeiZhengZhiJian.execute(scene, [b]);

    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(0);
    expect(scene.renderPlayerHandAfterSkill).not.toHaveBeenCalled();
  });
});

describe('WeiZhengZhiJian 配置', () => {
  it('id / name / maxUses / ownerCharacterId 符合规范', () => {
    expect(WeiZhengZhiJian.id).toBe('weizheng_zhijian');
    expect(WeiZhengZhiJian.name).toBe('直谏');
    expect(WeiZhengZhiJian.maxUses).toBe(1);
    expect(WeiZhengZhiJian.ownerCharacterId).toBe('weizheng');
    // 默认需要选中牌才能发动
    expect(WeiZhengZhiJian.requiresSelection).toBeUndefined();
    expect(WeiZhengZhiJian.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
