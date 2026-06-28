import type Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { cardDisplayName } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS } from '../../models/BattleTypes';
import { identifyHand, canBeat, findAllPlays, findBeatingPlays } from '../../engine/HandRecognizer';
import { canBeatOrEqual } from '../../engine/CharacterAbilities';
import { getBlockedResponseTypes } from '../../skills/PassiveSkillUtils';
import type { SkillRunner } from '../../skills/SkillRunner';
import type { SkillContext } from '../../skills/SkillTypes';
import type { PlayerCharacterId } from '../../models/Character';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export interface PatternHintHost {
  battle: BattleState;
  phase: GamePhase;
  patternHintText: Phaser.GameObjects.Text;
  playerCharacterIds: PlayerCharacterId[];
  getSelectedCards(): Card[];
}

export class PatternHintManager {
  private host: PatternHintHost;
  private scene: Phaser.Scene;
  private skillRunner: SkillRunner;

  constructor(host: PatternHintHost & Phaser.Scene, skillRunner: SkillRunner) {
    this.host = host;
    this.scene = host;
    this.skillRunner = skillRunner;
  }

  updatePatternHint(): void {
    const selected = this.host.getSelectedCards();
    if (selected.length === 0) {
      this.host.patternHintText.setText('');
      return;
    }

    const pattern = identifyHand(selected);
    if (pattern) {
      this.showPatternHint(pattern, selected, false);
    } else {
      this.host.patternHintText.setText('无效牌型');
      this.host.patternHintText.setColor('#a04040');
      this.checkHandValidationHint(selected);
    }
  }

  playerHasPlayablePattern(): boolean {
    const hand = this.host.battle.player.hand;
    if (this.host.phase === 'player_init') {
      const allPlays = findAllPlays(hand);
      return allPlays.length > 0;
    }
    if (this.host.phase === 'player_respond' && this.host.battle.lastPlay) {
      let beatingPlays = findBeatingPlays(hand, this.host.battle.lastPlay);
      const blockedTypes = getBlockedResponseTypes(this.host.battle.enemyCharacterId, this.host.battle.lastPlay);
      if (blockedTypes.length > 0) {
        beatingPlays = beatingPlays.filter(p => !blockedTypes.includes(p.type));
      }
      return beatingPlays.length > 0;
    }
    return false;
  }

  private showPatternHint(pattern: HandPattern, selected: Card[], isChouSuan: boolean): void {
    const label = isChouSuan ? '顺子（筹算）' : HAND_TYPE_LABELS[pattern.type];
    const cardsStr = selected.map(c => cardDisplayName(c)).join('');

    if (this.host.battle.lastPlay && this.host.phase === 'player_respond') {
      const playerChar = this.host.battle.player.characterId;
      const canBeatPlay = playerChar === 'zhugeliang'
        ? canBeatOrEqual(pattern, this.host.battle.lastPlay)
        : canBeat(pattern, this.host.battle.lastPlay);
      if (!canBeatPlay) {
        this.host.patternHintText.setText(`${label} ${cardsStr}（打不过上家）`);
        this.host.patternHintText.setColor('#a08040');
        return;
      }
    }

    this.host.patternHintText.setText(`${label}: ${cardsStr}`);
    this.host.patternHintText.setColor('#b89050');
  }

  private async checkHandValidationHint(selected: Card[]): Promise<void> {
    const playerChar = this.host.battle.player.characterId;
    if (!playerChar) return;

    const ctx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: playerChar,
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      handValidation: {
        hand: this.host.battle.player.hand,
        candidateCards: selected,
        basePattern: null,
        additionalPatterns: [],
      },
    };
    const additionalPatterns = await this.skillRunner.modifyHandValidation(ctx);
    if (additionalPatterns.length > 0) {
      this.showPatternHint(additionalPatterns[0]!, selected, true);
    }
  }
}
