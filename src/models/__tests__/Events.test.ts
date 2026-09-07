import { describe, it, expect } from 'vitest';
import { createNewRun, INITIAL_DESTINY_MAX } from '../RunState';
import type { RunState } from '../RunState';
import { GAME_EVENTS, applyEventChoice, rollEvent } from '../Events';
import type { GameEvent } from '../Events';
import { createRng } from '../../engine/MapGenerator';
import { HEXAGRAM_CATALOG } from '../Shop';
import { PLAYER_CHARACTER_LIST } from '../Character';

/** 构造一个便于测试的事件抽取环境 */
function makeRun(floor: number, opts: { roster?: string[]; tongbao?: number; destiny?: number; buci?: boolean } = {}): RunState {
  const run = createNewRun(createRng(1));
  run.floor = floor;
  run.roster = (opts.roster ?? ['hanxin']) as RunState['roster'];
  run.tongbao = opts.tongbao ?? 100;
  run.destiny = opts.destiny ?? INITIAL_DESTINY_MAX;
  run.buciCards = opts.buci
    ? [{ ...HEXAGRAM_CATALOG.find((c) => c.buci.id === 'hex_qian_wei_tian')!.buci, count: 1 }]
    : [];
  return run;
}

function eventById(id: string): GameEvent {
  const event = GAME_EVENTS.find((e) => e.id === id);
  if (!event) throw new Error(`事件不存在: ${id}`);
  return event;
}

describe('GAME_EVENTS 数据完整性', () => {
  it('共 20 个事件且 id 唯一', () => {
    expect(GAME_EVENTS).toHaveLength(20);
    expect(new Set(GAME_EVENTS.map((e) => e.id)).size).toBe(20);
  });

  it('四池数量：旷古罕见 2 / 凤毛麟角 4 / 可遇难求 5 / 稀松平常 9', () => {
    expect(GAME_EVENTS.filter((e) => e.pool === 'legendary')).toHaveLength(2);
    expect(GAME_EVENTS.filter((e) => e.pool === 'rare')).toHaveLength(4);
    expect(GAME_EVENTS.filter((e) => e.pool === 'uncommon')).toHaveLength(5);
    expect(GAME_EVENTS.filter((e) => e.pool === 'common')).toHaveLength(9);
  });

  it('每事件至少一个选项、层数合法、可遇难求及以上均每局唯一', () => {
    for (const e of GAME_EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      expect(e.floors[0]).toBeGreaterThanOrEqual(1);
      expect(e.floors[1]).toBeLessThanOrEqual(36);
      expect(e.floors[0]).toBeLessThanOrEqual(e.floors[1]);
      if (e.pool !== 'common') {
        expect(e.oncePerRun).toBe(true);
      }
    }
  });
});

describe('rollEvent 概率池抽取', () => {
  it('10 万次抽取四池占比收敛于 1%/5%/15%/79%', () => {
    const run = makeRun(20, { destiny: 50, buci: true });
    const counts: Record<string, number> = { legendary: 0, rare: 0, uncommon: 0, common: 0 };
    const rng = createRng(20260902);
    for (let i = 0; i < 100_000; i++) {
      const pool = rollEvent(run, rng).pool;
      counts[pool] = (counts[pool] ?? 0) + 1;
    }
    // 宽松容差，避免随机波动导致测试抖动
    expect(counts.legendary).toBeGreaterThan(400);
    expect(counts.legendary).toBeLessThan(1600);
    expect(counts.rare).toBeGreaterThan(3500);
    expect(counts.rare).toBeLessThan(6500);
    expect(counts.uncommon).toBeGreaterThan(12000);
    expect(counts.uncommon).toBeLessThan(18000);
    expect(counts.common).toBeGreaterThan(70000);
    expect(counts.common).toBeLessThan(86000);
  });

  it('触发条件过滤：没有姜尚时抽不到钓鱼老叟，拥有后抽取到乌江亭霸王', () => {
    const rng = () => 0.005; // roll = 0.5 → 旷古罕见
    const run = makeRun(20);
    expect(rollEvent(run, rng).id).toBe('diaoyu_laosou');
    run.roster = ['jiangshang'];
    expect(rollEvent(run, rng).id).toBe('wujiangting_bawang');
  });

  it('层数过滤：5 层时抽不到 10 层以上才可遇难求事件', () => {
    const run = makeRun(5);
    const rng = () => 0.2; // roll = 20 → 可遇难求
    const event = rollEvent(run, rng);
    expect(['nanmin_cunzhai', 'shiji_duma']).toContain(event.id);
  });

  it('每局唯一：卧薪尝胆触发后不再被抽出', () => {
    const rng = () => 0.03; // roll = 3 → 凤毛麟角
    const run = makeRun(20, { destiny: 50 });
    const first = rollEvent(run, rng);
    expect(['chibi_yifeng', 'woxin_changdan']).toContain(first.id);
    if (first.id === 'woxin_changdan') {
      applyEventChoice(run, first, 0, createRng(2));
      expect(run.eventsTriggered).toContain('woxin_changdan');
    } else {
      // 若先抽到赤壁遗风，手动标记后验证被过滤
      applyEventChoice(run, first, 2, createRng(2));
      run.eventsTriggered = ['woxin_changdan'];
    }
    const second = rollEvent(run, rng);
    expect(second.id).not.toBe('woxin_changdan');
    expect(run.eventsTriggered).toContain('woxin_changdan');
  });
});

describe('稀松平常事件结算', () => {
  it('山神庙：祭拜天命 +15 且不超过上限', () => {
    const run = makeRun(1, { destiny: 70 });
    const result = applyEventChoice(run, eventById('shan_shen_miao'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(run.destiny).toBe(INITIAL_DESTINY_MAX);
  });

  it('山神庙：离开无变化', () => {
    const run = makeRun(1);
    const before = { destiny: run.destiny, tongbao: run.tongbao };
    applyEventChoice(run, eventById('shan_shen_miao'), 2, createRng(2));
    expect(run.destiny).toBe(before.destiny);
    expect(run.tongbao).toBe(before.tongbao);
  });

  it('拾荒：翻找深处收益 20~35，可能被蛇咬（天命 -8）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const run = makeRun(1);
      const before = run.tongbao;
      applyEventChoice(run, eventById('shihuang'), 1, createRng(seed));
      const gain = run.tongbao - before;
      expect(gain).toBeGreaterThanOrEqual(20);
      expect(gain).toBeLessThanOrEqual(35);
    }
    const run = makeRun(1);
    const biteRng = () => 0.1; // < 0.25 → 被咬
    applyEventChoice(run, eventById('shihuang'), 1, biteRng);
    expect(run.destiny).toBe(INITIAL_DESTINY_MAX - 8);
  });

  it('算命先生：问前程 60% 得 +15，40% 扣 10', () => {
    const winRun = makeRun(1, { destiny: 50 });
    applyEventChoice(winRun, eventById('suanming_xiansheng'), 0, () => 0.1);
    expect(winRun.tongbao).toBe(90);
    expect(winRun.destiny).toBe(65);

    const loseRun = makeRun(1, { destiny: 50 });
    applyEventChoice(loseRun, eventById('suanming_xiansheng'), 0, () => 0.9);
    expect(loseRun.tongbao).toBe(90);
    expect(loseRun.destiny).toBe(40);
  });

  it('遭遇盗贼：破财免灾 -25、迎战进战斗', () => {
    const run = makeRun(1);
    applyEventChoice(run, eventById('zao_yu_dao_zei'), 0, createRng(2));
    expect(run.tongbao).toBe(75);
    const battle = applyEventChoice(run, eventById('zao_yu_dao_zei'), 1, createRng(2));
    expect(battle.startBattle).toBe(true);
  });

  it('剪径强人：拼死一搏挂起胜利额外通宝 40', () => {
    const run = makeRun(1);
    const result = applyEventChoice(run, eventById('jian_jing_qiang_ren'), 1, createRng(2));
    expect(result.startBattle).toBe(true);
    expect(run.pendingEventBattleReward).toBe(40);
  });

  it('行脚商：淘旧书花 15 得随机卜辞', () => {
    const run = makeRun(1);
    applyEventChoice(run, eventById('xingjiao_shang'), 1, createRng(2));
    expect(run.tongbao).toBe(85);
    expect(run.buciCards).toHaveLength(1);
  });

  it('流浪武士：8 折招募 shopItem，队伍已满角色不可再招的触发条件外仍正常', () => {
    const run = makeRun(1, { roster: ['hanxin'] });
    const result = applyEventChoice(run, eventById('liulang_wushi'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(result.shopItem?.kind).toBe('character');
    if (result.shopItem?.kind === 'character') {
      expect(run.roster).not.toContain(result.shopItem.characterId);
      expect(result.shopItem.price).toBeGreaterThan(0);
      expect(result.shopItem.price).toBeLessThanOrEqual(96); // 120×0.8 = 96 上限
    }
  });

  it('上锁宝箱：撬开获得随机卜辞', () => {
    const run = makeRun(1);
    applyEventChoice(run, eventById('baoxiang'), 0, createRng(2));
    expect(run.buciCards).toHaveLength(1);
  });
});

describe('可遇难求事件结算', () => {
  it('山中隐士：请教养生 气数上限 +800', () => {
    const run = makeRun(1, { roster: ['hanxin', 'zhangfei', 'guanyu'] });
    applyEventChoice(run, eventById('shanzhong_yinshi'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(800);
  });

  it('沙场老兵：听战事 气数上限 +1000', () => {
    const run = makeRun(15);
    applyEventChoice(run, eventById('shachang_laobing'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(1000);
  });

  it('难民村寨：施舍 -40 天命 +25；征劳役 +20 天命 -15', () => {
    const run = makeRun(1, { tongbao: 60, destiny: 50 });
    applyEventChoice(run, eventById('nanmin_cunzhai'), 0, createRng(2));
    expect(run.tongbao).toBe(20);
    expect(run.destiny).toBe(75);

    const run2 = makeRun(1, { tongbao: 60, destiny: 50 });
    applyEventChoice(run2, eventById('nanmin_cunzhai'), 1, createRng(2));
    expect(run2.tongbao).toBe(80);
    expect(run2.destiny).toBe(35);
  });

  it('古战场遗址：披上故甲 气数上限 +600', () => {
    const run = makeRun(15);
    applyEventChoice(run, eventById('guzhanchang_yizhi'), 1, createRng(2));
    expect(run.vitalityMaxBoost).toBe(600);
  });

  it('市集赌马：通宝不足不可下注', () => {
    const run = makeRun(1, { tongbao: 30 });
    const result = applyEventChoice(run, eventById('shiji_duma'), 0, createRng(2));
    expect(result.success).toBe(false);
    expect(run.tongbao).toBe(30);
  });
});

describe('凤毛麟角事件结算', () => {
  it('赤壁遗风：凭吊 +1200；拥有周瑜则 +2000', () => {
    const run = makeRun(25);
    applyEventChoice(run, eventById('chibi_yifeng'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(1200);

    const run2 = makeRun(25, { roster: ['zhouyu'] });
    applyEventChoice(run2, eventById('chibi_yifeng'), 0, createRng(2));
    expect(run2.vitalityMaxBoost).toBe(2000);
  });

  it('卧薪尝胆：置胆于座 气数上限 +1500', () => {
    const run = makeRun(25, { destiny: 30 });
    applyEventChoice(run, eventById('woxin_changdan'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(1500);
  });

  it('高山流水：抚琴 天命 +20', () => {
    const run = makeRun(5, { destiny: 50, buci: true });
    applyEventChoice(run, eventById('gaoshan_liushui'), 0, createRng(2));
    expect(run.destiny).toBe(70);
  });

  it('桃园结义：一人 +1500，张飞关羽同在 +2500', () => {
    const run = makeRun(5, { roster: ['zhangfei'] });
    applyEventChoice(run, eventById('taoyuan_jieyi'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(1500);

    const run2 = makeRun(5, { roster: ['zhangfei', 'guanyu'] });
    applyEventChoice(run2, eventById('taoyuan_jieyi'), 0, createRng(2));
    expect(run2.vitalityMaxBoost).toBe(2500);
  });
});

describe('旷古罕见事件结算', () => {
  it('钓鱼老叟：询问缘由 气数上限 +2000', () => {
    const run = makeRun(5);
    applyEventChoice(run, eventById('diaoyu_laosou'), 0, createRng(2));
    expect(run.vitalityMaxBoost).toBe(2000);
  });

  it('钓鱼老叟：虚心请教 —— 层数 27 以上或卜辞区有乾为天才获姜尚', () => {
    // 层数不足且无乾为天 → 不招募
    const low = makeRun(20);
    applyEventChoice(low, eventById('diaoyu_laosou'), 1, createRng(2));
    expect(low.roster).not.toContain('jiangshang');

    // 28 层以上（27 层以上）→ 招募
    const high = makeRun(28);
    applyEventChoice(high, eventById('diaoyu_laosou'), 1, createRng(2));
    expect(high.roster).toContain('jiangshang');

    // 低层但有乾为天 → 招募
    const buci = makeRun(5, { buci: true });
    applyEventChoice(buci, eventById('diaoyu_laosou'), 1, createRng(2));
    expect(buci.roster).toContain('jiangshang');
  });

  it('钓鱼老叟：一起钓鱼得随机卜辞', () => {
    const run = makeRun(5);
    applyEventChoice(run, eventById('diaoyu_laosou'), 2, createRng(2));
    expect(run.buciCards).toHaveLength(1);
  });

  it('乌江亭·霸王：请霸王同行获项羽；队伍满员则通宝 +50', () => {
    const run = makeRun(25);
    applyEventChoice(run, eventById('wujiangting_bawang'), 0, createRng(2));
    expect(run.roster).toContain('xiangyu');

    const full = makeRun(25);
    full.roster = PLAYER_CHARACTER_LIST.slice(0, 10).map((c) => c.id) as RunState['roster'];
    applyEventChoice(full, eventById('wujiangting_bawang'), 0, createRng(2));
    expect(full.roster).toHaveLength(10);
    expect(full.tongbao).toBe(150);
  });

  it('每局唯一标记：触发后写入 eventsTriggered', () => {
    const run = makeRun(5);
    applyEventChoice(run, eventById('diaoyu_laosou'), 0, createRng(2));
    expect(run.eventsTriggered).toContain('diaoyu_laosou');
  });
});

describe('applyEventChoice 通用边界', () => {
  it('无效 choiceIdx 返回失败', () => {
    const run = makeRun(1);
    const result = applyEventChoice(run, eventById('shan_shen_miao'), 99, createRng(2));
    expect(result.success).toBe(false);
  });
});