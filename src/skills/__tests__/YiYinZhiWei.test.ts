import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillSceneAccess } from '../SkillTypes';
import { YiYinZhiWei } from '../YiYinZhiWei';
import { SkillVisualManagerImpl } from '../SkillVisualManagerImpl';

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

describe('伊尹「至味」cardFilter（可用判定）', () => {
  it('恰好四张且四种花色各一张时可发动', () => {
    const selected = [card(3, 'spade'), card(5, 'club'), card(7, 'heart'), card(9, 'diamond')];
    expect(YiYinZhiWei.cardFilter(selected)).toBe(true);
  });

  it('花色重复（缺少一种花色）不可发动', () => {
    const selected = [card(3, 'spade'), card(5, 'spade'), card(7, 'heart'), card(9, 'diamond')];
    expect(YiYinZhiWei.cardFilter(selected)).toBe(false);
  });

  it('包含无花色的大小王不可发动', () => {
    const selected = [card(25, null), card(5, 'club'), card(7, 'heart'), card(9, 'diamond')];
    expect(YiYinZhiWei.cardFilter(selected)).toBe(false);
  });

  it('数量不足四张不可发动', () => {
    const selected = [card(3, 'spade'), card(5, 'club'), card(7, 'heart')];
    expect(YiYinZhiWei.cardFilter(selected)).toBe(false);
  });

  it('数量超过四张不可发动', () => {
    const selected = [
      card(3, 'spade'), card(5, 'club'), card(7, 'heart'), card(9, 'diamond'), card(11, 'spade'),
    ];
    expect(YiYinZhiWei.cardFilter(selected)).toBe(false);
  });
});

describe('伊尹「至味」execute（弃牌 + 治疗）', () => {
  it('弃置四张异花色牌（进弃牌堆），治疗分数之和的气数', async () => {
    const cards = [card(3, 'spade'), card(5, 'club'), card(7, 'heart'), card(9, 'diamond')];
    // execute 会就地修改 hand（与 cards 同一引用），先保存 uid
    const uids = cards.map((c) => c.uid).sort();
    const battle = makeBattle(cards);
    battle.player.vitality = 400; // 残血，验证治疗生效且不超上限
    const scene = makeHostScene(battle);

    // mock showHeal：记录调用并复刻 clamp 语义（闭包引用 battle）
    const spy = vi.spyOn(SkillVisualManagerImpl.prototype, 'showHeal')
      .mockImplementation((_target, amount) => {
        battle.player.vitality = Math.min(battle.player.vitalityMax, battle.player.vitality + amount);
      });

    try {
      await YiYinZhiWei.execute(scene, cards);

      expect(battle.player.hand).toHaveLength(0);
      expect(battle.player.discardPile.map((c) => c.uid).sort()).toEqual(uids);
      // 3 + 5 + 7 + 9 = 24；400 + 24 = 424
      expect(spy).toHaveBeenCalledWith('player', 24);
      expect(battle.player.vitality).toBe(424);
      expect(scene.renderPlayerHandAfterSkill).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('治疗按分数（score）计算而非点数（rank）：分数被技能修改后以分数为准', async () => {
    const cards = [card(3, 'spade'), card(5, 'club'), card(7, 'heart'), card(9, 'diamond')];
    cards[1]!.score = 20; // 点数仍为 5，分数被单独修改为 20
    const uids = cards.map((c) => c.uid).sort();
    const battle = makeBattle(cards);
    battle.player.vitality = 400; // 残血，验证治疗生效且不超上限
    const scene = makeHostScene(battle);

    // mock showHeal：记录调用并复刻 clamp 语义（闭包引用 battle）
    const spy = vi.spyOn(SkillVisualManagerImpl.prototype, 'showHeal')
      .mockImplementation((_target, amount) => {
        battle.player.vitality = Math.min(battle.player.vitalityMax, battle.player.vitality + amount);
      });

    try {
      await YiYinZhiWei.execute(scene, cards);

      expect(battle.player.hand).toHaveLength(0);
      expect(battle.player.discardPile.map((c) => c.uid).sort()).toEqual(uids);
      // 3 + 20 + 7 + 9 = 39（若误按点数则为 24）；400 + 39 = 439
      expect(spy).toHaveBeenCalledWith('player', 39);
      expect(battle.player.vitality).toBe(439);
    } finally {
      spy.mockRestore();
    }
  });

  it('选中牌与手牌不匹配时安静返回', async () => {
    const a = card(3, 'spade');
    const battle = makeBattle([a]);
    const scene = makeHostScene(battle);
    const spy = vi.spyOn(SkillVisualManagerImpl.prototype, 'showHeal').mockImplementation(vi.fn());

    try {
      const others = [card(5, 'club'), card(7, 'heart'), card(9, 'diamond'), card(11, 'spade')];
      await YiYinZhiWei.execute(scene, others);

      expect(battle.player.hand).toHaveLength(1);
      expect(battle.player.discardPile).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('伊尹「至味」配置', () => {
  it('id / name / maxUses / ownerCharacterId 符合规范', () => {
    expect(YiYinZhiWei.id).toBe('yiyin_zhiwei');
    expect(YiYinZhiWei.name).toBe('至味');
    expect(YiYinZhiWei.maxUses).toBe(1);
    expect(YiYinZhiWei.ownerCharacterId).toBe('yiyin');
    expect(YiYinZhiWei.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
