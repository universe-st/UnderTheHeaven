import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { SunBinJianZao, SunBinJianZaoBonus } from '../SunBin';

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

interface MockSceneHandle {
  scene: Phaser.Scene;
  /** 按创建顺序记录的 zone pointerdown 回调：前 hand.length 个是牌，随后是「确定」「取消」 */
  zoneHandlers: Array<(e?: unknown) => void>;
}

/** mock 一个支撑选牌 UI + discardCardsFromHand / showNotice 的 scene；所有 tween/delay 即时完成 */
function makeMockScene(battle: BattleState): MockSceneHandle {
  const zoneHandlers: Array<(e?: unknown) => void> = [];

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
    on: vi.fn((ev: string, cb: (e?: unknown) => void) => {
      if (ev === 'pointerdown') zoneHandlers.push(cb);
      return zone;
    }),
    destroy: vi.fn(),
  };

  const scene = {
    battle,
    cardObjects: [],
    enemyCardObjects: [],
    handScrollX: 0,
    renderPlayerHand: vi.fn(),
    renderEnemyHand: vi.fn(),
    createCardDisplay: vi.fn(() => container),
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

  return { scene, zoneHandlers };
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

describe('SunBinJianZao execute（减灶弃牌发动）', () => {
  it('选3张确定：弃3张入弃牌堆、bonus=三张 score 之和、jianzaoActive=true', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10), card(20, 'heart')];
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = SunBinJianZao.execute(ctx, visuals);
    // 让同步部分执行到阻塞等待点（zone 已全部创建：4 张牌 + 确定 + 取消）
    await Promise.resolve();
    await Promise.resolve();

    expect(zoneHandlers.length).toBe(6);

    // 选前 3 张牌（3、5、10），点「确定」（index 4）
    zoneHandlers[0]!();
    zoneHandlers[1]!();
    zoneHandlers[2]!();
    zoneHandlers[4]!();
    await p;

    // 弃 3 张：手牌剩 1 张，弃牌堆 3 张
    expect(battle.player.hand.length).toBe(1);
    expect(battle.player.discardPile.length).toBe(3);
    // 弃的是选中的 3 张（uid 不在手牌中）
    const handUids = battle.player.hand.map(c => c.uid);
    for (const c of [battle.player.discardPile[0]!, battle.player.discardPile[1]!, battle.player.discardPile[2]!]) {
      expect(handUids).not.toContain(c.uid);
    }
    // bonus = 3 + 5 + 10 = 18（用 score）
    expect(battle.jianzaoBonus).toBe(18);
    expect(battle.jianzaoActive).toBe(true);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('取消：不弃牌、jianzaoActive 保持 false', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10), card(20, 'heart')];
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = SunBinJianZao.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    // 点「取消」（index 5）
    zoneHandlers[5]!();
    await p;

    expect(battle.player.hand.length).toBe(4);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.jianzaoBonus).toBe(0);
    expect(battle.jianzaoActive).toBe(false);
  });

  it('选中不足3张点确定：视为不发动', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    battle.player.hand = [card(3), card(5), card(10), card(20, 'heart')];
    const { scene, zoneHandlers } = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene });

    const p = SunBinJianZao.execute(ctx, visuals);
    await Promise.resolve();
    await Promise.resolve();

    // 只选 1 张后点确定
    zoneHandlers[0]!();
    zoneHandlers[4]!();
    await p;

    expect(battle.player.hand.length).toBe(4);
    expect(battle.player.discardPile.length).toBe(0);
    expect(battle.jianzaoActive).toBe(false);
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
