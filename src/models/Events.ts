import type { RunState } from './RunState';
import type { ShopItem } from './Shop';
import { HEXAGRAM_CATALOG, addBuciToBar, characterPrice } from './Shop';
import { PLAYER_CHARACTER_LIST, type PlayerCharacterId } from './Character';
import { ROSTER_MAX } from './RunState';
import {
  applyEventCostHalf,
  applyEventTongbaoMult,
  blockEventDestinyLoss,
  triggerHealOnGoodEvent,
} from '../engine/BuciEffects';

/**
 * 事件系统（v2 重设计）：
 * - 四概率池：旷古罕见 1% / 凤毛麟角 5% / 可遇难求 15% / 稀松平常 79%
 * - 抽取逻辑：先按概率掷池 → 在池内过滤「出现层数 + 触发条件 + 每局唯一」→ 随机取一
 * - 候选为空时向更低一级池降级；全部为空则无视条件兜底（保证事件节点不空转）
 * 设计文档：docs/design/game/15-事件系统.md
 */

export type EventPool = 'legendary' | 'rare' | 'uncommon' | 'common';

/** 触发条件（数组内 AND；or 用于组合） */
export type TriggerCondition =
  | { type: 'has_character'; characterId: PlayerCharacterId }
  | { type: 'not_has_character'; characterId: PlayerCharacterId }
  | { type: 'floor_gte'; floor: number }
  | { type: 'tongbao_gte'; amount: number }
  | { type: 'destiny_lte'; amount: number }
  | { type: 'buci_has'; buciId: string }
  | { type: 'buci_count_gte'; count: number }
  | { type: 'roster_count_gte'; count: number }
  | { type: 'roster_count_lt'; count: number }
  | { type: 'or'; items: TriggerCondition[] };

/** 选项内条件判定（用于「按当前状态决定后续效果」） */
export type ConditionSpec =
  | { kind: 'floor_above'; floor: number }
  | { kind: 'buci_has'; buciId: string }
  | { kind: 'has_character'; characterId: PlayerCharacterId }
  | { kind: 'has_all_characters'; characterIds: PlayerCharacterId[] }
  | { kind: 'or'; items: ConditionSpec[] }
  | { kind: 'and'; items: ConditionSpec[] };

export type EventEffect =
  | { type: 'none' }
  | { type: 'tongbao'; amount: number; amountMax?: number }
  | { type: 'destiny'; amount: number }
  /** 通宝 +N~M，但有 riskChance 概率被蛇咬伤扣天命（拾荒·翻找深处） */
  | { type: 'tongbao_with_risk'; amount: number; amountMax: number; riskChance: number; riskDestiny: number }
  /** 花 cost 通宝卜一卦：60% 得 win 天命，否则 lose（负数）天命（算命先生·问前程） */
  | { type: 'destiny_random'; cost: number; winChance: number; win: number; lose: number }
  /** 花 cost 通宝购买随机卜辞（算命先生·求签 / 行脚商·旧书 / 茶棚·听书） */
  | { type: 'buy_buci'; cost: number }
  | { type: 'tongbao_and_destiny'; tongbao: number; destiny: number }
  | { type: 'buci' }
  | { type: 'battle' }
  /** 遭遇战：胜利后额外获得 reward 通宝（剪径强人·拼死一搏） */
  | { type: 'battle_with_reward'; reward: number }
  | { type: 'recruit'; discount: number }
  /** 直接获得指定人杰；队伍已满时改为通宝 +50（钓鱼老叟/乌江亭·霸王） */
  | { type: 'recruit_character'; characterId: PlayerCharacterId }
  | { type: 'trade'; tongbaoCost: number; destinyGain: number }
  | { type: 'gamble'; tongbaoCost: number; winAmount: number; winChance: number }
  /** 气数上限永久 +amount；可选按当前状态加成（赤壁凭吊/桃园结义） */
  | { type: 'vitality_max_up'; amount: number; amountIfHasCharacter?: { characterId: PlayerCharacterId; amount: number }; amountIfHasBothCharacters?: { characterIds: [PlayerCharacterId, PlayerCharacterId]; amount: number } }
  /** 按当前状态二选一结算（钓鱼老叟·虚心请教） */
  | { type: 'conditional'; if: ConditionSpec; then: EventEffect; else: EventEffect; elseText?: string };

export interface EventChoice {
  label: string;
  effect: EventEffect;
  /** 选项结算结果描述（覆盖通用文案，保留事件风味） */
  resultText?: string;
}

export interface GameEvent {
  id: string;
  title: string;
  pool: EventPool;
  /** 出现层数（含端点），如 [1, 36] */
  floors: [number, number];
  /** 触发条件（数组内全部满足才可触发） */
  trigger: TriggerCondition[];
  /** 每局唯一（可遇难求及以上） */
  oncePerRun: boolean;
  description: string;
  choices: EventChoice[];
}

/** 供场景层消费的事件结算结果 */
export interface EventResult {
  success: boolean;
  description: string;
  startBattle?: boolean;
  shopItem?: ShopItem;
}

export const GAME_EVENTS: GameEvent[] = [
  // ───────────────────────── 稀松平常（79%）─────────────────────────
  {
    id: 'shan_shen_miao',
    title: '山神庙',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '一座香火凋零的破败山神庙，神像前的供桌上积满灰尘，功德箱里却隐约有些叮当声。你决定：',
    choices: [
      { label: '虔诚祭拜（天命 +15）', effect: { type: 'destiny', amount: 15 }, resultText: '你拂去神像上的尘土，恭恭敬敬地叩了三个头。庙中似有暖风拂过，你心安了不少，天命恢复 15。' },
      { label: '翻找功德箱（通宝 +10~15）', effect: { type: 'tongbao', amount: 10, amountMax: 15 }, resultText: '你四下张望无人，伸手探进功德箱，摸出几枚铜钱。神像无言，你自己心里发虚。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你不敢亵渎神灵，转身离去，继续赶路。' },
    ],
  },
  {
    id: 'shihuang',
    title: '拾荒',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '路边的废墟中散落着前人留下的遗物，或许能翻出一些值钱的东西。你决定：',
    choices: [
      { label: '粗略搜刮（通宝 +10~20）', effect: { type: 'tongbao', amount: 10, amountMax: 20 }, resultText: '你在断壁残垣间翻找，拾得几件尚能变卖的物件。' },
      { label: '翻找深处（通宝 +20~35，25% 被蛇咬）', effect: { type: 'tongbao_with_risk', amount: 20, amountMax: 35, riskChance: 0.25, riskDestiny: -8 }, resultText: '你钻进废墟深处仔细翻寻，摸到一件沉甸甸的好东西——但黑暗中似乎有什么东西也盯上了它。' },
      { label: '离开', effect: { type: 'none' }, resultText: '废墟里阴气森森，你摇了摇头，继续赶路。' },
    ],
  },
  {
    id: 'suanming_xiansheng',
    title: '算命先生',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '路旁支着一面旧幡，一个戴墨镜的算命先生摇着签筒，吆喝道：“算不准不要钱！客官，来一卦？”你决定：',
    choices: [
      { label: '问前程（花 10 通宝）', effect: { type: 'destiny_random', cost: 10, winChance: 0.6, win: 15, lose: -10 }, resultText: '先生掐指一算，眉头一挑：“大吉大利，主客平安！”' },
      { label: '求一卦签（花 15 通宝）', effect: { type: 'buy_buci', cost: 15 }, resultText: '你抽出一支卦签，先生端详片刻，赠你一句卦辞。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你信不过江湖术士，摆摆手走了。' },
    ],
  },
  {
    id: 'zao_yu_dao_zei',
    title: '遭遇盗贼',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '夜路边上窜出一道黑影，一个瘦小毛贼举着短刀拦路：“此路是我开，此树是我栽！留下买路财！”你决定：',
    choices: [
      { label: '破财免灾（通宝 -25）', effect: { type: 'tongbao', amount: -25 }, resultText: '你丢出钱袋，毛贼捡起后窜入夜色消失。' },
      { label: '迎战', effect: { type: 'battle' }, resultText: '你冷哼一声，抽出兵刃——毛贼也不含糊，挥刀扑来。' },
      { label: '夺路而逃（天命 -5）', effect: { type: 'destiny', amount: -5 }, resultText: '你转身便跑，毛贼追出数百步才罢休，你累得气喘吁吁，还摔了一跤。' },
    ],
  },
  {
    id: 'jian_jing_qiang_ren',
    title: '剪径强人',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '山道转角忽然杀声四起，一伙明火执仗的强人从树丛中逼出来，当头一人喝道：“此山是我开！识相的留下财物！”你决定：',
    choices: [
      { label: '交纳买路钱（通宝 -30）', effect: { type: 'tongbao', amount: -30 }, resultText: '强人头目掂了掂钱袋，满意地一挥手，放你过去。' },
      { label: '拼死一搏（战斗，胜后通宝 +40）', effect: { type: 'battle_with_reward', reward: 40 }, resultText: '你拔刀在手，强人狞笑着围了上来——这一仗注定凶险。' },
      { label: '连夜绕行（天命 -8）', effect: { type: 'destiny', amount: -8 }, resultText: '你趁夜色摸进林中绕路，山道崎岖，摔了好几跤才脱身。' },
    ],
  },
  {
    id: 'xingjiao_shang',
    title: '行脚商',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '一个挑着担子的行脚商拦住你，掀开货箱热情地介绍：“客官！续命丹、护身符、稀罕物——样样都有，童叟无欺！”你决定：',
    choices: [
      { label: '买续命丹（花 30 通宝，天命 +15）', effect: { type: 'trade', tongbaoCost: 30, destinyGain: 15 }, resultText: '行脚商郑重地把一瓶“续命丹”塞进你手里：“稳固气运，包你满意。”' },
      { label: '淘一本旧书（花 15 通宝）', effect: { type: 'buy_buci', cost: 15 }, resultText: '货箱底压着一本泛黄的旧书——据说是某位游方道人留下的。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你信不过这油嘴滑舌的商人，转头就走。' },
    ],
  },
  {
    id: 'chaping_xiejiao',
    title: '茶棚歇脚',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '官道旁搭着一间茶棚，老板娘提着大铜壶吆喝：“歇歇脚吧客官，一碗热茶润润喉！”你决定：',
    choices: [
      { label: '歇息片刻（天命 +8）', effect: { type: 'destiny', amount: 8 }, resultText: '你坐下喝了碗热茶，长出一口气，连日赶路的疲惫消散了些。' },
      { label: '听书（花 8 通宝）', effect: { type: 'buy_buci', cost: 8 }, resultText: '茶棚角落有个说书人正讲《封神演义》，你听得入神，散场时他赠你一支卦签。' },
      { label: '继续赶路', effect: { type: 'none' }, resultText: '你茶也没喝，马不停蹄地赶路。' },
    ],
  },
  {
    id: 'liulang_wushi',
    title: '流浪武士',
    pool: 'common',
    floors: [1, 36],
    trigger: [{ type: 'roster_count_lt', count: 10 }],
    oncePerRun: false,
    description: '一个落魄武士蹲在路边，身旁插着一柄卷刃的旧刀。见你经过，他站起来抱拳：“在下流落至此，愿凭一身武艺讨口饭吃，只求主家赏识。”你决定：',
    choices: [
      { label: '打折招募（8 折）', effect: { type: 'recruit', discount: 0.8 }, resultText: '你打量他一番，愿出一份折价礼金邀他随行。他大喜过望，抱拳称谢。' },
      { label: '切磋武艺（战斗）', effect: { type: 'battle' }, resultText: '你拔出兵器：“先让我看看你的本事！”武士眼中精光一闪，拔刀便上。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你摇了摇头：“山高水长，后会有期。”' },
    ],
  },
  {
    id: 'baoxiang',
    title: '上锁宝箱',
    pool: 'common',
    floors: [1, 36],
    trigger: [],
    oncePerRun: false,
    description: '草丛深处露出一只上锁的木箱，锁头已经锈得不成样子，箱盖上刻着一行小字：“有缘者开。”你决定：',
    choices: [
      { label: '撬开（随机卜辞）', effect: { type: 'buci' }, resultText: '你捡起石块砸开锈锁，箱中竟躺着一支竹简——上书卦辞一则。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你怕箱中设了什么机关，摇了摇头走开。' },
    ],
  },

  // ───────────────────────── 可遇难求（15%）─────────────────────────
  {
    id: 'shanzhong_yinshi',
    title: '山中隐士',
    pool: 'uncommon',
    floors: [1, 36],
    trigger: [{ type: 'roster_count_gte', count: 3 }],
    oncePerRun: true,
    description: '云雾缭绕的山道上，一位白衣隐士临崖而坐，面前摆着一局残棋。他抬眼看了你的队伍一眼，微微一笑：“阁下带着一班人马，倒是有趣。”你决定：',
    choices: [
      { label: '请教养生之道（气数上限 +800）', effect: { type: 'vitality_max_up', amount: 800 }, resultText: '隐士抚须道：“养生之道，在于守心。老夫传你一段吐纳之法。”' },
      { label: '询问天下大势（天命 +12）', effect: { type: 'destiny', amount: 12 }, resultText: '隐士望着山下的烽烟，轻叹：“乱世将至，群雄并起。阁下且看风向行事。”' },
      { label: '离开', effect: { type: 'none' }, resultText: '你不愿打扰隐士清净，拱手告辞。' },
    ],
  },
  {
    id: 'shachang_laobing',
    title: '沙场老兵',
    pool: 'uncommon',
    floors: [10, 36],
    trigger: [],
    oncePerRun: true,
    description: '路旁石头上坐着一个独臂老兵，旧甲残破，面前摆着一只缺口的酒碗。他眯眼打量你：“小娃娃，上过几回战场？”你决定：',
    choices: [
      { label: '听其讲述战场往事（气数上限 +1000）', effect: { type: 'vitality_max_up', amount: 1000 }, resultText: '老兵一仰脖灌了口酒，讲起金戈铁马的旧事。你听得血热，气势为之一振。' },
      { label: '赠其盘缠（花 30 通宝，天命 +20）', effect: { type: 'trade', tongbaoCost: 30, destinyGain: 20 }, resultText: '你放下银钱：“老丈拿去沽酒。”老兵一愣，郑重抱拳：“恩公大义，老天爷记着呢。”' },
      { label: '离开', effect: { type: 'none' }, resultText: '你点了点头，与老兵擦肩而过。' },
    ],
  },
  {
    id: 'nanmin_cunzhai',
    title: '难民村寨',
    pool: 'uncommon',
    floors: [1, 36],
    trigger: [{ type: 'tongbao_gte', amount: 40 }],
    oncePerRun: true,
    description: '一座村寨前挤满了面黄肌瘦的难民，一个老里正颤巍巍地拦路：“壮士行行好，寨中已断粮三日了……”你决定：',
    choices: [
      { label: '施舍粮米（花 40 通宝，天命 +25）', effect: { type: 'trade', tongbaoCost: 40, destinyGain: 25 }, resultText: '你买下粮车分给难民，众人跪地叩首，口称恩公。' },
      { label: '征其劳役（通宝 +20，天命 -15）', effect: { type: 'tongbao_and_destiny', tongbao: 20, destiny: -15 }, resultText: '你吆喝一声：“想吃饭？干活来！”难民们默默拿起工具为你修路搬运，你隐隐觉得不妥。' },
      { label: '视而不见', effect: { type: 'none' }, resultText: '你目不斜视地走过村寨，背后传来低低的啜泣声。' },
    ],
  },
  {
    id: 'guzhanchang_yizhi',
    title: '古战场遗址',
    pool: 'uncommon',
    floors: [10, 36],
    trigger: [],
    oncePerRun: true,
    description: '荒坡上白骨累累，折断的旌旗斜插在泥土里，锈蚀的甲片散落一地——这是一处古战场。风过处，隐约有呜咽声。你决定：',
    choices: [
      { label: '仔细搜寻（通宝 +25~45）', effect: { type: 'tongbao', amount: 25, amountMax: 45 }, resultText: '你在尸骨与残骸间翻找，摸出几件还能变卖的古物。' },
      { label: '披上故甲（气数上限 +600）', effect: { type: 'vitality_max_up', amount: 600 }, resultText: '你拾起那件还算完好的皮甲，抖落尘土披在身上。甲胄虽旧，却透着战场上的杀伐之气，你只觉浑身是劲。' },
      { label: '祭拜亡魂（天命 +10）', effect: { type: 'destiny', amount: 10 }, resultText: '你捡起断旗，插在土丘上，郑重三拜：“诸位英魂，安息吧。”风忽然静了。' },
    ],
  },
  {
    id: 'shiji_duma',
    title: '市集赌马',
    pool: 'uncommon',
    floors: [1, 36],
    trigger: [{ type: 'tongbao_gte', amount: 60 }],
    oncePerRun: true,
    description: '路过一处热闹的市集，正中围着一圈人，一个相马翁牵着一黑一白两匹骏马高声吆喝：“押对了，十倍奉还！押错了，血本无归！”你决定：',
    choices: [
      { label: '押注赛马（花 40 通宝，40% 得 100）', effect: { type: 'gamble', tongbaoCost: 40, winAmount: 100, winChance: 0.4 }, resultText: '你拍出 40 通宝押在黑马身上。哨响马奔——黑马四蹄翻飞，一马当先冲过终点！' },
      { label: '离开', effect: { type: 'none' }, resultText: '你摇了摇头，挤出了人堆。' },
    ],
  },

  // ───────────────────────── 凤毛麟角（5%）─────────────────────────
  {
    id: 'chibi_yifeng',
    title: '赤壁遗风',
    pool: 'rare',
    floors: [1, 36],
    trigger: [{ type: 'or', items: [{ type: 'has_character', characterId: 'zhouyu' }, { type: 'floor_gte', floor: 19 }] }],
    oncePerRun: true,
    description: '江风猎猎，断崖上立着一块斑驳的古碑，碑文记载着多年前那场惊天动地的大火。江面上仿佛还浮着当年的船骸。你凭栏而望，心潮起伏。你决定：',
    choices: [
      {
        label: '凭吊古战场（气数上限 +1200）',
        effect: { type: 'vitality_max_up', amount: 1200, amountIfHasCharacter: { characterId: 'zhouyu', amount: 2000 } },
        resultText: '你望着浩浩江流，遥想当年烈焰焚江的壮景，胸中豪气陡生。',
      },
      { label: '检拾断戟（随机卜辞）', effect: { type: 'buci' }, resultText: '你在崖下滩涂间拾得半截锈断戟，戟身隐约有铭文。' },
      { label: '离开', effect: { type: 'none' }, resultText: '江风萧瑟，你紧了紧衣襟，转身离去。' },
    ],
  },
  {
    id: 'woxin_changdan',
    title: '卧薪尝胆',
    pool: 'rare',
    floors: [19, 36],
    trigger: [{ type: 'destiny_lte', amount: 50 }],
    oncePerRun: true,
    description: '荒山上一座破败的越国旧祠，祠中悬着一只苦胆。相传昔年有人败于敌国，在此卧薪尝胆、忍辱负重，终成大事。你看着那只胆，想起自己如今的处境。你决定：',
    choices: [
      { label: '置胆于座，日日自励（气数上限 +1500）', effect: { type: 'vitality_max_up', amount: 1500 }, resultText: '你取下苦胆挂在腰间，命人日日为你悬挂提醒。此仇此辱，终须偿还！' },
      { label: '尝胆明志（天命 +25）', effect: { type: 'destiny', amount: 25 }, resultText: '你咬破苦胆，苦涩之味直冲脑门，却也激得你浑身一振——这点苦，算得了什么？' },
      { label: '离开', effect: { type: 'none' }, resultText: '你对着旧祠拱了拱手，转身离去。' },
    ],
  },
  {
    id: 'gaoshan_liushui',
    title: '高山流水',
    pool: 'rare',
    floors: [1, 36],
    trigger: [{ type: 'buci_count_gte', count: 1 }],
    oncePerRun: true,
    description: '山涧叮咚，一个樵夫打扮的汉子坐在溪边石上，抱着一架七弦琴，正闭目抚琴。琴声悠扬，与流水相和。你听了一会儿，竟觉心旷神怡。你决定：',
    choices: [
      { label: '席地抚琴（天命 +20）', effect: { type: 'destiny', amount: 20 }, resultText: '你盘膝而坐，待他曲罢，抚掌赞叹：“此曲只应天上有！”樵夫睁开眼，笑道：“知音难得，请受我一拜。”' },
      { label: '求教乐理（随机卜辞）', effect: { type: 'buci' }, resultText: '你上前请教琴艺，樵夫欣然指点，末了赠你一支卦签：“音律与卦理相通，阁下悟性不差。”' },
      { label: '离开', effect: { type: 'none' }, resultText: '琴声入耳，你静立片刻便告辞离去。' },
    ],
  },
  {
    id: 'taoyuan_jieyi',
    title: '桃园结义',
    pool: 'rare',
    floors: [1, 36],
    trigger: [{ type: 'or', items: [{ type: 'has_character', characterId: 'zhangfei' }, { type: 'has_character', characterId: 'guanyu' }] }],
    oncePerRun: true,
    description: '暮春时节，一片桃林花开正盛。林中设着香案，两个汉子正在对天盟誓：“不求同年同月同日生，但求同年同月同日死！”你认出了他们——是你队伍中的故人。你决定：',
    choices: [
      {
        label: '一同结义（气数上限 +1500）',
        effect: { type: 'vitality_max_up', amount: 1500, amountIfHasBothCharacters: { characterIds: ['zhangfei', 'guanyu'], amount: 2500 } },
        resultText: '你走上前，与二人并肩跪在香案前，歃血为盟。桃瓣纷落，三人的心紧紧连在了一起。',
      },
      { label: '赠礼祝贺（花 30 通宝，天命 +15）', effect: { type: 'trade', tongbaoCost: 30, destinyGain: 15 }, resultText: '你奉上礼金为二人贺喜：“两位义薄云天，在下敬服！”二人抱拳称谢。' },
      { label: '离开', effect: { type: 'none' }, resultText: '你远远望着桃林中的香案，心中一动，终究没有上前。' },
    ],
  },

  // ───────────────────────── 旷古罕见（1%）─────────────────────────
  {
    id: 'diaoyu_laosou',
    title: '钓鱼老叟',
    pool: 'legendary',
    floors: [1, 36],
    trigger: [{ type: 'not_has_character', characterId: 'jiangshang' }],
    oncePerRun: true,
    description: '渭水之边，一个老叟正在垂钓。你见那钩距离水面三尺，还没有鱼饵，不禁心生疑惑。你决定：',
    choices: [
      { label: '询问老叟缘由（气数上限 +2000）', effect: { type: 'vitality_max_up', amount: 2000 }, resultText: '老叟笑道：“我非钓鱼，为钓王侯。”你似有所悟，气数上限增加 2000。' },
      {
        label: '虚心请教老叟',
        effect: {
          type: 'conditional',
          if: { kind: 'or', items: [{ kind: 'floor_above', floor: 27 }, { kind: 'buci_has', buciId: 'hex_qian_wei_tian' }] },
          then: { type: 'recruit_character', characterId: 'jiangshang' },
          else: { type: 'none' },
          elseText: '老叟道：“区区小鱼，莫来叨扰！”',
        },
        resultText: '你上前虚心请教。',
      },
      { label: '在旁边一起钓鱼（随机卜辞）', effect: { type: 'buci' }, resultText: '你坐到老叟身旁，学着抛竿。日暮时分收竿，你竟从水中捞起一支竹简，上书卦辞。' },
    ],
  },
  {
    id: 'wujiangting_bawang',
    title: '乌江亭·霸王',
    pool: 'legendary',
    floors: [19, 36],
    trigger: [{ type: 'not_has_character', characterId: 'xiangyu' }],
    oncePerRun: true,
    description: '乌江亭畔，暮色四合。江边立着一尊伟岸的身影，玄甲残破，腰间佩剑——你认出了他，西楚霸王项羽。四面楚歌之夜，他正望着滚滚江水，似要渡江东归。你决定：',
    choices: [
      { label: '请霸王同行（获得角色：项羽）', effect: { type: 'recruit_character', characterId: 'xiangyu' }, resultText: '你上前抱拳：“霸王若肯同行，天下可期！”项羽回头，目光如电，半晌，他大笑一声：“好！便随你走这一遭！”' },
      { label: '受其赠枪（气数上限 +2500）', effect: { type: 'vitality_max_up', amount: 2500 }, resultText: '项羽解下背后的长枪掷给你：“霸王枪传你，莫堕了我西楚威名！”你接枪在手，势沉如山。' },
      { label: '告辞', effect: { type: 'none' }, resultText: '你远远一揖：“霸王保重。”项羽望着江水，没有回头。' },
    ],
  },
];

/** 池边界：旷古罕见 <1，凤毛麟角 <6，可遇难求 <21，其余稀松平常 */
const POOL_ORDER_BY_ROLL: EventPool[][] = [
  ['legendary', 'rare', 'uncommon', 'common'],
  ['rare', 'uncommon', 'common'],
  ['uncommon', 'common'],
  ['common'],
];

function floorInRange(floor: number, floors: [number, number]): boolean {
  return floor >= floors[0] && floor <= floors[1];
}

function triggerMet(run: RunState, trigger: TriggerCondition): boolean {
  switch (trigger.type) {
    case 'has_character':
      return run.roster.includes(trigger.characterId);
    case 'not_has_character':
      return !run.roster.includes(trigger.characterId);
    case 'floor_gte':
      return run.floor >= trigger.floor;
    case 'tongbao_gte':
      return run.tongbao >= trigger.amount;
    case 'destiny_lte':
      return run.destiny <= trigger.amount;
    case 'buci_has':
      return run.buciCards.some((c) => c.id === trigger.buciId);
    case 'buci_count_gte':
      return run.buciCards.length >= trigger.count;
    case 'roster_count_gte':
      return run.roster.length >= trigger.count;
    case 'roster_count_lt':
      return run.roster.length < trigger.count;
    case 'or':
      return trigger.items.some((t) => triggerMet(run, t));
  }
}

function eventEligible(run: RunState, event: GameEvent): boolean {
  return (
    floorInRange(run.floor, event.floors)
    && event.trigger.every((t) => triggerMet(run, t))
    && !(event.oncePerRun && (run.eventsTriggered ?? []).includes(event.id))
  );
}

/**
 * 事件抽取（v2）：先按概率掷池 → 池内过滤符合条件的事件 → 随机取一；
 * 候选为空则向低一级池降级；全部为空则无视条件兜底，保证事件节点不空转。
 */
export function rollEvent(run: RunState, rng: () => number): GameEvent {
  const roll = rng() * 100;
  const order = roll < 1 ? POOL_ORDER_BY_ROLL[0]!
    : roll < 6 ? POOL_ORDER_BY_ROLL[1]!
    : roll < 21 ? POOL_ORDER_BY_ROLL[2]!
    : POOL_ORDER_BY_ROLL[3]!;

  for (const pool of order) {
    const candidates = GAME_EVENTS.filter((e) => e.pool === pool && eventEligible(run, e));
    if (candidates.length > 0) {
      return candidates[Math.floor(rng() * candidates.length)]!;
    }
  }
  return GAME_EVENTS[Math.floor(rng() * GAME_EVENTS.length)]!;
}

/** 每局唯一标记：可遇难求及以上事件触发后写入，后续抽取自动排除 */
function markEventTriggered(run: RunState, event: GameEvent): void {
  if (!event.oncePerRun) return;
  if (!run.eventsTriggered) run.eventsTriggered = [];
  if (!run.eventsTriggered.includes(event.id)) {
    run.eventsTriggered.push(event.id);
  }
}

function clampDestiny(run: RunState): void {
  run.destiny = Math.max(0, Math.min(run.destinyMax, run.destiny));
}

function clampTongbao(run: RunState): void {
  run.tongbao = Math.max(0, run.tongbao);
}

function gainRandomBuci(run: RunState, rng: () => number): string {
  const entry = HEXAGRAM_CATALOG[Math.floor(rng() * HEXAGRAM_CATALOG.length)]!;
  const added = addBuciToBar(run, { ...entry.buci, count: 1 });
  if (!added) {
    return ''; // 卜辞栏满格且无同卦可堆叠
  }
  return entry.buci.name;
}

/**
 * 是否属于「非负面」事件选项（用于泽地萃：事件选择非负面选项时额外回 8 天命）。
 * 奖励/招募/增益类视为非负面；代价/风险/赌博/战斗类不算。
 */
function isBeneficialChoice(effect: EventEffect): boolean {
  switch (effect.type) {
    case 'destiny':
      return effect.amount >= 0;
    case 'tongbao':
      return effect.amount >= 0;
    case 'tongbao_and_destiny':
      return effect.tongbao >= 0 && effect.destiny >= 0;
    case 'trade':
    case 'buci':
    case 'recruit':
    case 'recruit_character':
    case 'vitality_max_up':
    case 'battle_with_reward':
      return true;
    default:
      return false;
  }
}

/**
 * 递归结算一个选项效果（conditional 会按当前状态二选一）。
 * 外层包装：泽地萃（非负面选项额外回天命）——内层负责具体的成本/扣减/通宝卦象修正。
 */
function resolveEffect(run: RunState, effect: EventEffect, rng: () => number): { description: string; success?: boolean; shopItem?: ShopItem; startBattle?: boolean } {
  const goodNote = isBeneficialChoice(effect) ? triggerHealOnGoodEvent(run) : null;
  const result = resolveEffectInner(run, effect, rng);
  if (goodNote !== null) {
    result.description = `${result.description} ${goodNote}`;
  }
  return result;
}

/** 事件卦象修正 + 原结算（雷水解减半 / 山水蒙抵挡天命扣减 / 雷火丰通宝翻倍） */
function resolveEffectInner(run: RunState, effect: EventEffect, rng: () => number): { description: string; success?: boolean; shopItem?: ShopItem; startBattle?: boolean } {
  switch (effect.type) {
    case 'none':
      return { description: '你没有停留，继续赶路。' };

    case 'tongbao': {
      let amount = effect.amountMax !== undefined
        ? effect.amount + Math.floor(rng() * (effect.amountMax - effect.amount + 1))
        : effect.amount;
      if (amount > 0) amount = applyEventTongbaoMult(run, amount); // 雷火丰：事件通宝奖励翻倍（一次）
      run.tongbao += amount;
      clampTongbao(run);
      return { description: amount >= 0 ? `获得 ${amount} 通宝。` : `损失 ${-amount} 通宝。` };
    }

    case 'destiny': {
      let amount = effect.amount;
      if (amount < 0 && blockEventDestinyLoss(run)) amount = 0; // 山水蒙：抵挡一次事件天命扣减
      run.destiny += amount;
      clampDestiny(run);
      return {
        description: effect.amount >= 0
          ? `天命恢复 ${effect.amount} 点。`
          : amount === 0
            ? '山水蒙显灵，天命未损。'
            : `天命损失 ${-amount} 点。`,
      };
    }

    case 'tongbao_with_risk': {
      let amount = effect.amount + Math.floor(rng() * (effect.amountMax - effect.amount + 1));
      if (amount > 0) amount = applyEventTongbaoMult(run, amount); // 雷火丰
      run.tongbao += amount;
      clampTongbao(run);
      if (rng() < effect.riskChance) {
        const riskDestiny = effect.riskDestiny < 0 && blockEventDestinyLoss(run) ? 0 : effect.riskDestiny; // 山水蒙
        run.destiny += riskDestiny;
        clampDestiny(run);
        return { description: `翻出 ${amount} 通宝，却被毒蛇咬伤（天命 ${riskDestiny}）。` };
      }
      return { description: `获得 ${amount} 通宝。` };
    }

    case 'destiny_random': {
      const cost = applyEventCostHalf(run, effect.cost); // 雷水解：事件代价减半（一次）
      if (run.tongbao < cost) {
        return { description: '通宝不足，卦钱付不起。', success: false };
      }
      run.tongbao -= cost;
      if (rng() < effect.winChance) {
        run.destiny += effect.win;
        clampDestiny(run);
        return { description: `大吉大利！（天命 +${effect.win}）` };
      }
      const lose = effect.lose < 0 && blockEventDestinyLoss(run) ? 0 : effect.lose; // 山水蒙
      run.destiny += lose;
      clampDestiny(run);
      return { description: `先生摇头叹息：“此路凶险，客官小心。”（天命 ${lose}）` };
    }

    case 'buy_buci': {
      const cost = applyEventCostHalf(run, effect.cost); // 雷水解
      if (run.tongbao < cost) {
        return { description: `通宝不足（需 ${cost}）。`, success: false };
      }
      run.tongbao -= cost;
      const name = gainRandomBuci(run, rng);
      if (name === '') {
        run.tongbao += cost; // 卜辞栏满且无同卦可堆叠：退还卦钱
        return { description: '卜辞栏已满，无卦可放，卦钱退还。' };
      }
      return { description: `花 ${cost} 通宝，获得卜辞【${name}】。` };
    }

    case 'tongbao_and_destiny': {
      const tongbao = effect.tongbao > 0 ? applyEventTongbaoMult(run, effect.tongbao) : effect.tongbao; // 雷火丰
      const destiny = effect.destiny < 0 && blockEventDestinyLoss(run) ? 0 : effect.destiny; // 山水蒙
      run.tongbao += tongbao;
      clampTongbao(run);
      run.destiny += destiny;
      clampDestiny(run);
      return {
        description: `通宝 +${tongbao}，天命 ${destiny >= 0 ? '+' : ''}${destiny}。`,
      };
    }

    case 'buci': {
      const name = gainRandomBuci(run, rng);
      if (name === '') {
        return { description: '卜辞栏已满，卦象无处安放。' };
      }
      return { description: `获得卜辞【${name}】。` };
    }

    case 'battle':
      return { description: '准备战斗！', startBattle: true };

    case 'battle_with_reward': {
      run.pendingEventBattleReward = effect.reward;
      return { description: `准备战斗！胜利后额外获得 ${effect.reward} 通宝。`, startBattle: true };
    }

    case 'recruit': {
      const unrecruited = PLAYER_CHARACTER_LIST.filter((c) => !run.roster.includes(c.id));
      const first = unrecruited[Math.floor(rng() * unrecruited.length)];
      if (!first) {
        return { description: '已没有可招募的角色。', success: false };
      }
      const shopItem: ShopItem = {
        kind: 'character',
        characterId: first.id,
        price: Math.ceil(characterPrice(first.id) * effect.discount),
      };
      return { description: `武士愿以 ${shopItem.price} 通宝的折价为【${first.name}】引荐随行。`, shopItem };
    }

    case 'recruit_character': {
      if (run.roster.includes(effect.characterId)) {
        return { description: '此人已在队伍中。' };
      }
      if (run.roster.length >= ROSTER_MAX) {
        run.tongbao += 50;
        clampTongbao(run);
        return { description: '队伍已满，对方赠你盘缠（通宝 +50）。' };
      }
      run.roster.push(effect.characterId);
      const name = PLAYER_CHARACTER_LIST.find((c) => c.id === effect.characterId)?.name ?? effect.characterId;
      return { description: `获得角色：${name}！` };
    }

    case 'trade': {
      const cost = applyEventCostHalf(run, effect.tongbaoCost); // 雷水解
      if (run.tongbao < cost) {
        return { description: '通宝不足，交易作罢。', success: false };
      }
      run.tongbao -= cost;
      run.destiny += effect.destinyGain;
      clampDestiny(run);
      return { description: `以 ${cost} 通宝换得 ${effect.destinyGain} 点天命。` };
    }

    case 'gamble': {
      const cost = applyEventCostHalf(run, effect.tongbaoCost); // 雷水解
      if (run.tongbao < cost) {
        return { description: '通宝不足，无法下注。', success: false };
      }
      run.tongbao -= cost;
      if (rng() < effect.winChance) {
        run.tongbao += effect.winAmount;
        return { description: `赌赢了！获得 ${effect.winAmount} 通宝。` };
      }
      return { description: '赌输了，血本无归。' };
    }

    case 'vitality_max_up': {
      let amount = effect.amount;
      let note = '';
      if (effect.amountIfHasCharacter && run.roster.includes(effect.amountIfHasCharacter.characterId)) {
        amount = effect.amountIfHasCharacter.amount;
        note = ' 众人气势大振，加成提高！';
      } else if (
        effect.amountIfHasBothCharacters
        && effect.amountIfHasBothCharacters.characterIds.every((id) => run.roster.includes(id))
      ) {
        amount = effect.amountIfHasBothCharacters.amount;
        note = ' 三人同心，义薄云天！';
      }
      run.vitalityMaxBoost = (run.vitalityMaxBoost ?? 0) + amount;
      return { description: `气数上限增加 ${amount}。${note}` };
    }

    case 'conditional': {
      if (evalCondition(run, effect.if)) {
        return resolveEffect(run, effect.then, rng);
      }
      if (effect.elseText !== undefined) {
        return { description: effect.elseText };
      }
      return resolveEffect(run, effect.else, rng);
    }
  }
}

function evalCondition(run: RunState, cond: ConditionSpec): boolean {
  switch (cond.kind) {
    case 'floor_above':
      return run.floor > cond.floor;
    case 'buci_has':
      return run.buciCards.some((c) => c.id === cond.buciId);
    case 'has_character':
      return run.roster.includes(cond.characterId);
    case 'has_all_characters':
      return cond.characterIds.every((id) => run.roster.includes(id));
    case 'or':
      return cond.items.some((c) => evalCondition(run, c));
    case 'and':
      return cond.items.every((c) => evalCondition(run, c));
  }
}

/**
 * 应用事件选项并结算效果。
 * - 通宝不为负、天命在 [0, destinyMax]；
 * - 资源不足时返回 success: false 且状态不变；
 * - 每局唯一事件在结算时写入 eventsTriggered。
 */
export function applyEventChoice(run: RunState, event: GameEvent, choiceIdx: number, rng: () => number): EventResult {
  const choice = event.choices[choiceIdx];
  if (!choice) {
    return { success: false, description: '无效的选择。' };
  }
  markEventTriggered(run, event);
  const resolved = resolveEffect(run, choice.effect, rng);
  return {
    success: resolved.success ?? true,
    description: choice.resultText !== undefined
      ? `${choice.resultText} ${resolved.description}`
      : resolved.description,
    startBattle: resolved.startBattle,
    shopItem: resolved.shopItem,
  };
}