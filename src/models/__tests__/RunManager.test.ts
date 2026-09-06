import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNewRun, getRun, setRun, hasSave, save, load, clear, applyBattleResult, consumePendingInterest, consumeBuciNotes, consumeLastBattleReward, consumeLastDestinyLoss, settleNodeClear } from '../RunManager';
import type { RunState, BuCiCard } from '../RunState';
import { INITIAL_TONGBAO, INITIAL_DESTINY, TONGBAO_REWARD, calcDestinyLoss, interestOn } from '../RunState';

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  };
}

describe('RunManager', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
    clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('startNewRun returns a fresh run and sets it as current', () => {
    const run = startNewRun(42);
    expect(getRun()).toBe(run);
    expect(run.destiny).toBe(100);
    expect(run.layers).toHaveLength(36);
  });

  it('startNewRun is reproducible for the same seed', () => {
    const a = startNewRun(7);
    const b = startNewRun(7);
    expect(a).toEqual(b);
  });

  it('hasSave is false before saving, true after', () => {
    startNewRun(1);
    expect(hasSave()).toBe(false);
    save();
    expect(hasSave()).toBe(true);
  });

  it('save + load round-trips the run state', () => {
    const run = startNewRun(3);
    run.tongbao = 99;
    run.floor = 4;
    save();

    // 开启另一局覆盖内存态（不动存档）
    startNewRun(999);
    expect(getRun()).not.toEqual(run);
    expect(hasSave()).toBe(true);

    expect(load()).toBe(true);
    expect(getRun()).toEqual(run);
  });

  it('load fills permanentSuitBans default for legacy saves (李离伏剑跨局禁分兼容)', () => {
    const run = startNewRun(4);
    // 模拟旧存档：无 permanentSuitBans 字段（伏剑功能加入前保存的）
    const { permanentSuitBans, ...legacy } = run;
    void permanentSuitBans;
    localStorage.setItem('uth_run_save', JSON.stringify({ version: 1, run: legacy }));
    expect(load()).toBe(true);
    expect(getRun()!.permanentSuitBans).toEqual([]);
  });

  it('load 迁移：旧格式卜辞栏（8 天宫，无 rarity/usage）全量作废重置为空栏（§16.8）', () => {
    const run = startNewRun(4);
    // 模拟六十四卦重做前保存的旧格式卡（有 count/effect 但无 rarity）
    run.buciCards = [
      { id: 'hex_qian_wei_tian', name: '乾为天', upper: '乾', lower: '乾', price: 30, type: 'active', count: 1, desc: '旧', effect: { kind: 'destiny_up', maxInc: 10, curInc: 10 } },
      { id: 'hex_tian_ze_lv', name: '天泽履', upper: '乾', lower: '兑', price: 50, type: 'passive', count: 1, desc: '旧', effect: { kind: 'save_from_zero' } },
    ] as unknown as BuCiCard[]; // 旧格式（升级前存档）：故意无 rarity/usage
    localStorage.setItem('uth_run_save', JSON.stringify({ version: 1, run }));
    expect(load()).toBe(true);
    expect(getRun()!.buciCards).toEqual([]); // 旧栏作废
    expect(getRun()!.buciMods).toEqual({}); // 修饰默认
  });

  it('load 保留新格式卜辞栏（含 rarity/usage）并兜底 buciMods', () => {
    const run = startNewRun(4);
    run.buciCards = [
      { id: 'hex_qian_wei_tian', name: '乾为天', upper: '乾', lower: '乾', price: 50, type: 'active', rarity: 'legendary', usage: ['shop', 'battle'], count: 1, desc: '天命上限+15，天命+15', effect: { kind: 'destiny_up', maxInc: 15, curInc: 15 } },
    ];
    run.buciMods = { shopDiscount: 15 };
    localStorage.setItem('uth_run_save', JSON.stringify({ version: 1, run }));
    expect(load()).toBe(true);
    expect(getRun()!.buciCards).toHaveLength(1);
    expect(getRun()!.buciCards[0]!.rarity).toBe('legendary');
    expect(getRun()!.buciMods).toEqual({ shopDiscount: 15 });
  });

  it('load returns false when there is no save', () => {
    expect(load()).toBe(false);
  });

  it('load clears a corrupted save and returns false', () => {
    localStorage.setItem('uth_run_save', '{not json');
    expect(load()).toBe(false);
    expect(hasSave()).toBe(false);
  });

  it('load rejects a mismatched version and clears the save', () => {
    localStorage.setItem('uth_run_save', JSON.stringify({ version: 999, run: startNewRun(1) }));
    expect(load()).toBe(false);
    expect(hasSave()).toBe(false);
  });

  it('clear removes both current run and save', () => {
    startNewRun(1);
    save();
    clear();
    expect(getRun()).toBeNull();
    expect(hasSave()).toBe(false);
  });

  it('setRun replaces the current run', () => {
    const a = startNewRun(1);
    const b = startNewRun(2);
    setRun(a);
    expect(getRun()).toBe(a);
    expect(getRun()).not.toBe(b);
  });

  it('degrades to in-memory state when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    const run = startNewRun(5);
    expect(() => save()).not.toThrow();
    // 降级到内存存储：存档在进程内依然可读
    expect(hasSave()).toBe(true);
    startNewRun(123);
    expect(load()).toBe(true);
    expect(getRun()).toEqual(run);
  });
});

function makeRun(): RunState {
  return {
    destiny: INITIAL_DESTINY,
    destinyMax: INITIAL_DESTINY,
    tongbao: INITIAL_TONGBAO,
    floor: 1,
    roster: ['hanxin'],
    buciCards: [],
    cardPool: [],
    layers: [
      [
        { id: 'n1', floor: 1, index: 0, type: 'normal', cleared: false },
        { id: 'e1', floor: 1, index: 1, type: 'event', cleared: false },
      ],
      [
        { id: 'b3', floor: 3, index: 0, type: 'boss', cleared: false },
      ],
    ],
    bossKills: 0,
    battlesWon: 0,
    characterMarkers: {},
  };
}

/** 测试用卦象卡（天水讼 / 天泽履） */
const HEX_TIAN_SHUI_SONG: BuCiCard = {
  id: 'hex_tian_shui_song', name: '天水讼', upper: '乾', lower: '坎', price: 30,
  type: 'passive', rarity: 'fine', usage: [],
  desc: '抵挡一次战斗失败引起的天命扣减',
  effect: { kind: 'block_battle_lose_deduction' }, count: 1,
};
const HEX_TIAN_ZE_LV: BuCiCard = {
  id: 'hex_tian_ze_lv', name: '天泽履', upper: '乾', lower: '兑', price: 40,
  type: 'passive', rarity: 'rare', usage: [],
  desc: '天命被扣减到 0 以下时恢复到 1，避免游戏失败',
  effect: { kind: 'save_from_zero' }, count: 1,
};

describe('applyBattleResult', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
    clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when there is no current run or the node is unknown', () => {
    expect(applyBattleResult({ nodeId: 'n1', victory: true })).toBeNull();
    setRun(makeRun());
    expect(applyBattleResult({ nodeId: 'missing', victory: true })).toBeNull();
  });

  it('victory clears the node, advances the floor, applies the given reward, settles interest and saves', () => {
    const run = makeRun();
    setRun(run);

    const result = applyBattleResult({ nodeId: 'n1', victory: true, reward: 12 });

    expect(result).toBe(run);
    expect(run.layers[0]![0]!.cleared).toBe(true);
    expect(run.floor).toBe(2);
    // 100 通宝 + 12 奖励 → 利息 10
    expect(run.tongbao).toBe(INITIAL_TONGBAO + 12 + interestOn(INITIAL_TONGBAO + 12));
    expect(run.battlesWon).toBe(1);
    expect(hasSave()).toBe(true);
    expect(consumePendingInterest()).toBe(10);
  });

  it('victory without an explicit reward rolls within the node type range', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: true });

    const gained = run.tongbao - INITIAL_TONGBAO;
    const interest = interestOn(run.tongbao);
    const reward = gained - interest;
    expect(interest).toBe(10); // 100 + 奖励 仍处 100-199 档
    expect(reward).toBeGreaterThanOrEqual(TONGBAO_REWARD.normal.min);
    expect(reward).toBeLessThanOrEqual(TONGBAO_REWARD.normal.max);
  });

  it('event node victory rolls the normal reward range and does not count as a battle win', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'e1', victory: true });

    const gained = run.tongbao - INITIAL_TONGBAO;
    const interest = interestOn(run.tongbao);
    const reward = gained - interest;
    expect(run.layers[0]![1]!.cleared).toBe(true);
    expect(reward).toBeGreaterThanOrEqual(TONGBAO_REWARD.normal.min);
    expect(reward).toBeLessThanOrEqual(TONGBAO_REWARD.normal.max);
    expect(run.battlesWon).toBe(0);
  });

  it('defeat deducts destiny from enemy vitality percent, doubled on boss nodes', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 80 });
    expect(run.destiny).toBe(INITIAL_DESTINY - 20);
    expect(run.floor).toBe(1);

    applyBattleResult({ nodeId: 'b3', victory: false, enemyVitalityPercent: 1 });
    expect(run.destiny).toBe(INITIAL_DESTINY - 20 - 2);
  });

  it('defeat defaults to 100% enemy vitality and clamps destiny at 0', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false });
    expect(run.destiny).toBe(INITIAL_DESTINY - 25);

    run.destiny = 30;
    applyBattleResult({ nodeId: 'b3', victory: false, enemyVitalityPercent: 100 });
    expect(run.destiny).toBe(0);
    expect(hasSave()).toBe(true);
  });

  it('defeat clears any pending interest from a previous node clear', () => {
    const run = makeRun();
    setRun(run);

    // 先完成一个事件节点：利息入账并处于待展示状态（此处不消费）
    const eventNode = run.layers[0]![1]!;
    const s = settleNodeClear(eventNode);
    expect(s?.interest).toBe(10);
    expect(eventNode.cleared).toBe(true);

    // 事件完成后再经历一场战败：此前悬挂的利息应被清空，不残留展示
    applyBattleResult({ nodeId: 'n1', victory: false });
    expect(consumePendingInterest()).toBe(0);
  });

  it('defeat with 天水讼 blocks the destiny deduction and consumes it', () => {
    const run = makeRun();
    run.buciCards.push({ ...HEX_TIAN_SHUI_SONG });
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 80 });
    expect(run.destiny).toBe(INITIAL_DESTINY);
    expect(run.buciCards.some((c) => c.id === 'hex_tian_shui_song')).toBe(false);
    expect(run.floor).toBe(1);
  });

  it('defeat with 天泽履 saves the run from zero by restoring destiny to 1', () => {
    const run = makeRun();
    run.destiny = 10;
    run.buciCards.push({ ...HEX_TIAN_ZE_LV });
    setRun(run);

    // 10 - 25 = -15 → 归零 → 天泽履回 1
    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 100 });
    expect(run.destiny).toBe(1);
    expect(run.buciCards.some((c) => c.id === 'hex_tian_ze_lv')).toBe(false);
  });

  it('defeat with 天水讼 blocks deduction and 天泽履 is not consumed when no deduction happened', () => {
    const run = makeRun();
    run.destiny = 10;
    run.buciCards.push({ ...HEX_TIAN_SHUI_SONG }, { ...HEX_TIAN_ZE_LV });
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 80 });
    // 天水讼抵挡扣减：天命不变、两卦均未消耗
    expect(run.destiny).toBe(10);
    expect(run.buciCards.some((c) => c.id === 'hex_tian_shui_song')).toBe(false);
    expect(run.buciCards.some((c) => c.id === 'hex_tian_ze_lv')).toBe(true);
  });

  it('victory records the adjusted reward and buci notes (雷地豫 ×2)', () => {
    const run = makeRun();
    run.buciCards.push({
      id: 'hex_lei_di_yu', name: '雷地豫', upper: '震', lower: '坤', price: 40,
      type: 'passive', rarity: 'rare', usage: [],
      desc: '本场战斗节点胜利通宝奖励 ×2',
      effect: { kind: 'battle_reward_mult', mult: 2 }, count: 1,
    });
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: true, reward: 12 });

    // 实际奖励已含卦象修正（12 ×2），供战斗结束浮层展示
    expect(consumeLastBattleReward()).toBe(24);
    expect(consumeBuciNotes().some((n) => n.includes('雷地豫'))).toBe(true);
    expect(consumePendingInterest()).toBe(interestOn(INITIAL_TONGBAO + 24));
  });

  it('victory without buci cards records the raw reward and no notes', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: true, reward: 12 });

    expect(consumeLastBattleReward()).toBe(12);
    expect(consumeBuciNotes()).toEqual([]);
  });

  it('defeat records the mitigated destiny loss and notes (天水讼 blocks → 0)', () => {
    const run = makeRun();
    run.buciCards.push({ ...HEX_TIAN_SHUI_SONG });
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 80 });

    expect(consumeLastDestinyLoss()).toBe(0);
    expect(consumeBuciNotes().some((n) => n.includes('天水讼'))).toBe(true);
  });

  it('defeat without buci cards records the raw loss and no notes', () => {
    const run = makeRun();
    setRun(run);

    applyBattleResult({ nodeId: 'n1', victory: false, enemyVitalityPercent: 80 });

    expect(consumeLastDestinyLoss()).toBe(calcDestinyLoss(80, false));
    expect(consumeBuciNotes()).toEqual([]);
  });

  it('settleNodeClear applies victory and records interest for the animation hint', () => {
    const run = makeRun();
    setRun(run);
    const node = run.layers[0]![0]!;

    const result = settleNodeClear(node, 20);

    expect(result).toEqual({ reward: 20, interest: interestOn(INITIAL_TONGBAO + 20) });
    expect(node.cleared).toBe(true);
    expect(run.floor).toBe(2);
    expect(consumePendingInterest()).toBe(interestOn(INITIAL_TONGBAO + 20));
  });
});
