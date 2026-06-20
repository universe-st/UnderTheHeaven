import { HanxinDianBing } from './HanxinDianBing';
import { LiShizhenBenCao } from './LiShizhenBenCao';
import { WenTianxiangDanXin } from './WenTianxiangDanXin';
import { NiuGaoMengGong } from './NiuGaoMengGong';
import { NanmanJunTengJia } from './NanmanJunTengJia';
import { QiangdaoJianJing } from './QiangdaoJianJing';
import { HuangjinJunHuangTian } from './HuangjinJunHuangTian';
import { ZhugeLiangTianSuan } from './ZhugeLiangTianSuan';
import { ZhugeLiangHuanZhi } from './ZhugeLiangHuanZhi';
import { LiuBoWenChouSuan } from './LiuBoWenChouSuan';
import type { SkillDefinition } from './SkillTypes';
import { SkillRegistry } from './SkillRegistry';

export * from './SkillTypes';
export { SkillEventBus } from './SkillEventBus';
export { SkillRegistry } from './SkillRegistry';
export { SkillRunner } from './SkillRunner';
export { SkillVisualManagerImpl } from './SkillVisualManagerImpl';

export const ALL_SKILL_DEFINITIONS: SkillDefinition[] = [
  HanxinDianBing,
  LiShizhenBenCao,
  WenTianxiangDanXin,
  NiuGaoMengGong,
  NanmanJunTengJia,
  QiangdaoJianJing,
  HuangjinJunHuangTian,
  ZhugeLiangTianSuan,
  ZhugeLiangHuanZhi,
  LiuBoWenChouSuan,
];

export function registerAllSkills(registry: SkillRegistry): void {
  registry.registerAll(ALL_SKILL_DEFINITIONS);
}
