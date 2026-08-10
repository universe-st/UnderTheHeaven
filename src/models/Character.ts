export type PlayerCharacterId = 'bianque' | 'hanxin' | 'liubowen' | 'lishizhen' | 'zhugeliang' | 'wentianxiang' | 'libai' | 'niugao' | 'luocheng' | 'xuewanche' | 'gaoshun' | 'zhangfei' | 'zhanghan' | 'zuchongzhi' | 'guanyu' | 'lanyu' | 'zhaogao' | 'zhangjuzheng' | 'zhouchu' | 'baozheng' | 'lvbuwei' | 'huamulan' | 'shangguanwaner' | 'liqingzhao' | 'qijiguang' | 'zhuangzhou' | 'weizheng' | 'zhangliang' | 'xiangyu';
export type EnemyCharacterId = 'huangjinjun' | 'nanmanjun' | 'qiangdao' | 'shizu' | 'banner_army' | 'mongol_army' | 'xiliang_army' | 'xiongnu_army';

export interface CharacterAbility {
  skillId: string;
  name: string;
  description: string;
  /**
   * 标记类技能：在角色框左上角显示圆形标记区（中间显示标记数）。
   * 值为标记名称（如 '骜'），仅带标记技能的角色设置。
   */
  markerLabel?: string;
  /**
   * 内部技能条目：用于技能注册但不展示在角色信息面板
   * （一个技能拆分为多个 SkillDefinition 时使用）。
   */
  hidden?: boolean;
  /**
   * 特殊技能条目：展示在角色信息面板，但用特殊颜色标识
   * （如周处「励心」——获得角色时尚未拥有，获得后变正常颜色）。
   */
  special?: boolean;
}

export interface PlayerCharacter {
  id: PlayerCharacterId;
  name: string;
  abilities: CharacterAbility[];
  /**
   * 接牌规则：'strict' 必须严格大于上家才能接牌（默认）；
   * 'equal' 允许同型等值接牌（如诸葛亮"先算"配合）。
   */
  beatRule?: 'strict' | 'equal';
}

export interface EnemyCharacter {
  id: EnemyCharacterId;
  name: string;
  abilities: CharacterAbility[];
}

export const PLAYER_CHARACTERS: Record<PlayerCharacterId, PlayerCharacter> = {
  bianque: {
    id: 'bianque',
    name: '扁鹊',
    abilities: [{ skillId: 'bianque_huisheng', name: '回生', description: '你气数降到0时，回复一半气数避免失败。每局只能触发一次。' }],
  },
  hanxin: {
    id: 'hanxin',
    name: '韩信',
    abilities: [{ skillId: 'hanxin_dianbing', name: '点兵', description: '你打出牌的伤害倍数+X，X为打出牌的花色数' }],
  },
  liubowen: {
    id: 'liubowen',
    name: '刘伯温',
    abilities: [{ skillId: 'liubowen_chouce', name: '筹策', description: '（主动技）选择两张点数差大于1的牌（大王、小王、2除外），创造一张点数在两者之间的临时牌，创造的牌花色与点数较大的牌一致。每次牌权限一次。' }],
  },
  lishizhen: {
    id: 'lishizhen',
    name: '李时珍',
    abilities: [{ skillId: 'lishizhen_bencao', name: '本草', description: '打出牌时，回复等同于本次打出的所有梅花牌分数之和的气数' }],
  },
  zhugeliang: {
    id: 'zhugeliang',
    name: '诸葛亮',
    beatRule: 'equal',
    abilities: [
      { skillId: 'zhugeliang_xiansuan', name: '先算', description: '对方摸满手牌后，你随机令对方七张牌变成【明置】状态' },
      { skillId: 'zhugeliang_liaoji', name: '料机', description: '单牌伤害结算时，【明置】状态的牌不计算分数' },
    ],
  },
  wentianxiang: {
    id: 'wentianxiang',
    name: '文天祥',
    abilities: [{ skillId: 'wentianxiang_danxin', name: '丹心', description: '你的红桃牌结算伤害+10' }],
  },
  libai: {
    id: 'libai',
    name: '李白',
    abilities: [{ skillId: 'libai_shixian', name: '诗仙', description: '你打出的牌如果是五张或者七张，只能被"王炸"响应' }],
  },
  niugao: {
    id: 'niugao',
    name: '牛皋',
    abilities: [{ skillId: 'niugao_menggong', name: '猛攻', description: '你造成伤害后，若对方手牌数不小于10，随机弃置其一张牌' }],
  },
  luocheng: {
    id: 'luocheng',
    name: '罗成',
    abilities: [{ skillId: 'luocheng_wuqiang', name: '舞枪', description: '你的方片牌结算伤害+10' }],
  },
  xuewanche: {
    id: 'xuewanche',
    name: '薛万彻',
    abilities: [{ skillId: 'xuewanche_xiaorui', name: '骁锐', description: '你的梅花牌结算伤害+10' }],
  },
  gaoshun: {
    id: 'gaoshun',
    name: '高顺',
    abilities: [{ skillId: 'gaoshun_xianzhen', name: '陷阵', description: '你的黑桃牌结算伤害+10' }],
  },
  zhangfei: {
    id: 'zhangfei',
    name: '张飞',
    abilities: [{ skillId: 'zhangfei_duanhe', name: '断喝', description: '若你手牌数量不大于四张，敌方对你结算伤害时，如果结算到了与你手牌中拥有花色的牌，你直接令已计数伤害归零并无效后续待结算牌。你获得牌权。' }],
  },
  zhanghan: {
    id: 'zhanghan',
    name: '章邯',
    abilities: [{ skillId: 'zhanghan_jueshou', name: '绝守', description: '你的气数损失每有10%，伤害结算时系数时+0.3。' }],
  },
  zuchongzhi: {
    id: 'zuchongzhi',
    name: '祖冲之',
    abilities: [{ skillId: 'zuchongzhi_yuanzhou', name: '圆周', description: '（主动技）选择任意张圆周率开头的序列牌弃置，然后创造点数和花色完全相同，并且附带随机四象印的临时牌。每次牌权限一次。' }],
  },
  guanyu: {
    id: 'guanyu',
    name: '关羽',
    abilities: [{ skillId: 'guanyu_wusheng', name: '武圣', description: '如果你持有牌权时主动打出的牌对方没有响应，则伤害系数+X。X为本次打出的牌中红色牌的数量' }],
  },
  lanyu: {
    id: 'lanyu',
    name: '蓝玉',
    abilities: [
      {
        skillId: 'lanyu_jieao_marker', name: '桀骜', markerLabel: '骜',
        description: '你每次造成伤害后，获得一个"骜"标记。你单牌计算伤害+X，X为"骜"标记的数量。当你一次给对方造成的伤害数量大于自己的气数时，你失去该角色牌（永久，除非之后再次招募）。',
      },
      // 以下为「桀骜」拆分的内部技能条目（用于注册，不单独显示）
      { skillId: 'lanyu_jieao_bonus', name: '桀骜', description: '', hidden: true },
      { skillId: 'lanyu_jieao_lost', name: '桀骜', description: '', hidden: true },
    ],
  },
  zhaogao: {
    id: 'zhaogao',
    name: '赵高',
    abilities: [{ skillId: 'zhaogao_zhilu', name: '指鹿', description: '你获得牌权时，随机失去一张最大的牌，生成随机花色点数且点数不大于失去牌的临时牌' }],
  },
  zhangjuzheng: {
    id: 'zhangjuzheng',
    name: '张居正',
    abilities: [{ skillId: 'zhangjuzheng_gaizhi', name: '改制', description: '（主动技）每局游戏限一次，弃置手上所有的非大小王的牌，生成点数+1的临时牌。失去牌权后重置发动次数。' }],
  },
  zhouchu: {
    id: 'zhouchu',
    name: '周处',
    abilities: [
      { skillId: 'zhouchu_chuhai', name: '除害', description: '（主动技）每次获得牌权限一次。随机展示对方三张牌，其中的大王或小王被移出对方牌库；若三张中没有王，你获得其中的红桃牌。若你移除过至少一张大王和一张小王，你失去技能【除害】，获得【励心】。' },
      // 特殊技能：获得周处时尚未拥有，通过「除害」转换获得；未获得时在技能列表以特殊颜色显示
      { skillId: 'zhouchu_lixin', name: '励心', special: true, description: '你的红桃牌在单牌伤害结算后，已经累加的伤害数乘以1.5' },
    ],
  },
  baozheng: {
    id: 'baozheng',
    name: '包拯',
    abilities: [
      { skillId: 'baozheng_tieduan', name: '铁断', description: '你的单张【大王】、【小王】与【9】可以无视大小和牌型，响应对方打出的任何牌，并且对方无法使用任何牌应对。你使用单张【大王】、【小王】与【9】结算伤害时系数+5。' },
      // 铁断拆分的内部技能条目（系数+5，用于注册，不单独显示）
      { skillId: 'baozheng_tieduan_coeff', name: '铁断', description: '', hidden: true },
    ],
  },
  lvbuwei: {
    id: 'lvbuwei',
    name: '吕不韦',
    abilities: [
      { skillId: 'lvbuwei_juqi', name: '居奇', description: '你每次选择不出后，生成一张点数为3的随机花色并带有青龙印的牌。' },
    ],
  },
  huamulan: {
    id: 'huamulan',
    name: '花木兰',
    abilities: [
      { skillId: 'huamulan_congjun', name: '从军', description: '你打出的牌若包含四种花色，每张牌结算伤害时分数+20。' },
    ],
  },
  shangguanwaner: {
    id: 'shangguanwaner',
    name: '上官婉儿',
    abilities: [
      { skillId: 'shangguanwaner_chengliang', name: '称量', description: '你每有一个角色牌，结算伤害时每张牌分数+5。' },
    ],
  },
  liqingzhao: {
    id: 'liqingzhao',
    name: '李清照',
    abilities: [
      { skillId: 'liqingzhao_youyuan', name: '幽怨', description: '若你打出的牌均为黑色且不小于五张，结算后将点数最大的牌收回手牌' },
      { skillId: 'liqingzhao_haofang', name: '豪放', description: '若你打出的牌均为红色且不小于五张，每张牌额外结算一次伤害' },
    ],
  },
  qijiguang: {
    id: 'qijiguang',
    name: '戚继光',
    abilities: [
      { skillId: 'qijiguang_dangkou', name: '荡寇', description: '若你打出的牌数量超出对方手牌数，结算伤害时所有牌额外结算一次' },
    ],
  },
  zhuangzhou: {
    id: 'zhuangzhou',
    name: '庄周',
    abilities: [
      { skillId: 'zhuangzhou_xiaoyao', name: '逍遥', description: '敌方对你结算伤害时，你进行一次判定，若结果为黑色，伤害无效' },
    ],
  },
  weizheng: {
    id: 'weizheng',
    name: '魏征',
    abilities: [
      { skillId: 'weizheng_zhijian', name: '直谏', description: '（主动技）每次牌权限一次，你可以弃置一张牌（自己的一张手牌）。' },
    ],
  },
  zhangliang: {
    id: 'zhangliang',
    name: '张良',
    abilities: [
      { skillId: 'zhangliang_yunchou', name: '运筹', description: '获得牌权时，从牌堆随机抽五张牌，选择最多两张获得，剩余的牌弃置' },
    ],
  },
  xiangyu: {
    id: 'xiangyu',
    name: '项羽',
    abilities: [
      { skillId: 'xiangyu_pofu', name: '破釜', description: '（主动技）每个牌权限一次，你可以弃置任意合法牌型，扣减自身分数总和乘以牌型系数的气数给对方造成两倍伤害。如果你的气数无法承担扣减则无法发动。' },
    ],
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
      { skillId: 'nanmanjun_tengjia_heart', name: '藤甲', description: '单牌伤害结算时，红桃牌计分×3' },
    ],
  },
  qiangdao: {
    id: 'qiangdao',
    name: '强盗',
    abilities: [{ skillId: 'qiangdao_jianjing', name: '剪径', description: '造成伤害后，随机获得你的一张牌' }],
  },
  shizu: {
    id: 'shizu',
    name: '士卒',
    abilities: [],
  },
  banner_army: {
    id: 'banner_army',
    name: '八旗军',
    abilities: [{ skillId: 'banner_army_qishe', name: '骑射', description: '打出方片花色的单张牌型时，对方无法用单张响应' }],
  },
  mongol_army: {
    id: 'mongol_army',
    name: '蒙古军',
    abilities: [{ skillId: 'mongol_army_qianglve', name: '抢掠', description: '单牌结算伤害时，若为黑桃牌，获得对方一张牌' }],
  },
  xiliang_army: {
    id: 'xiliang_army',
    name: '西凉军',
    abilities: [{ skillId: 'xiliang_army_hanyong', name: '悍勇', description: '结算伤害时，若没有手牌，伤害倍数+3' }],
  },
  xiongnu_army: {
    id: 'xiongnu_army',
    name: '匈奴军',
    abilities: [{ skillId: 'xiongnu_army_langshou', name: '狼狩', description: '单牌结算伤害后，若为红桃牌，你回复等同于结算伤害的气数' }],
  },
};

export const PLAYER_CHARACTER_LIST: PlayerCharacter[] = Object.values(PLAYER_CHARACTERS);
export const ENEMY_CHARACTER_LIST: EnemyCharacter[] = Object.values(ENEMY_CHARACTERS);

const DEFAULT_PLAYER_CHARACTER_IDS: PlayerCharacterId[] = ['hanxin', 'liubowen', 'lishizhen', 'zhugeliang', 'wentianxiang', 'niugao', 'zuchongzhi', 'guanyu', 'lanyu', 'zhangjuzheng', 'zhouchu', 'baozheng'];

export function randomPlayerCharacter(rng: () => number = Math.random): PlayerCharacterId {
  return DEFAULT_PLAYER_CHARACTER_IDS[Math.floor(rng() * DEFAULT_PLAYER_CHARACTER_IDS.length)]!;
}
