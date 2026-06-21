import { HanxinDianBing } from './HanxinDianBing';
import { LiShizhenBenCao } from './LiShizhenBenCao';
import { WenTianxiangDanXin } from './WenTianxiangDanXin';
import { NiuGaoMengGong } from './NiuGaoMengGong';
import { NanmanJunTengJiaBlack, NanmanJunTengJiaHeart } from './NanmanJunTengJia';
import { QiangdaoJianJing } from './QiangdaoJianJing';
import { HuangjinJunHuangTian } from './HuangjinJunHuangTian';
import { ZhugeLiangXianSuan } from './ZhugeLiangXianSuan';
import { ZhugeLiangLiaoJi } from './ZhugeLiangLiaoJi';
import { LuoChengWuQiang } from './LuoChengWuQiang';
import { XueWanCheXiaoRui } from './XueWanCheXiaoRui';
import { GaoShunXianZhen } from './GaoShunXianZhen';
import type { SkillDefinition } from './SkillTypes';
import { SkillRegistry } from './SkillRegistry';

export * from './SkillTypes';
export { SkillEventBus } from './SkillEventBus';
export { SkillRegistry } from './SkillRegistry';
export { SkillRunner } from './SkillRunner';
export { SkillVisualManagerImpl } from './SkillVisualManagerImpl';
export { LiuBoWenChouCe } from './LiuBoWenChouSuan';

export const ALL_SKILL_DEFINITIONS: SkillDefinition[] = [
  HanxinDianBing,
  LiShizhenBenCao,
  WenTianxiangDanXin,
  NiuGaoMengGong,
  NanmanJunTengJiaBlack,
  NanmanJunTengJiaHeart,
  QiangdaoJianJing,
  HuangjinJunHuangTian,
  ZhugeLiangXianSuan,
  ZhugeLiangLiaoJi,
  LuoChengWuQiang,
  XueWanCheXiaoRui,
  GaoShunXianZhen,
];

export function registerAllSkills(registry: SkillRegistry): void {
  registry.registerAll(ALL_SKILL_DEFINITIONS);
}
