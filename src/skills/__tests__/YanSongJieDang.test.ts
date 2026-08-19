import { describe, it, expect } from 'vitest';
import { isCharacterSkillSuppressed, shouldYanSongMoveToFront } from '../../engine/CharacterAbilities';

/**
 * 严嵩「结党」压制判定测试。
 * 阵容顺序 = 站位顺序：playerCharacterIds 中 index-1 与 index+1 为紧邻左右（豁免）。
 */
describe('isCharacterSkillSuppressed（严嵩结党压制判定）', () => {
  it('严嵩不在场 → 不压制', () => {
    expect(isCharacterSkillSuppressed(['hanxin', 'liubowen', 'zhugeliang'], 'hanxin')).toBe(false);
    expect(isCharacterSkillSuppressed([], 'hanxin')).toBe(false);
  });

  it('owner 为严嵩自己 → 不压制（结党本身生效）', () => {
    expect(isCharacterSkillSuppressed(['hanxin', 'yansong', 'liubowen'], 'yansong')).toBe(false);
  });

  it('严嵩紧邻左右两张 → 豁免不压制', () => {
    // 严嵩在中间：[0]hanxin [1]yansong [2]liubowen
    expect(isCharacterSkillSuppressed(['hanxin', 'yansong', 'liubowen'], 'hanxin')).toBe(false);
    expect(isCharacterSkillSuppressed(['hanxin', 'yansong', 'liubowen'], 'liubowen')).toBe(false);
  });

  it('隔开严嵩的角色 → 压制', () => {
    // [0]hanxin [1]yansong [2]liubowen [3]zhugeliang
    expect(isCharacterSkillSuppressed(['hanxin', 'yansong', 'liubowen', 'zhugeliang'], 'zhugeliang')).toBe(true);
    // [0]hanxin [1]liubowen [2]yansong [3]zhugeliang → hanxin 不是紧邻，被压制
    expect(isCharacterSkillSuppressed(['hanxin', 'liubowen', 'yansong', 'zhugeliang'], 'hanxin')).toBe(true);
  });

  it('敌方角色（不在 playerCharacterIds 中）→ 不受影响', () => {
    const lineup = ['hanxin', 'yansong', 'liubowen'];
    expect(isCharacterSkillSuppressed(lineup, 'qiangdao')).toBe(false);
    expect(isCharacterSkillSuppressed(lineup, 'huangjinjun')).toBe(false);
  });

  it('ownerId 为空 / undefined → 不压制', () => {
    const lineup = ['hanxin', 'yansong', 'liubowen'];
    expect(isCharacterSkillSuppressed(lineup, undefined)).toBe(false);
    expect(isCharacterSkillSuppressed(lineup, null)).toBe(false);
    expect(isCharacterSkillSuppressed(lineup, '')).toBe(false);
  });

  it('严嵩在首位：只有右侧一张豁免', () => {
    // [0]yansong [1]hanxin [2]liubowen → hanxin 豁免、liubowen 压制
    expect(isCharacterSkillSuppressed(['yansong', 'hanxin', 'liubowen'], 'hanxin')).toBe(false);
    expect(isCharacterSkillSuppressed(['yansong', 'hanxin', 'liubowen'], 'liubowen')).toBe(true);
    // [0]yansong [1]liubowen → liubowen 豁免
    expect(isCharacterSkillSuppressed(['yansong', 'liubowen'], 'liubowen')).toBe(false);
  });

  it('严嵩在末位：只有左侧一张豁免', () => {
    // [0]hanxin [1]liubowen [2]yansong → liubowen 豁免、hanxin 压制
    expect(isCharacterSkillSuppressed(['hanxin', 'liubowen', 'yansong'], 'liubowen')).toBe(false);
    expect(isCharacterSkillSuppressed(['hanxin', 'liubowen', 'yansong'], 'hanxin')).toBe(true);
    // [0]hanxin [1]yansong → hanxin 豁免
    expect(isCharacterSkillSuppressed(['hanxin', 'yansong'], 'hanxin')).toBe(false);
  });

  it('严嵩单独在场：无其他角色可压制', () => {
    expect(isCharacterSkillSuppressed(['yansong'], 'yansong')).toBe(false);
  });

  it('严嵩在场且 owner 为玩家方被压制角色（单角色阵容中严嵩左右无豁免）', () => {
    // [0]yansong [1]hanxin [2]liubowen [3]zhugeliang → 严嵩右侧豁免 hanxin，其余压制
    const lineup = ['yansong', 'hanxin', 'liubowen', 'zhugeliang'];
    expect(isCharacterSkillSuppressed(lineup, 'hanxin')).toBe(false);
    expect(isCharacterSkillSuppressed(lineup, 'liubowen')).toBe(true);
    expect(isCharacterSkillSuppressed(lineup, 'zhugeliang')).toBe(true);
  });
});

describe('shouldYanSongMoveToFront（结党追加效果：其它角色触发技能后严嵩移最前）', () => {
  it('其它玩家角色触发技能 + 严嵩在最后一个站位 → true', () => {
    expect(shouldYanSongMoveToFront(['hanxin', 'liubowen', 'yansong'], 'hanxin')).toBe(true);
    expect(shouldYanSongMoveToFront(['hanxin', 'zhugeliang', 'yansong'], 'zhugeliang')).toBe(true);
  });

  it('严嵩不在最后一个站位 → false', () => {
    // 严嵩在首位/中间，均不触发
    expect(shouldYanSongMoveToFront(['yansong', 'hanxin', 'liubowen'], 'hanxin')).toBe(false);
    expect(shouldYanSongMoveToFront(['hanxin', 'yansong', 'liubowen'], 'hanxin')).toBe(false);
  });

  it('严嵩不在阵容 → false', () => {
    expect(shouldYanSongMoveToFront(['hanxin', 'liubowen', 'zhugeliang'], 'hanxin')).toBe(false);
  });

  it('触发者是严嵩自己（结党常驻被动）→ false', () => {
    expect(shouldYanSongMoveToFront(['hanxin', 'liubowen', 'yansong'], 'yansong')).toBe(false);
  });

  it('触发者是敌方（owner 不在 playerCharacterIds）→ false', () => {
    expect(shouldYanSongMoveToFront(['hanxin', 'liubowen', 'yansong'], 'huangjinjun')).toBe(false);
    expect(shouldYanSongMoveToFront(['hanxin', 'liubowen', 'yansong'], 'qiangdao')).toBe(false);
  });

  it('ownerId 为空 / undefined → false', () => {
    const lineup = ['hanxin', 'liubowen', 'yansong'];
    expect(shouldYanSongMoveToFront(lineup, undefined)).toBe(false);
    expect(shouldYanSongMoveToFront(lineup, null)).toBe(false);
    expect(shouldYanSongMoveToFront(lineup, '')).toBe(false);
  });

  it('只有严嵩一人 → false（无其它角色可触发）', () => {
    expect(shouldYanSongMoveToFront(['yansong'], 'yansong')).toBe(false);
  });
});
