import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { DongfangShuoFengJian } from '../DongfangShuo';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
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
    sourceCharacterId: 'player',
    target: 'enemy',
    playerCharacterIds: ['dongfangshuo'],
    enemyCharacterId: 'qiangdao',
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

/** mock 一个支撑 drawCardsToHand / discardCardsFromHand / selectHandCards 的 scene；tween/delay 即时完成 */
function makeMockScene(battle: BattleState): { scene: Phaser.Scene; selectHandCards: ReturnType<typeof vi.fn> } {
  const container = {
    x: 0, y: 0,
    setDepth: vi.fn(() => container),
    setData: vi.fn(() => container),
    getData: vi.fn(() => undefined),
    setAlpha: vi.fn(() => container),
    setScale: vi.fn(() => container),
    setVisible: vi.fn(() => container),
    setOrigin: vi.fn(() => container),
    setText: vi.fn(() => container),
    add: vi.fn(() => container),
    destroy: vi.fn(),
  };
  const text = {
    setOrigin: vi.fn(() => text),
    setDepth: vi.fn(() => text),
    setAlpha: vi.fn(() => text),
    setText: vi.fn(() => text),
    destroy: vi.fn(),
    x: 1200, y: 700,
  };
  const gfx = {
    fillStyle: vi.fn(() => gfx),
    lineStyle: vi.fn(() => gfx),
    fillRoundedRect: vi.fn(() => gfx),
    strokeRoundedRect: vi.fn(() => gfx),
    setVisible: vi.fn(() => gfx),
  };
  const zone = {
    setInteractive: vi.fn(() => zone),
    on: vi.fn(() => zone),
    destroy: vi.fn(),
  };

  const selectHandCards = vi.fn();
  const scene = {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    updateHandOverflowHints: vi.fn(),
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
    selectHandCards,
    add: {
      container: vi.fn(() => container),
      graphics: vi.fn(() => gfx),
      text: vi.fn(() => text),
      zone: vi.fn(() => zone),
    },
    scale: { width: 2400, height: 1080 },
    tweens: {
      add: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
      addCounter: (config: { onComplete?: () => void }) => { config.onComplete?.(); },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;

  return { scene, selectHandCards };
}

describe('DongfangShuoFengJian filter（讽谏触发判定）', () => {
  it('东方朔在场 + 玩家获得牌权 + 牌堆有牌 → 触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3), card(5)];
    const ctx = makeCtx({ battle });
    expect(DongfangShuoFengJian.filter(ctx)).toBe(true);
  });

  it('敌方获得牌权（source=敌方）→ 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3)];
    const ctx = makeCtx({ battle, sourceCharacterId: 'qiangdao' });
    expect(DongfangShuoFengJian.filter(ctx)).toBe(false);
  });

  it('东方朔不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [card(3)];
    const ctx = makeCtx({ battle, playerCharacterIds: ['hanxin'] });
    expect(DongfangShuoFengJian.filter(ctx)).toBe(false);
  });

  it('牌堆与弃牌堆均为空 → 不触发', () => {
    const battle = makeBattle();
    battle.player.deck = [];
    battle.player.discardPile = [];
    const ctx = makeCtx({ battle });
    expect(DongfangShuoFengJian.filter(ctx)).toBe(false);
  });
});

describe('DongfangShuoFengJian execute（讽谏摸牌弃牌）', () => {
  it('摸 1 张并弃 1 张不同的牌：手牌数不变、牌堆减 1、弃牌堆加 1', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const deckCards = [card(3), card(5), card(10)]; // 顶 = card(10)
    battle.player.deck = [...deckCards];
    const handCards = [card(7, 'heart'), card(8, 'club'), card(9, 'diamond')];
    battle.player.hand = [...handCards];
    const { scene, selectHandCards } = makeMockScene(battle);
    // 玩家选择弃置手牌中的第一张（heart 7，与刚摸的 card(10) 不同）
    selectHandCards.mockResolvedValue([handCards[0]!]);
    const ctx = makeCtx({ battle, gameScene: scene });

    await DongfangShuoFengJian.execute(ctx, visuals);

    // 摸 1 张（deck 顶 card(10) 入手）→ 4 张，弃 1 张 → 3 张
    expect(battle.player.hand.length).toBe(3);
    expect(battle.player.deck.length).toBe(2);
    expect(battle.player.discardPile.length).toBe(1);
    expect(battle.player.discardPile[0]!.uid).toBe(handCards[0]!.uid);
    // 刚摸的牌仍在手牌中（不被弃置）
    const handUids = battle.player.hand.map(c => c.uid);
    expect(handUids).toContain(deckCards[2]!.uid);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('选牌事件 filter 排除刚摸的那张牌', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const deckTop = card(10);
    battle.player.deck = [card(3), deckTop];
    battle.player.hand = [card(7, 'heart'), card(8, 'club')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue([card(7, 'heart')]);
    const ctx = makeCtx({ battle, gameScene: scene });

    await DongfangShuoFengJian.execute(ctx, visuals);

    const opts = selectHandCards.mock.calls[0]![0];
    expect(opts.side).toBe('player');
    expect(opts.want([card(7, 'heart')])).toBe(true);
    expect(opts.want([card(7, 'heart'), card(8, 'club')])).toBe(false);
    // 刚摸的牌不可选
    expect(opts.filter({ ...card(10), uid: deckTop.uid })).toBe(false);
    expect(opts.filter(card(7, 'heart'))).toBe(true);
    expect(opts.title).toContain('讽谏');
  });

  it('取消弃置（返回 null）：仅摸牌、不弃牌', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.deck = [card(3), card(5), card(10)];
    battle.player.hand = [card(7, 'heart'), card(8, 'club'), card(9, 'diamond')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene });

    await DongfangShuoFengJian.execute(ctx, visuals);

    expect(battle.player.hand.length).toBe(4); // 只摸 1 张
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.player.deck.length).toBe(2);
  });

  it('手牌除刚摸那张外无其他牌 → 仅摸牌、自动跳过弃置（不卡死）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const deckTop = card(10);
    battle.player.deck = [card(3), card(5), deckTop];
    battle.player.hand = []; // 摸牌前空手
    const { scene, selectHandCards } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    await DongfangShuoFengJian.execute(ctx, visuals);

    // 摸 1 张入手，跳过弃置交互
    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.hand[0]!.uid).toBe(deckTop.uid); // deck 顶被摸走
    expect(selectHandCards).not.toHaveBeenCalled();
  });
});

describe('DongfangShuoFengJian 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(DongfangShuoFengJian.id).toBe('dongfangshuo_fengjian');
    expect(DongfangShuoFengJian.name).toBe('讽谏');
    expect(DongfangShuoFengJian.timing).toBe('on_gain_turn');
    expect(DongfangShuoFengJian.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
