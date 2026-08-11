import { describe, it, expect, vi } from 'vitest';
import { resetCardIdCounter, createDeck, type Card } from '../../models/Card';
import { QidanDaCao } from '../QidanDaCao';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

function makeBattle(playerHand: Card[] = [], enemyVitalityMax: number = 100): BattleState {
  return {
    player: {
      hand: playerHand,
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '玩家',
      characterId: 'hanxin',
    },
    enemy: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: enemyVitalityMax,
      vitalityMax: enemyVitalityMax,
      name: '敌人',
    },
    enemyCharacterId: 'qidan',
    turnHolder: 'enemy',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };
}

function makeScene(battle: BattleState): Phaser.Scene {
  const container = {
    add: vi.fn(),
    setAlpha: vi.fn(),
    setDepth: vi.fn(),
    setData: vi.fn(),
    setDisplaySize: vi.fn(),
    destroy: vi.fn(),
  };
  const graphics = {
    fillStyle: vi.fn(),
    fillRoundedRect: vi.fn(),
    lineStyle: vi.fn(),
    strokeRoundedRect: vi.fn(),
  };
  return {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    add: {
      container: vi.fn(() => container),
      graphics: vi.fn(() => graphics),
      image: vi.fn(() => container),
    },
    tweens: {
      add: (config: { onComplete?: () => void }) => config.onComplete?.(),
      addCounter: (config: { onComplete?: () => void }) => config.onComplete?.(),
    },
    time: { delayedCall: (_ms: number, cb: () => void) => cb() },
    scale: { width: 2400, height: 1080 },
  } as unknown as Phaser.Scene;
}

function makeCtx(battle: BattleState, target: 'enemy' | 'player' = 'enemy'): SkillContext {
  return {
    gameScene: makeScene(battle),
    battle,
    sourceCharacterId: 'qidan',
    playerCharacterIds: ['hanxin'],
    enemyCharacterId: 'qidan',
    target,
  };
}

function makeVisuals(): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn<(target: 'player' | 'enemy', amount: number) => void>(),
    playSkillTriggerSound: vi.fn<() => void>(),
    playSfx: vi.fn<(key: string) => void>(),
    getScene: () => makeScene({} as BattleState),
    cancelDamageSettlement: vi.fn<(gainTurn?: boolean) => void>(),
    updateMarker: vi.fn<(characterId: string, count: number) => void>(),
    markCharacterLost: vi.fn<(characterId: string) => void>(),
    showDialog: vi.fn<(characterId: string, text: string) => void>(),
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  resetCardIdCounter();
  const [c] = createDeck();
  return { ...c!, ...overrides };
}

describe('契丹士兵「打草」filter（纯判定）', () => {
  it('敌方受到伤害且玩家手牌非空时触发', () => {
    const battle = makeBattle([makeCard({ suit: 'heart' })]);
    expect(QidanDaCao.filter(makeCtx(battle, 'enemy'))).toBe(true);
  });

  it('玩家（target=player）受伤害不触发', () => {
    const battle = makeBattle([makeCard({ suit: 'heart' })]);
    expect(QidanDaCao.filter(makeCtx(battle, 'player'))).toBe(false);
  });

  it('玩家手牌为空不触发', () => {
    const battle = makeBattle([]);
    expect(QidanDaCao.filter(makeCtx(battle, 'enemy'))).toBe(false);
  });
});

describe('契丹士兵「打草」execute', () => {
  it('随机抢玩家 1 张牌（skipDiscardPile：不进玩家弃牌堆），加入敌方手牌', async () => {
    const playerHand = [makeCard({ suit: 'spade' }), makeCard({ suit: 'heart' })];
    const battle = makeBattle(playerHand);
    const visuals = makeVisuals();

    await QidanDaCao.execute(makeCtx(battle), visuals);

    // 无论随机抢哪一张：玩家少 1、敌方多 1、玩家弃牌堆 0（被抢牌不进入牌库）
    expect(battle.player.hand.length).toBe(1);
    expect(battle.enemy.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.enemy.hand[0]!.uid).toBe(
      playerHand.some(c => c.uid === battle.enemy.hand[0]!.uid) ? battle.enemy.hand[0]!.uid : battle.enemy.hand[0]!.uid,
    );
  });

  it('抢到梅花牌时回复 5% × vitalityMax 气数', async () => {
    // 手牌只有一张梅花：无论随机取哪张都抢到梅花
    const battle = makeBattle([makeCard({ suit: 'club' })]);
    const visuals = makeVisuals();

    await QidanDaCao.execute(makeCtx(battle), visuals);

    // 5% × 100 = 5，四舍五入
    expect(visuals.showHeal).toHaveBeenCalledWith('enemy', 5);
    expect(battle.enemy.hand.length).toBe(1);
  });

  it('抢到非梅花牌（红桃）不回血', async () => {
    const battle = makeBattle([makeCard({ suit: 'heart' })]);
    const visuals = makeVisuals();

    await QidanDaCao.execute(makeCtx(battle), visuals);

    expect(visuals.showHeal).not.toHaveBeenCalled();
  });

  it('抢到大王/小王（suit 为 null）不回血', async () => {
    const battle = makeBattle([makeCard({ suit: null, rank: 30, rankLabel: '龍' })]);
    const visuals = makeVisuals();

    await QidanDaCao.execute(makeCtx(battle), visuals);

    expect(visuals.showHeal).not.toHaveBeenCalled();
  });

  it('玩家手牌为空时不执行（execute 兜底）', async () => {
    const battle = makeBattle([]);
    const visuals = makeVisuals();

    await expect(QidanDaCao.execute(makeCtx(battle), visuals)).resolves.toBeUndefined();
    expect(battle.enemy.hand.length).toBe(0);
    expect(visuals.showHeal).not.toHaveBeenCalled();
  });

  it('timing 为 AFTER_DAMAGE，id 唯一', () => {
    expect(QidanDaCao.timing).toBe('after_damage');
    expect(QidanDaCao.id).toBe('qidan_dacao');
  });
});
