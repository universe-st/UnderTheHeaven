import { createSuitScoreBonusSkill } from './SkillUtils';

export const GaoShunXianZhen = createSuitScoreBonusSkill({
  id: 'gaoshun_xianzhen',
  name: '陷阵',
  description: '单牌伤害结算时，你的黑桃牌计分+10',
  suit: 'spade',
  bonus: 10,
  dialogLines: ['陷阵之志，有死无生！'],
});