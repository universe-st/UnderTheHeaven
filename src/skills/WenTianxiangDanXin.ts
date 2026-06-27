import { createSuitScoreBonusSkill } from './SkillUtils';

export const WenTianxiangDanXin = createSuitScoreBonusSkill({
  id: 'wentianxiang_danxin',
  name: '丹心',
  description: '单牌伤害结算时，你的红桃牌计分+10',
  suit: 'heart',
  bonus: 10,
  dialogLines: ['人生自古谁无死，留取丹心照汗青！'],
});