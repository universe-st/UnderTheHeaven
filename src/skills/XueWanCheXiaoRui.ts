import { createSuitScoreBonusSkill } from './SkillUtils';

export const XueWanCheXiaoRui = createSuitScoreBonusSkill({
  id: 'xuewanche_xiaorui',
  name: '骁锐',
  description: '单牌伤害结算时，你的梅花牌计分+10',
  suit: 'club',
  bonus: 10,
  dialogLines: ['吾乃万人敌也！'],
});