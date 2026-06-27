import type { BattleState, HandPattern, HandType } from '../models/BattleTypes';
import type { Card } from '../models/Card';

export enum SkillTiming {
  ON_PLAY = 'on_play',
  ON_COEFFICIENT_REVEALED = 'on_coefficient_revealed',
  ON_DAMAGE_MULTIPLIER_REVEALED = 'on_damage_multiplier_revealed',
  ON_DAMAGE_CALCULATED = 'on_damage_calculated',
  ON_SINGLE_CARD_SETTLEMENT = 'on_single_card_settlement',
  AFTER_DAMAGE = 'after_damage',
  ON_GAIN_TURN = 'on_gain_turn',
  ON_TURN_START = 'on_turn_start',
  ON_AI_SCORE = 'on_ai_score',
  PASSIVE_MODIFIER = 'passive_modifier',
  HAND_VALIDATION = 'hand_validation',
  AFTER_HEALTH_DECREASE = 'after_health_decrease',
  AFTER_SINGLE_CARD_SETTLEMENT = 'after_single_card_settlement',
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
  cancelDamageSettlement(): void;
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

export interface ActiveSkillSceneAccess {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  getBattle(): BattleState;
  renderPlayerHandAfterSkill(): void;
}

export interface ActiveSkillDefinition {
  id: string;
  name: string;
  description: string;
  maxUses: number;
  cardFilter: (selectedCards: Card[]) => boolean;
  execute: (scene: Phaser.Scene, selectedCards: Card[]) => Promise<void>;
  ownerCharacterId: string;
}
