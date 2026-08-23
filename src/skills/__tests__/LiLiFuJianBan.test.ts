import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { LiLiFuJianBan } from '../LiLiFuJianBan';

function makeBattle(bans: Card['suit'][]): BattleState {
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
    permanentSuitBans: bans,
  };
}

function makeCtx(
  battle: BattleState,
  opts: { target?: 'enemy' | 'player'; cardSuit?: string | null } = {},
): SkillContext {
  return {
    gameScene: {
      tweens: {
        addCounter: (c: { onUpdate?: (t: { getValue: () => number }) => void; onComplete?: () => void }) => {
          c.onUpdate?.({ getValue: () => 0 });
          c.onComplete?.();
        },
      },
    } as unknown as Phaser.Scene,
    battle,
    sourceCharacterId: 'lili',
    playerCharacterIds: ['lili'],
    enemyCharacterId: 'qiangdao',
    target: opts.target ?? 'player',
    singleCard: {
      card: {
        getData: vi.fn(() => (opts.cardSuit !== undefined ? opts.cardSuit : 'spade')),
        setAlpha: vi.fn(),
      } as unknown as Phaser.GameObjects.Container,
      scoreText: { setText: vi.fn() } as unknown as Phaser.GameObjects.Text,
      baseScore: 5,
      scoreBonus: 0,
    },
  } as unknown as SkillContext;
}

describe('李离「伏剑」永久禁分 filter（方向正确）', () => {
  it('敌方对玩家结算（target=player）且花色命中 → 触发', () => {
    const ctx = makeCtx(makeBattle(['spade']), { target: 'player', cardSuit: 'spade' });
    expect(LiLiFuJianBan.filter(ctx)).toBe(true);
  });

  it('玩家对敌方结算（target=enemy）即使花色命中 → 不触发（方向相反）', () => {
    const ctx = makeCtx(makeBattle(['spade']), { target: 'enemy', cardSuit: 'spade' });
    expect(LiLiFuJianBan.filter(ctx)).toBe(false);
  });

  it('花色未命中 → 不触发', () => {
    const ctx = makeCtx(makeBattle(['spade']), { target: 'player', cardSuit: 'heart' });
    expect(LiLiFuJianBan.filter(ctx)).toBe(false);
  });

  it('无永久禁分（空数组）→ 不触发', () => {
    const ctx = makeCtx(makeBattle([]), { target: 'player', cardSuit: 'spade' });
    expect(LiLiFuJianBan.filter(ctx)).toBe(false);
  });

  it('大小王（suit null）不属于禁分花色 → 不触发', () => {
    const ctx = makeCtx(makeBattle(['spade']), { target: 'player', cardSuit: null });
    expect(LiLiFuJianBan.filter(ctx)).toBe(false);
  });
});

describe('李离「伏剑」永久禁分 execute（伤害归零）', () => {
  it('execute：scoreBonus 覆盖为 -baseScore（伤害归零）', async () => {
    const ctx = makeCtx(makeBattle(['spade']), { target: 'player', cardSuit: 'spade' });
    const visuals: SkillVisualManager = {
      animateCardScale: vi.fn(),
      showHeal: vi.fn(),
      playSkillTriggerSound: vi.fn(),
      playSfx: vi.fn(),
      getScene: () => ({ tweens: { addCounter: (c: { onUpdate?: (t: { getValue: () => number }) => void; onComplete?: () => void }) => { c.onUpdate?.({ getValue: () => 0 }); c.onComplete?.(); } } }) as unknown as Phaser.Scene,
      cancelDamageSettlement: vi.fn(),
      updateMarker: vi.fn(),
      markCharacterLost: vi.fn(),
      showDialog: vi.fn(),
    };

    await LiLiFuJianBan.execute(ctx, visuals);

    expect(ctx.singleCard!.scoreBonus).toBe(-5);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });
});

describe('李离「伏剑」永久禁分配置', () => {
  it('id / timing 符合规范', () => {
    expect(LiLiFuJianBan.id).toBe('lili_fujian_ban');
    expect(LiLiFuJianBan.timing).toBe('on_single_card_settlement');
  });
});
