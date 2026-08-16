import { describe, it, expect, vi } from 'vitest';
import { resetCardIdCounter, createDeck, type Card } from '../../models/Card';
import { TianWenYangShi } from '../TianWenYangShi';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

function makeBattle(playerHand: Card[] = []): BattleState {
  return {
    player: {
      hand: playerHand,
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '玩家',
      characterId: 'tianwen',
    },
    enemy: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '敌人',
    },
    enemyCharacterId: 'huangjinjun',
    turnHolder: 'player',
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
      graphics: vi.fn(() => container),
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

function makeCtx(battle: BattleState, sourceCharacterId = 'tianwen'): SkillContext {
  return {
    gameScene: makeScene(battle),
    battle,
    sourceCharacterId,
    playerCharacterIds: ['tianwen'],
    enemyCharacterId: 'huangjinjun',
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

describe('田文「养士」filter（纯判定）', () => {
  it('田文在阵容 + 玩家获得牌权 + 手牌非空时触发', () => {
    const battle = makeBattle(drawCards(3));
    expect(TianWenYangShi.filter(makeCtx(battle))).toBe(true);
  });

  it('敌方获得牌权（source 为敌方）不触发', () => {
    const battle = makeBattle(drawCards(3));
    expect(TianWenYangShi.filter(makeCtx(battle, 'huangjinjun'))).toBe(false);
  });

  it('田文不在阵容不触发', () => {
    const battle = makeBattle(drawCards(3));
    const ctx = makeCtx(battle);
    ctx.playerCharacterIds = ['hanxin'];
    expect(TianWenYangShi.filter(ctx)).toBe(false);
  });

  it('手牌为空不触发', () => {
    const battle = makeBattle([]);
    expect(TianWenYangShi.filter(makeCtx(battle))).toBe(false);
  });
});

describe('田文「养士」execute', () => {
  it('所有手牌分数 +1，且按身份键累计 scoreBoosts（普通牌 + 王）', async () => {
    resetCardIdCounter();
    const spade3 = createDeck()[0]!;   // 黑桃 3（score 3）
    const club3 = createDeck()[13]!;   // 梅花 3（score 3）
    const battle = makeBattle([spade3, club3]);
    await TianWenYangShi.execute(makeCtx(battle), makeVisuals());

    expect(spade3.score).toBe(4);
    expect(club3.score).toBe(4);
    // 同点数不同花色 → 不同身份键，各自 +1
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 1, club_3: 1 });
  });

  it('大小王分别按 joker_25 / joker_30 累计', async () => {
    resetCardIdCounter();
    const deck = createDeck();
    const hu = deck.find(c => c.rank === 25)!;
    const long = deck.find(c => c.rank === 30)!;
    const battle = makeBattle([hu, long]);
    await TianWenYangShi.execute(makeCtx(battle), makeVisuals());

    expect(hu.score).toBe(26);
    expect(long.score).toBe(31);
    expect(battle.player.scoreBoosts).toEqual({ joker_25: 1, joker_30: 1 });
  });

  it('重复触发分数与加成持续累加（同键多次 +1）', async () => {
    const hand = [drawCards(1)[0]!]; // spade_3
    const battle = makeBattle(hand);
    await TianWenYangShi.execute(makeCtx(battle), makeVisuals());
    await TianWenYangShi.execute(makeCtx(battle), makeVisuals());

    expect(hand[0]!.score).toBe(5); // 3 + 1 + 1
    expect(battle.player.scoreBoosts).toEqual({ spade_3: 2 });
  });

  it('空手牌不执行（execute 兜底，无副作用）', async () => {
    const battle = makeBattle([]);
    await expect(TianWenYangShi.execute(makeCtx(battle), makeVisuals())).resolves.toBeUndefined();
    expect(battle.player.scoreBoosts ?? {}).toEqual({});
  });

  it('timing 为 ON_GAIN_TURN，id 唯一', () => {
    expect(TianWenYangShi.timing).toBe('on_gain_turn');
    expect(TianWenYangShi.id).toBe('tianwen_yangshi');
    expect(TianWenYangShi.priority).toBe(100);
  });
});
