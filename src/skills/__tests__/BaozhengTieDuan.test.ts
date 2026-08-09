import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerResponseBlock, getBlockedResponseTypes, clearPassiveSkills } from '../PassiveSkillUtils';
import type { HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { BaozhengTieDuanBlock, ALL_HAND_TYPES, BaozhengTieDuanCoefficient, BaozhengTieDuan, TIE_DUAN_DIALOG_BY_RANK, tieDuanDialog } from '../BaozhengTieDuan';
import { isTieDuanSingle, canPlayerBeat, canPlayerRosterBeat } from '../../engine/CharacterAbilities';
import type { Card } from '../../models/Card';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

function single(rank: number, suit: Card['suit'] = 'spade'): HandPattern {
  return {
    type: HandType.Single,
    cards: [{ uid: `c${rank}`, suit, rank, rankLabel: String(rank) }],
    mainValue: rank,
    length: 1,
  };
}

function rocket(): HandPattern {
  return {
    type: HandType.Rocket,
    cards: [
      { uid: 'j1', suit: null, rank: 25, rankLabel: '虎' },
      { uid: 'j2', suit: null, rank: 30, rankLabel: '龍' },
    ],
    mainValue: 25,
    length: 1,
  };
}

function bomb(rank: number): HandPattern {
  return {
    type: HandType.Bomb,
    cards: Array.from({ length: 4 }, (_, i) => ({ uid: `b${rank}_${i}`, suit: 'club' as const, rank, rankLabel: String(rank) })),
    mainValue: rank,
    length: 4,
  };
}

describe('isTieDuanSingle（铁断单张判定）', () => {
  it('9/小王(25)/大王(30) 单张均判定为铁断牌', () => {
    expect(isTieDuanSingle(single(9))).toBe(true);
    expect(isTieDuanSingle(single(25))).toBe(true);
    expect(isTieDuanSingle(single(30))).toBe(true);
  });

  it('其他点数单张不是铁断牌', () => {
    expect(isTieDuanSingle(single(3))).toBe(false);
    expect(isTieDuanSingle(single(10))).toBe(false);
    expect(isTieDuanSingle(single(20))).toBe(false);
  });

  it('非单张牌型（对子/炸弹/王炸）不是铁断牌', () => {
    expect(isTieDuanSingle(bomb(9))).toBe(false);
    expect(isTieDuanSingle(rocket())).toBe(false);
    expect(isTieDuanSingle(null)).toBe(false);
    expect(isTieDuanSingle(undefined)).toBe(false);
  });

  it('视为 9 的临时牌（consideredAs）判定为铁断牌', () => {
    const pattern: HandPattern = {
      type: HandType.Single,
      cards: [{
        uid: 'tmp', suit: 'heart', rank: 8, rankLabel: '8',
        consideredAs: { rank: 9, rankLabel: '9', suit: 'spade' },
      }],
      mainValue: 9,
      length: 1,
    };
    expect(isTieDuanSingle(pattern)).toBe(true);
  });
});

describe('包拯「铁断」接牌判定', () => {
  it('包拯用单张 9 可响应任意牌（含王炸）', () => {
    expect(canPlayerBeat('baozheng', single(9), rocket())).toBe(true);
    expect(canPlayerBeat('baozheng', single(9), bomb(20))).toBe(true);
    expect(canPlayerBeat('baozheng', single(9), single(30))).toBe(true);
  });

  it('包拯用单张小王/大王可响应任意牌', () => {
    expect(canPlayerBeat('baozheng', single(25), rocket())).toBe(true);
    expect(canPlayerBeat('baozheng', single(30), rocket())).toBe(true);
  });

  it('包拯其他单张不享受铁断，仍按常规规则判定', () => {
    expect(canPlayerBeat('baozheng', single(3), single(10))).toBe(false);
    expect(canPlayerBeat('baozheng', single(10), single(3))).toBe(true);
  });

  it('其他角色不享受铁断', () => {
    expect(canPlayerBeat('hanxin', single(9), rocket())).toBe(false);
  });
});

describe('包拯「铁断」阵容版接牌判定（canPlayerRosterBeat）', () => {
  it('阵容含包拯（非首位）时单张 9 可响应任意牌', () => {
    expect(canPlayerRosterBeat(['hanxin', 'baozheng'], single(9), rocket())).toBe(true);
  });

  it('阵容不含包拯时不享受铁断', () => {
    expect(canPlayerRosterBeat(['hanxin', 'zhugeliang'], single(9), rocket())).toBe(false);
  });

  it('阵容首位角色决定非铁断牌的常规判定（如诸葛亮 equal）', () => {
    const last = single(10);
    expect(canPlayerRosterBeat(['zhugeliang', 'baozheng'], single(10), last)).toBe(true);
  });
});

describe('包拯「铁断」响应封锁（对方无法使用任何牌应对）', () => {
  beforeEach(() => {
    clearPassiveSkills();
    registerResponseBlock('baozheng', BaozhengTieDuanBlock);
  });

  it('lastPlay 为单张 9 时封锁全部牌型（含王炸）', () => {
    const blocked = getBlockedResponseTypes('baozheng', single(9));
    expect(blocked).toEqual(ALL_HAND_TYPES);
    expect(blocked).toContain(HandType.Rocket);
    expect(blocked).toContain(HandType.Bomb);
    expect(blocked).toContain(HandType.Single);
  });

  it('lastPlay 为单张小王/大王时同样封锁全部牌型', () => {
    expect(getBlockedResponseTypes('baozheng', single(25))).toEqual(ALL_HAND_TYPES);
    expect(getBlockedResponseTypes('baozheng', single(30))).toEqual(ALL_HAND_TYPES);
  });

  it('lastPlay 非铁断牌时不封锁', () => {
    expect(getBlockedResponseTypes('baozheng', single(10))).toEqual([]);
    expect(getBlockedResponseTypes('baozheng', bomb(9))).toEqual([]);
    expect(getBlockedResponseTypes('baozheng', rocket())).toEqual([]);
  });

  it('其他角色查询包拯封锁不生效', () => {
    expect(getBlockedResponseTypes('banner_army', single(9))).toEqual([]);
  });
});

describe('包拯「铁断」不无视对方封锁（如八旗军「骑射」）', () => {
  beforeEach(() => {
    clearPassiveSkills();
    // 八旗军「骑射」：lastPlay 为方片单张时封锁单张响应
    registerResponseBlock('banner_army', {
      type: 'response_block',
      getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
        const lp = ctx.lastPlay;
        if (lp.type === HandType.Single && lp.cards.length === 1 && lp.cards[0]!.suit === 'diamond') {
          return [HandType.Single];
        }
        return [];
      },
    });
  });

  it('模拟 onPlayClick 顺序：敌方封锁 Single 时，铁断单张 9 仍被拦截（先查封锁再查铁断）', () => {
    const lastPlay = single(5, 'diamond');
    const blockedTypes = getBlockedResponseTypes('banner_army', lastPlay);
    // 封锁检查先于铁断判定（BattleFlowManager.onPlayClick 顺序）
    expect(blockedTypes).toContain(HandType.Single);
    if (blockedTypes.includes(HandType.Single)) {
      // 被封锁 → 玩家不能打出单张响应，铁断不生效
      return;
    }
    expect(canPlayerRosterBeat(['baozheng'], single(9), lastPlay)).toBe(true);
  });

  it('敌方未封锁单张时，铁断单张 9 可正常响应', () => {
    const lastPlay = single(5, 'spade'); // 非方片，骑射不封锁
    expect(getBlockedResponseTypes('banner_army', lastPlay)).toEqual([]);
    expect(canPlayerRosterBeat(['baozheng'], single(9), lastPlay)).toBe(true);
  });
});

describe('包拯「铁断」系数+5（ON_COEFFICIENT_REVEALED）', () => {
  function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
    return {
      gameScene: {} as Phaser.Scene,
      battle: {
        player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: 'player' },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: 'enemy' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
      sourceCharacterId: 'baozheng',
      playerCharacterIds: ['baozheng'],
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

  it('filter：玩家打出铁断单张且结算伤害时触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      pattern: single(9),
      damageInfo: { sumRanks: 9, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 9 },
    });
    expect(BaozhengTieDuanCoefficient.filter(ctx)).toBe(true);
  });

  it('filter：敌方打出铁断单张（target=player）不触发', () => {
    const ctx = makeCtx({
      target: 'player',
      pattern: single(9),
      damageInfo: { sumRanks: 9, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 9 },
    });
    expect(BaozhengTieDuanCoefficient.filter(ctx)).toBe(false);
  });

  it('filter：非铁断单张（如 10）不触发', () => {
    const ctx = makeCtx({
      target: 'enemy',
      pattern: single(10),
      damageInfo: { sumRanks: 10, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 10 },
    });
    expect(BaozhengTieDuanCoefficient.filter(ctx)).toBe(false);
  });

  it('execute：单张 9 结算时系数 +5，finalDamage 重算', async () => {
    const damageInfo = { sumRanks: 9, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 9 };
    const ctx = makeCtx({
      target: 'enemy',
      pattern: single(9),
      damageInfo,
    });
    const visuals = makeVisuals();
    await BaozhengTieDuanCoefficient.execute(ctx, visuals);
    expect(damageInfo.coefficient).toBe(6);
    expect(damageInfo.finalDamage).toBe(9 * 6 * 1);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('包拯「铁断」按牌面区分台词', () => {
  it('大王(30) → 龙头铡台词', () => {
    expect(tieDuanDialog(single(30))).toBe('这龙头铡，铡的是违法乱国的皇亲国戚！');
  });

  it('小王(25) → 虎头铡台词', () => {
    expect(tieDuanDialog(single(25))).toBe('这虎头铡，铡的是贪赃枉法的乱臣贼子！');
  });

  it('9 → 狗头铡台词', () => {
    expect(tieDuanDialog(single(9))).toBe('这狗头铡，铡的是横行霸道的流氓地痞！');
  });

  it('非铁断牌返回空串', () => {
    expect(tieDuanDialog(single(10))).toBe('');
    expect(tieDuanDialog(null)).toBe('');
  });

  it('台词表含三条且键为 9/25/30', () => {
    expect(Object.keys(TIE_DUAN_DIALOG_BY_RANK).map(Number).sort((a, b) => a - b)).toEqual([9, 25, 30]);
  });

  it('ON_PLAY execute 按牌面显示指定台词', async () => {
    const ctx: SkillContext = {
      gameScene: {} as Phaser.Scene,
      battle: {
        player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: 'player' },
        enemy: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: 'enemy' },
        turnHolder: 'player', lastPlay: null, phase: 'play', turnCount: 1,
      },
      sourceCharacterId: 'baozheng',
      playerCharacterIds: ['baozheng'],
      target: 'enemy',
      pattern: single(30),
    };
    const visuals: SkillVisualManager = {
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
    await BaozhengTieDuan.execute(ctx, visuals);
    expect(visuals.showDialog).toHaveBeenCalledWith(
      'baozheng',
      '这龙头铡，铡的是违法乱国的皇亲国戚！',
    );
  });
});
