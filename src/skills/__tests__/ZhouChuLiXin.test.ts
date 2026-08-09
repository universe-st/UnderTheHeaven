import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { SkillContext } from '../SkillTypes';
import { ZhouChuLiXin } from '../ZhouChuLiXin';
import { ZHOUCHU_FLAG_HAS_LIXIN, ZHOUCHU_FLAG_BIG_JOKER, ZHOUCHU_FLAG_SMALL_JOKER } from '../ZhouChuChuHaiLogic';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank) };
}

function baseCtx(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: {
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
      turnHolder: 'player',
      lastPlay: null,
      phase: 'play',
      turnCount: 1,
    },
    sourceCharacterId: 'zhouchu',
    target: 'enemy',
    playerCharacterIds: ['zhouchu'],
    enemyCharacterId: 'qiangdao',
    singleCard: {
      card: { getData: (k: string) => (k === 'suit' ? 'heart' : undefined) } as unknown as Phaser.GameObjects.Container,
      scoreText: {} as Phaser.GameObjects.Text,
      baseScore: 8,
      scoreBonus: 0,
    },
    damageCounterText: { text: '18' } as Phaser.GameObjects.Text,
    damageInfo: { sumRanks: 23, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 23 },
    ...overrides,
  };
}

describe('ZhouChuLiXin filter（励心触发判定）', () => {
  it('timing 为单牌结算后（AFTER_SINGLE_CARD_SETTLEMENT）', () => {
    expect(ZhouChuLiXin.timing).toBe('after_single_card_settlement');
  });

  it('周处已获得励心 + 玩家红桃结算时触发', () => {
    const ctx = baseCtx({
      battle: {
        player: {
          hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家',
          skillFlags: { [ZHOUCHU_FLAG_HAS_LIXIN]: true },
        },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
    });
    expect(ZhouChuLiXin.filter(ctx)).toBe(true);
  });

  it('未获得励心时不触发（技能列表仍为特殊色）', () => {
    const ctx = baseCtx();
    expect(ctx.battle.player.skillFlags).toBeUndefined();
    expect(ZhouChuLiXin.filter(ctx)).toBe(false);
  });

  it('已有移除大小王进度但未转换（未获得励心）时不触发', () => {
    const ctx = baseCtx({
      battle: {
        player: {
          hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家',
          skillFlags: { [ZHOUCHU_FLAG_BIG_JOKER]: true, [ZHOUCHU_FLAG_SMALL_JOKER]: false },
        },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
    });
    expect(ZhouChuLiXin.filter(ctx)).toBe(false);
  });

  it('非红桃牌不触发', () => {
    const ctx = baseCtx({
      singleCard: {
        card: { getData: (k: string) => (k === 'suit' ? 'spade' : undefined) } as unknown as Phaser.GameObjects.Container,
        scoreText: {} as Phaser.GameObjects.Text,
        baseScore: 10,
        scoreBonus: 0,
      },
      battle: {
        player: {
          hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家',
          skillFlags: { [ZHOUCHU_FLAG_HAS_LIXIN]: true },
        },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
    });
    expect(ZhouChuLiXin.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（敌方红桃结算）时不触发', () => {
    const ctx = baseCtx({
      target: 'player',
      battle: {
        player: {
          hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家',
          skillFlags: { [ZHOUCHU_FLAG_HAS_LIXIN]: true },
        },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
    });
    expect(ZhouChuLiXin.filter(ctx)).toBe(false);
  });

  it('缺少中央计数器引用时不触发', () => {
    const ctx = baseCtx({
      damageCounterText: undefined,
      battle: {
        player: {
          hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家',
          skillFlags: { [ZHOUCHU_FLAG_HAS_LIXIN]: true },
        },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌方' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
    });
    expect(ZhouChuLiXin.filter(ctx)).toBe(false);
  });
});

describe('ZhouChuLiXin 配置', () => {
  it('id / 归属符合规范', () => {
    expect(ZhouChuLiXin.id).toBe('zhouchu_lixin');
    expect(ZhouChuLiXin.name).toBe('励心');
  });
});
