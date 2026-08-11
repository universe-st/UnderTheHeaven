import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetCardIdCounter, SUITS, rankToLabel } from '../../models/Card';
import { createJuQiCard, applyJuQiOnPass, JUQI_CARD_RANK, JUQI_SEAL } from '../LvBuWeiJuQiLogic';
import { LvBuWeiJuQi } from '../LvBuWeiJuQi';
import type { BattleState, PlayerState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';

const LV = 'lvbuwei';

function makeBattle(partial: Partial<PlayerState> = {}): BattleState {
  return {
    player: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '玩家',
      characterId: LV,
      ...partial,
    },
    enemy: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 100,
      vitalityMax: 100,
      name: '敌人',
    },
    enemyCharacterId: 'qiangdao',
    turnHolder: 'player',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    roundEnemyCards: [],
    jianzaoBonus: 0,
    jianzaoActive: false,
  };
}

function makeCtx(partial: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: makeBattle(),
    sourceCharacterId: LV,
    playerCharacterIds: [LV],
    ...partial,
  };
}

function makeVisuals(): SkillVisualManager {
  const textObj = {
    y: 0,
    setOrigin: vi.fn(() => textObj),
    setDepth: vi.fn(() => textObj),
    setAlpha: vi.fn(() => textObj),
    destroy: vi.fn(),
  };
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => ({
      scale: { width: 2400, height: 1080 },
      add: { text: vi.fn(() => textObj) },
      tweens: { add: (config: { onComplete?: () => void }) => config.onComplete?.() },
      time: { delayedCall: (_ms: number, cb: () => void) => cb() },
    }) as unknown as Phaser.Scene,
    cancelDamageSettlement: vi.fn(),
    updateMarker: vi.fn(),
    markCharacterLost: vi.fn(),
    showDialog: vi.fn(),
  };
}

describe('吕不韦「居奇」createJuQiCard（生成点数为3的随机花色青龙印普通牌）', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('固定点数为 3，rankLabel 为 "3"', () => {
    for (let i = 0; i < 50; i++) {
      const c = createJuQiCard(Math.random);
      expect(c.rank).toBe(JUQI_CARD_RANK);
      expect(c.rankLabel).toBe('3');
      expect(c.rankLabel).toBe(rankToLabel(JUQI_CARD_RANK));
    }
  });

  it('随机花色可覆盖全部四种花色', () => {
    const suits = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = createJuQiCard(Math.random);
      expect(c.suit).not.toBeNull();
      suits.add(c.suit!);
    }
    expect(suits.size).toBe(SUITS.length);
  });

  it('必带青龙印（qinglong）', () => {
    for (let i = 0; i < 50; i++) {
      expect(createJuQiCard(Math.random).seal).toBe(JUQI_SEAL);
    }
  });

  it('不是临时牌（无 isTemp），进入牌库后正常摸取与结算', () => {
    const c = createJuQiCard(() => 0.5);
    expect(c.isTemp).toBeUndefined();
  });

  it('uid 全局递增，互不重复', () => {
    const a = createJuQiCard(() => 0.5);
    const b = createJuQiCard(() => 0.5);
    expect(a.uid).not.toBe(b.uid);
  });

  it('rng 决定花色（rng()=0 → spade）', () => {
    expect(createJuQiCard(() => 0).suit).toBe('spade');
  });
});

describe('吕不韦「居奇」applyJuQiOnPass（每次选择不出后生成牌进手牌）', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('生成的 3 点青龙印牌直接进入玩家手牌', () => {
    const battle = makeBattle();
    const newCard = applyJuQiOnPass(battle, () => 0.5);
    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.hand[0]!.uid).toBe(newCard.uid);
    expect(newCard.rank).toBe(3);
    expect(newCard.rankLabel).toBe('3');
    expect(newCard.seal).toBe('qinglong');
    expect(newCard.isTemp).toBeUndefined();
  });

  it('每次调用各生成一张新牌（多次不出累加进手牌）', () => {
    const battle = makeBattle();
    applyJuQiOnPass(battle, () => 0);
    applyJuQiOnPass(battle, () => 0.5);
    expect(battle.player.hand.length).toBe(2);
    expect(battle.player.hand[0]!.uid).not.toBe(battle.player.hand[1]!.uid);
  });
});

describe('吕不韦「居奇」ON_PASS 技能（filter）', () => {
  it('阵容含吕不韦时触发', () => {
    expect(LvBuWeiJuQi.filter(makeCtx())).toBe(true);
  });

  it('阵容不含吕不韦不触发', () => {
    expect(LvBuWeiJuQi.filter(makeCtx({ playerCharacterIds: ['hanxin'] }))).toBe(false);
  });
});

describe('吕不韦「居奇」ON_PASS 技能（execute）', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('执行后生成 3 点青龙印牌直接进入玩家手牌', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    await LvBuWeiJuQi.execute(makeCtx({ battle }), visuals);
    expect(battle.player.hand.length).toBe(1);
    const card = battle.player.hand[0]!;
    expect(card.rank).toBe(3);
    expect(card.seal).toBe('qinglong');
  });

  it('timing 为 ON_PASS', () => {
    expect(LvBuWeiJuQi.timing).toBe('on_pass');
  });
});
