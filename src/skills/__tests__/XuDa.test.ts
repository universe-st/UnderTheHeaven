import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { XuDaZhenBei } from '../XuDa';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function patternWith(...cards: Card[]): HandPattern {
  return { type: HandType.Single, cards, mainValue: cards[0]!.rank, length: cards.length };
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

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: 'xuda',
    target: 'enemy',
    playerCharacterIds: ['xuda'],
    pattern: patternWith(card(8)),
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

describe('XuDaZhenBei filter（镇北触发判定）', () => {
  it('徐达在场 + 响应（跟牌）出牌给敌方 → 触发', () => {
    const ctx = makeCtx({ isRespond: true });
    expect(XuDaZhenBei.filter(ctx)).toBe(true);
  });

  it('先手主动出牌（isRespond=false）→ 不触发', () => {
    const ctx = makeCtx({ isRespond: false });
    expect(XuDaZhenBei.filter(ctx)).toBe(false);
  });

  it('isRespond 缺失 → 不触发', () => {
    const ctx = makeCtx({});
    expect(XuDaZhenBei.filter(ctx)).toBe(false);
  });

  it('非徐达阵容 → 不触发', () => {
    const ctx = makeCtx({ isRespond: true, playerCharacterIds: ['hanxin'] });
    expect(XuDaZhenBei.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const ctx = makeCtx({ isRespond: true, target: 'player' });
    expect(XuDaZhenBei.filter(ctx)).toBe(false);
  });
});

describe('XuDaZhenBei execute（镇北置封锁标记）', () => {
  it('响应后置 battle.xudaResponseBlock = true（拦截逻辑在 BattleFlowManager，属集成行为）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const ctx = makeCtx({ battle });

    await XuDaZhenBei.execute(ctx, visuals);

    expect(battle.xudaResponseBlock).toBe(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('XuDa 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(XuDaZhenBei.id).toBe('xuda_zhenbei');
    expect(XuDaZhenBei.name).toBe('镇北');
    expect(XuDaZhenBei.timing).toBe('on_play');
    expect(XuDaZhenBei.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
