import type { BattleState, HandPattern, HandType } from '../models/BattleTypes';
import type { Card } from '../models/Card';

export enum SkillTiming {
  ON_PLAY = 'on_play',
  /** 玩家选择不出（放弃响应）后触发，如吕不韦「居奇」 */
  ON_PASS = 'on_pass',
  ON_COEFFICIENT_REVEALED = 'on_coefficient_revealed',
  ON_DAMAGE_MULTIPLIER_REVEALED = 'on_damage_multiplier_revealed',
  ON_DAMAGE_CALCULATED = 'on_damage_calculated',
  ON_SINGLE_CARD_SETTLEMENT = 'on_single_card_settlement',
  AFTER_DAMAGE = 'after_damage',
  ON_GAIN_TURN = 'on_gain_turn',
  ON_TURN_START = 'on_turn_start',
  PASSIVE_MODIFIER = 'passive_modifier',
  HAND_VALIDATION = 'hand_validation',
  AFTER_HEALTH_DECREASE = 'after_health_decrease',
  AFTER_SINGLE_CARD_SETTLEMENT = 'after_single_card_settlement',
  /** 玩家手牌打空后补满到上限的那一刻触发（玩家侧专用；敌方摸满不触发） */
  ON_HAND_REFILLED = 'on_hand_refilled',
  /** 所有牌伤害累加完成后、系数亮出之前，整次结算触发一次（孙膑「减灶」加成） */
  ON_DAMAGE_ACCUMULATED = 'on_damage_accumulated',
  /** 敌方选择不出、一圈结束且伤害结算完成后触发（姜尚「垂钓」） */
  ON_ENEMY_PASS = 'on_enemy_pass',
}

export interface SkillContext {
  gameScene: Phaser.Scene;
  battle: BattleState;
  sourceCharacterId: string;
  pattern?: HandPattern;
  target?: 'enemy' | 'player';
  isEmptyHand?: boolean;
  damageInfo?: {
    sumRanks: number;
    coefficient: number;
    baseCoefficient: number;
    damageMultiplier: number;
    finalDamage: number;
  };
  playerCharacterIds: string[];
  enemyCharacterId?: string;
  /**
   * 当前一圈敌方打出的所有牌（ON_ENEMY_PASS 时填充；含临时牌，技能侧自行过滤）。
   * 每圈结束（结算完成清桌时）由 BattleFlowManager 清空。
   */
  roundEnemyCards?: Card[];
  centerCardContainers?: Phaser.GameObjects.Container[];
  playedCards?: Card[];
  /**
   * 单牌伤害结算时（ON_SINGLE_CARD_SETTLEMENT）的当前结算牌信息。
   * GameScene 在 stage1 逐牌揭示时填充；技能通过设置 scoreBonus 增加该牌计分，
   * GameScene 在技能返回后将其累加进 sumRanks 与计数器。
   */
  singleCard?: {
    card: Phaser.GameObjects.Container;
    scoreText: Phaser.GameObjects.Text;
    baseScore: number;
    scoreBonus: number;
  };
  /**
   * 单牌伤害结算时的中央累计伤害计数器文本（stage1 中逐牌累加）。
   * 结算类技能（如周处「励心」在 AFTER_SINGLE_CARD_SETTLEMENT）可读取/改写它。
   */
  damageCounterText?: Phaser.GameObjects.Text;
  aiScoreContext?: {
    play: HandPattern;
    hand: Card[];
    isFollow: boolean;
    lastPlay: HandPattern | null;
    currentScore: number;
  };
  coefficientLabel?: Phaser.GameObjects.Text;
  multiplierLabel?: Phaser.GameObjects.Text;
  handValidation?: {
    hand: Card[];
    candidateCards: Card[];
    basePattern: HandPattern | null;
    additionalPatterns: HandPattern[];
  };
}

export type SkillFilter = (context: SkillContext) => boolean;

export type SkillExecutor = (
  context: SkillContext,
  visuals: SkillVisualManager,
) => Promise<void>;

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  timing: SkillTiming;
  priority?: number;
  dialogLines?: string[];
  filter: SkillFilter;
  execute: SkillExecutor;
  onAIDecision?: AIDecisionHook;
}

export interface PassiveSkill {
  id: string;
  name: string;
  description: string;
  modifier: PassiveModifier;
}

export type PassiveModifier =
  | DamageModifier
  | HandRuleModifier
  | ResponseBlockModifier;

export interface ResponseBlockModifier {
  type: 'response_block';
  getBlockedTypes: (ctx: ResponseBlockContext) => HandType[];
}

export interface ResponseBlockContext {
  lastPlay: HandPattern;
}

export interface DamageModifier {
  type: 'damage';
  apply: (context: PassiveDamageContext) => PassiveDamageContext;
}

export interface PassiveDamageContext {
  sumRanks: number;
  coefficient: number;
  baseCoefficient: number;
  finalDamage: number;
  cards: Card[];
  target: 'enemy' | 'player';
}

export interface HandRuleModifier {
  type: 'hand_rule';
  apply: (context: HandRuleContext) => HandRuleResult;
}

export interface HandRuleContext {
  hand: Card[];
  enemyCharacterId?: string;
}

export interface HandRuleResult {
  revealedCount: number;
}

export interface SkillVisualManager {
  animateCardScale(
    cards: Phaser.GameObjects.Container | Phaser.GameObjects.Container[],
    scaleTo?: number,
    duration?: number,
  ): void;
  showHeal(target: 'player' | 'enemy', amount: number): void;
  playSkillTriggerSound(): void;
  playSfx(key: string): void;
  getScene(): Phaser.Scene;
  cancelDamageSettlement(gainTurn?: boolean): void;
  /**
   * 更新角色框左上角标记区的标记数量（仅带标记技能的角色有此区域）。
   */
  updateMarker(characterId: string, count: number): void;
  /**
   * 标记角色失去角色牌：角色框头像变灰、技能不再触发。
   */
  markCharacterLost(characterId: string): void;
  /**
   * 显示角色对话框台词（指定文本，非随机 dialogLines）。
   * 用于技能需要按情境显示特定台词（如包拯「铁断」按牌面区分铡刀台词）。
   */
  showDialog(characterId: string, text: string): void;
}

export interface CharacterSlotManager {
  glowOn(characterId: string): Promise<void>;
  glowOff(characterId: string): Promise<void>;
  moveToFront(characterId: string): Promise<void>;
  shakeAndPulse(characterId: string): Promise<void>;
  restoreSlot(characterId: string): Promise<void>;
  isPlayerCharacter(characterId: string): boolean;
  getCharacterOrder(characterId: string): number;
  showDialog(characterId: string, text: string): void;
}

export interface AIDecisionContext {
  hand: Card[];
  battleState: BattleState;
  lastPlay: HandPattern | null;
  isFollow: boolean;
}

export type AIDecisionHook = (
  plays: { play: HandPattern; score: number }[],
  ctx: AIDecisionContext,
) => void;

export interface ActiveSkillSceneAccess {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  getBattle(): BattleState;
  renderPlayerHandAfterSkill(): void;
  /**
   * 按当前战斗状态重新注册主动技（如周处「除害」失去技能后调用，按钮随即消失）。
   */
  initActiveSkills(): void;
}

export interface ActiveSkillDefinition {
  id: string;
  name: string;
  description: string;
  maxUses: number;
  cardFilter: (selectedCards: Card[]) => boolean;
  execute: (scene: Phaser.Scene & ActiveSkillSceneAccess, selectedCards: Card[]) => Promise<void>;
  ownerCharacterId: string;
  /**
   * 发动时随机显示的对话气泡台词（与触发技 dialogLines 机制一致，
   * 由 ActiveSkillManager 在 execute 前随机取一句显示）。
   */
  dialogLines?: string[];
  /**
   * 无需选中牌即可发动（默认 false）。为 true 时，即使未选中任何牌，
   * 只要 `canUseWithoutSelection`（若有）通过也会显示技能按钮。
   */
  requiresSelection?: boolean;
  /**
   * 无需选牌时判定可否发动（需访问 scene 手牌等）。不提供则视为可发动。
   * 仅在 `requiresSelection: true` 之外的未选牌场景使用。
   */
  canUseWithoutSelection?: (scene: Phaser.Scene & ActiveSkillSceneAccess) => boolean;
  /**
   * 选中牌时判定可否发动（需访问 scene 状态，如项羽「破釜」检查气数足够）。
   * cardFilter 只接收 selectedCards 无法访问 scene，此钩子在 cardFilter 通过后叠加检查；
   * 返回 false 则技能按钮不显示（也不会在点击时消耗次数）。
   */
  canUseWithSelection?: (
    scene: Phaser.Scene & ActiveSkillSceneAccess,
    selectedCards: Card[],
  ) => boolean;
  /**
   * 次数重置时机：默认（false/缺省）在玩家「获得牌权」时重置（每次获得牌权限一次，
   * 如筹策、圆周、除害）；true 时改为在玩家「失去牌权」（对方获得牌权）时重置
   * （如张居正「改制」——描述明确"失去牌权后重置"）。
   */
  resetOnLostTurn?: boolean;
}
