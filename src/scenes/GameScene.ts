import Phaser from 'phaser';
import type { Card} from '../models/Card';
import { createDeck, shuffleDeck, sortHand, resetCardIdCounter } from '../models/Card';
import type { BattleState, HandPattern} from '../models/BattleTypes';
import { GameAudioManager } from '../utils/GameAudioManager';
import type { PlayerCharacterId, EnemyCharacterId} from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS, ENEMY_CHARACTER_LIST, randomPlayerCharacter } from '../models/Character';
import { getCharacterEnemyName } from '../engine/CharacterAbilities';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, type SkillContext, type ActiveSkillDefinition } from '../skills';
import { clearPassiveSkills } from '../skills/PassiveSkillUtils';
import {
  FONT_FAMILY,
  DEPTH_BG, DEPTH_BG_BORDER, DEPTH_UI,
  DEPTH_CENTER_BASE, DEPTH_DAMAGE,
} from '../constants/Layout';
import { DragInputManager } from './managers/DragInputManager';
import { HealthBarManager } from './managers/HealthBarManager';
import { DamageSettlementManager } from './managers/DamageSettlementManager';
import { ModalManager } from './managers/ModalManager';
import { CardDisplayManager } from './managers/CardDisplayManager';
import { BattleFlowManager } from './managers/BattleFlowManager';
import { CharacterBarManager } from './managers/CharacterBarManager';
import { CharacterInfoManager } from './managers/CharacterInfoManager';
import { ActiveSkillManager } from './managers/ActiveSkillManager';
import { InfoBarManager } from './managers/InfoBarManager';
import { PatternHintManager } from './managers/PatternHintManager';
import { ButtonManager } from './managers/ButtonManager';
import { BgmManager } from './managers/BgmManager';

interface TestBattleConfig {
  selectedPlayerCharacterIds?: PlayerCharacterId[];
  enemyCharacterId?: EnemyCharacterId;
  playerVitality?: number;
  enemyVitality?: number;
}

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export class GameScene extends Phaser.Scene {
  battle!: BattleState;
  phase: GamePhase = 'player_init';

  selectedIndices: Set<number> = new Set();
  cardObjects: Phaser.GameObjects.Container[] = [];
  enemyCardObjects: Phaser.GameObjects.Container[] = [];

  playerVitalityBar!: Phaser.GameObjects.Graphics;
  enemyVitalityBar!: Phaser.GameObjects.Graphics;
  playerVitalityText!: Phaser.GameObjects.Text;
  enemyVitalityText!: Phaser.GameObjects.Text;
  playerDeckText!: Phaser.GameObjects.Text;
  enemyDeckText!: Phaser.GameObjects.Text;
  patternHintText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private thinkingText!: Phaser.GameObjects.Text;
  btnPlay!: Phaser.GameObjects.Container;
  btnPass!: Phaser.GameObjects.Container;
  btnPlayText!: Phaser.GameObjects.Text;
  btnPassText!: Phaser.GameObjects.Text;

  btnSkill: Phaser.GameObjects.Container | null = null;
  btnSkillText: Phaser.GameObjects.Text | null = null;
  skillDropdown: Phaser.GameObjects.Container | null = null;
  activeSkills: ActiveSkillDefinition[] = [];
  activeSkillUseCounts: Map<string, number> = new Map();
  activeSkillEligibleIds: string[] = [];
  currentActiveSkillId: string | null = null;

  enemyNameText!: Phaser.GameObjects.Text;
  enemyNameFrame!: Phaser.GameObjects.Graphics;
  playerNameText!: Phaser.GameObjects.Text;
  enemyAvatarImage!: Phaser.GameObjects.Image;
  enemyAvatarBorder!: Phaser.GameObjects.Graphics;

  private cardHandGroup!: Phaser.GameObjects.Container;
  private aiHandGroup!: Phaser.GameObjects.Container;

  centerCards: Phaser.GameObjects.Container[] = [];
  centerCardsOwner: 'player' | 'enemy' | null = null;
  centerDepthCounter = DEPTH_CENTER_BASE;

  revealedEnemyCards: Set<Card> = new Set();

  private bgmManager!: BgmManager;

  handPatternButton!: Phaser.GameObjects.Container;
  handPatternModal: Phaser.GameObjects.Container | null = null;

  settingsButton!: Phaser.GameObjects.Container;
  settingsPanel: Phaser.GameObjects.Container | null = null;
  volumeSettingsModal: Phaser.GameObjects.Container | null = null;
  returnConfirmModal: Phaser.GameObjects.Container | null = null;

  respondChainDepth: number = 0;
  damageSettlementCancelled: boolean = false;

  private testConfig: TestBattleConfig | null = null;
  playerCharacterIds: PlayerCharacterId[] = [];

  characterSlotContainers: Phaser.GameObjects.Container[] = [];
  characterSlotTexts: Phaser.GameObjects.Text[] = [];

  characterBarContainer: Phaser.GameObjects.Container | null = null;
  characterBarMaskShape: Phaser.GameObjects.Graphics | null = null;
  characterBarScrollX: number = 0;
  characterBarMaxScroll: number = 0;
  characterBarDragging: boolean = false;
  barDragStartPointerX: number = 0;
  barDragStartScrollX: number = 0;
  barDragPending: boolean = false;
  barDragMoved: boolean = false;

  skillTriggeredCharacters: Set<PlayerCharacterId> = new Set();
  characterSlotGlows: { innerGlow: Phaser.GameObjects.Graphics; midGlow: Phaser.GameObjects.Graphics; outerGlow: Phaser.GameObjects.Graphics; sweepGfx: Phaser.GameObjects.Graphics }[] = [];
  characterSlotGlowTweens: Map<number, Phaser.Tweens.Tween[]> = new Map();

  skillEventBus!: SkillEventBus;
  private skillRegistry!: SkillRegistry;
  skillRunner!: SkillRunner;

  private dragInputManager!: DragInputManager;
  private healthBarManager!: HealthBarManager;
  private damageSettlementManager!: DamageSettlementManager;
  private modalManager!: ModalManager;
  private cardDisplayManager!: CardDisplayManager;
  private battleFlowManager!: BattleFlowManager;
  private characterBarManager!: CharacterBarManager;
  private characterInfoManager!: CharacterInfoManager;
  private activeSkillManager!: ActiveSkillManager;
  private infoBarManager!: InfoBarManager;
  private patternHintManager!: PatternHintManager;
  private buttonManager!: ButtonManager;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: TestBattleConfig): void {
    if (data) {
      this.testConfig = data;
    } else {
      this.testConfig = null;
    }
  }

  /**
   * State Reset Pattern:
   * 将所有可变游戏状态重置为初始值。在 create() 最开始调用，
   * 确保每次进入场景时状态完全重建，消除场景重启时的残留状态。
   */
  private resetSceneState(): void {
    resetCardIdCounter();

    this.phase = 'player_init';
    this.selectedIndices = new Set();
    this.cardObjects = [];
    this.enemyCardObjects = [];
    this.centerCards = [];
    this.centerCardsOwner = null;
    this.centerDepthCounter = DEPTH_CENTER_BASE;

    this.bgmManager?.stopBattleBgm();

    this.handPatternModal?.destroy();
    this.handPatternModal = null;
    this.settingsPanel?.destroy();
    this.settingsPanel = null;
    this.volumeSettingsModal?.destroy();
    this.volumeSettingsModal = null;
    this.returnConfirmModal?.destroy();
    this.returnConfirmModal = null;

    this.respondChainDepth = 0;
    this.damageSettlementCancelled = false;
    this.playerCharacterIds = [];

    this.characterSlotContainers = [];
    this.characterSlotTexts = [];
    this.characterInfoManager?.destroy();
    this.skillTriggeredCharacters = new Set();
    this.characterSlotGlows = [];
    for (const [, tweens] of this.characterSlotGlowTweens) {
      for (const t of tweens) t.stop();
    }
    this.characterSlotGlowTweens = new Map();

    this.characterBarContainer = null;
    this.characterBarMaskShape = null;
    this.characterBarScrollX = 0;
    this.characterBarMaxScroll = 0;
    this.characterBarDragging = false;
    this.barDragStartPointerX = 0;
    this.barDragStartScrollX = 0;
    this.barDragPending = false;
    this.barDragMoved = false;

    this.skillEventBus?.clear();
    this.skillRegistry?.clear();
    clearPassiveSkills();

    this.revealedEnemyCards = new Set();

    this.btnSkill?.destroy();
    this.btnSkill = null;
    this.btnSkillText = null;
    this.skillDropdown?.destroy();
    this.skillDropdown = null;
    this.activeSkills = [];
    this.activeSkillUseCounts = new Map();
    this.activeSkillEligibleIds = [];
    this.currentActiveSkillId = null;

    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);
    this.createPatternHint(width, height);
    this.createTurnIndicator(width, height);

    this.battle = this.initBattle();

    this.characterInfoManager = new CharacterInfoManager(this);
    this.characterBarManager = new CharacterBarManager(this, this.characterInfoManager);
    this.infoBarManager = new InfoBarManager(this, this.characterInfoManager);
    this.infoBarManager.createInfoBars(width, height);
    this.createCharacterSlots(width, height);

    this.enemyNameText.setText(this.battle.enemy.name);
    this.playerNameText.setText(this.battle.player.name);
    const enemyCharId = this.battle.enemyCharacterId;
    if (enemyCharId) {
      this.enemyAvatarImage.setTexture(`char_${enemyCharId}`);
      this.enemyAvatarImage.setVisible(true);
      this.enemyAvatarBorder.setVisible(true);
    }

    this.dragInputManager = new DragInputManager(this);
    this.healthBarManager = new HealthBarManager(this);
    this.damageSettlementManager = new DamageSettlementManager(this);
    this.modalManager = new ModalManager(this);
    this.cardDisplayManager = new CardDisplayManager(this);
    this.battleFlowManager = new BattleFlowManager(
      this,
      this.cardDisplayManager,
      this.damageSettlementManager,
      () => this.bgmManager.stopBattleBgm(),
    );
    this.activeSkillManager = new ActiveSkillManager(
      this,
      this.characterBarManager,
      this.cardDisplayManager,
      () => this.battleFlowManager.aiInitiatePlay(),
      () => this.battleFlowManager.refillPlayerHand(),
    );
    this.bgmManager = new BgmManager(this);

    this.buttonManager = new ButtonManager(
      this,
      () => this.battleFlowManager.onPlayClick(),
      () => this.battleFlowManager.onPassClick(),
    );
    this.buttonManager.createButtons(width, height);

    this.createHandPatternButton(width, height);
    this.createSettingsButton(width, height);

    this.renderAllCards();
    this.dragInputManager.setup();
    this.healthBarManager.updateVitalityBars();

    // ── Skill system + pattern hint (must be before updateUIForPhase) ──
    this.skillEventBus = new SkillEventBus();
    this.skillRegistry = new SkillRegistry();

    const enemyChar = this.battle.enemyCharacterId
      ? ENEMY_CHARACTERS[this.battle.enemyCharacterId]
      : undefined;
    this.skillRegistry.registerForBattle(
      ALL_SKILL_DEFINITIONS,
      this.playerCharacterIds.map(id => PLAYER_CHARACTERS[id]),
      enemyChar ? [enemyChar] : [],
    );

    const visualManager = new SkillVisualManagerImpl(this);

    this.skillRunner = new SkillRunner(this.skillRegistry, this.skillEventBus, visualManager, this.characterBarManager);

    this.patternHintManager = new PatternHintManager(this, this.skillRunner);

    this.initActiveSkills();

    this.updateUIForPhase();

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);

    this.time.delayedCall(200, () => {
      GameAudioManager.playSfx(this, 'sfx_gong');
      this.time.delayedCall(800, () => {
        this.initBattleBgm();
      });
    });

    if (this.playerCharacterIds.includes('zhugeliang')) {
      const initCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: 'zhugeliang',
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
      };
      this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, initCtx)
        .then(() => { this.renderEnemyHand(); })
        .catch((err) => { console.warn('[GameScene] zhugeliang init skill error:', err); });
    }
  }

  private initBattle(): BattleState {
    const playerDeck = shuffleDeck(createDeck());
    const enemyDeck = shuffleDeck(createDeck());

    const playerHand = playerDeck.splice(0, 17);
    const enemyHand = enemyDeck.splice(0, 17);

    sortHand(playerHand);
    sortHand(enemyHand);

    const playerCharId = this.selectPlayerCharacter();
    const enemyCharId = this.selectEnemyCharacter();
    const enemyName = getCharacterEnemyName(enemyCharId);
    const playerChar = PLAYER_CHARACTERS[playerCharId];

    const playerVit = this.testConfig?.playerVitality ?? 500;
    const enemyVit = this.testConfig?.enemyVitality ?? 500;

    return {
      player: {
        hand: playerHand,
        deck: playerDeck,
        discardPile: [],
        vitality: playerVit,
        vitalityMax: playerVit,
        name: playerChar.name,
        characterId: this.playerCharacterIds[0] ?? 'hanxin',
      },
      enemy: {
        hand: enemyHand,
        deck: enemyDeck,
        discardPile: [],
        vitality: enemyVit,
        vitalityMax: enemyVit,
        name: enemyName,
      },
      enemyCharacterId: enemyCharId,
      turnHolder: 'player',
      lastPlay: null,
      phase: 'play',
      turnCount: 1,
    };
  }

  private selectPlayerCharacter(): PlayerCharacterId {
    if (this.testConfig?.selectedPlayerCharacterIds && this.testConfig.selectedPlayerCharacterIds.length > 0) {
      this.playerCharacterIds = [...this.testConfig.selectedPlayerCharacterIds];
      return this.playerCharacterIds[0]!;
    }
    const id = randomPlayerCharacter();
    this.playerCharacterIds = [id];
    return id;
  }

  private selectEnemyCharacter(): EnemyCharacterId {
    if (this.testConfig?.enemyCharacterId) {
      return this.testConfig.enemyCharacterId;
    }
    const enemies = ENEMY_CHARACTER_LIST;
    return enemies[Math.floor(Math.random() * enemies.length)]!.id;
  }

  // ═══════════════════════════════════════════════
  //  UI Drawing
  // ═══════════════════════════════════════════════

  private drawBackground(w: number, h: number): void {
    const bg = this.add.image(w / 2, h / 2, 'battle_bg');
    bg.setDepth(DEPTH_BG);
    const scaleX = w / bg.width;
    const scaleY = h / bg.height;
    bg.setScale(Math.max(scaleX, scaleY));

    const border = this.add.graphics();
    border.setDepth(DEPTH_BG_BORDER);
    border.lineStyle(1, 0x6a4a2a, 0.3);
    border.strokeRect(8, 8, w - 16, h - 16);
  }

  private createPatternHint(w: number, h: number): void {
    this.patternHintText = this.add.text(w / 2, h - 370, '', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0.5).setDepth(DEPTH_UI);
  }

  private createTurnIndicator(w: number, _h: number): void {
    this.turnIndicatorText = this.add.text(w / 2, 100, '', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    this.thinkingText = this.add.text(590, 67, '', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false);
  }

  private createCharacterSlots(w: number, h: number): void {
    this.characterBarManager.createCharacterSlots(w, h);
  }

  // ═══════════════════════════════════════════════
  //  Card Rendering (delegated to CardDisplayManager)
  // ═══════════════════════════════════════════════

  private createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    return this.cardDisplayManager.createCardDisplay(card, x, y, isSelected);
  }

  updateCardShadowGlow(container: Phaser.GameObjects.Container, isGlow: boolean): void {
    this.cardDisplayManager.updateCardShadowGlow(container, isGlow);
  }

  private createCardInteractive(card: Card, x: number, y: number, index: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    return this.cardDisplayManager.createCardInteractive(card, x, y, index, isSelected);
  }

  private renderAllCards(): void {
    this.cardDisplayManager.renderAllCards();
  }

  renderPlayerHand(animateEntry: boolean = false): void {
    this.cardDisplayManager.renderPlayerHand(animateEntry);
  }

  renderEnemyHand(animateEntry: boolean = false, baseDelay: number = 700, onComplete?: () => void): void {
    this.cardDisplayManager.renderEnemyHand(animateEntry, baseDelay, onComplete);
  }

  private getRevealedEnemyCardIndices(): Set<number> {
    return this.cardDisplayManager.getRevealedEnemyCardIndices();
  }

  getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }> {
    return this.cardDisplayManager.getCardFanPositions(count, centerX, centerY);
  }

  private animateCardsToPositions(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
    onComplete?: () => void
  ): void {
    this.cardDisplayManager.animateCardsToPositions(cards, positions, duration, onComplete);
  }

  clearCenterCards(): void {
    this.cardDisplayManager.clearCenterCards();
  }

  private fadeOutCenterCards(onComplete: () => void): void {
    this.cardDisplayManager.fadeOutCenterCards(onComplete);
  }

  private animateShiftAndReplace(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
    onComplete: () => void
  ): void {
    this.cardDisplayManager.animateShiftAndReplace(oldCards, newCards, duration, onComplete);
  }

  createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[] {
    return this.cardDisplayManager.createEnemyDisplayCards(indices);
  }

  // ═══════════════════════════════════════════════
  //  Interaction
  // ═══════════════════════════════════════════════

  getSelectedCards(): Card[] {
    return [...this.selectedIndices].sort((a, b) => a - b).map(i => this.battle.player.hand[i]!).filter((c): c is Card => c !== undefined);
  }

  updatePatternHint(): void {
    this.patternHintManager.updatePatternHint();
  }

  private playerHasPlayablePattern(): boolean {
    return this.patternHintManager.playerHasPlayablePattern();
  }

  // ═══════════════════════════════════════════════
  //  Battle Logic
  // ═══════════════════════════════════════════════

  // ═══════════════════════════════════════════════
  //  UI Updates
  // ═══════════════════════════════════════════════

  updateUIForPhase(): void {
    const { width, height } = this.scale;

    switch (this.phase) {
      case 'player_init':
        if (this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('');
          this.turnIndicatorText.setPosition(width / 2, 100);
        } else {
          this.turnIndicatorText.setText('');
          this.turnIndicatorText.setPosition(width / 2, height - 370);
        }
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(true);
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPassText.setColor('#8a7a5a');
        this.btnPass.setVisible(false);
        if (this.btnSkill) this.btnSkill.setVisible(false);
        break;
      case 'player_respond':
        this.turnIndicatorText.setText('');
        this.turnIndicatorText.setPosition(width / 2, 100);
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(true);
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPass.setVisible(true);
        this.btnPassText.setColor('#1a0804');
        if (!this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('');
          this.turnIndicatorText.setPosition(width / 2, height - 370);
        }
        break;
      case 'ai_init':
        this.thinkingText.setText('');
        this.thinkingText.setVisible(true);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      case 'ai_respond':
        this.thinkingText.setText('');
        this.thinkingText.setVisible(true);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      case 'animating':
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      case 'game_over':
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      default:
        break;
    }

    this.updateButtonLayout();
    this.updateVitalityBars();
  }

  updateTurnIndicator(who: 'player' | 'enemy'): void {
    const { width } = this.scale;
    if (who === 'player') {
      this.thinkingText.setVisible(false);
      this.turnIndicatorText.setVisible(true);
      this.turnIndicatorText.setText('');
      this.turnIndicatorText.setPosition(width / 2, 100);
    } else {
      this.turnIndicatorText.setVisible(false);
      this.thinkingText.setText('');
      this.thinkingText.setVisible(true);
    }
  }

  updateVitalityBars(): void {
    this.healthBarManager.updateVitalityBars();
  }

  private animateHealthBarDepletion(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
    onComplete: () => void
  ): void {
    this.healthBarManager.animateHealthBarDepletion(target, newVitality, duration, onComplete);
  }

  async playDamageSettlement(
    pattern: HandPattern,
    target: 'enemy' | 'player',
    isEmptyHand: boolean,
  ): Promise<void> {
    await this.damageSettlementManager.playDamageSettlement(pattern, target, isEmptyHand);
  }





  async animateCardsToPositionsAsync(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
  ): Promise<void> {
    return this.cardDisplayManager.animateCardsToPositionsAsync(cards, positions, duration);
  }

  async fadeOutCenterCardsAsync(): Promise<void> {
    return this.cardDisplayManager.fadeOutCenterCardsAsync();
  }

  async animateShiftAndReplaceAsync(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
  ): Promise<void> {
    return this.cardDisplayManager.animateShiftAndReplaceAsync(oldCards, newCards, duration);
  }

  renderEnemyHandAsync(delay: number): Promise<void> {
    return this.cardDisplayManager.renderEnemyHandAsync(delay);
  }

  async animateHealthBarDepletionAsync(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
  ): Promise<void> {
    return this.healthBarManager.animateHealthBarDepletionAsync(target, newVitality, duration);
  }

  private showFloatingText(value: number, x: number, y: number, color: string): void {
    const text = this.add.text(x, y, `${value}`, {
      fontSize: '44px',
      fontFamily: FONT_FAMILY,
      color: color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE);

    this.tweens.add({
      targets: text,
      y: y - 90,
      alpha: { from: 1, to: 0 },
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  // ═══════════════════════════════════════════════
  //  Hand Pattern Button & Modal
  // ═══════════════════════════════════════════════

  private createHandPatternButton(w: number, _h: number): void {
    this.modalManager.createHandPatternButton(w, _h);
  }

  // ═══════════════════════════════════════════════
  //  Battle BGM (delegated to BgmManager)
  // ═══════════════════════════════════════════════

  private initBattleBgm(): void {
    this.bgmManager.initBattleBgm();
  }

  cancelDamageSettlement(): void {
    this.damageSettlementManager.cancelDamageSettlement();
  }

  // ═══════════════════════════════════════════════
  //  Settings Button & Panel
  // ═══════════════════════════════════════════════

  private createSettingsButton(w: number, _h: number): void {
    this.modalManager.createSettingsButton(w, _h);
  }

  // ═══════════════════════════════════════════════
  //  Active Skill System (delegated to ActiveSkillManager)
  // ═══════════════════════════════════════════════

  getBattle(): BattleState {
    return this.activeSkillManager.getBattle();
  }

  renderPlayerHandAfterSkill(): void {
    this.activeSkillManager.renderPlayerHandAfterSkill();
  }

  initActiveSkills(): void {
    this.activeSkillManager.initActiveSkills();
  }

  updateActiveSkillButton(): void {
    this.activeSkillManager.updateActiveSkillButton();
  }

  private closeSkillDropdown(): void {
    this.activeSkillManager.closeSkillDropdown();
  }

  private updateSkillDropdownTrigger(btnY: number): void {
    this.activeSkillManager.updateSkillDropdownTrigger(btnY);
  }

  private async onSkillClick(): Promise<void> {
    await this.activeSkillManager.onSkillClick();
  }

  private updateButtonLayout(): void {
    this.activeSkillManager.updateButtonLayout();
  }

  // ═══════════════════════════════════════════════
  //  Drag-to-Select Hand Input
  // ═══════════════════════════════════════════════

  private isPlayerTurn(): boolean {
    return this.phase === 'player_init' || this.phase === 'player_respond';
  }
}
