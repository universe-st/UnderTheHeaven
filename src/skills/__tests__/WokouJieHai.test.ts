import { describe, it, expect, vi } from 'vitest';
import { resetCardIdCounter, createDeck, type Card } from '../../models/Card';
import { WokouJieHai } from '../WokouJieHai';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

function makeBattle(playerHand: Card[] = [], enemyHand: Card[] = []): BattleState {
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
      hand: enemyHand,
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '敌人',
    },
    enemyCharacterId: 'wokou',
    turnHolder: 'enemy',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
    wokouStolenCards: [],
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

function makeCtx(battle: BattleState): SkillContext {
  return {
    gameScene: makeScene(battle),
    battle,
    sourceCharacterId: 'wokou',
    playerCharacterIds: ['hanxin'],
    enemyCharacterId: 'wokou',
    target: 'player',
  };
}

function makeVisuals(): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => makeScene({} as BattleState),
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

function drawCards(count: number): Card[] {
  resetCardIdCounter();
  return createDeck().slice(0, count);
}

describe('倭寇「劫海」filter（纯判定）', () => {
  it('玩家手牌 ≤3 且非空时触发', () => {
    const battle = makeBattle(drawCards(3));
    expect(WokouJieHai.filter(makeCtx(battle))).toBe(true);
    const battle1 = makeBattle(drawCards(1));
    expect(WokouJieHai.filter(makeCtx(battle1))).toBe(true);
  });

  it('玩家手牌 >3 不触发', () => {
    const battle = makeBattle(drawCards(4));
    expect(WokouJieHai.filter(makeCtx(battle))).toBe(false);
  });

  it('玩家手牌为空不触发', () => {
    const battle = makeBattle([]);
    expect(WokouJieHai.filter(makeCtx(battle))).toBe(false);
  });
});

describe('倭寇「劫海」execute', () => {
  it('拿走玩家全部手牌并加入敌方手牌', async () => {
    const playerHand = drawCards(3);
    const battle = makeBattle(playerHand);
    await WokouJieHai.execute(makeCtx(battle), makeVisuals());

    expect(battle.player.hand.length).toBe(0);
    expect(battle.enemy.hand.length).toBe(3);
  });

  it('被劫走的牌不进入玩家弃牌堆（skipDiscardPile）', async () => {
    const battle = makeBattle(drawCards(2));
    await WokouJieHai.execute(makeCtx(battle), makeVisuals());

    expect(battle.player.discardPile.length).toBe(0);
  });

  it('记录 wokouStolenCards 深拷贝（引用不同、内容一致）', async () => {
    const playerHand = drawCards(2);
    // execute 会 splice 原数组，先保留元素引用副本用于对比
    const originals = playerHand.slice();
    const battle = makeBattle(playerHand);
    await WokouJieHai.execute(makeCtx(battle), makeVisuals());

    expect(battle.wokouStolenCards?.length).toBe(2);
    const recorded = battle.wokouStolenCards!;
    for (const c of recorded) {
      // 深拷贝：与原始手牌对象不是同一引用
      expect(originals.some(pc => pc === c)).toBe(false);
      // 内容一致：uid / rank / suit 保留
      const src = originals.find(pc => pc.uid === c.uid);
      expect(src).toBeDefined();
      expect(c.rank).toBe(src!.rank);
      expect(c.suit).toBe(src!.suit);
    }
  });

  it('玩家手牌不足 1 张时不执行（execute 兜底）', async () => {
    const battle = makeBattle([]);
    await expect(WokouJieHai.execute(makeCtx(battle), makeVisuals())).resolves.toBeUndefined();
    expect(battle.wokouStolenCards?.length ?? 0).toBe(0);
  });

  it('timing 为 ON_TURN_START，id 唯一', () => {
    expect(WokouJieHai.timing).toBe('on_turn_start');
    expect(WokouJieHai.id).toBe('wokou_jiehai');
  });
});
