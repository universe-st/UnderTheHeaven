import { createSuitScoreBonusSkill } from './SkillUtils';

export const LuoChengWuQiang = createSuitScoreBonusSkill({
  id: 'luocheng_wuqiang',
  name: '舞枪',
  description: '单牌伤害结算时，你的方片牌计分+10',
  suit: 'diamond',
  bonus: 10,
  dialogLines: ['看枪！'],
});