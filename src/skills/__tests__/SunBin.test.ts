import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { SunBinJianZao, SunBinJianZaoBonus } from '../SunBin';

// 卡面渲染（createPokerCardVisual）依赖 Phaser 运行时，node 单测环境不可用，mock 掉仅保留纯逻辑
vi.mock('../../utils/CardVisual', () => ({
  createPokerCardVisual: () => ({ add: vi.fn() }),
}));

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank };
}

function singlePattern(c: Card): HandPattern {
  return { type: HandType.Single, cards: [c], mainValue: c.rank, length: 1 };
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
    sourceCharacterId: 'sunbin',
    target: 'enemy',
    playerCharacterIds: ['sunbin'],
    enemyCharacterId: 'qiangdao',
    pattern: singlePattern(card(8)),
    damageInfo: { sumRanks: 8, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 8 },
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

/** mock 一个支撑 selectHandCards（公共事件）+ discardCardsFromHand / showNotice 的 scene；tween/delay 即时完成 */
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
    clear: vi.fn(() => gfx),
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
      addCounter: (config: { onComplete?: () => void; onUpdate?: (t: { getValue: () => number }) => void; to: number }) => {
        config.onUpdate?.({ getValue: () => config.to });
        config.onComplete?.();
      },
    },
    time: { delayedCall: (_ms: number, cb: () => void) => { cb(); } },
  } as unknown as Phaser.Scene;

  return { scene, selectHandCards };
}

describe('SunBinJianZao filter（减灶发动判定）', () => {
  it('孙膑在场且手牌不少于3张 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10)];
    const ctx = makeCtx({ battle });
    expect(SunBinJianZao.filter(ctx)).toBe(true);
  });

  it('手牌不足3张 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5)];
    const ctx = makeCtx({ battle });
    expect(SunBinJianZao.filter(ctx)).toBe(false);
  });

  it('孙膑不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10)];
    const ctx = makeCtx({ battle, playerCharacterIds: ['hanxin'] });
    expect(SunBinJianZao.filter(ctx)).toBe(false);
  });
});

describe('SunBinJianZao execute（减灶弃牌发动，经由公共事件选择手牌）', () => {
  it('选3张确定：调用公共事件参数正确、弃3张入弃牌堆、bonus=三张 score 之和、jianzaoActive=true', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3);
    const c5 = card(5);
    const c10 = card(10);
    battle.player.hand = [c3, c5, c10, card(20, 'heart')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue([c3, c5, c10]);
    const ctx = makeCtx({ battle, gameScene: scene });

    await SunBinJianZao.execute(ctx, visuals);

    // 公共事件调用参数：玩家侧、恰好 3 张、全牌可选、可取消、提示文案、AI 策略
    const opts = selectHandCards.mock.calls[0]![0];
    expect(opts.side).toBe('player');
    expect(opts.want([c3, c5, c10])).toBe(true);
    expect(opts.want([c3, c5])).toBe(false);
    expect(opts.filter()).toBe(true);
    expect(opts.forced).toBe(false);
    expect(opts.title).toContain('减灶');
    expect(typeof opts.aiPick).toBe('function');
    // AI 策略：分数最低的 3 张
    expect(opts.aiPick([c10, c5, c3, card(20)])!.map((c: Card) => c.rank)).toEqual([3, 5, 10]);

    // 弃 3 张：手牌剩 1 张，弃牌堆 3 张
    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(3);
    const handUids = battle.player.hand.map(c => c.uid);
    for (const c of [battle.player.discardPile[0]!, battle.player.discardPile[1]!, battle.player.discardPile[2]!]) {
      expect(handUids).not.toContain(c.uid);
    }
    // bonus = 3 + 5 + 10 = 18（用 score）
    expect(battle.jianzaoBonus).toBe(18);
    expect(battle.jianzaoActive).toBe(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('取消（返回 null）：不弃牌、jianzaoActive 保持 false', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10), card(20, 'heart')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene });

    await SunBinJianZao.execute(ctx, visuals);

    expect(battle.player.hand.length).toBe(4);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.jianzaoBonus).toBe(0);
    expect(battle.jianzaoActive).toBe(false);
  });

  it('返回不足 3 张：视为不发动', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const c3 = card(3);
    battle.player.hand = [c3, card(5), card(10), card(20, 'heart')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue([c3]);
    const ctx = makeCtx({ battle, gameScene: scene });

    await SunBinJianZao.execute(ctx, visuals);

    expect(battle.player.hand.length).toBe(4);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.jianzaoActive).toBe(false);
  });

  it('敌方拥有孙膑时（sourceCharacterId 非玩家阵容）：公共事件 side = enemy', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10), card(20, 'heart')];
    const { scene, selectHandCards } = makeMockScene(battle);
    selectHandCards.mockResolvedValue(null);
    const ctx = makeCtx({ battle, gameScene: scene, playerCharacterIds: ['hanxin'] });

    await SunBinJianZao.execute(ctx, visuals);

    expect(selectHandCards.mock.calls[0]![0].side).toBe('enemy');
  });
});

describe('SunBinJianZaoBonus filter（减灶加成判定）', () => {
  it('孙膑在场 + 减灶生效 + 玩家结算伤害给敌方 → 触发', () => {
    const battle = makeBattle();
    battle.jianzaoActive = true;
    battle.jianzaoBonus = 18;
    const ctx = makeCtx({ battle });
    expect(SunBinJianZaoBonus.filter(ctx)).toBe(true);
  });

  it('目标为玩家（敌方打出的牌结算）→ 不触发', () => {
    const battle = makeBattle();
    battle.jianzaoActive = true;
    const ctx = makeCtx({ battle, target: 'player' });
    expect(SunBinJianZaoBonus.filter(ctx)).toBe(false);
  });

  it('减灶未生效（如打光手牌复位后）→ 不触发', () => {
    const battle = makeBattle();
    battle.jianzaoActive = false;
    const ctx = makeCtx({ battle });
    expect(SunBinJianZaoBonus.filter(ctx)).toBe(false);
  });

  it('damageInfo 缺失 → 不触发', () => {
    const battle = makeBattle();
    battle.jianzaoActive = true;
    const ctx = makeCtx({ battle, damageInfo: undefined });
    expect(SunBinJianZaoBonus.filter(ctx)).toBe(false);
  });

  it('孙膑不在场 → 不触发', () => {
    const battle = makeBattle();
    battle.jianzaoActive = true;
    const ctx = makeCtx({ battle, playerCharacterIds: ['jiangshang'] });
    expect(SunBinJianZaoBonus.filter(ctx)).toBe(false);
  });
});

describe('SunBinJianZaoBonus execute（减灶伤害加成）', () => {
  it('sumRanks 增加 jianzaoBonus，计数器文本同步更新', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.jianzaoActive = true;
    battle.jianzaoBonus = 18;
    const setText = vi.fn();
    const counterText = { text: '40', setText } as unknown as Phaser.GameObjects.Text;
    const scene = makeMockScene(battle).scene;
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 40 },
      damageCounterText: counterText,
    });

    await SunBinJianZaoBonus.execute(ctx, visuals);

    expect(ctx.damageInfo!.sumRanks).toBe(58);
    // 计数器显示值更新为 40 + 18 = 58
    expect(setText).toHaveBeenCalledWith('58');
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('jianzaoBonus 为 0 时不加成', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.jianzaoActive = true;
    battle.jianzaoBonus = 0;
    const scene = makeMockScene(battle).scene;
    const ctx = makeCtx({
      battle,
      gameScene: scene,
      damageInfo: { sumRanks: 40, coefficient: 1, baseCoefficient: 1, damageMultiplier: 1, finalDamage: 40 },
    });

    await SunBinJianZaoBonus.execute(ctx, visuals);
    expect(ctx.damageInfo!.sumRanks).toBe(40);
  });
});

describe('SunBin 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(SunBinJianZao.id).toBe('sunbin_jianzao');
    expect(SunBinJianZao.name).toBe('减灶');
    expect(SunBinJianZao.timing).toBe('on_hand_refilled');
    expect(SunBinJianZao.dialogLines!.length).toBeGreaterThanOrEqual(2);

    expect(SunBinJianZaoBonus.id).toBe('sunbin_jianzao_bonus');
    expect(SunBinJianZaoBonus.timing).toBe('on_damage_accumulated');
  });
});
