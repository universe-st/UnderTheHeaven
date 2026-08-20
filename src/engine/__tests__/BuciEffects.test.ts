import { describe, it, expect } from 'vitest';
import { createNewRun } from '../../models/RunState';
import type { BuCiCard, RunState } from '../../models/RunState';
import { createRng } from '../MapGenerator';
import {
  consumeBuci,
  findBuci,
  useSimpleActive,
  triggerBlockBattleLose,
  triggerSaveFromZero,
  triggerDestinyUpOnBattleWin,
  triggerEventAutopick,
  triggerSkipBattle,
  resolveRemoveCharacter,
  buciSellPrice,
} from '../BuciEffects';

function makeCard(partial: Partial<BuCiCard> & { id: string; effect: BuCiCard['effect'] }): BuCiCard {
  return {
    name: partial.id,
    upper: '乾',
    lower: '乾',
    price: 30,
    type: 'active',
    desc: '',
    count: 1,
    ...partial,
  };
}

function makeRun(cards: BuCiCard[]): RunState {
  const run = createNewRun(createRng(1));
  run.buciCards = cards;
  run.tongbao = 1000;
  return run;
}

describe('consumeBuci / findBuci', () => {
  it('堆叠多张时触发只扣第一张，count 归零才移出', () => {
    const run = makeRun([makeCard({ id: 'hex_qian_wei_tian', effect: { kind: 'destiny_up', maxInc: 10, curInc: 10 }, count: 2 })]);
    expect(consumeBuci(run, 'hex_qian_wei_tian')).toBe(true);
    expect(run.buciCards[0]!.count).toBe(1);
    expect(consumeBuci(run, 'hex_qian_wei_tian')).toBe(true);
    expect(run.buciCards).toHaveLength(0);
    expect(consumeBuci(run, 'hex_qian_wei_tian')).toBe(false);
  });
});

describe('useSimpleActive', () => {
  it('乾为天：天命上限 +10，天命 +10', () => {
    const run = makeRun([makeCard({ id: 'hex_qian_wei_tian', effect: { kind: 'destiny_up', maxInc: 10, curInc: 10 } })]);
    const d0 = run.destiny, m0 = run.destinyMax;
    const desc = useSimpleActive(run, 'hex_qian_wei_tian');
    expect(desc).toContain('天命上限 +10');
    expect(run.destinyMax).toBe(m0 + 10);
    expect(run.destiny).toBe(Math.min(m0 + 10, d0 + 10));
    expect(findBuci(run, 'hex_qian_wei_tian')).toBeNull(); // 已消耗
  });

  it('天地否：上限 -50，天命 +20（上限截断）', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_di_pi', effect: { kind: 'destiny_max_down_cur_up', maxDown: 50, curUp: 20 }, price: 30 })]);
    const d0 = run.destiny; // 100
    useSimpleActive(run, 'hex_tian_di_pi');
    expect(run.destinyMax).toBe(50);
    expect(run.destiny).toBe(Math.min(50, d0 + 20)); // min(50, 120) = 50
    expect(run.destiny).toBe(50);
  });

  it('被动卦不能通过 useSimpleActive 主动使用', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_shui_song', type: 'passive', effect: { kind: 'block_battle_lose_deduction' } })]);
    expect(useSimpleActive(run, 'hex_tian_shui_song')).toBeNull();
    expect(findBuci(run, 'hex_tian_shui_song')).not.toBeNull();
  });
});

describe('被动触发', () => {
  it('天水讼：抵挡一次战败天命扣减并消耗', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_shui_song', type: 'passive', effect: { kind: 'block_battle_lose_deduction' } })]);
    expect(triggerBlockBattleLose(run)).toBe(true);
    expect(findBuci(run, 'hex_tian_shui_song')).toBeNull();
    expect(triggerBlockBattleLose(run)).toBe(false);
  });

  it('天泽履：天命≤0 时回 1 避免失败', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_ze_lv', type: 'passive', effect: { kind: 'save_from_zero' }, price: 50 })]);
    run.destiny = 0;
    expect(triggerSaveFromZero(run)).toBe(true);
    expect(run.destiny).toBe(1);
    expect(findBuci(run, 'hex_tian_ze_lv')).toBeNull();
    // 天命 > 0 不触发
    run.destiny = 50;
    expect(triggerSaveFromZero(run)).toBe(false);
  });

  it('天火同人：仅战斗节点胜利触发', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_huo_tong_ren', type: 'passive', effect: { kind: 'destiny_up_on_battle_win', amount: 10 } })]);
    run.destiny = 90;
    const d0 = run.destiny;
    const desc = triggerDestinyUpOnBattleWin(run, 'normal');
    expect(desc).toContain('天命 +10');
    expect(run.destiny).toBe(d0 + 10);
    // 非战斗节点不触发
    expect(triggerDestinyUpOnBattleWin(run, 'shop')).toBeNull();
  });

  it('天雷无妄：事件出选项时回天命并消耗', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_lei_wu_wang', type: 'passive', effect: { kind: 'event_autopick', amount: 10 } })]);
    run.destiny = 90;
    const d0 = run.destiny;
    const desc = triggerEventAutopick(run);
    expect(desc).toContain('天命 +10');
    expect(run.destiny).toBe(d0 + 10);
    expect(findBuci(run, 'hex_tian_lei_wu_wang')).toBeNull();
  });

  it('天山遁：选战斗节点跳过 +10 天命并消耗', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_shan_dun', type: 'passive', effect: { kind: 'skip_battle', amount: 10 } })]);
    run.destiny = 90;
    const d0 = run.destiny;
    const desc = triggerSkipBattle(run);
    expect(desc).toContain('天命 +10');
    expect(run.destiny).toBe(d0 + 10);
    expect(findBuci(run, 'hex_tian_shan_dun')).toBeNull();
  });

  it('天风姤：移除角色牌 +10 天命；无该卦或角色不存在不可用', () => {
    const run = makeRun([makeCard({ id: 'hex_tian_feng_gou', type: 'active', effect: { kind: 'remove_character', amount: 10 }, price: 40 })]);
    run.roster = ['hanxin', 'zhangfei'];
    run.destiny = 90;
    const d0 = run.destiny;
    const desc = resolveRemoveCharacter(run, 'zhangfei');
    expect(desc).toContain('zhangfei');
    expect(run.roster).toEqual(['hanxin']);
    expect(run.destiny).toBe(d0 + 10);
    // 已消耗
    expect(resolveRemoveCharacter(run, 'hanxin')).toBeNull();
  });
});

describe('buciSellPrice', () => {
  it('出售价 = 购买价一半（向下取整）', () => {
    expect(buciSellPrice(makeCard({ id: 'x', effect: { kind: 'destiny_up', maxInc: 1, curInc: 1 }, price: 30 }))).toBe(15);
    expect(buciSellPrice(makeCard({ id: 'y', effect: { kind: 'destiny_up', maxInc: 1, curInc: 1 }, price: 50 }))).toBe(25);
  });
});
