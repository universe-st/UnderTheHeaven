import { describe, it, expect } from 'vitest';
import { PLAYER_CHARACTER_LIST, ENEMY_CHARACTER_LIST } from '../Character';

/** 名人堂分组展示的朝代（与 HallOfFameScene.DYNASTY_ORDER 保持一致） */
const KNOWN_DYNASTIES = new Set(['战国', '秦', '秦汉', '东汉', '三国', '西晋', '南北朝', '隋唐', '宋', '元', '明', '清', '敌军']);

describe('Character 名人堂字段（dynasty / bio）', () => {
  const all = [...PLAYER_CHARACTER_LIST, ...ENEMY_CHARACTER_LIST];

  it('全部角色共 37 个（29 玩家 + 8 敌人）', () => {
    expect(PLAYER_CHARACTER_LIST.length).toBe(29);
    expect(ENEMY_CHARACTER_LIST.length).toBe(8);
    expect(all.length).toBe(37);
  });

  it('每个角色都有 dynasty 与 bio', () => {
    for (const c of all) {
      expect(c.dynasty, `${c.name} 缺少 dynasty`).toBeTruthy();
      expect(c.bio, `${c.name} 缺少 bio`).toBeTruthy();
    }
  });

  it('每个朝代都属于名人堂已知分组', () => {
    for (const c of all) {
      expect(KNOWN_DYNASTIES.has(c.dynasty), `${c.name} 朝代「${c.dynasty}」不在分组中`).toBe(true);
    }
  });

  it('每个分组角色数不超过单行容量 8（名人堂一行 8 卡）', () => {
    const counts = new Map<string, number>();
    for (const c of all) {
      counts.set(c.dynasty, (counts.get(c.dynasty) ?? 0) + 1);
    }
    for (const [dynasty, count] of counts) {
      expect(count, `分组「${dynasty}」共 ${count} 个`).toBeLessThanOrEqual(8);
    }
  });
});
