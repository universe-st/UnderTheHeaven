export type PlayerCharacterId = 'hanxin' | 'liubowen' | 'lishizhen' | 'zhugeliang' | 'wentianxiang' | 'niugao';
export type EnemyCharacterId = 'huangjinjun' | 'nanmanjun' | 'qiangdao';

export interface CharacterAbility {
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
  ability: CharacterAbility;
}

export const PLAYER_CHARACTERS: Record<PlayerCharacterId, PlayerCharacter> = {
  hanxin: {
    id: 'hanxin',
    name: '韩信',
    cost: 8,
    abilities: [{ name: '点兵', description: '伤害结算时，系数乘以打出牌的花色数' }],
  },
  liubowen: {
    id: 'liubowen',
    name: '刘伯温',
    cost: 5,
    abilities: [{ name: '筹算', description: '你可以将黑桃牌当做癞子牌打出' }],
  },
  lishizhen: {
    id: 'lishizhen',
    name: '李时珍',
    cost: 3,
    abilities: [{ name: '本草', description: '打出牌时，回复等同于本次打出的所有梅花牌分数之和的气数' }],
  },
  zhugeliang: {
    id: 'zhugeliang',
    name: '诸葛亮',
    cost: 8,
    abilities: [
      { name: '天算', description: '敌方始终随机有六张牌明置' },
      { name: '还治', description: '你可以用相同的牌接住敌方的牌型，而不必用更大的' },
    ],
  },
  wentianxiang: {
    id: 'wentianxiang',
    name: '文天祥',
    cost: 5,
    abilities: [{ name: '丹心', description: '你的红桃牌结算伤害+10' }],
  },
  niugao: {
    id: 'niugao',
    name: '牛皋',
    cost: 3,
    abilities: [{ name: '猛攻', description: '你造成伤害后，若对方手牌数不小于10，随机弃置其一张牌' }],
  },
};

export const ENEMY_CHARACTERS: Record<EnemyCharacterId, EnemyCharacter> = {
  huangjinjun: {
    id: 'huangjinjun',
    name: '黄巾军',
    ability: { name: '黄天', description: '获得牌权时，随机弃置一张点数最小的牌并摸一张' },
  },
  nanmanjun: {
    id: 'nanmanjun',
    name: '南蛮军',
    ability: { name: '藤甲', description: '敌方的黑色牌不计算伤害，红桃牌结算伤害乘以2' },
  },
  qiangdao: {
    id: 'qiangdao',
    name: '强盗',
    ability: { name: '剪径', description: '造成伤害后，随机获得你的一张牌' },
  },
};

export const PLAYER_CHARACTER_LIST: PlayerCharacter[] = Object.values(PLAYER_CHARACTERS);
export const ENEMY_CHARACTER_LIST: EnemyCharacter[] = Object.values(ENEMY_CHARACTERS);
