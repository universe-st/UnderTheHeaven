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
import { ZhangFeiDuanHe } from './ZhangFeiDuanHe';
import { ZhangHanJueShou } from './ZhangHanJueShou';
import { BianQueHuiSheng } from './BianQueHuiSheng';
import { LiBaiShiXian } from './LiBaiShiXian';
import { BannerArmyQiShe } from './BannerArmyQiShe';
import { MongolArmyQiangLve } from './MongolArmyQiangLve';
import { XiliangArmyHanYong } from './XiliangArmyHanYong';
import { XiongnuArmyLangShou } from './XiongnuArmyLangShou';
import { GuanYuWuSheng } from './GuanYuWuSheng';
import { LanYuJieAoMarker, LanYuJieAoBonus, LanYuJieAoLost } from './LanYuJieAo';
import { ZhaoGaoZhiLu } from './ZhaoGaoZhiLu';
import { ZhouChuLiXin } from './ZhouChuLiXin';
import { BaozhengTieDuan, BaozhengTieDuanCoefficient } from './BaozhengTieDuan';
import { LvBuWeiJuQi } from './LvBuWeiJuQi';
import { HuaMulanCongJun } from './HuaMulanCongJun';
import { ShangguanWanErChengLiang } from './ShangguanWanErChengLiang';
import { LiQingZhaoYouYuan } from './LiQingZhaoYouYuan';
import { LiQingZhaoHaoFang } from './LiQingZhaoHaoFang';
import { QiJiGuangDangKou } from './QiJiGuangDangKou';
import { ZhuangZhouXiaoYao } from './ZhuangZhouXiaoYao';
import { ZhangLiangYunChou } from './ZhangLiangYunChou';
import type { SkillDefinition } from './SkillTypes';
import type { SkillRegistry } from './SkillRegistry';

export * from './SkillTypes';
export { SkillEventBus } from './SkillEventBus';
export { SkillRegistry } from './SkillRegistry';
export { SkillRunner } from './SkillRunner';
export { SkillVisualManagerImpl } from './SkillVisualManagerImpl';
export { LiuBoWenChouCe } from './LiuBoWenChouSuan';
export { ZuChongZhiYuanZhou } from './ZuChongZhiYuanZhou';
export { ZhangJuZhengGaiZhi } from './ZhangJuZhengGaiZhi';
export { LiBaiShiXian, LiBaiShiXianBlock } from './LiBaiShiXian';
export { BaozhengTieDuan, BaozhengTieDuanBlock } from './BaozhengTieDuan';
export { ZhouChuChuHai } from './ZhouChuChuHai';
export { ZhouChuLiXin } from './ZhouChuLiXin';
export { LvBuWeiJuQi } from './LvBuWeiJuQi';
export { HuaMulanCongJun } from './HuaMulanCongJun';
export { ShangguanWanErChengLiang } from './ShangguanWanErChengLiang';
export { LiQingZhaoYouYuan } from './LiQingZhaoYouYuan';
export { LiQingZhaoHaoFang } from './LiQingZhaoHaoFang';
export { QiJiGuangDangKou } from './QiJiGuangDangKou';
export { ZhuangZhouXiaoYao } from './ZhuangZhouXiaoYao';
export { ZhangLiangYunChou } from './ZhangLiangYunChou';
export { WeiZhengZhiJian } from './WeiZhengZhiJian';
export { XiangYuPoFu } from './XiangYuPoFu';

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
  ZhangFeiDuanHe,
  ZhangHanJueShou,
  BianQueHuiSheng,
  LiBaiShiXian,
  BannerArmyQiShe,
  MongolArmyQiangLve,
  XiliangArmyHanYong,
  XiongnuArmyLangShou,
  GuanYuWuSheng,
  LanYuJieAoMarker,
  LanYuJieAoBonus,
  LanYuJieAoLost,
  ZhaoGaoZhiLu,
  ZhouChuLiXin,
  BaozhengTieDuan,
  BaozhengTieDuanCoefficient,
  LvBuWeiJuQi,
  HuaMulanCongJun,
  ShangguanWanErChengLiang,
  LiQingZhaoYouYuan,
  LiQingZhaoHaoFang,
  QiJiGuangDangKou,
  ZhuangZhouXiaoYao,
  ZhangLiangYunChou,
];

export function registerAllSkills(registry: SkillRegistry): void {
  registry.registerAll(ALL_SKILL_DEFINITIONS);
}
