import Phaser from 'phaser';
import type { Card} from '../models/Card';
import { createDeck, shuffleDeck, cardDisplayName, sortHand, resetCardIdCounter, sortPlayedCards } from '../models/Card';
import type { BattleState, HandPattern} from '../models/BattleTypes';
import { HandType, HAND_TYPE_LABELS } from '../models/BattleTypes';
import { identifyHand, canBeat, findAllPlays, findBeatingPlays } from '../engine/HandRecognizer';
import { decidePlay } from '../engine/AIBrain';
import { loadAudioSettings, saveAudioSettings } from '../AudioSettings';
import { GameAudioManager } from '../utils/GameAudioManager';
import { VoiceManager, getVoiceKeyForPlay, getRandomPassVoice } from '../utils/VoiceManager';
import type { PlayerCharacterId, EnemyCharacterId} from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS, ENEMY_CHARACTER_LIST, randomPlayerCharacter } from '../models/Character';
import { canBeatOrEqual, getCharacterEnemyName } from '../engine/CharacterAbilities';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, type SkillContext, type CharacterSlotManager, type ActiveSkillDefinition } from '../skills';
import { getBlockedResponseTypes, clearPassiveSkills } from '../skills/PassiveSkillUtils';
import {
  FONT_FAMILY, SELECTED_OFFSET,
  AVATAR_SOURCE_SIZE,
  DEPTH_BG, DEPTH_BG_BORDER, DEPTH_UI,
  DEPTH_CENTER_BASE, DEPTH_DAMAGE,
  DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT,
} from '../constants/Layout';
import { DragInputManager } from './managers/DragInputManager';
import { HealthBarManager } from './managers/HealthBarManager';
import { DamageSettlementManager } from './managers/DamageSettlementManager';
import { ModalManager } from './managers/ModalManager';
import { CardDisplayManager } from './managers/CardDisplayManager';
import { BattleFlowManager } from './managers/BattleFlowManager';
import { CharacterBarManager } from './managers/CharacterBarManager';
import { ActiveSkillManager } from './managers/ActiveSkillManager';
import { BgmManager } from './managers/BgmManager';

interface TestBattleConfig {
  selectedPlayerCharacterIds?: PlayerCharacterId[];
  enemyCharacterId?: EnemyCharacterId;
  playerVitality?: number;
  enemyVitality?: number;
}

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export class GameScene extends Phaser.Scene implements CharacterSlotManager {
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
  private patternHintText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private thinkingText!: Phaser.GameObjects.Text;
  btnPlay!: Phaser.GameObjects.Container;
  btnPass!: Phaser.GameObjects.Container;
  private btnPlayText!: Phaser.GameObjects.Text;
  private btnPassText!: Phaser.GameObjects.Text;

  btnSkill: Phaser.GameObjects.Container | null = null;
  btnSkillText: Phaser.GameObjects.Text | null = null;
  skillDropdown: Phaser.GameObjects.Container | null = null;
  activeSkills: ActiveSkillDefinition[] = [];
  activeSkillUseCounts: Map<string, number> = new Map();
  activeSkillEligibleIds: string[] = [];
  currentActiveSkillId: string | null = null;

  private enemyNameText!: Phaser.GameObjects.Text;
  private enemyNameFrame!: Phaser.GameObjects.Graphics;
  private playerNameText!: Phaser.GameObjects.Text;
  enemyAvatarImage!: Phaser.GameObjects.Image;
  private enemyAvatarBorder!: Phaser.GameObjects.Graphics;

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
  characterTooltip: Phaser.GameObjects.Container | null = null;
  enemyInfoWindow: Phaser.GameObjects.Container | null = null;

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
  private activeSkillManager!: ActiveSkillManager;

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
    this.characterTooltip?.destroy();
    this.characterTooltip = null;
    this.enemyInfoWindow?.destroy();
    this.enemyInfoWindow = null;
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
    this.createInfoBars(width, height);
    this.createButtons(width, height);
    this.createPatternHint(width, height);
    this.createTurnIndicator(width, height);

    this.battle = this.initBattle();

    this.characterBarManager = new CharacterBarManager(this);
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
    this.battleFlowManager = new BattleFlowManager(this);
    this.activeSkillManager = new ActiveSkillManager(this);
    this.bgmManager = new BgmManager(this);

    this.createHandPatternButton(width, height);
    this.createSettingsButton(width, height);

    this.renderAllCards();
    this.dragInputManager.setup();
    this.healthBarManager.updateVitalityBars();
    this.updateUIForPhase();

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);

    this.time.delayedCall(200, () => {
      GameAudioManager.playSfx(this, 'sfx_gong');
      this.time.delayedCall(800, () => {
        this.initBattleBgm();
      });
    });

    // ── 技能系统初始化（Phase 2：统一异步事件流）──
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

    this.skillRunner = new SkillRunner(this.skillRegistry, this.skillEventBus, visualManager, this);

    this.initActiveSkills();

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
        .catch(() => {});
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

  private createInfoBars(w: number, _h: number): void {
    // Enemy info bar (top)
    const enemyBarY = 50;
    const enemyBarX = 120;
    const barW = 420;
    const barH = 34;

    this.enemyNameText = this.add.text(enemyBarX, enemyBarY - 22, '山贼头目', {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setShadow(0, 2, '#1a0800', 4, true, true).setDepth(DEPTH_UI);

    // 敌方名字线框（金色边框背景）
    this.enemyNameFrame = this.add.graphics();
    this.enemyNameFrame.setDepth(DEPTH_UI - 1);
    const namePad = 8;
    const nameH = 32;
    this.enemyNameFrame.fillStyle(0x2a1a0f, 0.6);
    this.enemyNameFrame.fillRoundedRect(enemyBarX - namePad, enemyBarY - 22 - nameH / 2 - namePad, barW + namePad * 2 - 8, nameH + namePad * 2, 4);
    this.enemyNameFrame.lineStyle(1.5, 0xb89040, 0.5);
    this.enemyNameFrame.strokeRoundedRect(enemyBarX - namePad, enemyBarY - 22 - nameH / 2 - namePad, barW + namePad * 2 - 8, nameH + namePad * 2, 4);

    // 敌人头像（敌人名字左侧，战斗开始后根据 enemyCharacterId 设置纹理）
    const avatarSize = 80;
    const avatarDisplaySize = 68;
    const avatarX = enemyBarX - 66;
    const avatarY = enemyBarY - 2;
    this.enemyAvatarBorder = this.add.graphics();
    this.enemyAvatarBorder.setDepth(DEPTH_UI);
    this.enemyAvatarBorder.fillStyle(0x2a1a0f, 0.85);
    this.enemyAvatarBorder.fillRoundedRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 6);
    this.enemyAvatarBorder.lineStyle(2, 0xb89040, 0.7);
    this.enemyAvatarBorder.strokeRoundedRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 6);
    this.enemyAvatarBorder.setVisible(false);

    this.enemyAvatarImage = this.add.image(avatarX, avatarY, 'char_huangjinjun')
      .setScale(avatarDisplaySize / AVATAR_SOURCE_SIZE)
      .setDepth(DEPTH_UI)
      .setVisible(false);

    this.enemyAvatarImage.setInteractive({ cursor: 'pointer' });
    this.enemyAvatarImage.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.showEnemyInfoWindow();
    });

    const enemyBg = this.add.graphics();
    enemyBg.setDepth(DEPTH_UI);
    enemyBg.fillStyle(0xf0ebe0, 0.85);
    enemyBg.fillRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);
    enemyBg.lineStyle(1, 0x9a8a6a, 0.6);
    enemyBg.strokeRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);

    this.enemyVitalityBar = this.add.graphics();
    this.enemyVitalityBar.setDepth(DEPTH_UI);
    this.enemyVitalityText = this.add.text(enemyBarX + barW / 2, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    // 玩家信息栏（中下方，高于按钮和手牌）
    const playerBarY = _h - 380;

    this.playerNameText = this.add.text(enemyBarX, playerBarY - 16, '玩家', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setDepth(DEPTH_UI).setVisible(false);

    const playerBg = this.add.graphics();
    playerBg.setDepth(DEPTH_UI);
    playerBg.fillStyle(0xf0ebe0, 0.85);
    playerBg.fillRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);
    playerBg.lineStyle(1, 0x9a8a6a, 0.6);
    playerBg.strokeRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);

    this.playerVitalityBar = this.add.graphics();
    this.playerVitalityBar.setDepth(DEPTH_UI);
    this.playerVitalityText = this.add.text(enemyBarX + barW / 2, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    const deckTextX = enemyBarX + barW + 24;
    this.enemyDeckText = this.add.text(deckTextX, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);

    this.playerDeckText = this.add.text(deckTextX, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);

  }

  private createButtons(w: number, h: number): void {
    const btnY = h - 320;
    const btnW = 250;
    const btnH = 80;

    // Play button
    this.btnPlay = this.add.container(w / 2 - 160, btnY).setDepth(DEPTH_UI);
    const playBg = this.add.graphics();
    playBg.fillStyle(0xc8a878, 1);
    playBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    playBg.lineStyle(1.5, 0x8a6030, 0.85);
    playBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPlay.add(playBg);

    this.btnPlayText = this.add.text(0, 0, '出  牌', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPlay.add(this.btnPlayText);

    const playZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    playZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.onPlayClick();
    });
    this.btnPlay.add(playZone);

    // Pass button
    this.btnPass = this.add.container(w / 2 + 160, btnY).setDepth(DEPTH_UI);
    const passBg = this.add.graphics();
    passBg.fillStyle(0xe8dcc8, 1);
    passBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    passBg.lineStyle(1, 0xb8a888, 0.6);
    passBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPass.add(passBg);

    this.btnPassText = this.add.text(0, 0, '不  出', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#7a6a50',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPass.add(this.btnPassText);

    const passZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    passZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.onPassClick();
    });
    this.btnPass.add(passZone);
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
  //  CharacterSlotManager implementation
  // ═══════════════════════════════════════════════

  isPlayerCharacter(characterId: string): boolean {
    return this.characterBarManager.isPlayerCharacter(characterId);
  }

  getCharacterOrder(characterId: string): number {
    return this.characterBarManager.getCharacterOrder(characterId);
  }

  showDialog(characterId: string, text: string): void {
    this.characterBarManager.showDialog(characterId, text);
  }

  async glowOn(characterId: string): Promise<void> {
    return this.characterBarManager.glowOn(characterId);
  }

  /**
   * 技能触发强调动效：左右晃动（加速）的同时放大，晃动结束后缩小回原尺寸。
   * 在 moveToFront 之后调用。晃动与放大并行以缩短总时长。
   */
  async shakeAndPulse(characterId: string): Promise<void> {
    return this.characterBarManager.shakeAndPulse(characterId);
  }

  async glowOff(characterId: string): Promise<void> {
    return this.characterBarManager.glowOff(characterId);
  }

  async moveToFront(characterId: string): Promise<void> {
    return this.characterBarManager.moveToFront(characterId);
  }

  async restoreSlot(_characterId: string): Promise<void> {
    return this.characterBarManager.restoreSlot(_characterId);
  }

  private showEnemyInfoWindow(): void {
    this.characterBarManager.showEnemyInfoWindow();
  }

  private closeEnemyInfoWindow(): void {
    this.characterBarManager.closeEnemyInfoWindow();
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

  onCardClick(index: number): void {
    if (this.phase === 'animating' || this.phase === 'game_over' || this.phase === 'ai_init' || this.phase === 'ai_respond') {
      return;
    }

    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }

    const { height } = this.scale;
    const baseY = height - 90;

    for (let i = 0; i < this.cardObjects.length; i++) {
      const obj = this.cardObjects[i]!;
      const isSelected = this.selectedIndices.has(i);
      const targetY = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;

      if (obj.y !== targetY) {
        this.tweens.add({
          targets: obj,
          y: targetY,
          duration: 300,
          ease: 'Sine.easeOut',
        });
      }

      if (glowG) {
        const targetAlpha = isSelected ? 1 : 0;
        if (glowG.alpha !== targetAlpha) {
          this.tweens.add({
            targets: glowG,
            alpha: targetAlpha,
            duration: 300,
            ease: 'Sine.easeOut',
          });
        }
      }


    }

    this.updatePatternHint();
    this.updateActiveSkillButton();
  }

  getSelectedCards(): Card[] {
    return [...this.selectedIndices].sort((a, b) => a - b).map(i => this.battle.player.hand[i]!).filter((c): c is Card => c !== undefined);
  }

  updatePatternHint(): void {
    const selected = this.getSelectedCards();
    if (selected.length === 0) {
      this.patternHintText.setText('');
      return;
    }

    const pattern = identifyHand(selected);
    if (pattern) {
      this.showPatternHint(pattern, selected, false);
    } else {
      this.patternHintText.setText('无效牌型');
      this.patternHintText.setColor('#a04040');
      this.checkHandValidationHint(selected);
    }
  }

  private showPatternHint(pattern: HandPattern, selected: Card[], isChouSuan: boolean): void {
    const label = isChouSuan ? '顺子（筹算）' : HAND_TYPE_LABELS[pattern.type];
    const cardsStr = selected.map(c => cardDisplayName(c)).join('');

    if (this.battle.lastPlay && this.phase === 'player_respond') {
      const playerChar = this.battle.player.characterId;
      const canBeatPlay = playerChar === 'zhugeliang'
        ? canBeatOrEqual(pattern, this.battle.lastPlay)
        : canBeat(pattern, this.battle.lastPlay);
      if (!canBeatPlay) {
        this.patternHintText.setText(`${label} ${cardsStr}（打不过上家）`);
        this.patternHintText.setColor('#a08040');
        return;
      }
    }

    this.patternHintText.setText(`${label}: ${cardsStr}`);
    this.patternHintText.setColor('#b89050');
  }

  private async checkHandValidationHint(selected: Card[]): Promise<void> {
    const playerChar = this.battle.player.characterId;
    if (!playerChar) return;

    const ctx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: playerChar,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      handValidation: {
        hand: this.battle.player.hand,
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

  private async onPlayClick(): Promise<void> {
    await this.battleFlowManager.onPlayClick();
  }

  private async onPassClick(): Promise<void> {
    await this.battleFlowManager.onPassClick();
  }

  // ═══════════════════════════════════════════════
  //  Battle Logic
  // ═══════════════════════════════════════════════

  private async executePlay(cards: Card[], pattern: HandPattern): Promise<void> {
    await this.battleFlowManager.executePlay(cards, pattern);
  }

  private async handlePostPlayEmptyHandCheck(hand: Card[], pattern: HandPattern): Promise<void> {
    await this.battleFlowManager.handlePostPlayEmptyHandCheck(hand, pattern);
  }

  private async executePass(who: 'player' | 'enemy'): Promise<void> {
    await this.battleFlowManager.executePass(who);
  }

  private showPassAnimation(who: 'player' | 'enemy'): Promise<void> {
    return this.battleFlowManager.showPassAnimation(who);
  }

  refillPlayerHand(): void {
    this.battleFlowManager.refillPlayerHand();
  }

  private refillEnemyHand(): void {
    this.battleFlowManager.refillEnemyHand();
  }

  /**
   * 获得牌权时的安全网：若该方手牌为空（例如被弃置技能清空），
   * 立即摸满 17 张并刷新显示。手牌非空时为无操作。
   */
  private async refillIfEmpty(who: 'player' | 'enemy'): Promise<void> {
    await this.battleFlowManager.refillIfEmpty(who);
  }

  private async aiRespond(): Promise<void> {
    await this.battleFlowManager.aiRespond();
  }

  async aiInitiatePlay(): Promise<void> {
    await this.battleFlowManager.aiInitiatePlay();
  }

  private findCardIndices(hand: Card[], cards: Card[]): number[] {
    return this.battleFlowManager.findCardIndices(hand, cards);
  }

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

  showGameOver(playerWin: boolean): void {
    this.phase = 'game_over';
    this.bgmManager.stopBattleBgm();

    if (playerWin) {
      const settings = loadAudioSettings();
      const victory = this.sound.add('victory_jingle', { volume: settings.sfxVolume });
      GameAudioManager.track(this, victory);
      victory.play();
    } else {
      GameAudioManager.playBgm(this, 'bgm_failure', { loop: false });
    }

    const { width, height } = this.scale;
    const overlay = this.add.graphics();
    overlay.setDepth(DEPTH_OVERLAY);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    const resultText = playerWin ? '胜利' : '败北';
    const resultColor = playerWin ? '#6a4a20' : '#802020';

    const title = this.add.text(width / 2, height / 2 - 50, resultText, {
      fontSize: '80px',
      fontFamily: FONT_FAMILY,
      color: resultColor,
      stroke: '#f0ebe0',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    const hint = this.add.text(width / 2, height / 2 + 30, '点击返回主菜单', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#8a7a60',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.tweens.add({
      targets: title,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => {
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('MenuScene');
        });
      });
    });
  }

  private playerHasPlayablePattern(): boolean {
    const hand = this.battle.player.hand;
    if (this.phase === 'player_init') {
      const allPlays = findAllPlays(hand);
      return allPlays.length > 0;
    }
    if (this.phase === 'player_respond' && this.battle.lastPlay) {
      let beatingPlays = findBeatingPlays(hand, this.battle.lastPlay);
      const blockedTypes = getBlockedResponseTypes(this.battle.enemyCharacterId, this.battle.lastPlay);
      if (blockedTypes.length > 0) {
        beatingPlays = beatingPlays.filter(p => !blockedTypes.includes(p.type));
      }
      return beatingPlays.length > 0;
    }
    return false;
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
