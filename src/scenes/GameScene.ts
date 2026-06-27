import Phaser from 'phaser';
import type { Card} from '../models/Card';
import { createDeck, shuffleDeck, cardDisplayName, sortHand, resetCardIdCounter } from '../models/Card';
import type { BattleState, HandPattern} from '../models/BattleTypes';
import { HandType, HAND_TYPE_LABELS } from '../models/BattleTypes';
import { identifyHand, canBeat, findAllPlays, findBeatingPlays } from '../engine/HandRecognizer';
import { calculateDamage, calculateDamageWithEmptyHand, getCoefficient } from '../engine/DamageCalculator';
import { decidePlay } from '../engine/AIBrain';
import { loadAudioSettings, saveAudioSettings } from '../AudioSettings';
import { GameAudioManager } from '../utils/GameAudioManager';
import { VoiceManager, getVoiceKeyForPlay, getRandomPassVoice } from '../utils/VoiceManager';
import type { PlayerCharacterId, EnemyCharacterId} from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS, ENEMY_CHARACTER_LIST, randomPlayerCharacter } from '../models/Character';
import { canBeatOrEqual, getCharacterEnemyName } from '../engine/CharacterAbilities';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, LiuBoWenChouCe, type SkillContext, type CharacterSlotManager, type ActiveSkillDefinition } from '../skills';
import { getBlockedResponseTypes } from '../skills/PassiveSkillUtils';
import { waitForDelay, waitForTween, waitForCounterTween, fadeOutAndDestroy } from '../utils/AnimationUtils';
import {
  FONT_FAMILY, CARD_W, CARD_H, SELECTED_OFFSET,
  AVATAR_SOURCE_SIZE, SLOT_SIZE, SLOT_GAP, SLOT_STRIDE,
  VISIBLE_BAR_WIDTH, FADE_WIDTH,
  DEPTH_BG, DEPTH_BG_BORDER, DEPTH_UI, DEPTH_ENEMY_HAND,
  DEPTH_PLAYER_HAND, DEPTH_CENTER_BASE, DEPTH_DAMAGE,
  DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT,
} from '../constants/Layout';

interface TestBattleConfig {
  selectedPlayerCharacterIds?: PlayerCharacterId[];
  enemyCharacterId?: EnemyCharacterId;
  playerVitality?: number;
  enemyVitality?: number;
}

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

function sortPlayedCards(cards: Card[]): Card[] {
  const rankCounts = new Map<number, number>();
  for (const c of cards) {
    const effectiveRank = c.consideredAs?.rank ?? c.rank;
    rankCounts.set(effectiveRank, (rankCounts.get(effectiveRank) || 0) + 1);
  }

  const suitOrder: Record<string, number> = { spade: 0, club: 1, heart: 2, diamond: 3 };

  return [...cards].sort((a, b) => {
    const rankA = a.consideredAs?.rank ?? a.rank;
    const rankB = b.consideredAs?.rank ?? b.rank;
    const countA = rankCounts.get(rankA)!;
    const countB = rankCounts.get(rankB)!;

    if (countA !== countB) return countB - countA;
    if (rankA !== rankB) return rankA - rankB;

    if (a.consideredAs && !b.consideredAs) return 1;
    if (!a.consideredAs && b.consideredAs) return -1;

    const suitA = a.suit ? (suitOrder[a.suit] ?? 4) : 4;
    const suitB = b.suit ? (suitOrder[b.suit] ?? 4) : 4;
    return suitA - suitB;
  });
}

export class GameScene extends Phaser.Scene implements CharacterSlotManager {
  private battle!: BattleState;
  private phase: GamePhase = 'player_init';

  private selectedIndices: Set<number> = new Set();
  private cardObjects: Phaser.GameObjects.Container[] = [];
  private enemyCardObjects: Phaser.GameObjects.Container[] = [];

  private playerVitalityBar!: Phaser.GameObjects.Graphics;
  private enemyVitalityBar!: Phaser.GameObjects.Graphics;
  private playerVitalityText!: Phaser.GameObjects.Text;
  private enemyVitalityText!: Phaser.GameObjects.Text;
  private playerDeckText!: Phaser.GameObjects.Text;
  private enemyDeckText!: Phaser.GameObjects.Text;
  private patternHintText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private thinkingText!: Phaser.GameObjects.Text;
  private btnPlay!: Phaser.GameObjects.Container;
  private btnPass!: Phaser.GameObjects.Container;
  private btnPlayText!: Phaser.GameObjects.Text;
  private btnPassText!: Phaser.GameObjects.Text;

  private btnSkill: Phaser.GameObjects.Container | null = null;
  private btnSkillText: Phaser.GameObjects.Text | null = null;
  private skillDropdown: Phaser.GameObjects.Container | null = null;
  private activeSkills: ActiveSkillDefinition[] = [];
  private activeSkillUseCounts: Map<string, number> = new Map();
  private activeSkillEligibleIds: string[] = [];
  private currentActiveSkillId: string | null = null;

  private enemyNameText!: Phaser.GameObjects.Text;
  private enemyNameFrame!: Phaser.GameObjects.Graphics;
  private playerNameText!: Phaser.GameObjects.Text;
  private enemyAvatarImage!: Phaser.GameObjects.Image;
  private enemyAvatarBorder!: Phaser.GameObjects.Graphics;

  private cardHandGroup!: Phaser.GameObjects.Container;
  private aiHandGroup!: Phaser.GameObjects.Container;

  private centerCards: Phaser.GameObjects.Container[] = [];
  private centerCardsOwner: 'player' | 'enemy' | null = null;
  private centerDepthCounter = DEPTH_CENTER_BASE;

  private revealedEnemyCards: Set<Card> = new Set();

  private battleBgm: Phaser.Sound.BaseSound | null = null;
  private battleBgmKeys = ['bgm_battle_1', 'bgm_battle_2', 'bgm_battle_3', 'bgm_battle_4', 'bgm_battle_5', 'bgm_battle_6'];
  private currentBattleBgmIndex = -1;

  private handPatternButton!: Phaser.GameObjects.Container;
  private handPatternModal: Phaser.GameObjects.Container | null = null;

  private settingsButton!: Phaser.GameObjects.Container;
  private settingsPanel: Phaser.GameObjects.Container | null = null;
  private volumeSettingsModal: Phaser.GameObjects.Container | null = null;
  private returnConfirmModal: Phaser.GameObjects.Container | null = null;

  private dragStartIndex: number | null = null;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragActive: boolean = false;
  private dragSelectMode: 'add' | 'remove' | null = null;
  private dragTouchedIndices: Set<number> = new Set();
  private dragSnapshot: Set<number> = new Set();

  private respondChainDepth: number = 0;
  private damageSettlementCancelled: boolean = false;

  private testConfig: TestBattleConfig | null = null;
  private playerCharacterIds: PlayerCharacterId[] = [];

  private characterSlotContainers: Phaser.GameObjects.Container[] = [];
  private characterSlotTexts: Phaser.GameObjects.Text[] = [];
  private characterTooltip: Phaser.GameObjects.Container | null = null;
  private enemyInfoWindow: Phaser.GameObjects.Container | null = null;

  private characterBarContainer: Phaser.GameObjects.Container | null = null;
  private characterBarMaskShape: Phaser.GameObjects.Graphics | null = null;
  private characterBarScrollX: number = 0;
  private characterBarMaxScroll: number = 0;
  private characterBarDragging: boolean = false;
  private barDragStartPointerX: number = 0;
  private barDragStartScrollX: number = 0;
  private barDragPending: boolean = false;
  private barDragMoved: boolean = false;

  private skillTriggeredCharacters: Set<PlayerCharacterId> = new Set();
  private characterSlotGlows: { innerGlow: Phaser.GameObjects.Graphics; midGlow: Phaser.GameObjects.Graphics; outerGlow: Phaser.GameObjects.Graphics; sweepGfx: Phaser.GameObjects.Graphics }[] = [];
  private characterSlotGlowTweens: Map<number, Phaser.Tweens.Tween[]> = new Map();

  private skillEventBus!: SkillEventBus;
  private skillRegistry!: SkillRegistry;
  private skillRunner!: SkillRunner;

  private cachedWidth = 2400;
  private cachedHeight = 1080;

  private getSlotPosition(index: number): { x: number; y: number } {
    return { x: SLOT_SIZE / 2 + FADE_WIDTH + index * SLOT_STRIDE, y: 0 };
  }

  private getCharacterBarOrigin(): { x: number; y: number } {
    return { x: this.cachedWidth - 180 - VISIBLE_BAR_WIDTH, y: this.cachedHeight - 420 };
  }

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

    this.battleBgm?.stop();
    this.battleBgm = null;
    this.currentBattleBgmIndex = -1;

    this.handPatternModal?.destroy();
    this.handPatternModal = null;
    this.settingsPanel?.destroy();
    this.settingsPanel = null;
    this.volumeSettingsModal?.destroy();
    this.volumeSettingsModal = null;
    this.returnConfirmModal?.destroy();
    this.returnConfirmModal = null;

    this.dragStartIndex = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices = new Set();
    this.dragSnapshot = new Set();

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
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);
    this.createInfoBars(width, height);
    this.createButtons(width, height);
    this.createPatternHint(width, height);
    this.createTurnIndicator(width, height);
    this.createHandPatternButton(width, height);
    this.createSettingsButton(width, height);

    this.battle = this.initBattle();

    this.createCharacterSlots(width, height);

    this.enemyNameText.setText(this.battle.enemy.name);
    this.playerNameText.setText(this.battle.player.name);
    const enemyCharId = this.battle.enemyCharacterId;
    if (enemyCharId) {
      this.enemyAvatarImage.setTexture(`char_${enemyCharId}`);
      this.enemyAvatarImage.setVisible(true);
      this.enemyAvatarBorder.setVisible(true);
    }

    this.renderAllCards();
    this.setupHandInput();
    this.updateVitalityBars();
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
      this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, initCtx).then(() => {
        this.renderEnemyHand();
      });
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
    const slotCount = Math.max(1, this.playerCharacterIds.length);
    const origin = this.getCharacterBarOrigin();

    const maskShape = this.add.graphics();
    // 左侧渐隐带：alpha 0 → 1
    maskShape.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 1, 0, 1);
    maskShape.fillRect(origin.x, origin.y - SLOT_SIZE, FADE_WIDTH, SLOT_SIZE * 3);
    // 中间实体遮罩：alpha 1
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(origin.x + FADE_WIDTH, origin.y - SLOT_SIZE, VISIBLE_BAR_WIDTH - 2 * FADE_WIDTH, SLOT_SIZE * 3);
    // 右侧渐隐带：alpha 1 → 0
    maskShape.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 1, 0, 1, 0);
    maskShape.fillRect(origin.x + VISIBLE_BAR_WIDTH - FADE_WIDTH, origin.y - SLOT_SIZE, FADE_WIDTH, SLOT_SIZE * 3);
    maskShape.setDepth(-10000);
    this.characterBarMaskShape = maskShape;

    const barContainer = this.add.container(origin.x, origin.y).setDepth(DEPTH_UI);
    barContainer.enableFilters();
    const maskFilter = barContainer.filters!.internal.addMask(maskShape);
    maskFilter.autoUpdate = false;
    this.characterBarContainer = barContainer;

    for (let i = 0; i < slotCount; i++) {
      const pos = this.getSlotPosition(i);
      const container = this.add.container(pos.x, pos.y);
      this.characterSlotContainers.push(container);

      const glowContainer = this.add.container(0, 0).setAlpha(0);
      container.addAt(glowContainer, 0);

      const innerGlow = this.add.graphics();
      innerGlow.fillStyle(0xffd700, 0.5);
      innerGlow.fillRoundedRect(-SLOT_SIZE / 2 + 2, -SLOT_SIZE / 2 + 2, SLOT_SIZE - 4, SLOT_SIZE - 4, 7);
      glowContainer.add(innerGlow);

      const midGlow = this.add.graphics();
      midGlow.fillStyle(0xffaa00, 0.3);
      midGlow.fillRoundedRect(-SLOT_SIZE / 2 - 4, -SLOT_SIZE / 2 - 4, SLOT_SIZE + 8, SLOT_SIZE + 8, 9);
      glowContainer.add(midGlow);

      const outerGlow = this.add.graphics();
      outerGlow.fillStyle(0xffd700, 0.12);
      outerGlow.fillRoundedRect(-SLOT_SIZE / 2 - 10, -SLOT_SIZE / 2 - 10, SLOT_SIZE + 20, SLOT_SIZE + 20, 11);
      glowContainer.add(outerGlow);

      const sweepGfx = this.add.graphics();
      sweepGfx.fillGradientStyle(0xffd700, 0xffd700, 0xffd700, 0xffd700, 0.35, 0.35, 0, 0);
      sweepGfx.fillRoundedRect(-SLOT_SIZE / 2 - 6, -SLOT_SIZE / 2 - 6, SLOT_SIZE + 12, 8, 4);
      glowContainer.add(sweepGfx);

      this.characterSlotGlows.push({ innerGlow, midGlow, outerGlow, sweepGfx });

      const gfx = this.add.graphics();
      gfx.fillStyle(0x2a1a0f, 0.7);
      gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
      gfx.lineStyle(2, 0xb89040, 0.6);
      gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
      gfx.lineStyle(1, 0x5a4030, 0.3);
      gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      container.add(gfx);

      const charId = this.playerCharacterIds[i] ?? null;
      const char = charId ? PLAYER_CHARACTERS[charId] : null;

      if (charId) {
        const avatar = this.add.image(0, 0, `char_${charId}`);
        avatar.setScale((SLOT_SIZE - 8) / AVATAR_SOURCE_SIZE);
        container.add(avatar);
      }

      const slotText = this.add.text(0, SLOT_SIZE / 2 + 18, char ? char.name : '?', {
        fontSize: char ? '28px' : '42px',
        fontFamily: FONT_FAMILY,
        color: char ? '#c8a050' : '#5a4030',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setShadow(0, 2, '#1a0800', 4, true, true);
      container.add(slotText);
      this.characterSlotTexts.push(slotText);

      const zone = this.add.zone(0, 0, SLOT_SIZE + 8, SLOT_SIZE + 8)
        .setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => {
        gfx.clear();
        gfx.fillStyle(0x3a2510, 0.8);
        gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(2, 0xe8d5a3, 0.8);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(1, 0x5a4030, 0.3);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      });
      zone.on('pointerout', () => {
        gfx.clear();
        gfx.fillStyle(0x2a1a0f, 0.7);
        gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(2, 0xb89040, 0.6);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(1, 0x5a4030, 0.3);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      });
      this.attachSlotDragAndClick(zone, charId as PlayerCharacterId | null);
      container.add(zone);

      const cornerGfx = this.add.graphics();
      const cornerLen = 12;
      const cornerGap = 6;
      cornerGfx.lineStyle(1.5, 0xb89040, 0.4);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen, -SLOT_SIZE / 2 + cornerGap);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen, -SLOT_SIZE / 2 + cornerGap);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen, SLOT_SIZE / 2 - cornerGap);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen, SLOT_SIZE / 2 - cornerGap);
      container.add(cornerGfx);

      barContainer.add(container);
    }

    const totalSlotsWidth = slotCount * SLOT_STRIDE - SLOT_GAP;
    this.characterBarMaxScroll = Math.min(0, VISIBLE_BAR_WIDTH - 2 * FADE_WIDTH - totalSlotsWidth);

    this.setCharacterBarScroll(0);
  }

  private attachSlotDragAndClick(zone: Phaser.GameObjects.Zone, zoneCharId: PlayerCharacterId | null): void {
    this.input.setDraggable(zone);
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.characterBarDragging) return;
      this.barDragPending = true;
      this.barDragMoved = false;
      this.barDragStartPointerX = pointer.x;
      this.barDragStartScrollX = this.characterBarScrollX;
    });
    zone.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.barDragPending || this.characterBarDragging) return;
      const dx = pointer.x - this.barDragStartPointerX;
      if (!this.barDragMoved && Math.abs(dx) > 5) this.barDragMoved = true;
      if (this.barDragMoved) {
        this.setCharacterBarScroll(this.barDragStartScrollX + dx);
      }
    });
    zone.on('pointerup', () => {
      const wasMoved = this.barDragMoved;
      this.barDragPending = false;
      this.barDragMoved = false;
      if (wasMoved) return;
      if (!zoneCharId) return;
      const idx = this.playerCharacterIds.indexOf(zoneCharId);
      if (idx < 0 || !this.isSlotVisible(idx)) return;
      GameAudioManager.playSfx(this, 'sfx_button');
      this.showCharacterTooltip(idx);
    });
  }

  private setCharacterBarScroll(x: number): void {
    if (!this.characterBarContainer) return;
    if (this.characterBarMaxScroll >= 0) {
      this.characterBarScrollX = 0;
    } else {
      this.characterBarScrollX = Phaser.Math.Clamp(x, this.characterBarMaxScroll, 0);
    }
    const origin = this.getCharacterBarOrigin();
    this.characterBarContainer.x = origin.x + this.characterBarScrollX;
  }

  private isSlotVisible(slotIndex: number): boolean {
    if (!this.characterBarContainer) return false;
    const origin = this.getCharacterBarOrigin();
    const container = this.characterSlotContainers[slotIndex];
    if (!container) return false;
    const worldCenterX = this.characterBarContainer.x + container.x;
    const slotHalf = SLOT_SIZE / 2;
    return worldCenterX + slotHalf > origin.x && worldCenterX - slotHalf < origin.x + VISIBLE_BAR_WIDTH;
  }

  private async resetCharacterBarScroll(): Promise<void> {
    if (this.characterBarScrollX === 0 || !this.characterBarContainer) {
      this.setCharacterBarScroll(0);
      return;
    }
    this.characterBarDragging = true;
    await waitForTween(this, {
      targets: this,
      characterBarScrollX: 0,
      duration: 200,
      ease: 'Sine.easeOut',
      onUpdate: () => this.setCharacterBarScroll(this.characterBarScrollX),
    });
    this.characterBarDragging = false;
  }

  // ═══════════════════════════════════════════════
  //  CharacterSlotManager implementation
  // ═══════════════════════════════════════════════

  isPlayerCharacter(characterId: string): boolean {
    return this.playerCharacterIds.includes(characterId as PlayerCharacterId);
  }

  getCharacterOrder(characterId: string): number {
    const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx >= 0) return idx;
    if (characterId === this.battle?.enemyCharacterId) return 999;
    return 999;
  }

  showDialog(characterId: string, text: string): void {
    if (!text) return;

    const lines = this.wrapDialogText(text, 15);
    const fontSize = 22;
    const padX = 16;
    const padY = 12;

    let anchorX: number;
    let anchorY: number;
    const tailDir: 'up' | 'down' = this.playerCharacterIds.includes(characterId as PlayerCharacterId) ? 'down' : 'up';

    if (tailDir === 'down') {
      const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
      if (idx < 0 || idx >= this.characterSlotContainers.length) return;
      const slot = this.characterSlotContainers[idx]!;
      const barX = this.characterBarContainer ? this.characterBarContainer.x : 0;
      const barY = this.characterBarContainer ? this.characterBarContainer.y : 0;
      anchorX = slot.x + barX;
      anchorY = slot.y + barY - 140;
    } else {
      anchorX = 54;
      anchorY = 160;
    }

    const container = this.add.container(anchorX, anchorY).setDepth(DEPTH_DAMAGE - 5).setAlpha(0);

    const textObj = this.add.text(0, 0, lines.join('\n'), {
      fontSize: `${fontSize}px`,
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5, 0);

    const textW = textObj.width;
    const textH = textObj.height;
    const boxW = Math.max(textW + padX * 2, 80);
    const boxH = Math.max(textH + padY * 2, 40);
    const totalH = boxH + 10;

    const tailSize = 8;
    const graphicsTop = tailDir === 'down' ? 0 : tailSize;
    const textY = tailDir === 'down' ? padY + 5 : padY + tailSize + 5;

    const gfx = this.add.graphics();
    gfx.fillStyle(0xfffdf5, 0.95);
    gfx.fillRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.fillTriangle(-tailSize, boxH, tailSize, boxH, 0, totalH);
    } else {
      gfx.fillTriangle(-tailSize, tailSize, tailSize, tailSize, 0, 0);
    }
    gfx.lineStyle(2, 0x6a4a2a, 0.7);
    gfx.strokeRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.lineBetween(-tailSize, boxH, 0, totalH);
      gfx.lineBetween(tailSize, boxH, 0, totalH);
    } else {
      gfx.lineBetween(-tailSize, tailSize, 0, 0);
      gfx.lineBetween(tailSize, tailSize, 0, 0);
    }
    container.add(gfx);

    textObj.setY(textY);
    container.add(textObj);

    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(2200, () => {
          this.tweens.add({
            targets: container,
            alpha: 0,
            duration: 400,
            ease: 'Sine.easeIn',
            onComplete: () => container.destroy(),
          });
        });
      },
    });
  }

  private wrapDialogText(text: string, maxPerLine: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const ch of text) {
      current += ch;
      if (current.length >= maxPerLine) {
        lines.push(current);
        current = '';
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [text];
  }

  async glowOn(characterId: string): Promise<void> {
    const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    await this.resetCharacterBarScroll();
    this.skillTriggeredCharacters.add(characterId as PlayerCharacterId);

    const container = this.characterSlotContainers[idx];
    if (!container) return;
    const glowContainer = container.getAt(0) as Phaser.GameObjects.Container | undefined;
    if (!glowContainer) return;

    this.tweens.killTweensOf(glowContainer);
    glowContainer.setAlpha(0);
    glowContainer.setScale(1);

    const glowEls = this.characterSlotGlows[idx];
    if (glowEls) {
      this.tweens.killTweensOf(glowEls.sweepGfx);
      glowEls.sweepGfx.setY(0);
    }

    await waitForTween(this, {
      targets: glowContainer,
      alpha: { from: 0, to: 1 },
      duration: 200,
      ease: 'Sine.easeOut',
    });

    const tweens: Phaser.Tweens.Tween[] = [];
    tweens.push(this.tweens.add({
      targets: glowContainer,
      alpha: { from: 0.7, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }));
    tweens.push(this.tweens.add({
      targets: glowContainer,
      scaleX: { from: 1, to: 1.06 },
      scaleY: { from: 1, to: 1.06 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }));
    if (glowEls) {
      const halfSlot = 64;
      tweens.push(this.tweens.add({
        targets: glowEls.sweepGfx,
        y: { from: -halfSlot, to: halfSlot },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }));
    }
    this.characterSlotGlowTweens.set(idx, tweens);
  }

  /**
   * 技能触发强调动效：左右晃动（加速）的同时放大，晃动结束后缩小回原尺寸。
   * 在 moveToFront 之后调用。晃动与放大并行以缩短总时长。
   */
  async shakeAndPulse(characterId: string): Promise<void> {
    const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    const container = this.characterSlotContainers[idx];
    if (!container) return;

    const origX = container.x;
    const shakeOffsets = [-8, 8, -8, 8, 0];
    const stepMs = 30;
    const scaleTo = 1.15;

    const shakePromise = (async () => {
      for (const offset of shakeOffsets) {
        await waitForTween(this, {
          targets: container,
          x: origX + offset,
          duration: stepMs,
          ease: 'Linear',
        });
      }
    })();

    const scaleUpPromise = waitForTween(this, {
      targets: container,
      scaleX: scaleTo,
      scaleY: scaleTo,
      duration: shakeOffsets.length * stepMs,
      ease: 'Sine.easeOut',
    });

    await Promise.all([shakePromise, scaleUpPromise]);

    await waitForTween(this, {
      targets: container,
      scaleX: 1.0,
      scaleY: 1.0,
      x: origX,
      duration: 150,
      ease: 'Sine.easeIn',
    });
  }

  async glowOff(characterId: string): Promise<void> {
    const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    this.skillTriggeredCharacters.delete(characterId as PlayerCharacterId);

    const container = this.characterSlotContainers[idx];
    if (!container) return;
    const glowContainer = container.getAt(0) as Phaser.GameObjects.Container | undefined;
    if (!glowContainer) return;

    const existingTweens = this.characterSlotGlowTweens.get(idx);
    if (existingTweens) {
      for (const t of existingTweens) t.stop();
      this.characterSlotGlowTweens.delete(idx);
    }

    await waitForTween(this, {
      targets: glowContainer,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeOut',
    });
  }

  async moveToFront(characterId: string): Promise<void> {
    const idx = this.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx <= 0) return;

    const triggeredChars = new Set(this.skillTriggeredCharacters);
    for (const [key, tweens] of this.characterSlotGlowTweens) {
      for (const t of tweens) t.stop();
    }
    this.characterSlotGlowTweens.clear();
    for (const c of this.characterSlotContainers) {
      this.tweens.killTweensOf(c);
    }

    this.playerCharacterIds.splice(idx, 1);
    this.playerCharacterIds.unshift(characterId as PlayerCharacterId);

    const movedContainer = this.characterSlotContainers.splice(idx, 1)[0]!;
    this.characterSlotContainers.unshift(movedContainer);

    const movedGlowEls = this.characterSlotGlows.splice(idx, 1)[0]!;
    this.characterSlotGlows.unshift(movedGlowEls);

    const movedText = this.characterSlotTexts.splice(idx, 1)[0]!;
    this.characterSlotTexts.unshift(movedText);

    const slotTweens: Promise<void>[] = [];
    for (let i = 0; i <= idx; i++) {
      const targetPos = this.getSlotPosition(i);
      slotTweens.push(waitForTween(this, {
        targets: this.characterSlotContainers[i]!,
        x: targetPos.x,
        duration: 300,
        ease: 'Sine.easeOut',
      }));
    }
    await Promise.all(slotTweens);

    for (const cid of triggeredChars) {
      const newIdx = this.playerCharacterIds.indexOf(cid);
      if (newIdx >= 0) {
        const glowEls = this.characterSlotGlows[newIdx];
        if (!glowEls) continue;
        const gc = this.characterSlotContainers[newIdx]?.getAt(0) as Phaser.GameObjects.Container | undefined;
        if (!gc) continue;
        await this.glowOn(cid);
      }
    }
  }

  async restoreSlot(_characterId: string): Promise<void> {
  }

  private showCharacterTooltip(index: number): void {
    this.closeCharacterTooltip();

    const charId = this.playerCharacterIds[index];
    if (!charId) return;

    const char = PLAYER_CHARACTERS[charId];
    const slotContainer = this.characterSlotContainers[index]!;
    const barX = this.characterBarContainer ? this.characterBarContainer.x : 0;
    const barY = this.characterBarContainer ? this.characterBarContainer.y : 0;
    const sx = slotContainer.x + barX;
    const slotY = slotContainer.y + barY;
    const slotSize = 120;

    const tooltipW = 320;
    const tooltipRadius = 8;
    const { width: sw, height: sh } = this.scale;

    const descLinesList: string[][] = [];
    let tooltipH = 50;
    for (const ability of char.abilities) {
      tooltipH += 28;
      const lines = this.wrapText(ability.description, tooltipW - 48, '18px');
      descLinesList.push(lines);
      tooltipH += lines.length * 24;
      tooltipH += 32;
    }
    tooltipH += 12;

    let tooltipX = sx;
    let tooltipY = slotY - slotSize / 2 - tooltipH - 12;
    if (tooltipY < 20) tooltipY = slotY + slotSize / 2 + 12;
    if (tooltipX - tooltipW / 2 < 10) tooltipX = tooltipW / 2 + 10;
    if (tooltipX + tooltipW / 2 > sw - 10) tooltipX = sw - tooltipW / 2 - 10;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.characterTooltip = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.3);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeCharacterTooltip());
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.setInteractive(new Phaser.Geom.Rectangle(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const nameText = this.add.text(tooltipX, tooltipY + 28, char.name, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(nameText);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd0c4a8, 0.5);
    divider.lineBetween(tooltipX - tooltipW / 2 + 20, tooltipY + 50, tooltipX + tooltipW / 2 - 20, tooltipY + 50);
    container.add(divider);

    let abilityY = tooltipY + 72;
    let lineIdx = 0;
    for (const ability of char.abilities) {
      const skillName = this.add.text(tooltipX - tooltipW / 2 + 22, abilityY, `【${ability.name}】`, {
        fontSize: '20px',
        fontFamily: FONT_FAMILY,
        color: '#8a6030',
      }).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(skillName);

      const descLines = descLinesList[lineIdx]!;
      for (const line of descLines) {
        abilityY += 24;
        const descText = this.add.text(tooltipX - tooltipW / 2 + 28, abilityY, line, {
          fontSize: '18px',
          fontFamily: FONT_FAMILY,
          color: '#5a4a30',
        }).setDepth(DEPTH_OVERLAY_TEXT);
        container.add(descText);
      }
      abilityY += 32;
      lineIdx++;
    }

    const closeText = this.add.text(tooltipX + tooltipW / 2 - 28, tooltipY + 14, '✕', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(tooltipX + tooltipW / 2 - 28, tooltipY + 14, 36, 36)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeCharacterTooltip();
    });
    container.add([closeText, closeZone]);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  private wrapText(text: string, maxWidth: number, fontSize: string): string[] {
    const lines: string[] = [];
    let currentLine = '';
    for (const char of text) {
      const testLine = currentLine + char;
      const testText = this.add.text(0, 0, testLine, { fontSize, fontFamily: FONT_FAMILY });
      if (testText.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
      testText.destroy();
    }
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  }

  private closeCharacterTooltip(): void {
    if (!this.characterTooltip) return;
    this.tweens.add({
      targets: this.characterTooltip,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.characterTooltip?.destroy();
        this.characterTooltip = null;
      },
    });
  }

  private showEnemyInfoWindow(): void {
    this.closeEnemyInfoWindow();

    const enemyCharId = this.battle.enemyCharacterId;
    if (!enemyCharId) return;

    const enemy = ENEMY_CHARACTERS[enemyCharId];
    if (!enemy) return;

    const tooltipW = 320;
    const tooltipRadius = 8;
    const { width: sw, height: sh } = this.scale;

    const descLinesList: string[][] = [];
    let tooltipH = 50;
    for (const ability of enemy.abilities) {
      tooltipH += 28;
      const lines = this.wrapText(ability.description, tooltipW - 48, '18px');
      descLinesList.push(lines);
      tooltipH += lines.length * 24;
      tooltipH += 32;
    }
    tooltipH += 12;

    const avatarY = this.enemyAvatarImage.y;
    const avatarX = this.enemyAvatarImage.x;
    const avatarSize = 80;
    let tooltipX = avatarX;
    let tooltipY = avatarY + avatarSize / 2 + 12;

    if (tooltipY + tooltipH > sh - 20) tooltipY = avatarY - avatarSize / 2 - tooltipH - 12;
    if (tooltipX - tooltipW / 2 < 10) tooltipX = tooltipW / 2 + 10;
    if (tooltipX + tooltipW / 2 > sw - 10) tooltipX = sw - tooltipW / 2 - 10;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.enemyInfoWindow = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.3);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeEnemyInfoWindow());
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.setInteractive(new Phaser.Geom.Rectangle(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const nameText = this.add.text(tooltipX, tooltipY + 28, enemy.name, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(nameText);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd0c4a8, 0.5);
    divider.lineBetween(tooltipX - tooltipW / 2 + 20, tooltipY + 50, tooltipX + tooltipW / 2 - 20, tooltipY + 50);
    container.add(divider);

    let abilityY = tooltipY + 72;
    let lineIdx = 0;
    for (const ability of enemy.abilities) {
      const skillName = this.add.text(tooltipX - tooltipW / 2 + 22, abilityY, `【${ability.name}】`, {
        fontSize: '20px',
        fontFamily: FONT_FAMILY,
        color: '#8a6030',
      }).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(skillName);

      const descLines = descLinesList[lineIdx]!;
      for (const line of descLines) {
        abilityY += 24;
        const descText = this.add.text(tooltipX - tooltipW / 2 + 28, abilityY, line, {
          fontSize: '18px',
          fontFamily: FONT_FAMILY,
          color: '#5a4a30',
        }).setDepth(DEPTH_OVERLAY_TEXT);
        container.add(descText);
      }
      abilityY += 32;
      lineIdx++;
    }

    const closeText = this.add.text(tooltipX + tooltipW / 2 - 28, tooltipY + 14, '✕', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(tooltipX + tooltipW / 2 - 28, tooltipY + 14, 36, 36)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeEnemyInfoWindow();
    });
    container.add([closeText, closeZone]);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  private closeEnemyInfoWindow(): void {
    if (!this.enemyInfoWindow) return;
    this.tweens.add({
      targets: this.enemyInfoWindow,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.enemyInfoWindow?.destroy();
        this.enemyInfoWindow = null;
      },
    });
  }

  // ═══════════════════════════════════════════════
  //  Card Rendering
  // ═══════════════════════════════════════════════

  private createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const halfW = CARD_W / 2;
    const halfH = CARD_H / 2;

    const shadowG = this.add.graphics();
    container.add(shadowG);
    container.setData('_shadowG', shadowG);
    shadowG.fillStyle(0x1a0a04, 0.25);
    shadowG.fillRoundedRect(-halfW + 5, -halfH + 6, CARD_W, CARD_H, 8);

    const glowG = this.add.graphics();
    container.add(glowG);
    container.setData('_glowG', glowG);
    glowG.fillStyle(0xffd700, 0.30);
    glowG.fillRoundedRect(-halfW - 4, -halfH - 4, CARD_W + 8, CARD_H + 8, 10);
    glowG.fillStyle(0xffd700, 0.18);
    glowG.fillRoundedRect(-halfW - 9, -halfH - 9, CARD_W + 18, CARD_H + 18, 12);
    glowG.fillStyle(0xffd700, 0.09);
    glowG.fillRoundedRect(-halfW - 15, -halfH - 15, CARD_W + 30, CARD_H + 30, 14);
    glowG.setAlpha(isSelected ? 1 : 0);

    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const textColor = isRed ? '#b02828' : '#1a0a04';
    const isJoker = card.rank >= 25;

    const suitSymbol: Record<string, string> = {
      spade: '♠', club: '♣', heart: '♥', diamond: '♦',
    };

    const g = this.add.graphics();

    // Card background
    g.fillStyle(0xfaf5eb, 1);
    g.fillRoundedRect(-halfW, -halfH, CARD_W, CARD_H, 8);

    // Outer border — double line
    g.lineStyle(2.5, 0x6b4e2b, 0.85);
    g.strokeRoundedRect(-halfW + 3, -halfH + 3, CARD_W - 6, CARD_H - 6, 7);
    g.lineStyle(1, 0xb8963e, 0.5);
    g.strokeRoundedRect(-halfW + 8, -halfH + 8, CARD_W - 16, CARD_H - 16, 6);

    // Corner ornaments — diamond shapes at four corners
    const cornerM = 16;
    const cornerSz = 8;
    const corners: Array<[number, number]> = [
      [-halfW + cornerM, -halfH + cornerM],
      [ halfW - cornerM, -halfH + cornerM],
      [-halfW + cornerM,  halfH - cornerM],
      [ halfW - cornerM,  halfH - cornerM],
    ];

    g.fillStyle(0xb8963e, 0.35);
    for (const [cx, cy] of corners) {
      g.fillPoints([
        new Phaser.Math.Vector2(cx, cy - cornerSz),
        new Phaser.Math.Vector2(cx + cornerSz, cy),
        new Phaser.Math.Vector2(cx, cy + cornerSz),
        new Phaser.Math.Vector2(cx - cornerSz, cy),
      ], true);
    }

    // Decorative dots along inner border edges (one dot every 30px)
    g.fillStyle(0xb8963e, 0.25);
    const step = 28;
    for (let t = halfH - 30; t >= -halfH + 30; t -= step) {
      g.fillCircle(-halfW + 18, t, 2);
      g.fillCircle( halfW - 18, t, 2);
    }
    for (let l = halfW - 30; l >= -halfW + 30; l -= step) {
      g.fillCircle(l, -halfH + 18, 2);
      g.fillCircle(l,  halfH - 18, 2);
    }

    // Central medallion — rotated square frame
    const midSize = 36;
    g.lineStyle(1.2, 0xb8963e, 0.25);
    const midPoints = [
      new Phaser.Math.Vector2(0, -midSize - 8),
      new Phaser.Math.Vector2(midSize + 8, 0),
      new Phaser.Math.Vector2(0, midSize + 8),
      new Phaser.Math.Vector2(-midSize - 8, 0),
    ];
    g.strokePoints(midPoints, true);

    // Small circle inside medallion
    g.lineStyle(1, 0xb8963e, 0.2);
    g.strokeCircle(0, 0, 14);

    container.add(g);

    // ═══ Top-left corner: rank + suit ═══
    const cornerX = -halfW + 16;
    const cornerY = -halfH + 10;

    if (!isJoker) {
      const rankTxt = this.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '34px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(rankTxt);

      const suitTxt = this.add.text(cornerX, cornerY + 34, suitSymbol[card.suit!]!, {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(suitTxt);

      // Large faded suit symbol in center
      const centerSuit = this.add.text(0, 0, suitSymbol[card.suit!]!, {
        fontSize: '60px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0.5).setAlpha(0.12);
      container.add(centerSuit);
    }

    // ═══ Joker rendering ═══
    if (isJoker) {
      const jokerColor = card.rank === 30 ? '#c9a030' : '#1a0a04';

      const cornerLabel = this.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '30px',
        fontFamily: FONT_FAMILY,
        color: jokerColor,
      }).setOrigin(0, 0);
      container.add(cornerLabel);

      const patternName = card.rank === 30 ? 'card_pattern_dragon' : 'card_pattern_tiger';
      const pattern = this.add.image(0, 0, patternName);
      const maxPatternW = CARD_W * 0.7;
      const maxPatternH = CARD_H * 0.7;
      const scale = Math.min(maxPatternW / pattern.width, maxPatternH / pattern.height);
      if (scale < 1) {
        pattern.setScale(scale);
      }
      container.add(pattern);

      const label = this.add.text(0, halfH - 22, 'JOKER', {
        fontSize: '13px',
        fontFamily: FONT_FAMILY,
        color: '#8a6830',
      }).setOrigin(0.5);
      container.add(label);
    }

    container.setData('uid', card.uid);
    container.setData('rank', card.rank);
    container.setData('suit', card.suit ?? '');

    if (card.isTemp) {
      const spiderGfx = this.add.graphics();
      const hw = halfW;
      const hh = halfH;
      spiderGfx.lineStyle(1, 0x88aacc, 0.6);
      spiderGfx.lineBetween(0, 0, -hw, -hh);
      spiderGfx.lineBetween(0, 0, hw, -hh * 0.7);
      spiderGfx.lineBetween(0, 0, -hw * 0.6, hh);
      spiderGfx.lineBetween(0, 0, hw * 0.8, hh * 0.3);
      spiderGfx.lineBetween(0, 0, 0, -hh);
      spiderGfx.lineBetween(0, 0, -hw * 0.3, hh * 0.5);
      spiderGfx.lineBetween(0, 0, hw * 0.4, -hh * 0.3);
      spiderGfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.7, -hh * 0.1);
      spiderGfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.15, -hh * 0.7);
      spiderGfx.lineBetween(hw * 0.5, -hh * 0.2, hw * 0.3, -hh * 0.6);
      spiderGfx.lineBetween(0, -hh * 0.5, hw * 0.25, -hh * 0.8);
      spiderGfx.lineStyle(0.8, 0x88aacc, 0.35);
      spiderGfx.lineBetween(-hw * 0.15, -hh * 0.7, -hw * 0.45, -hh * 0.55);
      spiderGfx.lineBetween(-hw * 0.7, -hh * 0.1, -hw * 0.5, hh * 0.2);
      spiderGfx.lineBetween(hw * 0.3, -hh * 0.6, hw * 0.6, -hh * 0.4);
      spiderGfx.lineBetween(0, hh, -hw * 0.4, hh * 0.35);
      spiderGfx.lineBetween(-hw * 0.3, hh * 0.5, -hw * 0.6, hh * 0.1);
      spiderGfx.setAlpha(0.4);
      container.add(spiderGfx);
    }

    return container;
  }

  private updateCardShadowGlow(container: Phaser.GameObjects.Container, isGlow: boolean): void {
    const glowG = container.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
    if (!glowG) return;
    glowG.setAlpha(isGlow ? 1 : 0);
  }

  private createCardInteractive(card: Card, x: number, y: number, index: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.createCardDisplay(card, x, y, isSelected);
    container.setDepth(DEPTH_PLAYER_HAND);
    container.setData('cardIndex', index);

    return container;
  }

  private renderAllCards(): void {
    this.renderPlayerHand(true);
    this.renderEnemyHand(true);
  }

  private renderPlayerHand(animateEntry: boolean = false): void {
    this.cardObjects.forEach(c => c.destroy());
    this.cardObjects = [];

    const hand = this.battle.player.hand;
    const { width, height } = this.scale;
    const baseY = height - 90;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;
    const offscreenX = width + CARD_W;

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * overlapOffset;
      const isSelected = this.selectedIndices.has(i);
      const y = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const initX = animateEntry ? offscreenX : targetX;
      const obj = this.createCardInteractive(hand[i]!, initX, y, i, isSelected);
      obj.setDepth(DEPTH_PLAYER_HAND + i);
      this.cardObjects.push(obj);

      if (animateEntry) {
        this.tweens.add({
          targets: obj,
          x: targetX,
          duration: 200,
          delay: i * 50,
          ease: 'Cubic.easeOut',
        });
      }
    }
  }

  private renderEnemyHand(animateEntry: boolean = false, baseDelay: number = 700, onComplete?: () => void): void {
    this.enemyCardObjects.forEach(c => c.destroy());
    this.enemyCardObjects = [];

    const hand = this.battle.enemy.hand;
    const { width } = this.scale;
    const baseY = 220;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    const revealedIndices = this.getRevealedEnemyCardIndices();

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * overlapOffset;
      const initY = animateEntry ? -CARD_H : baseY;
      const container = this.add.container(targetX, initY);
      container.setDepth(DEPTH_ENEMY_HAND + i);
      container.setData('cardIndex', i);
      const hc = hand[i]!;
      container.setData('uid', hc.uid);
      container.setData('rank', hc.rank);
      container.setData('suit', hc.suit ?? '');
      if (animateEntry) {
        container.setAlpha(0);
      }

      const enemyShadowG = this.add.graphics();
      enemyShadowG.fillStyle(0x1a0a04, 0.25);
      enemyShadowG.fillRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 6, CARD_W, CARD_H, 8);
      container.add(enemyShadowG);

      if (revealedIndices.has(i)) {
        const revealedDisplay = this.createCardDisplay(hand[i]!, 0, 0, false);
        revealedDisplay.setAlpha(0.6);
        revealedDisplay.setScale(0.75);
        container.add(revealedDisplay);
      } else {
        const cardBack = this.add.image(0, 0, 'card_back');
        cardBack.setDisplaySize(CARD_W, CARD_H);
        container.add(cardBack);
      }

      this.enemyCardObjects.push(container);

      if (animateEntry) {
        this.tweens.add({
          targets: container,
          y: baseY,
          alpha: 1,
          duration: 120,
          delay: baseDelay + i * 100,
          ease: 'Cubic.easeOut',
        });
      }
    }

    if (animateEntry) {
      if (hand.length === 0 && onComplete) {
        onComplete();
      } else if (hand.length > 0) {
        const lastCardAnimEnd = baseDelay + (hand.length - 1) * 100 + 120;
        this.time.delayedCall(lastCardAnimEnd, () => {
          onComplete?.();
        });
      }
    } else if (onComplete) {
      onComplete();
    }
  }

  private getRevealedEnemyCardIndices(): Set<number> {
    if (this.revealedEnemyCards.size === 0) return new Set();
    if (this.battle.enemy.hand.length === 0) return new Set();

    const indices = new Set<number>();
    for (let i = 0; i < this.battle.enemy.hand.length; i++) {
      if (this.revealedEnemyCards.has(this.battle.enemy.hand[i]!)) {
        indices.add(i);
      }
    }
    return indices;
  }

  private getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }> {
    const gap = CARD_W * 0.75;
    const totalW = CARD_W + (count - 1) * gap;
    const startX = centerX - totalW / 2 + CARD_W / 2;
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      positions.push({ x: startX + i * gap, y: centerY });
    }
    return positions;
  }

  private animateCardsToPositions(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
    onComplete?: () => void
  ): void {
    if (cards.length === 0) {
      onComplete?.();
      return;
    }
    const baseDepth = this.centerDepthCounter;
    this.centerDepthCounter += cards.length;
    let completed = 0;
    for (let i = 0; i < cards.length; i++) {
      cards[i]!.setDepth(baseDepth + i);
      this.tweens.add({
        targets: cards[i]!,
        x: positions[i]!.x,
        y: positions[i]!.y,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => {
          completed++;
          if (completed >= cards.length) {
            onComplete?.();
          }
        },
      });
    }
  }

  private clearCenterCards(): void {
    for (const c of this.centerCards) {
      c.destroy();
    }
    this.centerCards = [];
    this.centerCardsOwner = null;
    this.centerDepthCounter = DEPTH_CENTER_BASE;
  }

  private fadeOutCenterCards(onComplete: () => void): void {
    const cards = [...this.centerCards];
    this.centerCards = [];
    this.centerCardsOwner = null;
    if (cards.length === 0) {
      onComplete();
      return;
    }
    this.centerDepthCounter = DEPTH_CENTER_BASE;
    let done = 0;
    for (const c of cards) {
      this.tweens.add({
        targets: c,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        y: c.y - 30,
        duration: 80,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          done++;
          if (done >= cards.length) onComplete();
        },
      });
    }
  }

  private animateShiftAndReplace(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
    onComplete: () => void
  ): void {
    const total = oldCards.length + newCards.length;
    if (total === 0) {
      onComplete();
      return;
    }
    let completed = 0;
    const checkDone = () => {
      completed++;
      if (completed >= total) onComplete();
    };

    const shiftDepth = this.centerDepthCounter;
    this.centerDepthCounter += newCards.length + oldCards.length;

    for (const c of oldCards) {
      c.setDepth(shiftDepth + oldCards.indexOf(c));
      this.tweens.add({
        targets: c,
        x: c.x - 150,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          checkDone();
        },
      });
    }

    const newPositions = this.getCardFanPositions(newCards.length, 1200, 475);
    for (let i = 0; i < newCards.length; i++) {
      newCards[i]!.setDepth(shiftDepth + oldCards.length + i);
      this.tweens.add({
        targets: newCards[i]!,
        x: newPositions[i]!.x,
        y: newPositions[i]!.y,
        duration,
        ease: 'Sine.easeOut',
        onComplete: checkDone,
      });
    }
  }

  private createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[] {
    const entries: Array<{ card: Card; x: number; y: number; isRevealed: boolean }> = [];

    for (const idx of indices) {
      if (idx < this.battle.enemy.hand.length) {
        const card = this.battle.enemy.hand[idx]!;
        const isRevealed = this.revealedEnemyCards.has(card);
        if (isRevealed) {
          this.revealedEnemyCards.delete(card);
        }
        let x: number;
        let y: number;
        if (idx < this.enemyCardObjects.length) {
          x = this.enemyCardObjects[idx]!.x;
          y = this.enemyCardObjects[idx]!.y;
        } else {
          const { width } = this.scale;
          const overlapOffset = CARD_W * 0.75;
          const totalW = CARD_W + (this.battle.enemy.hand.length - 1) * overlapOffset;
          const startX = (width - totalW) / 2 + CARD_W / 2;
          x = startX + idx * overlapOffset;
          y = 220;
        }
        entries.push({ card, x, y, isRevealed });
      }
    }

    const sortedCards = sortPlayedCards(entries.map(e => e.card));
    const cardToEntry = new Map<Card, typeof entries[0]>();
    for (const entry of entries) {
      cardToEntry.set(entry.card, entry);
    }

    const baseDepth = this.centerDepthCounter;
    this.centerDepthCounter += entries.length;
    const displayCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedCards) {
      const entry = cardToEntry.get(card);
      if (entry) {
        const display = this.createCardDisplay(card, entry.x, entry.y, false);
        display.setDepth(baseDepth + displayCards.length);
        if (entry.isRevealed) {
          display.setData('isRevealed', true);
        }
        displayCards.push(display);
        cardToEntry.delete(card);
      }
    }
    for (const entry of cardToEntry.values()) {
      const display = this.createCardDisplay(entry.card, entry.x, entry.y, false);
      display.setDepth(baseDepth + displayCards.length);
      if (entry.isRevealed) {
        display.setData('isRevealed', true);
      }
      displayCards.push(display);
    }

    return displayCards;
  }

  // ═══════════════════════════════════════════════
  //  Interaction
  // ═══════════════════════════════════════════════

  private onCardClick(index: number): void {
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

  private getSelectedCards(): Card[] {
    return [...this.selectedIndices].sort((a, b) => a - b).map(i => this.battle.player.hand[i]!).filter((c): c is Card => c !== undefined);
  }

  private updatePatternHint(): void {
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
    if (this.phase !== 'player_init' && this.phase !== 'player_respond') return;

    const selected = this.getSelectedCards();
    if (selected.length === 0) return;

    let pattern = identifyHand(selected);

    if (!pattern) {
      const playerChar = this.battle.player.characterId;
      if (playerChar) {
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
          pattern = additionalPatterns[0]!;
        }
      }
    }

    if (!pattern) return;

    if (this.phase === 'player_respond') {
      if (!this.battle.lastPlay) return;
      const blockedTypes = getBlockedResponseTypes(this.battle.enemyCharacterId, this.battle.lastPlay);
      if (blockedTypes.includes(pattern.type)) return;
      const playerChar = this.battle.player.characterId;
      const canBeatPlay = playerChar === 'zhugeliang'
        ? canBeatOrEqual(pattern, this.battle.lastPlay)
        : canBeat(pattern, this.battle.lastPlay);
      if (!canBeatPlay) return;
    }

    GameAudioManager.playSfx(this, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this, 'sfx_bomb');
    }
    await this.executePlay(selected, pattern);
  }

  private async onPassClick(): Promise<void> {
    if (this.phase !== 'player_respond') return;

    await this.executePass('player');
  }

  // ═══════════════════════════════════════════════
  //  Battle Logic
  // ═══════════════════════════════════════════════

  private async executePlay(cards: Card[], pattern: HandPattern): Promise<void> {
    const prevPhase = this.phase;
    this.phase = 'animating';

    for (const idx of this.selectedIndices) {
      const cardObj = this.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        this.tweens.killTweensOf(cardObj);
        const glowG = cardObj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
        if (glowG) {
          this.tweens.killTweensOf(glowG);
        }
      }
    }

    const isInit = prevPhase === 'player_init';
    const isBombOnNonBomb = !isInit &&
      (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) &&
      this.battle.lastPlay !== null &&
      this.battle.lastPlay.type !== HandType.Bomb &&
      this.battle.lastPlay.type !== HandType.Rocket;
    const voiceKey = getVoiceKeyForPlay(pattern, isInit, isBombOnNonBomb);
    VoiceManager.play(this, voiceKey);

    const playerHand = this.battle.player.hand;
    const indicesToRemove = this.findCardIndices(playerHand, cards);

    const displayMap = new Map<string, Phaser.GameObjects.Container>();
    for (const idx of this.selectedIndices) {
      const cardObj = this.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        const handCard = playerHand[idx]!;
        displayMap.set(handCard.uid, cardObj);
        const arrIdx = this.cardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.cardObjects.splice(arrIdx, 1);
      }
    }

    this.selectedIndices.clear();

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const pc = playerHand[i]!;
      playedCards.push({ ...pc });
    }

    for (const pc of pattern.cards) {
      if (pc.consideredAs) {
        for (const cd of playedCards) {
          if (cd.uid === pc.uid) {
            cd.consideredAs = { ...pc.consideredAs };
            break;
          }
        }
      }
    }
    for (const i of indicesToRemove) {
      playerHand.splice(i, 1);
    }
    this.battle.player.discardPile.push(...playedCards.filter(c => !c.isTemp));

    const sortedPlayed = sortPlayedCards(playedCards);
    const animatedCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedPlayed) {
      const display = displayMap.get(card.uid);
      if (display) {
        if (card.consideredAs) {
          display.setData('consideredAsRank', card.consideredAs.rank);
          display.setData('consideredAsLabel', `视为 ♠${card.consideredAs.rankLabel}`);
        }
        animatedCards.push(display);
        displayMap.delete(card.uid);
      }
    }
    for (const display of displayMap.values()) {
      animatedCards.push(display);
    }

    for (const card of animatedCards) {
      this.updateCardShadowGlow(card, false);
    }

    this.battle.lastPlay = pattern;
    this.battle.turnHolder = 'player';

    this.clearCenterCards();
    sortHand(playerHand);
    this.renderPlayerHand();
    this.updatePatternHint();

    const onPlayCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.player.characterId ?? this.playerCharacterIds[0]!,
      pattern,
      target: 'enemy',
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      centerCardContainers: this.centerCards,
      playedCards,
    };

    if (animatedCards.length === 0) {
      await this.skillEventBus.emit(SkillTiming.ON_PLAY, onPlayCtx);
      await this.handlePostPlayEmptyHandCheck(playerHand, pattern);
      return;
    }

    const positions = this.getCardFanPositions(animatedCards.length, 1200, 475);
    await this.animateCardsToPositionsAsync(animatedCards, positions, 120);

    for (const card of animatedCards) {
      const labelText = card.getData('consideredAsLabel') as string | undefined;
      if (labelText) {
        const halfW = CARD_W / 2;
        const halfH = CARD_H / 2;
        const tagBg = this.add.graphics();
        const tagW = 120;
        const tagH = 26;
        const tagX = -halfW + 4;
        const tagY = halfH - tagH - 4;
        tagBg.fillStyle(0xfaf5eb, 0.85);
        tagBg.fillRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        tagBg.lineStyle(1, 0x8a6030, 0.6);
        tagBg.strokeRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        const tagText = this.add.text(0, tagH / 2, labelText, {
          fontSize: '20px',
          fontFamily: FONT_FAMILY,
          color: '#5a3a20',
        }).setOrigin(0.5);
        const tagContainer = this.add.container(tagX, tagY).setDepth(DEPTH_CENTER_BASE + 200);
        tagContainer.add([tagBg, tagText]);
        card.add(tagContainer);
        card.setData('_consideredTag', tagContainer);
      }
    }

    this.centerCards = animatedCards;
    this.centerCardsOwner = 'player';

    onPlayCtx.centerCardContainers = this.centerCards;
    await this.skillEventBus.emit(SkillTiming.ON_PLAY, onPlayCtx);

    if (playerHand.length === 0) {
      await this.playDamageSettlement(pattern, 'enemy', true);
      if (this.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      this.battle.lastPlay = null;
      this.refillPlayerHand();
      this.renderPlayerHand(true);
      await this.fadeOutCenterCardsAsync();
      this.battle.turnHolder = 'enemy';
      this.phase = 'ai_init';
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      await this.aiInitiatePlay();
      return;
    }

    await waitForDelay(this, 300);
    this.phase = 'ai_respond';
    this.updateUIForPhase();
    this.respondChainDepth = this.respondChainDepth + 1;
    await this.aiRespond();
  }

  private async handlePostPlayEmptyHandCheck(hand: Card[], pattern: HandPattern): Promise<void> {
    if (hand.length === 0) {
      await this.playDamageSettlement(pattern, 'enemy', true);
      if (this.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      this.battle.lastPlay = null;
      this.refillPlayerHand();
      this.renderPlayerHand(true);
      await this.fadeOutCenterCardsAsync();
      this.battle.turnHolder = 'enemy';
      this.phase = 'ai_init';
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      await this.aiInitiatePlay();
      return;
    }

    await waitForDelay(this, 300);
    this.phase = 'ai_respond';
    this.updateUIForPhase();
    this.respondChainDepth = this.respondChainDepth + 1;
    await this.aiRespond();
  }

  private async executePass(who: 'player' | 'enemy'): Promise<void> {
    this.phase = 'animating';

    await this.showPassAnimation(who);
    VoiceManager.play(this, getRandomPassVoice(), who);

    if (!this.battle.lastPlay) {
      if (who === 'player') {
        this.battle.turnHolder = 'enemy';
        this.phase = 'ai_init';
        this.updateUIForPhase();
        this.respondChainDepth = 0;
        await this.aiInitiatePlay();
      } else {
        this.battle.turnHolder = 'player';
        this.phase = 'player_init';
        this.initActiveSkills();
        await this.refillIfEmpty('player');
        this.updateUIForPhase();
        this.respondChainDepth = 0;
      }
      return;
    }

    const lastPlay = this.battle.lastPlay;

    if (who === 'player') {
      this.battle.turnHolder = 'enemy';
      this.renderPlayerHand();
      this.updatePatternHint();

      await this.playDamageSettlement(lastPlay, 'player', false);
      if (this.damageSettlementCancelled) return;
      if (this.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.battle.lastPlay = null;
      await this.fadeOutCenterCardsAsync();
      this.phase = 'ai_init';
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      await this.aiInitiatePlay();
    } else {
      // player pass → enemy lastPlay deals damage to enemy
      this.battle.turnHolder = 'player';

      await this.playDamageSettlement(lastPlay, 'enemy', false);
      if (this.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      this.battle.lastPlay = null;
      await this.fadeOutCenterCardsAsync();
      this.phase = 'player_init';
      this.initActiveSkills();
      await this.refillIfEmpty('player');
      this.updateUIForPhase();
      this.respondChainDepth = 0;
    }
  }

  private showPassAnimation(who: 'player' | 'enemy'): Promise<void> {
    const { width, height } = this.scale;
    const posY = who === 'player' ? height - 90 : 220;

    const passText = this.add.text(width / 2, posY, '过', {
      fontSize: '108px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#5a3000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

    passText.setShadow(0, 0, '#ff8800', 18, true, true);

    return waitForTween(this, {
      targets: passText,
      alpha: 1,
      duration: 80,
      ease: 'Sine.easeOut',
    }).then(() =>
      waitForTween(this, {
        targets: passText,
        scaleX: { from: 0, to: 1 },
        duration: 400,
        yoyo: true,
        ease: 'Sine.easeInOut',
      }).then(() => passText.destroy()),
    );
  }

  private refillPlayerHand(): void {
    const player = this.battle.player;
    const needed = 17 - player.hand.length;

    if (needed <= 0) return;

    if (player.deck.length < needed) {
      const remaining = player.deck.splice(0);
      player.deck = shuffleDeck(player.discardPile);
      player.discardPile = [];
      player.deck.push(...remaining);
    }

    const drawn = player.deck.splice(0, needed);
    player.hand.push(...drawn);
    sortHand(player.hand);
  }

  private refillEnemyHand(): void {
    const enemy = this.battle.enemy;
    const needed = 17 - enemy.hand.length;

    if (needed <= 0) return;

    if (enemy.deck.length < needed) {
      const remaining = enemy.deck.splice(0);
      enemy.deck = shuffleDeck(enemy.discardPile);
      enemy.discardPile = [];
      enemy.deck.push(...remaining);
    }

    const drawn = enemy.deck.splice(0, needed);
    enemy.hand.push(...drawn);
    sortHand(enemy.hand);
  }

  /**
   * 获得牌权时的安全网：若该方手牌为空（例如被弃置技能清空），
   * 立即摸满 17 张并刷新显示。手牌非空时为无操作。
   */
  private async refillIfEmpty(who: 'player' | 'enemy'): Promise<void> {
    if (who === 'player') {
      if (this.battle.player.hand.length === 0) {
        this.refillPlayerHand();
        this.renderPlayerHand(true);
      }
      return;
    }
    if (this.battle.enemy.hand.length === 0) {
      this.refillEnemyHand();
      await this.renderEnemyHandAsync(300);
    }
  }

  private async aiRespond(): Promise<void> {
    await waitForDelay(this, 400);
    this.battle.phase = 'respond';
    const cards = decidePlay(this.battle);
    if (!cards || cards.length === 0) {
      await this.executePass('enemy');
      return;
    }

    const pattern = identifyHand(cards)!;
    GameAudioManager.playSfx(this, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this, 'sfx_bomb');
    }

    const isBombOnNonBomb = this.respondChainDepth > 0 &&
      (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) &&
      this.battle.lastPlay !== null &&
      this.battle.lastPlay.type !== HandType.Bomb &&
      this.battle.lastPlay.type !== HandType.Rocket;
    const voiceKey = getVoiceKeyForPlay(pattern, false, isBombOnNonBomb);
    VoiceManager.play(this, voiceKey, 'enemy');

    const enemyHand = this.battle.enemy.hand;
    const indicesToRemove = this.findCardIndices(enemyHand, cards);

    const displayCards = this.createEnemyDisplayCards(indicesToRemove);

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const ei = enemyHand[i]!; playedCards.push({ ...ei });
    }
    for (const i of indicesToRemove) {
      enemyHand.splice(i, 1);
    }
    this.battle.enemy.discardPile.push(...playedCards);
    sortHand(enemyHand);

    this.battle.lastPlay = pattern;
    this.battle.turnHolder = 'enemy';

    this.renderEnemyHand();
    this.updateTurnIndicator('enemy');

    const playerCenterCards = [...this.centerCards];

    const pos = this.getCardFanPositions(displayCards.length, 1380, 475);
    await this.animateCardsToPositionsAsync(displayCards, pos, 120);

    if (enemyHand.length === 0) {
      this.centerCards = [...displayCards];
      this.centerCardsOwner = 'enemy';

      const aiOnPlayCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: this.battle.enemyCharacterId ?? 'unknown',
        pattern,
        target: 'player',
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
        centerCardContainers: this.centerCards,
        playedCards,
      };
      await this.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

      await this.playDamageSettlement(pattern, 'player', true);
      if (this.damageSettlementCancelled) return;
      if (this.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.battle.lastPlay = null;
      this.refillEnemyHand();

      const gainTurnCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: 'zhugeliang',
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
      };
      await this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);

      await this.renderEnemyHandAsync(300);
      await this.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
      this.centerCards = displayCards;
      this.centerCardsOwner = 'enemy';
      await waitForDelay(this, 100);
      await this.fadeOutCenterCardsAsync();
      this.battle.turnHolder = 'player';
      this.phase = 'player_init';
      this.initActiveSkills();
      await this.refillIfEmpty('player');
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      return;
    }

    await waitForDelay(this, 600);
    await this.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
    this.centerCards = displayCards;
    this.centerCardsOwner = 'enemy';

    const aiOnPlayCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.enemyCharacterId ?? 'unknown',
      pattern,
      target: 'player',
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      centerCardContainers: this.centerCards,
      playedCards,
    };
    await this.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

    this.phase = 'player_respond';
    this.updateUIForPhase();
    this.respondChainDepth = this.respondChainDepth + 1;
  }

  private async aiInitiatePlay(): Promise<void> {
    const enemyWasEmpty = this.battle.enemy.hand.length === 0;
    await this.refillIfEmpty('enemy');
    if (enemyWasEmpty) {
      const gainTurnCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: 'zhugeliang',
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
      };
      await this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);
    }
    this.respondChainDepth = 0;
    const turnStartCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.enemyCharacterId ?? 'unknown',
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
    };
    await this.skillEventBus.emit(SkillTiming.ON_TURN_START, turnStartCtx);

    await waitForDelay(this, 400);
    this.battle.phase = 'play';
    const cards = decidePlay(this.battle);
    if (!cards || cards.length === 0) {
      this.battle.lastPlay = null;
      this.battle.turnHolder = 'player';
      this.phase = 'player_init';
      this.initActiveSkills();
      await this.refillIfEmpty('player');
      this.updateUIForPhase();
      return;
    }

    const pattern = identifyHand(cards)!;
    GameAudioManager.playSfx(this, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this, 'sfx_bomb');
    }

    const voiceKey = getVoiceKeyForPlay(pattern, true, false);
    VoiceManager.play(this, voiceKey, 'enemy');

    const enemyHand = this.battle.enemy.hand;
    const indicesToRemove = this.findCardIndices(enemyHand, cards);

    const displayCards = this.createEnemyDisplayCards(indicesToRemove);

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const ei = enemyHand[i]!; playedCards.push({ ...ei });
    }
    for (const i of indicesToRemove) {
      enemyHand.splice(i, 1);
    }
    this.battle.enemy.discardPile.push(...playedCards);
    sortHand(enemyHand);

    this.battle.lastPlay = pattern;
    this.battle.turnHolder = 'enemy';

    this.clearCenterCards();
    this.renderEnemyHand();
    this.updateTurnIndicator('enemy');

    const pos = this.getCardFanPositions(displayCards.length, 1200, 475);
    await this.animateCardsToPositionsAsync(displayCards, pos, 120);
    this.centerCards = displayCards;
    this.centerCardsOwner = 'enemy';

    const aiOnPlayCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.enemyCharacterId ?? 'unknown',
      pattern,
      target: 'player',
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      centerCardContainers: this.centerCards,
      playedCards,
    };
    await this.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

    if (enemyHand.length === 0) {
      await this.playDamageSettlement(pattern, 'player', true);
      if (this.damageSettlementCancelled) return;
      if (this.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.battle.lastPlay = null;
      this.refillEnemyHand();

      const gainTurnCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: 'zhugeliang',
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
      };
      await this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);

      await this.renderEnemyHandAsync(300);
      await this.fadeOutCenterCardsAsync();
      this.battle.turnHolder = 'player';
      this.phase = 'player_init';
      this.initActiveSkills();
      await this.refillIfEmpty('player');
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      return;
    }

    await waitForDelay(this, 300);
    this.phase = 'player_respond';
    this.updateUIForPhase();
  }

  private findCardIndices(hand: Card[], cards: Card[]): number[] {
    const used = new Set<number>();
    const result: number[] = [];
    for (const card of cards) {
      for (let i = 0; i < hand.length; i++) {
        if (!used.has(i) && hand[i]!.uid === card.uid) {
          used.add(i);
          result.push(i);
          break;
        }
      }
    }
    return result.sort((a, b) => b - a);
  }

  // ═══════════════════════════════════════════════
  //  UI Updates
  // ═══════════════════════════════════════════════

  private updateUIForPhase(): void {
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

  private updateTurnIndicator(who: 'player' | 'enemy'): void {
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

  private updateVitalityBars(): void {
    const { height } = this.scale;
    const barX = 120;
    const barW = 420;
    const barH = 34;

    this.drawVitalityBar(
      this.enemyVitalityBar,
      this.enemyVitalityText,
      this.battle.enemy.vitality,
      this.battle.enemy.vitalityMax,
      barX, 56, barW, barH
    );
    this.drawVitalityBar(
      this.playerVitalityBar,
      this.playerVitalityText,
      this.battle.player.vitality,
      this.battle.player.vitalityMax,
      barX, height - 374, barW, barH
    );
    this.enemyDeckText.setText(`牌堆 ${this.battle.enemy.deck.length}`);
    this.playerDeckText.setText(`牌堆 ${this.battle.player.deck.length}`);
  }

  private drawVitalityBar(
    gfx: Phaser.GameObjects.Graphics,
    text: Phaser.GameObjects.Text,
    current: number,
    max: number,
    barX: number,
    barY: number,
    barW: number,
    barH: number
  ): void {
    gfx.clear();
    const ratio = Math.max(0, current / max);

    // Background
    gfx.fillStyle(0xe8dcc8, 0.8);
    gfx.fillRoundedRect(barX, barY, barW, barH, 4);

    // Fill
    let fillColor = 0x60a030;
    if (ratio < 0.3) fillColor = 0xa03030;
    else if (ratio < 0.6) fillColor = 0xc0a030;

    if (ratio > 0) {
      gfx.fillStyle(fillColor, 0.9);
      gfx.fillRoundedRect(barX + 1, barY + 1, (barW - 2) * ratio, barH - 2, 3);
    }

    // Border
    gfx.lineStyle(1, 0x9a8a6a, 0.6);
    gfx.strokeRoundedRect(barX, barY, barW, barH, 4);

    text.setText(`${current} / ${max}`);
    text.setPosition(barX + barW / 2, barY + barH / 2);
  }

  private animateHealthBarDepletion(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
    onComplete: () => void
  ): void {
    const battleObj = target === 'enemy' ? this.battle.enemy : this.battle.player;
    const oldVitality = battleObj.vitality;
    const vitObj = { value: oldVitality };

    this.tweens.add({
      targets: vitObj,
      value: newVitality,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        battleObj.vitality = Math.round(vitObj.value);
        this.updateVitalityBars();
      },
      onComplete: () => {
        battleObj.vitality = newVitality;
        this.updateVitalityBars();
        onComplete();
      },
    });
  }

  private async playDamageSettlement(
    pattern: HandPattern,
    target: 'enemy' | 'player',
    isEmptyHand: boolean,
  ): Promise<void> {
    this.phase = 'animating';
    this.damageSettlementCancelled = false;

    const cards = [...this.centerCards];
    const sumRanks = pattern.cards.reduce((sum, c) => sum + (c.consideredAs?.rank ?? c.rank), 0);
    const coefficient = getCoefficient(pattern.type, pattern.length);
    const baseCoefficient = coefficient;
    const damageMultiplier = isEmptyHand ? 5 : 1;
    const finalDamage = Math.round(sumRanks * coefficient * damageMultiplier);

    const damageInfo = { sumRanks, coefficient, baseCoefficient, damageMultiplier, finalDamage };
    const sourceCharId = target === 'enemy'
      ? (this.battle.player.characterId ?? this.playerCharacterIds[0]!)
      : (this.battle.enemyCharacterId ?? 'unknown');

    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const counterText = this.add.text(centerX, centerY, '0', {
      fontSize: '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#cc3333',
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#ff8800', 14, true, true);

    const cardPhaseMs = cards.length > 0 ? cards.length * 360 + 180 : 0;

    await this.stage1RevealCards(
      cards, counterText, damageInfo, pattern, target, sourceCharId,
    );
    if (this.damageSettlementCancelled) return;
    await waitForDelay(this, 180);

    // stage1 中单牌技能（如文天祥丹心）可能将加成累加进 sumRanks，重算 finalDamage
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage2ShowCoefficient(
      counterText, pattern, damageInfo, baseCoefficient, isEmptyHand, target, sourceCharId,
    );
  }

  private async stage1RevealCards(
    cards: Phaser.GameObjects.Container[],
    counterText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    pattern: HandPattern,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    let currentSum = 0;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      const consideredAsRank = card.getData('consideredAsRank') as number | undefined;
      const rank = consideredAsRank ?? (card.getData('rank') as number ?? 0);

      GameAudioManager.playSfx(this, 'sfx_card_reveal');

      const floatText = this.add.text(card.x, card.y, `+${rank}`, {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#b08030',
        stroke: '#1a0800',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(DEPTH_DAMAGE + 1).setAlpha(0).setScale(0.5);

      // 弹出文字出现 + 卡牌放大 并行
      await Promise.all([
        waitForTween(this, {
          targets: floatText,
          alpha: 1,
          scaleX: 1.15,
          scaleY: 1.15,
          y: floatText.y - 40,
          duration: 180,
          ease: 'Back.easeOut',
        }),
        waitForTween(this, {
          targets: card,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 180,
          ease: 'Sine.easeIn',
        }),
      ]);

      // 单牌伤害结算时：分数出现后、消失前。技能可修改弹出分数并将加成写入 scoreBonus。
      const singleCard = {
        card,
        scoreText: floatText,
        baseScore: rank,
        scoreBonus: 0,
      };
      const singleCardCtx: SkillContext = {
        gameScene: this,
        battle: this.battle,
        sourceCharacterId: sourceCharId,
        pattern,
        target,
        damageInfo,
        playerCharacterIds: this.playerCharacterIds,
        enemyCharacterId: this.battle.enemyCharacterId,
        centerCardContainers: this.centerCards,
        singleCard,
      };
      await this.skillEventBus.emit(SkillTiming.ON_SINGLE_CARD_SETTLEMENT, singleCardCtx);
      if (this.damageSettlementCancelled) break;

      const cardScore = rank + singleCard.scoreBonus;
      currentSum += cardScore;
      counterText.setText(`${currentSum}`);
      damageInfo.sumRanks += singleCard.scoreBonus;

      await this.skillEventBus.emit(SkillTiming.AFTER_SINGLE_CARD_SETTLEMENT, singleCardCtx);

      // 弹出文字消失（fire-and-forget，保持与下一张牌并行的原节奏）+ 卡牌缩小
      this.tweens.add({
        targets: floatText,
        alpha: 0,
        y: floatText.y - 100,
        duration: 400,
        ease: 'Sine.easeIn',
        onComplete: () => floatText.destroy(),
      });

      await waitForTween(this, {
        targets: card,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Sine.easeOut',
      });
    }
  }

  private async stage2ShowCoefficient(
    counterText: Phaser.GameObjects.Text,
    pattern: HandPattern,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    baseCoefficient: number,
    isEmptyHand: boolean,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    if (this.damageSettlementCancelled) return;
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;
    const typeLabel = HAND_TYPE_LABELS[pattern.type];

    await waitForTween(this, {
      targets: counterText,
      x: centerX - 50,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const coeffText = this.add.text(centerX + 60, centerY,
      `✖️ ${baseCoefficient}（${typeLabel}）`,
      {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#8a5a20',
        stroke: '#1a0800',
        strokeThickness: 3,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 0, '#ff8800', 14, true, true);

    await waitForTween(this, {
      targets: coeffText,
      alpha: 1,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const multiplierText = this.add.text(
      coeffText.x + coeffText.width + 16,
      centerY,
      `✖️ ${damageInfo.damageMultiplier}（伤害倍数）`,
      {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#b08030',
        stroke: '#1a0800',
        strokeThickness: 3,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 0, '#ffaa00', 14, true, true);

    await waitForTween(this, {
      targets: multiplierText,
      alpha: 1,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const onCoeffCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      damageInfo,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      centerCardContainers: this.centerCards,
      coefficientLabel: coeffText,
    };
    await this.skillEventBus.emit(SkillTiming.ON_COEFFICIENT_REVEALED, onCoeffCtx);

    const multiplierCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      isEmptyHand,
      damageInfo,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
      centerCardContainers: this.centerCards,
      multiplierLabel: multiplierText,
    };
    await this.skillEventBus.emit(SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED, multiplierCtx);

    // 倍数技能（如韩信点兵）可能修改 damageMultiplier，重算 finalDamage
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage3ApplyDamage(counterText, coeffText, multiplierText, damageInfo, target, pattern, sourceCharId);
  }

  private async stage3ApplyDamage(
    counterText: Phaser.GameObjects.Text,
    coeffText: Phaser.GameObjects.Text,
    multiplierText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    target: 'enemy' | 'player',
    pattern: HandPattern,
    sourceCharId: string,
  ): Promise<void> {
    if (this.damageSettlementCancelled) return;
    const { height } = this.scale;

    const labelsToFade: Phaser.GameObjects.Text[] = [coeffText, multiplierText];

    const currentDisplay = parseInt(counterText.text, 10) || damageInfo.sumRanks;

    await Promise.all([
      Promise.all(labelsToFade.map(t =>
        waitForTween(this, {
          targets: t,
          alpha: 0,
          duration: 600,
          ease: 'Sine.easeOut',
        }).then(() => t.destroy()),
      )),
      waitForCounterTween(this, {
        from: currentDisplay,
        to: damageInfo.finalDamage,
        duration: 600,
        ease: 'Cubic.easeOut',
        onUpdate: (val) => counterText.setText(`${Math.round(val)}`),
      }),
    ]);

    if (damageInfo.finalDamage <= 0) {
      await waitForTween(this, {
        targets: counterText,
        alpha: 0,
        duration: 1200,
        ease: 'Sine.easeOut',
      });
      counterText.destroy();
      return;
    }

    GameAudioManager.playSfx(this, 'sfx_hurt');

    const barX = 120;
    const barW = 420;
    const barH = 34;
    const barTargetY = target === 'enemy' ? 56 : height - 374;
    const barCenterX = barX + barW / 2;
    const barCenterY = barTargetY + barH / 2;

    await waitForTween(this, {
      targets: counterText,
      x: barCenterX,
      y: barCenterY,
      scaleX: 2.0,
      scaleY: 2.0,
      duration: 300,
      ease: 'Cubic.easeIn',
    });

    counterText.destroy();

    const battleObj = target === 'enemy' ? this.battle.enemy : this.battle.player;
    const newVitality = Math.max(0, battleObj.vitality - damageInfo.finalDamage);
    await this.animateHealthBarDepletionAsync(target, newVitality, 300);

    const healthDecreaseCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      playerCharacterIds: this.playerCharacterIds,
      damageInfo,
    };
    await this.skillEventBus.emit(SkillTiming.AFTER_HEALTH_DECREASE, healthDecreaseCtx);

    if (battleObj.vitality <= 0) return;

    const afterDmgCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
    };
    await this.skillEventBus.emit(SkillTiming.AFTER_DAMAGE, afterDmgCtx);
    this.applyPostDamageEffects(pattern, target, damageInfo.finalDamage);
  }

  private applyPostDamageEffects(_pattern: HandPattern, _target: 'enemy' | 'player', _finalDamage: number): void {
  }

  private async animateCardsToPositionsAsync(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
  ): Promise<void> {
    if (cards.length === 0) return;
    const baseDepth = this.centerDepthCounter;
    this.centerDepthCounter += cards.length;
    await Promise.all(
      cards.map((card, i) => {
        card.setDepth(baseDepth + i);
        const pos = positions[i]!;
        return waitForTween(this, {
          targets: card,
          x: pos.x,
          y: pos.y,
          duration,
          ease: 'Sine.easeOut',
        });
      }),
    );
  }

  private async fadeOutCenterCardsAsync(): Promise<void> {
    const cards = [...this.centerCards];
    this.centerCards = [];
    this.centerCardsOwner = null;
    if (cards.length === 0) return;
    this.centerDepthCounter = DEPTH_CENTER_BASE;
    await fadeOutAndDestroy(cards, 80, this);
  }

  private async animateShiftAndReplaceAsync(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
  ): Promise<void> {
    const total = oldCards.length + newCards.length;
    if (total === 0) return;

    const shiftDepth = this.centerDepthCounter;
    this.centerDepthCounter += newCards.length + oldCards.length;

    const oldPromises = oldCards.map((c, i) => {
      c.setDepth(shiftDepth + i);
      return waitForTween(this, {
        targets: c,
        x: c.x - 150,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration,
        ease: 'Sine.easeIn',
      }).then(() => c.destroy());
    });

    const newPositions = this.getCardFanPositions(newCards.length, 1200, 475);
    const newPromises = newCards.map((card, i) => {
      card.setDepth(shiftDepth + oldCards.length + i);
      const pos = newPositions[i]!;
      return waitForTween(this, {
        targets: card,
        x: pos.x,
        y: pos.y,
        duration,
        ease: 'Sine.easeOut',
      });
    });

    await Promise.all([...oldPromises, ...newPromises]);
  }

  private renderEnemyHandAsync(delay: number): Promise<void> {
    return new Promise(resolve => {
      this.renderEnemyHand(true, delay, resolve);
    });
  }

  private async animateHealthBarDepletionAsync(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
  ): Promise<void> {
    return new Promise(resolve => {
      this.animateHealthBarDepletion(target, newVitality, duration, resolve);
    });
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

  private showGameOver(playerWin: boolean): void {
    this.phase = 'game_over';
    this.battleBgm?.stop();

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
    const btnX = w - 230;
    const btnY = 70;
    const btnW = 180;
    const btnH = 72;
    const radius = 16;

    const container = this.add.container(0, 0).setDepth(DEPTH_UI);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x1a0a04, 0.15);
    shadow.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 3, btnW, btnH, radius);
    container.add(shadow);

    const bg = this.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x8a6030, 0.8);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1, 0xb8963e, 0.35);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xd4c4a8, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2.5, 0x6a4020, 1);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1.2, 0xb8963e, 0.5);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawPressed = () => {
      bg.clear();
      bg.fillStyle(0x9a8a6a, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x5a3018, 0.9);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
    };
    drawNormal();
    container.add(bg);

    const text = this.add.text(btnX, btnY, '牌型', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5);
    container.add(text);

    const zone = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
    });
    zone.on('pointerout', () => {
      drawNormal();
    });
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      drawPressed();
      this.time.delayedCall(80, () => {
        drawNormal();
        this.showHandPatternModal();
      });
    });
    container.add(zone);

    this.handPatternButton = container;
  }

  private showHandPatternModal(): void {
    if (this.handPatternModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 880;
    const modalH = 920;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const pad = 24;
    const radius = 8;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.handPatternModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeHandPatternModal());
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1, 0xa89878, 0.3);
    panel.strokeRoundedRect(modalX + 4, modalY + 4, modalW - 8, modalH - 8, radius - 1);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const titleY = modalY + 36;
    const title = this.add.text(modalX + modalW / 2, titleY, '牌型系数表', {
      fontSize: '42px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const closeBtnX = modalX + modalW - 38;
    const closeBtnY = modalY + 22;
    const closeText = this.add.text(closeBtnX, closeBtnY, '✕', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(closeBtnX, closeBtnY, 52, 52).setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeHandPatternModal();
    });
    container.add([closeText, closeZone]);

    const col1X = modalX + pad + 6;
    const col2X = col1X + 160;
    const col3X = col1X + 410;
    const headerY = titleY + 38;
    const headerStyle = { fontSize: '34px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;

    headerStyle satisfies Phaser.Types.GameObjects.Text.TextStyle;

    const headerBg = this.add.graphics();
    headerBg.fillStyle(0xe0d8c8, 0.6);
    headerBg.fillRect(modalX + pad, headerY - 8, modalW - pad * 2, 36);
    container.add(headerBg);

    container.add(this.add.text(col1X, headerY, '牌型', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.add.text(col2X, headerY, '系数', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.add.text(col3X, headerY, '说明', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(modalX + pad, headerY + 14, modalX + modalW - pad, headerY + 14);
    container.add(divider);

    interface RowData {
      name: string;
      coeff: string;
      desc: string;
    }

    const rows: RowData[] = [
      { name: '单张', coeff: '×1', desc: '任意 1 张' },
      { name: '对子', coeff: '×1.2', desc: '同点 2 张' },
      { name: '三张', coeff: '×1.5', desc: '同点 3 张' },
      { name: '三带一', coeff: '×1.5', desc: '三张 + 1 单张' },
      { name: '三带二', coeff: '×2', desc: '三张 + 1 对子' },
      { name: '顺子', coeff: '2+(n-5)×0.5', desc: '不小于5张点数连续牌，n为牌数' },
      { name: '连对', coeff: '×2', desc: '连续对子，3 对起' },
      { name: '飞机', coeff: '×2.5', desc: '连续三张，2 组起' },
      { name: '飞机带单', coeff: '×2.5', desc: '飞机 + 等量单张' },
      { name: '飞机带对', coeff: '×2.5', desc: '飞机 + 等量对子' },
      { name: '炸弹', coeff: '×3', desc: '同点 4 张' },
      { name: '王炸', coeff: '×4', desc: '小王 + 大王' },
    ];

    const rowH = 46;
    const nameStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#2a1008' } as const;
    const coeffStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;
    const descStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;

    rows.forEach((row, i) => {
      const y = headerY + 34 + i * rowH;
      const isOdd = i % 2 === 1;
      if (isOdd) {
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0xe8e0d0, 0.5);
        rowBg.fillRect(modalX + pad, y - rowH / 2 + 2, modalW - pad * 2, rowH - 3);
        container.add(rowBg);
      }
      if (i > 0) {
        const rowDivider = this.add.graphics();
        rowDivider.lineStyle(1, 0xd0c8b8, 0.25);
        rowDivider.lineBetween(modalX + pad, y - rowH / 2, modalX + modalW - pad, y - rowH / 2);
        container.add(rowDivider);
      }

      container.add(this.add.text(col1X, y, row.name, nameStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.add.text(col2X, y, row.coeff, coeffStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.add.text(col3X, y, row.desc, descStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    });

    const footerY = headerY + 24 + rows.length * rowH + 16;
    const footerDivider = this.add.graphics();
    footerDivider.lineStyle(1, 0xc8b898, 0.4);
    footerDivider.lineBetween(modalX + pad, footerY, modalX + modalW - pad, footerY);
    container.add(footerDivider);

    const noteStyle = { fontSize: '22px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;
    const note2 = this.add.text(modalX + pad + 6, footerY + 24, '清空手牌时伤害×5', noteStyle)
      .setOrigin(0, 0).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(note2);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private closeHandPatternModal(): void {
    if (!this.handPatternModal) return;
    this.tweens.add({
      targets: this.handPatternModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.handPatternModal?.destroy();
        this.handPatternModal = null;
      },
    });
  }

  // ═══════════════════════════════════════════════
  //  Battle BGM
  // ═══════════════════════════════════════════════

  private initBattleBgm(): void {
    this.playRandomBattleBgm();
  }

  private playRandomBattleBgm(excludeIndex?: number): void {
    let index: number;
    do {
      index = Math.floor(Math.random() * this.battleBgmKeys.length);
    } while (index === excludeIndex && this.battleBgmKeys.length > 1);

    this.currentBattleBgmIndex = index;
    const settings = loadAudioSettings();
    this.battleBgm = this.sound.add(this.battleBgmKeys[index]!, { loop: false, volume: settings.bgmVolume });
    GameAudioManager.track(this, this.battleBgm);
    this.battleBgm.on('complete', () => this.onBattleBgmComplete());
    this.battleBgm.play();
  }

  private onBattleBgmComplete(): void {
    if (this.phase === 'game_over') return;
    this.playRandomBattleBgm(this.currentBattleBgmIndex);
  }

  cancelDamageSettlement(): void {
    this.damageSettlementCancelled = true;

    const texts = this.children.list.filter(
      c => c instanceof Phaser.GameObjects.Text &&
        (c.depth === DEPTH_DAMAGE || c.depth === DEPTH_DAMAGE + 1)
    ) as Phaser.GameObjects.Text[];

    for (const t of texts) {
      this.tweens.add({
        targets: t,
        x: t.x + 8,
        duration: 30,
        yoyo: true,
        repeat: 5,
        ease: 'Sine.easeInOut',
      });

      this.tweens.add({
        targets: t,
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        duration: 400,
        delay: 50,
        ease: 'Back.easeIn',
        onComplete: () => t.destroy(),
      });
    }

    for (const card of this.centerCards) {
      this.tweens.add({
        targets: card,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 300,
        ease: 'Sine.easeIn',
        onComplete: () => card.destroy(),
      });
    }
    this.centerCards = [];
    this.centerCardsOwner = null;
    this.centerDepthCounter = DEPTH_CENTER_BASE;

    this.battle.turnHolder = 'player';
    this.phase = 'player_init';
    this.initActiveSkills();
    this.updateUIForPhase();
    this.respondChainDepth = 0;
  }

  // ═══════════════════════════════════════════════
  //  Settings Button & Panel
  // ═══════════════════════════════════════════════

  private createSettingsButton(w: number, _h: number): void {
    const btnX = w - 72;
    const btnY = 72;
    const btnSize = 88;

    const container = this.add.container(0, 0).setDepth(DEPTH_UI);

    const bg = this.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 0.9);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(1.5, 0x8a6030, 0.7);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xe0d0b0, 1);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(2, 0x6a4020, 0.9);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    drawNormal();
    container.add(bg);

    const gearGfx = this.add.graphics();
    gearGfx.setPosition(btnX, btnY);
    const drawGear = () => {
      gearGfx.clear();
      const innerR = 16;
      const outerR = 20;
      const teethCount = 8;
      const steps = teethCount * 2;
      gearGfx.fillStyle(0x2a1008, 1);
      gearGfx.beginPath();
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) gearGfx.moveTo(px, py);
        else gearGfx.lineTo(px, py);
      }
      gearGfx.closePath();
      gearGfx.fillPath();
      gearGfx.fillStyle(0xf0e8d4, 1);
      gearGfx.fillCircle(0, 0, 5);
    };
    drawGear();
    container.add(gearGfx);

    const zone = this.add.zone(btnX, btnY, btnSize + 12, btnSize + 12).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
      this.tweens.add({
        targets: gearGfx,
        angle: 90,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerout', () => {
      drawNormal();
      this.tweens.add({
        targets: gearGfx,
        angle: 0,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      if (this.settingsPanel) {
        this.closeSettingsPanel();
      } else {
        this.showSettingsPanel();
      }
    });
    container.add(zone);

    this.settingsButton = container;
  }

  private showSettingsPanel(): void {
    if (this.settingsPanel) return;

    const { width: sw, height: sh } = this.scale;
    const panelW = 340;
    const panelH = 180;
    const panelX = sw - 48;
    const panelY = 72;
    const radius = 10;
    const itemH = 70;
    const pad = 8;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.settingsPanel = container;

    const dismissOverlay = this.add.graphics();
    dismissOverlay.fillStyle(0x000000, 0.01);
    dismissOverlay.fillRect(0, 0, sw, sh);
    dismissOverlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    dismissOverlay.on('pointerdown', () => this.closeSettingsPanel());
    container.add(dismissOverlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.98);
    panel.fillRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.8);
    panel.strokeRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(panelX - panelW, panelY, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const itemStyle = {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    } as const;

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(panelX - panelW + pad, panelY + itemH, panelX - pad, panelY + itemH);
    container.add(divider);

    const volumeItemY = panelY + itemH / 2;
    const volumeText = this.add.text(panelX - panelW / 2, volumeItemY, '音量设置', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(volumeText);

    const volZone = this.add.zone(panelX - panelW / 2, volumeItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    volZone.on('pointerover', () => volumeText.setColor('#6a4020'));
    volZone.on('pointerout', () => volumeText.setColor('#2a1008'));
    volZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeSettingsPanel();
      this.showVolumeSettings();
    });
    container.add(volZone);

    const menuItemY = panelY + itemH + itemH / 2;
    const menuText = this.add.text(panelX - panelW / 2, menuItemY, '返回主菜单', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(menuText);

    const menuZone = this.add.zone(panelX - panelW / 2, menuItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    menuZone.on('pointerover', () => menuText.setColor('#6a4020'));
    menuZone.on('pointerout', () => menuText.setColor('#2a1008'));
    menuZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.showReturnConfirmModal();
    });
    container.add(menuZone);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 120,
      ease: 'Sine.easeOut',
    });
  }

  private closeSettingsPanel(): void {
    if (!this.settingsPanel) return;
    this.tweens.add({
      targets: this.settingsPanel,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.settingsPanel?.destroy();
        this.settingsPanel = null;
      },
    });
  }

  private showVolumeSettings(): void {
    if (this.volumeSettingsModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 520;
    const modalH = 360;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;
    const pad = 28;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.volumeSettingsModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf2ead8, 0.95);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.7);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const topGoldLine = this.add.graphics();
    topGoldLine.fillGradientStyle(0xc8a040, 0xc8a040, 0x8a6830, 0x8a6830, 0.8);
    topGoldLine.fillRoundedRect(modalX + 16, modalY, modalW - 32, 2, 1);
    container.add(topGoldLine);

    const titleY = modalY + 42;
    const title = this.add.text(modalX + modalW / 2, titleY, '音量设置', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const titleDivider = this.add.graphics();
    titleDivider.lineStyle(1, 0xd4c498, 0.5);
    titleDivider.lineBetween(modalX + pad, titleY + 18, modalX + modalW - pad, titleY + 18);
    container.add(titleDivider);

    const closeBtnW = 72;
    const closeBtnH = 36;
    const closeBtnX = modalX + modalW - closeBtnW / 2 - 14;
    const closeBtnY = modalY + 20;
    const closeBtnGfx = this.add.graphics();
    closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
    closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
    closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    container.add(closeBtnGfx);

    const closeText = this.add.text(closeBtnX, closeBtnY, '✕', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(closeBtnX, closeBtnY, closeBtnW, closeBtnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xe8d8b8, 1);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(2, 0x6a4020, 0.9);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#2a1008');
    });
    closeZone.on('pointerout', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#7a5a3a');
    });
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeVolumeSettings();
    });
    container.add([closeText, closeZone]);

    const settings = loadAudioSettings();

    const trackW = 360;
    const sliderX = modalX + (modalW - trackW) / 2;
    const labelX = sliderX;
    const bgmSliderY = titleY + 60;
    const sfxSliderY = bgmSliderY + 64;
    const voiceSliderY = sfxSliderY + 64;

    this.createVolumeSlider(
      container, labelX, bgmSliderY, sliderX, trackW,
      '音乐音量', settings.bgmVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.bgmVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setBgmVolume(value);
      }
    );

    this.createVolumeSlider(
      container, labelX, sfxSliderY, sliderX, trackW,
      '音效音量', settings.sfxVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.sfxVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setSfxVolume(value);
      }
    );

    this.createVolumeSlider(
      container, labelX, voiceSliderY, sliderX, trackW,
      '配音音量', settings.voiceVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.voiceVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setVoiceVolume(value);
      }
    );

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private createVolumeSlider(
    parent: Phaser.GameObjects.Container,
    labelX: number, y: number,
    trackX: number, trackW: number,
    label: string,
    initialValue: number,
    onChange: (value: number) => void
  ): void {
    const trackH = 10;
    const handleR = 16;
    const trackColor = 0xd8d0c0;
    const fillColor1 = 0xc8a040;
    const fillColor2 = 0x8a6830;

    const labelText = this.add.text(labelX, y - 18, label, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(labelText);

    const trackY = y + 18;
    const trackRectX = trackX;

    const trackGfx = this.add.graphics();
    trackGfx.setDepth(DEPTH_OVERLAY_TEXT);
    trackGfx.fillStyle(trackColor, 0.5);
    trackGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    trackGfx.lineStyle(1, 0xb8a898, 0.4);
    trackGfx.strokeRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    parent.add(trackGfx);

    const fillGfx = this.add.graphics();
    fillGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(fillGfx);

    const valueText = this.add.text(trackX + trackW, y - 18, `${Math.round(initialValue * 100)}%`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(1, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(valueText);

    const handleGfx = this.add.graphics();
    handleGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(handleGfx);

    const handleZone = this.add.zone(trackRectX + trackW / 2, trackY, trackW + handleR * 4, handleR * 6)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(handleZone);

    let currentValue = initialValue;
    const updateUI = (value: number) => {
      currentValue = Phaser.Math.Clamp(value, 0, 1);
      const fillWidth = trackW * currentValue;
      const handleX = trackRectX + fillWidth;

      fillGfx.clear();
      if (fillWidth > 0) {
        fillGfx.fillStyle(fillColor1, 0.9);
        fillGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, fillWidth, trackH, trackH / 2);
        if (fillWidth > trackH) {
          fillGfx.fillStyle(fillColor2, 0.6);
          fillGfx.fillRoundedRect(trackRectX + fillWidth / 2, trackY - trackH / 2, fillWidth / 2, trackH, trackH / 2);
        }
      }

      handleGfx.clear();
      handleGfx.fillStyle(0xf8f4ec, 0.4);
      handleGfx.fillCircle(handleX, trackY, handleR + 3);
      handleGfx.fillStyle(0xf5f0e5, 1);
      handleGfx.fillCircle(handleX, trackY, handleR);
      handleGfx.lineStyle(2, fillColor2, 0.9);
      handleGfx.strokeCircle(handleX, trackY, handleR);

      valueText.setText(`${Math.round(currentValue * 100)}%`);

      onChange(currentValue);
    };

    updateUI(initialValue);

    let dragging = false;

    handleZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      const ratio = (pointer.x - trackRectX) / trackW;
      updateUI(ratio);
    });

    handleZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const ratio = (pointer.x - trackRectX) / trackW;
      updateUI(ratio);
    });

    handleZone.on('pointerup', () => {
      dragging = false;
    });

    this.input.on('pointerup', () => {
      dragging = false;
    });
  }

  private closeVolumeSettings(): void {
    if (!this.volumeSettingsModal) return;
    this.tweens.add({
      targets: this.volumeSettingsModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.volumeSettingsModal?.destroy();
        this.volumeSettingsModal = null;
      },
    });
  }

  private showReturnConfirmModal(): void {
    if (this.returnConfirmModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 400;
    const modalH = 200;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.returnConfirmModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const title = this.add.text(modalX + modalW / 2, modalY + 48, '确认返回主菜单？', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const subtitle = this.add.text(modalX + modalW / 2, modalY + 82, '当前对局进度将丢失', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(subtitle);

    const btnW = 120;
    const btnH = 44;
    const btnY = modalY + 136;

    const cancelBtnX = modalX + modalW / 2 - 80;
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0xe8dcc8, 1);
    cancelBg.fillRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    cancelBg.lineStyle(1.5, 0x8a6830, 0.6);
    cancelBg.strokeRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(cancelBg);

    const cancelText = this.add.text(cancelBtnX, btnY, '取消', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#5a4a30',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(cancelText);

    const cancelZone = this.add.zone(cancelBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    cancelZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeReturnConfirmModal();
    });
    container.add(cancelZone);

    const confirmBtnX = modalX + modalW / 2 + 80;
    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0xc8a878, 1);
    confirmBg.fillRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    confirmBg.lineStyle(1.5, 0x8a6030, 0.8);
    confirmBg.strokeRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(confirmBg);

    const confirmText = this.add.text(confirmBtnX, btnY, '确认', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(confirmText);

    const confirmZone = this.add.zone(confirmBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    confirmZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeReturnConfirmModal();
      this.closeSettingsPanel();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MenuScene');
      });
    });
    container.add(confirmZone);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  private closeReturnConfirmModal(): void {
    if (!this.returnConfirmModal) return;
    this.tweens.add({
      targets: this.returnConfirmModal,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.returnConfirmModal?.destroy();
        this.returnConfirmModal = null;
      },
    });
  }

  // ═══════════════════════════════════════════════
  //  Active Skill System
  // ═══════════════════════════════════════════════

  getBattle(): BattleState {
    return this.battle;
  }

  renderPlayerHandAfterSkill(): void {
    this.selectedIndices.clear();
    this.renderPlayerHand(false);
    this.updatePatternHint();
    this.updateUIForPhase();
  }

  private initActiveSkills(): void {
    this.activeSkills = [];
    this.activeSkillUseCounts = new Map();

    if (this.playerCharacterIds.includes('liubowen')) {
      this.activeSkills.push(LiuBoWenChouCe);
      this.activeSkillUseCounts.set(LiuBoWenChouCe.id, 0);
    }
  }

  private updateActiveSkillButton(): void {
    const { width, height } = this.scale;

    if (this.phase !== 'player_init') {
      if (this.btnSkill) this.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      return;
    }

    const selected = this.getSelectedCards();
    if (selected.length === 0) {
      if (this.btnSkill) this.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const eligibleIds: string[] = [];
    for (const skill of this.activeSkills) {
      const used = this.activeSkillUseCounts.get(skill.id) ?? 0;
      if (used >= skill.maxUses) continue;
      if (skill.cardFilter(selected)) {
        eligibleIds.push(skill.id);
      }
    }

    this.activeSkillEligibleIds = eligibleIds;

    if (eligibleIds.length === 0) {
      if (this.btnSkill) this.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const firstSkill = this.activeSkills.find(s => s.id === eligibleIds[0]);
    if (!firstSkill) {
      if (this.btnSkill) this.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const btnY = height - 320;
    if (!this.btnSkill) {
      this.btnSkill = this.add.container(0, btnY).setDepth(DEPTH_UI);
    }

    this.btnSkill.removeAll(true);

    const skillBg = this.add.graphics();
    skillBg.fillStyle(0x3a1a5a, 1);
    skillBg.fillRoundedRect(-125, -40, 250, 80, 6);
    skillBg.lineStyle(2, 0xffd700, 0.8);
    skillBg.strokeRoundedRect(-125, -40, 250, 80, 6);
    this.btnSkill.add(skillBg);

    const glowBorder = this.add.graphics();
    glowBorder.lineStyle(1.5, 0xffd700, 0.5);
    glowBorder.strokeRoundedRect(-123, -38, 246, 76, 5);
    this.btnSkill.add(glowBorder);

    if (eligibleIds.length > 1 && this.currentActiveSkillId === firstSkill.id) {
      this.currentActiveSkillId = firstSkill.id;
    } else if (!this.currentActiveSkillId || !eligibleIds.includes(this.currentActiveSkillId)) {
      this.currentActiveSkillId = eligibleIds[0] ?? null;
    }

    const displaySkill = this.activeSkills.find(s => s.id === this.currentActiveSkillId) ?? firstSkill;
    this.btnSkillText = this.add.text(0, 0, displaySkill.name, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#ffd700',
      stroke: '#1a0a2a',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnSkill.add(this.btnSkillText);

    const skillZone = this.add.zone(0, 0, 250, 80).setInteractive({ cursor: 'pointer' });
    skillZone.on('pointerdown', () => {
      this.onSkillClick();
    });
    this.btnSkill.add(skillZone);

    this.btnSkill.setVisible(true);

    if (eligibleIds.length > 1) {
      this.updateSkillDropdownTrigger(btnY);
    } else {
      this.closeSkillDropdown();
    }

    this.updateButtonLayout();
  }

  private closeSkillDropdown(): void {
    this.skillDropdown?.destroy();
    this.skillDropdown = null;
  }

  private updateSkillDropdownTrigger(btnY: number): void {
    this.skillDropdown?.destroy();
    this.skillDropdown = null;

    const panelW = 250;
    const panelH = Math.min(this.activeSkillEligibleIds.length * 52 + 16, 280);

    this.skillDropdown = this.add.container(0, btnY - 80 - panelH / 2 - 8).setDepth(DEPTH_UI);

    const listBg = this.add.graphics();
    listBg.fillStyle(0x2a1a4a, 0.95);
    listBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    listBg.lineStyle(1.5, 0xffd700, 0.6);
    listBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    this.skillDropdown.add(listBg);

    const itemH = 48;
    const startY = -panelH / 2 + 12;
    for (const skillId of this.activeSkillEligibleIds) {
      const skill = this.activeSkills.find(s => s.id === skillId);
      if (!skill) continue;
      const idx = this.activeSkillEligibleIds.indexOf(skillId);
      const itemY = startY + idx * itemH + itemH / 2;

      const itemText = this.add.text(0, itemY, skill.name, {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: skillId === this.currentActiveSkillId ? '#ffd700' : '#c8a080',
        stroke: '#1a0a24',
        strokeThickness: 2,
      }).setOrigin(0.5);
      this.skillDropdown.add(itemText);

      const itemZone = this.add.zone(0, itemY - itemH / 2 + panelH / 2, panelW, itemH)
        .setInteractive({ cursor: 'pointer' });
      const listY = btnY - 80 - panelH / 2 - 8;
      itemZone.setPosition(0, itemY - listY);
      itemZone.on('pointerdown', () => {
        this.currentActiveSkillId = skillId;
        this.updateActiveSkillButton();
      });
      this.skillDropdown.add(itemZone);
    }
  }

  private async onSkillClick(): Promise<void> {
    if (!this.currentActiveSkillId) return;
    const skill = this.activeSkills.find(s => s.id === this.currentActiveSkillId);
    if (!skill) return;

    const selected = this.getSelectedCards();
    if (!skill.cardFilter(selected)) return;

    const prevPhase = this.phase;
    this.phase = 'animating';
    this.updateUIForPhase();

    for (const idx of this.selectedIndices) {
      const cardObj = this.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        this.tweens.killTweensOf(cardObj);
        const glowG = cardObj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
        if (glowG) {
          this.tweens.killTweensOf(glowG);
        }
      }
    }

    GameAudioManager.playSfx(this, 'sfx_skill_trigger');
    await this.glowOn('liubowen');
    await this.moveToFront('liubowen');
    await this.shakeAndPulse('liubowen');
    this.showDialog('liubowen', '人算不如天算，天算不如我算！');

    await skill.execute(this, selected);

    const used = this.activeSkillUseCounts.get(skill.id) ?? 0;
    this.activeSkillUseCounts.set(skill.id, used + 1);

    await this.glowOff('liubowen');
    await this.restoreSlot('liubowen');

    const playerHand = this.battle.player.hand;

    if (playerHand.length === 0) {
      this.battle.lastPlay = null;
      this.refillPlayerHand();
      this.renderPlayerHand(true);
      await this.fadeOutCenterCardsAsync();
      this.battle.turnHolder = 'enemy';
      this.phase = 'ai_init';
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      await this.aiInitiatePlay();
      return;
    }

    const isInit = prevPhase === 'player_init';
    if (isInit) {
      this.battle.turnHolder = 'player';
      this.phase = 'player_init';
    } else {
      this.battle.lastPlay = null;
      this.battle.turnHolder = 'enemy';
      this.phase = 'ai_init';
      this.updateUIForPhase();
      this.respondChainDepth = 0;
      await this.aiInitiatePlay();
      return;
    }

    this.updateUIForPhase();
  }

  private updateButtonLayout(): void {
    const { width } = this.scale;
    const skillVisible = this.btnSkill?.visible ?? false;
    const playVisible = this.btnPlay?.visible ?? false;
    const passVisible = this.btnPass?.visible ?? false;

    const visibleButtons: Phaser.GameObjects.Container[] = [];
    if (skillVisible && this.btnSkill) visibleButtons.push(this.btnSkill);
    if (playVisible) visibleButtons.push(this.btnPlay);
    if (passVisible) visibleButtons.push(this.btnPass);

    if (visibleButtons.length === 0) return;

    const btnW = 250;
    const gap = 10;
    const totalW = visibleButtons.length * btnW + (visibleButtons.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + btnW / 2;

    for (let i = 0; i < visibleButtons.length; i++) {
      const targetX = startX + i * (btnW + gap);
      const btn = visibleButtons[i]!;
      if (btn.x !== targetX) {
        this.tweens.add({
          targets: btn,
          x: targetX,
          duration: 200,
          ease: 'Sine.easeOut',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  Drag-to-Select Hand Input
  // ═══════════════════════════════════════════════

  private setupHandInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlayerTurn()) return;
      const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      if (idx === null) return;

      this.dragStartIndex = idx;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragActive = false;
      this.dragSelectMode = null;
      this.dragSnapshot = new Set(this.selectedIndices);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;
      if (!pointer.isDown) {
        this.resetDragState();
        return;
      }

      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dragStartX, this.dragStartY);
      if (!this.dragActive && dist < 8) return;

      if (!this.dragActive) {
        this.dragActive = true;
        this.dragSelectMode = this.selectedIndices.has(this.dragStartIndex) ? 'remove' : 'add';
      }

      const currentIdx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      this.applyDragRange(currentIdx);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;

      if (!this.dragActive) {
        const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
        if (idx !== null && idx === this.dragStartIndex) {
          this.onCardClick(idx);
        }
      }

      this.resetDragState();
    });
  }

  private resetDragState(): void {
    this.dragStartIndex = null;
    this.dragActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices.clear();
    this.dragSnapshot.clear();
  }

  private applyDragRange(currentIdx: number | null): void {
    if (this.dragStartIndex === null || this.dragSelectMode === null) return;

    this.selectedIndices = new Set(this.dragSnapshot);

    if (currentIdx !== null) {
      const minIdx = Math.min(this.dragStartIndex, currentIdx);
      const maxIdx = Math.max(this.dragStartIndex, currentIdx);
      for (let i = minIdx; i <= maxIdx; i++) {
        if (this.dragSelectMode === 'add') {
          this.selectedIndices.add(i);
        } else {
          this.selectedIndices.delete(i);
        }
      }
    }

    const { height } = this.scale;
    const baseY = height - 90;

    for (let i = 0; i < this.cardObjects.length; i++) {
      const obj = this.cardObjects[i]!;
      const isSelected = this.selectedIndices.has(i);
      const targetY = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;

      // 上移+发光动画（与 onCardClick 点按一致）
      this.tweens.add({
        targets: obj,
        y: targetY,
        duration: 300,
        ease: 'Sine.easeOut',
      });
      if (glowG) {
        const targetAlpha = isSelected ? 1 : 0;
        this.tweens.add({
          targets: glowG,
          alpha: targetAlpha,
          duration: 300,
          ease: 'Sine.easeOut',
        });
      }
    }

    this.updatePatternHint();
    this.updateActiveSkillButton();
  }

  private getCardIndexAtPosition(x: number, y: number): number | null {
    const hand = this.battle.player.hand;
    if (hand.length === 0) return null;

    const { width, height } = this.scale;
    const baseY = height - 90;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    if (y < baseY - CARD_H / 2 - 10 || y > baseY + CARD_H / 2 + 10) return null;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const cx = startX + i * overlapOffset;
      const dist = Math.abs(x - cx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestDist > CARD_W / 2) return null;

    return bestIdx;
  }

  private isPlayerTurn(): boolean {
    return this.phase === 'player_init' || this.phase === 'player_respond';
  }
}
