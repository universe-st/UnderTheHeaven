import { describe, it, expect, vi } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel } from '../../models/Card';
import { HandType, type HandPattern, type BattleState } from '../../models/BattleTypes';
import type { SkillContext, SkillVisualManager } from '../SkillTypes';
import { YuChiGongDuoShuo } from '../YuChiGongDuoShuo';
import { JiangShangChuiDiao } from '../JiangShang';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade', isTemp = false): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank), score: rank, isTemp };
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
    sourceCharacterId: 'yuchigong',
    target: 'enemy',
    playerCharacterIds: ['yuchigong'],
    enemyCharacterId: 'qiangdao',
    pattern: singlePattern(card(8)),
    isRespond: true,
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

/** mock 一个支撑 addCardsToHand / showNotice 的 scene；所有 tween/delay 即时完成 */
function makeMockScene(battle: BattleState): Phaser.Scene {
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
      zone: vi.fn(() => ({ setInteractive: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() })) })),
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

  return scene;
}

describe('YuChiGongDuoShuo filter（夺槊触发判定）', () => {
  it('尉迟恭在场 + 响应出牌 + 手牌≤10 + 敌方圈内有非临时牌 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = [card(3), card(4), card(5), card(6), card(7), card(8), card(9), card(10), card(11), card(12)];
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: true });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(true);
  });

  it('手牌数大于10 → 不触发', () => {
    const battle = makeBattle();
    // 11 张手牌（响应后）
    battle.player.hand = Array.from({ length: 11 }, (_, i) => card(i + 3));
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: true });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('恰好10张手牌 → 触发', () => {
    const battle = makeBattle();
    battle.player.hand = Array.from({ length: 10 }, (_, i) => card(i + 3));
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: true });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(true);
  });

  it('先手主动出牌（isRespond=false）→ 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: false });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('isRespond 缺失 → 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: undefined });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('非尉迟恭阵容 → 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: true, playerCharacterIds: ['hanxin'] });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('敌方圈内全是临时牌 → 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [card(20, 'heart', true)];
    const ctx = makeCtx({ battle, isRespond: true });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('敌方圈内无牌 → 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [];
    const ctx = makeCtx({ battle, isRespond: true });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });

  it('受伤方为玩家（target=player）→ 不触发', () => {
    const battle = makeBattle();
    battle.roundEnemyCards = [card(20)];
    const ctx = makeCtx({ battle, isRespond: true, target: 'player' });
    expect(YuChiGongDuoShuo.filter(ctx)).toBe(false);
  });
});

describe('YuChiGongDuoShuo execute（夺槊获得对方的牌）', () => {
  it('夺走圈内非临时牌：置 isTemp、移出敌方弃牌堆与 roundEnemyCards、加入玩家手牌；临时牌不夺', async () => {
    const visuals = makeVisuals();
    const nonTempA = card(5);
    const nonTempB = card(25, null);
    const enemyTemp = card(9, 'heart', true);
    const battle = makeBattle();
    // 敌方出牌已 push 进弃牌堆（含临时牌）；roundEnemyCards 记录整圈
    battle.enemy.discardPile = [nonTempA, nonTempB, enemyTemp].map(c => ({ ...c }));
    battle.roundEnemyCards = [nonTempA, nonTempB, enemyTemp];
    battle.player.hand = [card(3), card(4)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene, isRespond: true });

    await YuChiGongDuoShuo.execute(ctx, visuals);

    // 非临时牌变为临时牌
    expect(nonTempA.isTemp).toBe(true);
    expect(nonTempB.isTemp).toBe(true);
    // 敌方打出的临时牌保持临时，不被夺走
    expect(enemyTemp.isTemp).toBe(true);

    // 从敌方弃牌堆按 uid 移除非临时牌；临时牌仍留在弃牌堆
    const discardUids = battle.enemy.discardPile.map(c => c.uid);
    expect(discardUids).not.toContain(nonTempA.uid);
    expect(discardUids).not.toContain(nonTempB.uid);
    expect(discardUids).toContain(enemyTemp.uid);

    // 从 roundEnemyCards 移除非临时牌（防止本圈再次响应时重复夺取）；临时牌保留
    const roundUids = battle.roundEnemyCards.map(c => c.uid);
    expect(roundUids).not.toContain(nonTempA.uid);
    expect(roundUids).not.toContain(nonTempB.uid);
    expect(roundUids).toContain(enemyTemp.uid);

    // 加入玩家手牌（仅非临时牌）
    const handUids = battle.player.hand.map(c => c.uid);
    expect(handUids).toContain(nonTempA.uid);
    expect(handUids).toContain(nonTempB.uid);
    expect(handUids).not.toContain(enemyTemp.uid);
    expect(visuals.playSkillTriggerSound).toHaveBeenCalled();
  });

  it('圈内无牌时不执行（不报错）', async () => {
    const visuals = makeVisuals();
    const battle = makeBattle();
    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene, isRespond: true });

    await YuChiGongDuoShuo.execute(ctx, visuals);
    expect(battle.player.hand.length).toBe(0);
  });
});

describe('与姜尚「垂钓」共享 roundEnemyCards 互不冲突', () => {
  it('夺槊夺走的牌已置 isTemp 且移出 roundEnemyCards，姜尚不会再夺同一批牌', async () => {
    const visuals = makeVisuals();
    const enemyCards = [card(5), card(12)];
    const battle = makeBattle();
    battle.enemy.discardPile = enemyCards.map(c => ({ ...c }));
    battle.roundEnemyCards = [...enemyCards];
    battle.player.hand = [card(3)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene, isRespond: true });
    await YuChiGongDuoShuo.execute(ctx, visuals);

    // 尉迟恭夺走了全部非临时牌 → roundEnemyCards 已被清空（只剩临时牌，此处无）
    expect(battle.roundEnemyCards.length).toBe(0);

    // 姜尚「垂钓」在圈末（ON_ENEMY_PASS）读同一份 roundEnemyCards：
    // 要么无牌、要么全是临时牌 → filter 返回 false，不会双夺
    const chuiDiaoCtx = makeCtx({
      battle,
      gameScene: scene,
      playerCharacterIds: ['jiangshang', 'yuchigong'],
      pattern: singlePattern(card(8)),
      roundEnemyCards: battle.roundEnemyCards,
    });
    expect(JiangShangChuiDiao.filter(chuiDiaoCtx)).toBe(false);

    // 且被夺走的牌仅存在于玩家手牌一份（无重复 uid、无别名残留）
    const handUids = battle.player.hand.map(c => c.uid);
    expect(new Set(handUids).size).toBe(handUids.length);
    for (const c of enemyCards) {
      expect(handUids).toContain(c.uid);
      expect(battle.enemy.discardPile.map(d => d.uid)).not.toContain(c.uid);
    }
  });

  it('同圈内再次响应时不会重复夺取已被夺走的牌（残留牌只夺一次）', async () => {
    const visuals = makeVisuals();
    const firstBeat = card(5);   // 第一次响应接住的牌
    const secondBeat = card(11); // 第二次响应接住的牌（敌方后续打出）
    const battle = makeBattle();
    battle.enemy.discardPile = [firstBeat, secondBeat].map(c => ({ ...c }));
    battle.roundEnemyCards = [firstBeat];
    battle.player.hand = [card(3)];

    const scene = makeMockScene(battle);
    const ctx = makeCtx({ battle, gameScene: scene, isRespond: true });
    await YuChiGongDuoShuo.execute(ctx, visuals);

    // 第一次夺槊后：roundEnemyCards 只剩后续敌方打出的牌，不再含 firstBeat
    expect(battle.roundEnemyCards.map(c => c.uid)).not.toContain(firstBeat.uid);

    // 敌方后续又打出一手（append 进 roundEnemyCards），玩家再次响应 → 再次夺槊
    battle.roundEnemyCards.push(secondBeat);
    battle.enemy.discardPile.push({ ...secondBeat });
    await YuChiGongDuoShuo.execute(ctx, visuals);

    // 玩家手牌里 firstBeat 只出现一次（未重复夺取）
    const handUids = battle.player.hand.map(c => c.uid);
    expect(handUids.filter(uid => uid === firstBeat.uid).length).toBe(1);
    expect(handUids).toContain(secondBeat.uid);
    // roundEnemyCards 最终被清空
    expect(battle.roundEnemyCards.length).toBe(0);
  });
});

describe('YuChiGongDuoShuo 配置', () => {
  it('id / name / timing 符合规范', () => {
    expect(YuChiGongDuoShuo.id).toBe('yuchigong_duoshuo');
    expect(YuChiGongDuoShuo.name).toBe('夺槊');
    expect(YuChiGongDuoShuo.timing).toBe('on_play');
    expect(YuChiGongDuoShuo.dialogLines!.length).toBeGreaterThanOrEqual(2);
  });
});
