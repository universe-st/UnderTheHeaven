import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import { FOUR_SEALS, randomFourSeal } from '../../models/FourSeal';
import { TangYinMiaoHui } from '../TangYinMiaoHui';

let idc = 0;
function card(rank: number, opts: Partial<Card> = {}): Card {
  idc += 1;
  return {
    uid: `c${idc}`,
    suit: 'spade',
    rank,
    rankLabel: rankToLabel(rank),
    score: rank,
    ...opts,
  };
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

/** mock 一个支撑 renderPlayerHandAfterSkill 的 scene；tween/delay 即时完成 */
function makeMockScene(battle: BattleState): Phaser.Scene {
  const textObj = {
    setOrigin: vi.fn(() => textObj),
    setAlpha: vi.fn(() => textObj),
    destroy: vi.fn(),
  };
  const scene = {
    battle,
    getBattle: () => battle,
    renderPlayerHandAfterSkill: vi.fn(),
    add: {
      text: vi.fn(() => textObj),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;
  return scene;
}

describe('TangYinMiaoHui cardFilter（妙绘选牌判定）', () => {
  it('恰好一张临时牌 → 通过', () => {
    expect(TangYinMiaoHui.cardFilter!([card(7, { isTemp: true })])).toBe(true);
  });

  it('普通牌（无 isTemp）→ 不通过', () => {
    expect(TangYinMiaoHui.cardFilter!([card(7)])).toBe(false);
  });

  it('isTemp === false 的普通牌 → 不通过', () => {
    expect(TangYinMiaoHui.cardFilter!([card(7, { isTemp: false })])).toBe(false);
  });

  it('多张牌 → 不通过', () => {
    expect(TangYinMiaoHui.cardFilter!([card(7, { isTemp: true }), card(8, { isTemp: true })])).toBe(false);
  });

  it('空选择 → 不通过', () => {
    expect(TangYinMiaoHui.cardFilter!([])).toBe(false);
  });
});

describe('TangYinMiaoHui execute（妙绘发动）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('选中临时牌：isTemp 变为 false，保留点数/花色/分数', async () => {
    const battle = makeBattle();
    const temp = card(12, { suit: 'heart', isTemp: true, score: 30 });
    battle.player.hand = [card(3), temp, card(9)];
    const scene = makeMockScene(battle);

    await TangYinMiaoHui.execute(scene as never, [temp]);

    const target = battle.player.hand.find(c => c.uid === temp.uid)!;
    expect(target.isTemp).toBe(false);
    expect(target.rank).toBe(12);
    expect(target.suit).toBe('heart');
    expect(target.score).toBe(30);
    const mockScene = scene as Phaser.Scene & { renderPlayerHandAfterSkill: ReturnType<typeof vi.fn> };
    expect(mockScene.renderPlayerHandAfterSkill).toHaveBeenCalled();
  });

  it('20% 概率命中：Math.random < 0.2 时附加随机四象印（四印之一）', async () => {
    const battle = makeBattle();
    const temp = card(5, { isTemp: true });
    battle.player.hand = [temp];
    const scene = makeMockScene(battle);
    // 控制 random：0.1 < 0.2 → 命中；随后 randomFourSeal 用第二个随机值
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);

    await TangYinMiaoHui.execute(scene as never, [temp]);

    const target = battle.player.hand[0]!;
    expect(target.seal).toBeDefined();
    expect(FOUR_SEALS).toContain(target.seal);
    spy.mockRestore();
  });

  it('20% 概率未命中：Math.random >= 0.2 时不附加四象印', async () => {
    const battle = makeBattle();
    const temp = card(5, { isTemp: true });
    battle.player.hand = [temp];
    const scene = makeMockScene(battle);
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);

    await TangYinMiaoHui.execute(scene as never, [temp]);

    const target = battle.player.hand[0]!;
    expect(target.seal).toBeUndefined();
    expect(target.isTemp).toBe(false);
    spy.mockRestore();
  });

  it('randomFourSeal 返回的 seal 恒为四印之一（等概率池）', () => {
    for (let i = 0; i < 200; i++) {
      const s = randomFourSeal();
      expect(FOUR_SEALS).toContain(s);
    }
  });

  it('选中牌已不在手牌中 → 无副作用', async () => {
    const battle = makeBattle();
    const temp = card(5, { isTemp: true });
    battle.player.hand = [card(3)];
    const scene = makeMockScene(battle);

    await TangYinMiaoHui.execute(scene as never, [temp]);

    expect(battle.player.hand[0]!.isTemp).toBeUndefined();
  });
});

describe('TangYinMiaoHui 配置', () => {
  it('id / name / maxUses / ownerCharacterId / requiresSelection 符合规范', () => {
    expect(TangYinMiaoHui.id).toBe('tangyin_miaohui');
    expect(TangYinMiaoHui.name).toBe('妙绘');
    expect(TangYinMiaoHui.maxUses).toBe(1);
    expect(TangYinMiaoHui.ownerCharacterId).toBe('tangyin');
    expect(TangYinMiaoHui.requiresSelection).toBe(true);
    expect(TangYinMiaoHui.dialogLines!.length).toBeGreaterThanOrEqual(3);
  });
});
