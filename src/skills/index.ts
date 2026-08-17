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
import { JiangShangChuiDiao, JiangShangFuWang } from './JiangShang';
import { SunBinJianZao, SunBinJianZaoBonus } from './SunBin';
import { WokouJieHai } from './WokouJieHai';
import { QidanDaCao } from './QidanDaCao';
import { QingZhouJingHan } from './QingZhouJingHan';
import { SuQinHeZong } from './SuQinHeZong';
import { JingKeBiXian } from './JingKeBiXian';
import { HaiRuiJianShu } from './HaiRuiJianShu';
import { ChengYaoJinMengFu } from './ChengYaoJinMengFu';
import { HanShiZhongZhongWuMarker, HanShiZhongZhongWuBonus } from './HanShiZhongZhongWu';
import { ZhouGongDanZhiLi, ZhouGongDanZhiLiNullify } from './ZhouGongDanZhiLi';
import { TianWenYangShi } from './TianWenYangShi';
import { DongfangShuoFengJian } from './DongfangShuo';
import { MengKeQuYi, MengKeXingShan } from './MengKe';
import { DiQingWenJinMarker, DiQingWenJinBonus } from './DiQing';
import { XuDaZhenBei } from './XuDa';
import { SunWuLianBing, SunWuLianBingBonus } from './SunWu';
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
export { JiangShangChuiDiao, JiangShangFuWang } from './JiangShang';
export { SunBinJianZao, SunBinJianZaoBonus } from './SunBin';
export { WokouJieHai } from './WokouJieHai';
export { QidanDaCao } from './QidanDaCao';
export { QingZhouJingHan } from './QingZhouJingHan';
export { SuQinHeZong } from './SuQinHeZong';
export { JingKeBiXian } from './JingKeBiXian';
export { WeiZhengZhiJian } from './WeiZhengZhiJian';
export { XiangYuPoFu } from './XiangYuPoFu';
export { YiYinZhiWei } from './YiYinZhiWei';
export { HaiRuiJianShu } from './HaiRuiJianShu';
export { ZhouGongDanZhiLiActive } from './ZhouGongDanZhiLi';
export { TianWenYangShi } from './TianWenYangShi';
export { ZhouYuFanjian } from './ZhouYu';
export { DongfangShuoFengJian } from './DongfangShuo';
export { MengKeQuYi, MengKeXingShan } from './MengKe';
export { DiQingWenJinMarker, DiQingWenJinBonus } from './DiQing';
export { XuDaZhenBei } from './XuDa';
export { SunWuLianBing, SunWuLianBingBonus } from './SunWu';

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
  JiangShangChuiDiao,
  JiangShangFuWang,
  SunBinJianZao,
  SunBinJianZaoBonus,
  WokouJieHai,
  QidanDaCao,
  QingZhouJingHan,
  SuQinHeZong,
  JingKeBiXian,
  HaiRuiJianShu,
  ChengYaoJinMengFu,
  HanShiZhongZhongWuMarker,
  HanShiZhongZhongWuBonus,
  ZhouGongDanZhiLi,
  ZhouGongDanZhiLiNullify,
  TianWenYangShi,
  DongfangShuoFengJian,
  MengKeQuYi,
  MengKeXingShan,
  DiQingWenJinMarker,
  DiQingWenJinBonus,
  XuDaZhenBei,
  SunWuLianBing,
  SunWuLianBingBonus,
];

export function registerAllSkills(registry: SkillRegistry): void {
  registry.registerAll(ALL_SKILL_DEFINITIONS);
}
