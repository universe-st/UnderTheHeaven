import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { ActiveSkillSceneAccess } from '../SkillTypes';
import { LiLiFuJian } from '../LiLiFuJian';

// ── mock CardActions：弃置即时生效 ──
const { discardMock } = vi.hoisted(() => ({
  discardMock: vi.fn(),
}));
vi.mock('../../utils/CardActions', () => ({
  discardCardsFromHand: (...args: unknown[]) => discardMock(...args),
}));
// ── mock RunManager.getRun：跨局永久禁分写入对局存档 ──
const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}));
vi.mock('../../models/RunManager', () => ({
  getRun: () => runMock(),
}));

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

/** 构造满足「伏剑」可发动条件的 battle：尊法已触发、记录同点同花色 */
function makeBattleWithZunfa(hand: Card[], targetSuit: Card['suit'], targetRank: number): BattleState {
  const b = makeBattle(hand);
  b.liliZunfaTriggered = true;
  b.liliZunfaSuit = targetSuit;
  b.liliZunfaRank = targetRank;
  return b;
}

function makeSkillScene(
  battle: BattleState,
): Phaser.Scene & ActiveSkillSceneAccess & { renderPlayerHandAfterSkill: ReturnType<typeof vi.fn> } {
  const renderPlayerHandAfterSkill = vi.fn();
  return {
    getBattle: () => battle,
    renderPlayerHandAfterSkill,
    initActiveSkills: vi.fn(),
    add: {
      text: vi.fn(() => {
        const t = { y: 0, setOrigin: vi.fn(() => t), setDepth: vi.fn(() => t), setAlpha: vi.fn(() => t), destroy: vi.fn() };
        return t;
      }),
    },
    scale: { width: 2400, height: 1080 },
    tweens: { add: (config: { onComplete?: () => void }) => { config.onComplete?.(); } },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene & ActiveSkillSceneAccess & { renderPlayerHandAfterSkill: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  discardMock.mockReset();
  runMock.mockReset();
  runMock.mockReturnValue({ permanentSuitBans: [] });
  // 默认弃置实现：从玩家手牌移除并进弃牌堆（skill scene 通过 getBattle 访问）
  discardMock.mockImplementation(async (scene: { getBattle: () => BattleState }, target: string, indices: number[]) => {
    const state = scene.getBattle().player;
    const sorted = [...indices].sort((a, b) => b - a);
    const removed: Card[] = [];
    for (const i of sorted) {
      const [c] = state.hand.splice(i, 1);
      if (c) removed.push(c);
    }
    state.discardPile.push(...removed);
    return removed;
  });
});

describe('李离「伏剑」cardFilter', () => {
  it('恰好选中 1 张可进入后续判定', () => {
    expect(LiLiFuJian.cardFilter([card(3)])).toBe(true);
    expect(LiLiFuJian.cardFilter([])).toBe(false);
    expect(LiLiFuJian.cardFilter([card(3), card(5)])).toBe(false);
  });
});

describe('李离「伏剑」canUseWithSelection（前置条件）', () => {
  it('尊法未触发 → 不可发动', () => {
    const battle = makeBattle([card(3, 'spade')]);
    const scene = makeSkillScene(battle);
    expect(LiLiFuJian.canUseWithSelection!(scene, [card(3, 'spade')])).toBe(false);
  });

  it('尊法已触发 + 选中同点同花色牌 → 可发动', () => {
    const battle = makeBattleWithZunfa([card(3, 'spade')], 'spade', 3);
    const scene = makeSkillScene(battle);
    expect(LiLiFuJian.canUseWithSelection!(scene, [card(3, 'spade')])).toBe(true);
  });

  it('选中不同花色 → 不可发动', () => {
    const battle = makeBattleWithZunfa([card(3, 'heart')], 'spade', 3);
    const scene = makeSkillScene(battle);
    expect(LiLiFuJian.canUseWithSelection!(scene, [card(3, 'heart')])).toBe(false);
  });

  it('选中同花色不同点数 → 不可发动', () => {
    const battle = makeBattleWithZunfa([card(5, 'spade')], 'spade', 3);
    const scene = makeSkillScene(battle);
    expect(LiLiFuJian.canUseWithSelection!(scene, [card(5, 'spade')])).toBe(false);
  });
});

describe('李离「伏剑」execute（移除花色 + 永久禁分 + 移除角色）', () => {
  it('展示同点同花色牌，移除手牌/牌堆/弃牌堆中该花色，写 run.permanentSuitBans 并移除李离', async () => {
    const spade3 = card(3, 'spade');
    const spade5 = card(5, 'spade');
    const heart3 = card(3, 'heart');
    const battle = makeBattleWithZunfa([spade3, spade5, heart3], 'spade', 3);
    // 牌堆/弃牌堆中含黑桃：一并移出牌库
    battle.player.deck = [card(9, 'spade'), card(10, 'heart')];
    battle.player.discardPile = [card(11, 'spade')];
    const scene = makeSkillScene(battle);

    await LiLiFuJian.execute(scene as never, [spade3]);

    // 手牌中黑桃全部移除（含展示牌），红桃保留
    expect(battle.player.hand.map(c => c.uid)).toEqual([heart3.uid]);
    // 牌堆 / 弃牌堆中黑桃移除
    expect(battle.player.deck.map(c => c.rank)).toEqual([10]);
    expect(battle.player.discardPile.map(c => c.rank)).toEqual([]);
    // 永久禁分：写入对局存档 + 注入本场 battle
    expect(runMock).toHaveBeenCalled();
    expect(runMock.mock.results[0]!.value.permanentSuitBans).toEqual(['spade']);
    expect(battle.permanentSuitBans).toEqual(['spade']);
    // 移除李离
    expect(battle.player.lostCharacters).toContain('lili');
    expect(scene.renderPlayerHandAfterSkill).toHaveBeenCalled();
  });

  it('无对局（run 为 null，测试模式）：仅注入本场 battle.permanentSuitBans', async () => {
    runMock.mockReturnValue(null);
    const spade3 = card(3, 'spade');
    const battle = makeBattleWithZunfa([spade3], 'spade', 3);
    const scene = makeSkillScene(battle);

    await LiLiFuJian.execute(scene as never, [spade3]);

    expect(battle.permanentSuitBans).toEqual(['spade']);
    expect(battle.player.lostCharacters).toContain('lili');
  });

  it('尊法未触发（execute 兜底）→ 直接返回', async () => {
    const battle = makeBattle([card(3, 'spade')]);
    const scene = makeSkillScene(battle);
    await LiLiFuJian.execute(scene as never, [card(3, 'spade')]);
    expect(battle.player.lostCharacters ?? []).not.toContain('lili');
  });
});

describe('李离「伏剑」配置', () => {
  it('id / name / owner / maxUses 符合规范', () => {
    expect(LiLiFuJian.id).toBe('lili_fujian');
    expect(LiLiFuJian.name).toBe('伏剑');
    expect(LiLiFuJian.ownerCharacterId).toBe('lili');
    expect(LiLiFuJian.maxUses).toBe(1);
  });
});
