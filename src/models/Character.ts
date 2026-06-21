export type PlayerCharacterId = 'hanxin' | 'liubowen' | 'lishizhen' | 'zhugeliang' | 'wentianxiang' | 'niugao' | 'luocheng' | 'xuewanche' | 'gaoshun';
export type EnemyCharacterId = 'huangjinjun' | 'nanmanjun' | 'qiangdao';

export interface CharacterAbility {
  skillId: string;
  name: string;
  description: string;
}

export interface PlayerCharacter {
  id: PlayerCharacterId;
  name: string;
  cost: number;
  abilities: CharacterAbility[];
}

export interface EnemyCharacter {
  id: EnemyCharacterId;
  name: string;
  abilities: CharacterAbility[];
}

export const PLAYER_CHARACTERS: Record<PlayerCharacterId, PlayerCharacter> = {
  hanxin: {
    id: 'hanxin',
    name: '韩信',
    cost: 8,
    abilities: [{ skillId: 'hanxin_dianbing', name: '点兵', description: '伤害结算时，系数乘以打出牌的花色数（至少为一）' }],
  },
  liubowen: {
    id: 'liubowen',
    name: '刘伯温',
    cost: 5,
    abilities: [{ skillId: 'liubowen_chouce', name: '筹策', description: '选择两张点数差大于1的牌（除大王、小王、2外），创造一张点数在两者之间的临时牌，创造牌的花色和较大牌一致' }],
  },
  lishizhen: {
    id: 'lishizhen',
    name: '李时珍',
    cost: 3,
    abilities: [{ skillId: 'lishizhen_bencao', name: '本草', description: '打出牌时，回复等同于本次打出的所有梅花牌分数之和的气数' }],
  },
  zhugeliang: {
    id: 'zhugeliang',
    name: '诸葛亮',
    cost: 8,
    abilities: [
      { skillId: 'zhugeliang_xiansuan', name: '先算', description: '对方摸满手牌后，你随机令对方七张牌变成【明置】状态' },
      { skillId: 'zhugeliang_liaoji', name: '料机', description: '单牌伤害结算时，【明置】状态的牌不计算分数' },
    ],
  },
  wentianxiang: {
    id: 'wentianxiang',
    name: '文天祥',
    cost: 5,
    abilities: [{ skillId: 'wentianxiang_danxin', name: '丹心', description: '你的红桃牌结算伤害+10' }],
  },
  niugao: {
    id: 'niugao',
    name: '牛皋',
    cost: 3,
    abilities: [{ skillId: 'niugao_menggong', name: '猛攻', description: '你造成伤害后，若对方手牌数不小于10，随机弃置其一张牌' }],
  },
  luocheng: {
    id: 'luocheng',
    name: '罗成',
    cost: 5,
    abilities: [{ skillId: 'luocheng_wuqiang', name: '舞枪', description: '你的方片牌结算伤害+10' }],
  },
  xuewanche: {
    id: 'xuewanche',
    name: '薛万彻',
    cost: 5,
    abilities: [{ skillId: 'xuewanche_xiaorui', name: '骁锐', description: '你的梅花牌结算伤害+10' }],
  },
  gaoshun: {
    id: 'gaoshun',
    name: '高顺',
    cost: 5,
    abilities: [{ skillId: 'gaoshun_xianzhen', name: '陷阵', description: '你的黑桃牌结算伤害+10' }],
  },
};

export const ENEMY_CHARACTERS: Record<EnemyCharacterId, EnemyCharacter> = {
  huangjinjun: {
    id: 'huangjinjun',
    name: '黄巾军',
    abilities: [{ skillId: 'huangjinjun_huangtian', name: '黄天', description: '获得牌权时，随机弃置一张点数最小的牌并摸一张' }],
  },
  nanmanjun: {
    id: 'nanmanjun',
    name: '南蛮军',
    abilities: [
      { skillId: 'nanmanjun_tengjia_black', name: '藤甲', description: '单牌伤害结算时，黑色牌不计算分数' },
      { skillId: 'nanmanjun_tengjia_heart', name: '藤甲', description: '单牌伤害结算时，红桃牌计分×2' },
    ],
  },
  qiangdao: {
    id: 'qiangdao',
    name: '强盗',
    abilities: [{ skillId: 'qiangdao_jianjing', name: '剪径', description: '造成伤害后，随机获得你的一张牌' }],
  },
};

export const PLAYER_CHARACTER_LIST: PlayerCharacter[] = Object.values(PLAYER_CHARACTERS);
export const ENEMY_CHARACTER_LIST: EnemyCharacter[] = Object.values(ENEMY_CHARACTERS);
