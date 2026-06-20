import type { BattleState, HandPattern } from '../models/BattleTypes';
import type { Card } from '../models/Card';

export enum SkillTiming {
  ON_PLAY = 'on_play',
  ON_COEFFICIENT_REVEALED = 'on_coefficient_revealed',
  ON_DAMAGE_CALCULATED = 'on_damage_calculated',
  AFTER_DAMAGE = 'after_damage',
  ON_GAIN_TURN = 'on_gain_turn',
  ON_TURN_START = 'on_turn_start',
  ON_AI_SCORE = 'on_ai_score',
  PASSIVE_MODIFIER = 'passive_modifier',
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
    finalDamage: number;
  };
  playerCharacterIds: string[];
  enemyCharacterId?: string;
  centerCardContainers?: Phaser.GameObjects.Container[];
  playedCards?: Card[];
  aiScoreContext?: {
    play: HandPattern;
    hand: Card[];
    isFollow: boolean;
    lastPlay: HandPattern | null;
    currentScore: number;
  };
  coefficientLabel?: Phaser.GameObjects.Text;
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
  | HandRuleModifier;

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
}

export interface CharacterSlotManager {
  glowOn(characterId: string): Promise<void>;
  glowOff(characterId: string): Promise<void>;
  moveToFront(characterId: string): Promise<void>;
  restoreSlot(characterId: string): Promise<void>;
  isPlayerCharacter(characterId: string): boolean;
}
