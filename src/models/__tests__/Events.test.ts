import { describe, it, expect } from 'vitest';
import { createNewRun } from '../RunState';
import { GAME_EVENTS, applyEventChoice, randomEvent } from '../Events';
import type { GameEvent } from '../Events';
import { createRng } from '../../engine/MapGenerator';
import { PLAYER_CHARACTER_LIST } from '../Character';

function eventById(id: string): GameEvent {
  const event = GAME_EVENTS.find((e) => e.id === id);
  if (!event) throw new Error(`事件不存在: ${id}`);
  return event;
}

describe('GAME_EVENTS', () => {
  it('contains 8 events', () => {
    expect(GAME_EVENTS).toHaveLength(8);
    expect(new Set(GAME_EVENTS.map((e) => e.id)).size).toBe(8);
  });

  it('randomEvent returns an event from the list', () => {
    const rng = createRng(3);
    for (let i = 0; i < 20; i++) {
      expect(GAME_EVENTS).toContain(randomEvent(rng));
    }
  });
});

describe('山神庙', () => {
  it('祭拜回复 15 天命且不超过上限', () => {
    const run = createNewRun(createRng(1));
    run.destiny = 50;
    const result = applyEventChoice(run, eventById('shan_shen_miao'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(run.destiny).toBe(65);
  });

  it('天命接近上限时截断到 destinyMax', () => {
    const run = createNewRun(createRng(1));
    run.destiny = 95;
    applyEventChoice(run, eventById('shan_shen_miao'), 0, createRng(2));
    expect(run.destiny).toBe(100);
  });

  it('离开无任何变化', () => {
    const run = createNewRun(createRng(1));
    const before = { destiny: run.destiny, tongbao: run.tongbao };
    const result = applyEventChoice(run, eventById('shan_shen_miao'), 1, createRng(2));
    expect(result.success).toBe(true);
    expect(run.destiny).toBe(before.destiny);
    expect(run.tongbao).toBe(before.tongbao);
  });
});

describe('拾荒', () => {
  it('通宝增加 10~20', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const run = createNewRun(createRng(1));
      const before = run.tongbao;
      applyEventChoice(run, eventById('shihuang'), 0, createRng(seed));
      const gain = run.tongbao - before;
      expect(gain).toBeGreaterThanOrEqual(10);
      expect(gain).toBeLessThanOrEqual(20);
      seen.add(gain);
    }
    expect(seen.has(10)).toBe(true);
    expect(seen.has(20)).toBe(true);
  });
});

describe('奇遇老者', () => {
  it('收下赠礼获得 25 通宝', () => {
    const run = createNewRun(createRng(1));
    applyEventChoice(run, eventById('qiyu_laozhe'), 0, createRng(2));
    expect(run.tongbao).toBe(125);
  });

  it('请教天机扣 5 天命换随机卜辞', () => {
    const run = createNewRun(createRng(1));
    run.destiny = 60;
    const result = applyEventChoice(run, eventById('qiyu_laozhe'), 1, createRng(2));
    expect(result.success).toBe(true);
    expect(run.destiny).toBe(55);
    expect(run.buciCards).toHaveLength(1);
  });

  it('天命不足时下限为 0 且仍获得卜辞', () => {
    const run = createNewRun(createRng(1));
    run.destiny = 3;
    applyEventChoice(run, eventById('qiyu_laozhe'), 1, createRng(2));
    expect(run.destiny).toBe(0);
    expect(run.buciCards).toHaveLength(1);
  });
});

describe('赌坊', () => {
  it('通宝不足 15 时返回失败且状态不变', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 10;
    const result = applyEventChoice(run, eventById('dufang'), 0, createRng(2));
    expect(result.success).toBe(false);
    expect(run.tongbao).toBe(10);
  });

  it('赢时净得 20（-15 +35）', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 20;
    const winRng = () => 0.1; // < 0.5 必赢
    const result = applyEventChoice(run, eventById('dufang'), 0, winRng);
    expect(result.success).toBe(true);
    expect(run.tongbao).toBe(40);
  });

  it('输时损失 15', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 20;
    const loseRng = () => 0.9;
    applyEventChoice(run, eventById('dufang'), 0, loseRng);
    expect(run.tongbao).toBe(5);
  });

  it('离开无变化', () => {
    const run = createNewRun(createRng(1));
    const before = run.tongbao;
    applyEventChoice(run, eventById('dufang'), 1, createRng(2));
    expect(run.tongbao).toBe(before);
  });
});

describe('伏兵', () => {
  it('返回 startBattle 且不改资源', () => {
    const run = createNewRun(createRng(1));
    const result = applyEventChoice(run, eventById('fubing'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(result.startBattle).toBe(true);
    expect(run.tongbao).toBe(100);
    expect(run.destiny).toBe(100);
  });
});

describe('流浪武士', () => {
  it('返回 8 折招募的 shopItem', () => {
    const run = createNewRun(createRng(1));
    const result = applyEventChoice(run, eventById('liulang_wushi'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(result.shopItem?.kind).toBe('character');
    if (result.shopItem?.kind === 'character') {
      expect(run.roster).not.toContain(result.shopItem.characterId);
      // 8 折：cost*15*0.8 向上取整
      expect(result.shopItem.price).toBeLessThan(200);
      expect(result.shopItem.price).toBeGreaterThan(0);
    }
  });

  it('全部角色已招募时返回失败', () => {
    const run = createNewRun(createRng(1));
    run.roster = PLAYER_CHARACTER_LIST.map((c) => c.id);
    const result = applyEventChoice(run, eventById('liulang_wushi'), 0, createRng(2));
    expect(result.success).toBe(false);
    expect(result.shopItem).toBeUndefined();
  });
});

describe('宝箱', () => {
  it('获得一张随机卜辞', () => {
    const run = createNewRun(createRng(1));
    const result = applyEventChoice(run, eventById('baoxiang'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(run.buciCards).toHaveLength(1);
  });
});

describe('行脚商', () => {
  it('30 通宝换 15 天命', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 50;
    run.destiny = 40;
    const result = applyEventChoice(run, eventById('xingjiao_shang'), 0, createRng(2));
    expect(result.success).toBe(true);
    expect(run.tongbao).toBe(20);
    expect(run.destiny).toBe(55);
  });

  it('通宝不足时拒绝且状态不变', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 29;
    run.destiny = 40;
    const result = applyEventChoice(run, eventById('xingjiao_shang'), 0, createRng(2));
    expect(result.success).toBe(false);
    expect(run.tongbao).toBe(29);
    expect(run.destiny).toBe(40);
  });

  it('天命不超过上限', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 50;
    run.destiny = 95;
    applyEventChoice(run, eventById('xingjiao_shang'), 0, createRng(2));
    expect(run.destiny).toBe(100);
  });
});

describe('applyEventChoice 通用边界', () => {
  it('无效 choiceIdx 返回失败', () => {
    const run = createNewRun(createRng(1));
    const result = applyEventChoice(run, eventById('fubing'), 99, createRng(2));
    expect(result.success).toBe(false);
  });
});
