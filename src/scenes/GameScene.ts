import Phaser from 'phaser';
import type { Card} from '../models/Card';
import { createDeck, shuffleDeck, sortHand, resetCardIdCounter, getNextCardId } from '../models/Card';
import type { BattleState, HandPattern, BattleConfig } from '../models/BattleTypes';
import { GameAudioManager } from '../utils/GameAudioManager';
import type { PlayerCharacterId, EnemyCharacterId} from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS, ENEMY_CHARACTER_LIST, randomPlayerCharacter } from '../models/Character';
import { getCharacterEnemyName } from '../engine/CharacterAbilities';
import { PLAYER_VITALITY } from '../models/RunState';
import { getRun } from '../models/RunManager';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, type SkillContext, type ActiveSkillDefinition } from '../skills';
import { clearPassiveSkills, registerAllPassiveSkills } from '../skills/PassiveSkillUtils';
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
import { TurnIndicatorManager } from './managers/TurnIndicatorManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export class GameScene extends Phaser.Scene {
  battle!: BattleState;
  phase: GamePhase = 'player_init';

  selectedIndices: Set<number> = new Set();
  cardObjects: Phaser.GameObjects.Container[] = [];
  handScrollX: number = 0;
  enemyCardObjects: Phaser.GameObjects.Container[] = [];

  playerVitalityBar!: Phaser.GameObjects.Graphics;
  enemyVitalityBar!: Phaser.GameObjects.Graphics;
  playerVitalityText!: Phaser.GameObjects.Text;
  enemyVitalityText!: Phaser.GameObjects.Text;
  playerDeckText!: Phaser.GameObjects.Text;
  enemyDeckText!: Phaser.GameObjects.Text;
  patternHintText!: Phaser.GameObjects.Text;
  turnIndicatorManager!: TurnIndicatorManager;
  btnPlay!: Phaser.GameObjects.Container;
  btnPass!: Phaser.GameObjects.Container;
  btnPlayText!: Phaser.GameObjects.Text;
  btnPassText!: Phaser.GameObjects.Text;
  btnHint!: Phaser.GameObjects.Container;
  btnHintText!: Phaser.GameObjects.Text;

  btnSkill: Phaser.GameObjects.Container | null = null;
  btnSkillText: Phaser.GameObjects.Text | null = null;
  skillDropdown: Phaser.GameObjects.Container | null = null;
  activeSkills: ActiveSkillDefinition[] = [];
  activeSkillUseCounts: Map<string, number> = new Map();
  activeSkillEligibleIds: string[] = [];
  currentActiveSkillId: string | null = null;

  enemyNameText!: Phaser.GameObjects.Text;
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

  private testConfig: BattleConfig | null = null;
  isTestMode: boolean = false;
  playerCharacterIds: PlayerCharacterId[] = [];

  /** 入场配置（含 runMode），供 BattleFlowManager 等管理器读取 */
  get battleConfig(): BattleConfig | null {
    return this.testConfig;
  }

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

  init(data?: BattleConfig): void {
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
    this.handScrollX = 0;
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
    registerAllPassiveSkills();

    this.revealedEnemyCards = new Set();
    this.isTestMode = this.testConfig !== null && !this.testConfig.runMode;

    this.btnSkill?.destroy();
    this.btnSkill = null;
    this.btnSkillText = null;
    this.skillDropdown?.destroy();
    this.skillDropdown = null;
    this.activeSkills = [];
    this.activeSkillUseCounts = new Map();
    this.activeSkillEligibleIds = [];
    this.currentActiveSkillId = null;

    this.turnIndicatorManager?.destroy();
    this.tweens.timeScale = 1;

    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);
    this.createPatternHint(width, height);
    this.turnIndicatorManager = new TurnIndicatorManager(this);
    this.turnIndicatorManager.create(width, height);

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

    this.cardDisplayManager = new CardDisplayManager(this);
    this.dragInputManager = new DragInputManager(this, this.cardDisplayManager);
    this.healthBarManager = new HealthBarManager(this);
    this.damageSettlementManager = new DamageSettlementManager(this);
    this.modalManager = new ModalManager(this);
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
      () => this.battleFlowManager.onHintClick(),
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

    // 战斗开局：通过标准技能事件通道广播 ON_GAIN_TURN，
    // 是否触发由已注册技能（如诸葛亮「先算」）自身的 filter 判定。
    const initCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.player.characterId ?? this.playerCharacterIds[0]!,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
    };
    this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, initCtx)
      .then(() => { this.renderEnemyHand(); })
      .catch((err) => { console.warn('[GameScene] battle start skill error:', err); });
  }

  private initBattle(): BattleState {
    const playerDeck = shuffleDeck(createDeck());
    const enemyDeck = shuffleDeck(createDeck());

    const runMode = this.testConfig?.runMode;

    // 融合购买的卡牌（仅加入玩家牌组）：测试模式优先，局外循环从存档牌池取
    const purchased = this.testConfig?.purchasedCards
      ?? (runMode ? getRun()?.cardPool : undefined);
    if (purchased && purchased.length > 0) {
      for (const card of purchased) {
        playerDeck.push({ ...card, uid: getNextCardId() });
      }
      shuffleDeck(playerDeck);
    }

    const playerHand = playerDeck.splice(0, 17);
    const enemyHand = enemyDeck.splice(0, 17);

    sortHand(playerHand);
    sortHand(enemyHand);

    const playerCharId = this.selectPlayerCharacter();
    const enemyCharId = this.selectEnemyCharacter();
    const enemyName = getCharacterEnemyName(enemyCharId);
    const playerChar = PLAYER_CHARACTERS[playerCharId];

    const playerVit = runMode ? PLAYER_VITALITY : (this.testConfig?.playerVitality ?? 500);
    const enemyVit = runMode ? runMode.enemyVitality : (this.testConfig?.enemyVitality ?? 500);

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
    const runMode = this.testConfig?.runMode;
    if (runMode) {
      // 局外循环：玩家阵容 = 当前对局 roster 全量
      const roster = getRun()?.roster;
      this.playerCharacterIds = roster && roster.length > 0 ? [...roster] : [randomPlayerCharacter()];
      return this.playerCharacterIds[0]!;
    }
    if (this.testConfig?.selectedPlayerCharacterIds && this.testConfig.selectedPlayerCharacterIds.length > 0) {
      this.playerCharacterIds = [...this.testConfig.selectedPlayerCharacterIds];
      return this.playerCharacterIds[0]!;
    }
    const id = randomPlayerCharacter();
    this.playerCharacterIds = [id];
    return id;
  }

  private selectEnemyCharacter(): EnemyCharacterId {
    const runMode = this.testConfig?.runMode;
    if (runMode) {
      return runMode.enemyId;
    }
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
    switch (this.phase) {
      case 'player_init':
        this.turnIndicatorManager.showPlayerTurn('轮到你出牌');
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPassText.setColor('#8a7a5a');
        this.btnPass.setVisible(false);
        if (this.btnSkill) this.btnSkill.setVisible(false);
        break;
      case 'player_respond':
        this.turnIndicatorManager.showPlayerTurn('跟牌或不出');
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPass.setVisible(true);
        this.btnPassText.setColor('#1a0804');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        break;
      case 'ai_init':
      case 'ai_respond':
        this.turnIndicatorManager.showAiThinking();
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      case 'animating':
      case 'game_over':
        this.turnIndicatorManager.hideAll();
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        if (this.btnSkill) this.btnSkill.setVisible(false);
        this.closeSkillDropdown();
        break;
      default:
        break;
    }

    const isPlayerPhase = this.phase === 'player_init' || this.phase === 'player_respond';
    if (this.btnHint) {
      this.btnHint.setVisible(isPlayerPhase);
      this.btnHintText.setColor(this.playerHasPlayablePattern() ? '#1a0a04' : '#8a7a5a');
    }

    this.updateButtonLayout();
    this.updateVitalityBars();
  }

  updateTurnIndicator(who: 'player' | 'enemy'): void {
    if (who === 'player') {
      this.turnIndicatorManager.showPlayerTurn('轮到你出牌');
    } else {
      this.turnIndicatorManager.showAiThinking();
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
