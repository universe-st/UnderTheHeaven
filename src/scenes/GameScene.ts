import Phaser from 'phaser';
import type { Card} from '../models/Card';
import { createDeck, shuffleDeck, sortHand, resetCardIdCounter, getNextCardId, cardScoreBoostKey } from '../models/Card';
import type { BattleState, HandPattern, BattleConfig } from '../models/BattleTypes';
import { GameAudioManager } from '../utils/GameAudioManager';
import type { PlayerCharacterId, EnemyCharacterId} from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS, ENEMY_CHARACTER_LIST, randomPlayerCharacter } from '../models/Character';
import { getCharacterEnemyName } from '../engine/CharacterAbilities';
import { PLAYER_VITALITY } from '../models/RunState';
import { getRun, save as saveRun } from '../models/RunManager';
import { battleStartBuciMods } from '../engine/BuciEffects';
import { BuciBarManager, BUCI_SLOT_H } from './managers/BuciBarManager';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, type SkillContext, type ActiveSkillDefinition } from '../skills';
import { clearPassiveSkills, registerAllPassiveSkills } from '../skills/PassiveSkillUtils';
import {
  FONT_FAMILY,
  DEPTH_BG, DEPTH_BG_BORDER, DEPTH_UI,
  DEPTH_CENTER_BASE, DEPTH_DAMAGE,
  SLOT_SIZE, VISIBLE_BAR_WIDTH,
} from '../constants/Layout';
import { HandSelectManager } from './managers/HandSelectManager';
import type { HandSelectEvent, HandSelectOptions } from '../skills/HandSelect';
import { DragInputManager } from './managers/DragInputManager';
import { HealthBarManager } from './managers/HealthBarManager';
import { DamageSettlementManager } from './managers/DamageSettlementManager';
import { ModalManager } from './managers/ModalManager';
import { CardDisplayManager } from './managers/CardDisplayManager';
import { BattleFlowManager } from './managers/BattleFlowManager';
import { CharacterBarManager } from './managers/CharacterBarManager';
import { CharacterInfoManager } from './managers/CharacterInfoManager';
import { CardInfoManager } from './managers/CardInfoManager';
import { ActiveSkillManager } from './managers/ActiveSkillManager';
import { InfoBarManager } from './managers/InfoBarManager';
import { PatternHintManager } from './managers/PatternHintManager';
import { ButtonManager } from './managers/ButtonManager';
import { BgmManager } from './managers/BgmManager';
import { TurnIndicatorManager } from './managers/TurnIndicatorManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export class GameScene extends Phaser.Scene implements HandSelectEvent {
  battle!: BattleState;
  phase: GamePhase = 'player_init';

  selectedIndices: Set<number> = new Set();
  /** 公共事件「选择手牌」激活期间置 true：挂起 DragInputManager 的普通手牌输入 */
  handSelectActive: boolean = false;
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
  /** 战斗内卜辞栏（仅 runMode 对局显示） */
  private buciBar: BuciBarManager | null = null;

  /** 入场配置（含 runMode），供 BattleFlowManager 等管理器读取 */
  get battleConfig(): BattleConfig | null {
    return this.testConfig;
  }

  characterSlotContainers: Phaser.GameObjects.Container[] = [];
  characterSlotTexts: Phaser.GameObjects.Text[] = [];
  characterMarkerCircles: (Phaser.GameObjects.Graphics | null)[] = [];
  characterMarkerTexts: (Phaser.GameObjects.Text | null)[] = [];

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
  private cardInfoManager: CardInfoManager | null = null;
  private activeSkillManager!: ActiveSkillManager;
  private infoBarManager!: InfoBarManager;
  private patternHintManager!: PatternHintManager;
  private buttonManager!: ButtonManager;
  private handSelectManager!: HandSelectManager;

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
    this.handSelectActive = false;
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
    this.buciBar?.destroy();
    this.buciBar = null;

    this.characterSlotContainers = [];
    this.characterSlotTexts = [];
    this.characterMarkerCircles = [];
    this.characterMarkerTexts = [];
    this.characterInfoManager?.destroy();
    this.cardInfoManager?.destroy();
    this.cardInfoManager = null;
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
    this.handSelectManager = new HandSelectManager(this, this.cardDisplayManager);
    this.cardInfoManager = new CardInfoManager(this);
    this.dragInputManager = new DragInputManager(this, this.cardDisplayManager);
    this.dragInputManager.setCardInfoManager(this.cardInfoManager);
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
      () => this.battleFlowManager.refillPlayerHandAndNotify(),
      (active) => this.buciBar?.setBattleActivePhase(active),
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

    this.createBattleBuciBar(width, height);

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

    // 战斗开局：通过标准技能事件通道依次广播 ON_GAIN_TURN → ON_HAND_REFILLED，
    // 是否触发由已注册技能（如诸葛亮「先算」、姜尚「辅王」、孙膑「减灶」）自身的 filter 判定。
    // 开局双方各摸满 17 张手牌，同样满足「摸满手牌后」语义，故补发 ON_HAND_REFILLED，
    // 否则孙膑「减灶」/姜尚「辅王」只在手牌打空补满时才触发、开局不触发。
    const initCtx: SkillContext = {
      gameScene: this,
      battle: this.battle,
      sourceCharacterId: this.battle.player.characterId ?? this.playerCharacterIds[0]!,
      playerCharacterIds: this.playerCharacterIds,
      enemyCharacterId: this.battle.enemyCharacterId,
    };
    this.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, initCtx)
      .then(() => this.skillEventBus.emit(SkillTiming.ON_HAND_REFILLED, initCtx))
      .then(() => { this.renderEnemyHand(); })
      .catch((err) => { console.warn('[GameScene] battle start skill error:', err); });
  }

  private initBattle(): BattleState {
    const playerDeck = shuffleDeck(createDeck());
    const enemyDeck = shuffleDeck(createDeck());

    const runMode = this.testConfig?.runMode;
    const run = runMode ? getRun() : null;

    // 局内卦象（战斗开始时触发一次性 + 读取常驻）：
    // 火雷噬嗑（系数 +1）/ 风地观（手牌 +1）/ 风水涣（敌方手牌 -1）/
    // 火泽睽（移除敌方 1 张牌）/ 离为火（本局所有战斗气数上限 +N）
    let buciCoeffBoost = 0;
    let handBonus = 0;
    let enemyHandDown = 0;
    let removeEnemyCards = false;
    let vitalityUp = 0;
    if (runMode && run) {
      const bmods = battleStartBuciMods(run);
      buciCoeffBoost = bmods.coefficientBoost;
      handBonus = bmods.handBonus;
      enemyHandDown = bmods.enemyHandDown;
      removeEnemyCards = bmods.removeEnemyCards;
      vitalityUp = bmods.vitalityBonus;
      saveRun();
    }

    // 融合购买的卡牌（仅加入玩家牌组）：测试模式优先，局外循环从存档牌池取
    const purchased = this.testConfig?.purchasedCards
      ?? (runMode ? run?.cardPool : undefined);
    if (purchased && purchased.length > 0) {
      for (const card of purchased) {
        playerDeck.push({ ...card, uid: getNextCardId() });
      }
      shuffleDeck(playerDeck);
    }

    // 田文「养士」：历史分数加成应用到本场玩家牌组（标准牌 + 购买牌）。
    // 分数加成按卡牌身份键（花色_点数 / joker_点数）持久化于对局存档，
    // 每场战斗重建牌组时重新应用，实现「永久、跨对局继承」。
    const boosts = run?.scoreBoosts;
    if (boosts) {
      for (const card of playerDeck) {
        const boost = boosts[cardScoreBoostKey(card)];
        if (boost) card.score += boost;
      }
    }

    const playerHand = playerDeck.splice(0, 17 + handBonus);
    const enemyHand = enemyDeck.splice(0, Math.max(1, 17 - enemyHandDown));

    sortHand(playerHand);
    sortHand(enemyHand);

    // 火泽睽：战斗开始时移除敌方 1 张牌
    if (removeEnemyCards && enemyHand.length > 1) {
      enemyHand.splice(Math.floor(Math.random() * enemyHand.length), 1);
    }

    const playerCharId = this.selectPlayerCharacter();
    const enemyCharId = this.selectEnemyCharacter();
    const enemyName = getCharacterEnemyName(enemyCharId);
    const playerChar = PLAYER_CHARACTERS[playerCharId];

    const playerVit = runMode ? PLAYER_VITALITY + (run?.vitalityMaxBoost ?? 0) + vitalityUp : (this.testConfig?.playerVitality ?? 500);
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
        // 跨战斗保留的角色标记（如蓝玉「骜」）：从对局状态读入
        aoMarkers: run?.characterMarkers?.['lanyu'] ?? 0,
        // 跨战斗保留的角色技能状态（如周处「除害」进度）：从对局状态读入
        skillFlags: run ? { ...run.characterSkillFlags } : {},
        // 本场战斗中玩家获得自对方的牌（如周处「除害」获得的红桃），战斗结束进入玩家牌库
        acquiredCards: [],
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
      // 火雷噬嗑：本场战斗牌型系数 +1（一次性卦象，DamageSettlement 结算系数时累加）
      coefficientBoost: buciCoeffBoost,
      // 当前一圈敌方打出的牌（敌方出牌时由 BattleFlowManager append，圈结束清空）
      roundEnemyCards: [],
      // 孙膑「减灶」状态：发动后写入弃牌总分并置 active，玩家打光手牌后复位
      jianzaoBonus: 0,
      jianzaoActive: false,
      // 倭寇「劫海」：被劫走的玩家手牌记录，敌方被击败后回归玩家牌库
      wokouStolenCards: [],
      // 李离「伏剑」永久禁分：从对局存档读入本场（跨局生效；李离本场即使不在
      // 阵容/已移除，敌方该花色结算伤害仍由 LiLiFuJianBan 隐藏技归零）
      permanentSuitBans: run ? [...(run.permanentSuitBans ?? [])] : [],
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
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#6a3a10',
      stroke: '#f0e8d8',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_UI);
  }

  private createCharacterSlots(w: number, h: number): void {
    this.characterBarManager.createCharacterSlots(w, h);
  }

  /**
   * 战斗内卜辞栏（context:'battle'，仅 runMode 对局显示；测试模式无局不显示）。
   * 位置：角色区（右下角色条）上方水平居中。
   * 布局计算（2400×1080 画布）：
   *   角色条原点 = (w - 180 - VISIBLE_BAR_WIDTH, h - 420)，槽 SLOT_SIZE=120 → 顶边 y = h - 420 - 60 = 600
   *   卜辞栏 3 格宽 = 3*116 + 2*14 = 376（x ∈ [x-188, x+188]），槽高 100 → y ∈ [y-50, y+50]
   *   x = 角色条水平中线（w - 180 - VISIBLE_BAR_WIDTH/2 = 1865），
   *   y = 角色条顶边 - 槽半高 - 10 = 540 → 卜辞栏 y ∈ [490, 590]，与角色条顶 gap = 10 ✅
   * 相邻元素重叠检查：
   *   A 敌方信息栏: x ∈ [120, 540]，y ∈ [56, 90]         → 与 [490, 590] 无 y 交集 ✅
   *   B 敌方手牌:   y ∈ [94, 346]                        → 与 [490, 590] 无交集 ✅
   *   C 牌型按钮:   x ∈ [2080, 2260]，y ∈ [34, 106]      → 无交集 ✅
   *   D 角色条:     x ∈ [1510, 2220]，y ∈ [600, 720]     → 与卜辞栏 [490, 590] 无 y 交集，gap 10 ✅
   *   E 中央牌桌:   动画中心 y≈475（CARD_H 252 → [349, 601]）位于画面中部 x≈1200~1380；
   *                 大牌型扇面仅瞬时跨越时由 DEPTH_UI(500) > DEPTH_CENTER_BASE(100) 覆盖其上 ✅
   */
  private createBattleBuciBar(w: number, h: number): void {
    const runMode = this.testConfig?.runMode;
    if (!runMode) return; // 仅 runMode 对局显示

    const barTopY = h - 420 - SLOT_SIZE / 2;
    const x = w - 180 - VISIBLE_BAR_WIDTH / 2;
    const y = barTopY - BUCI_SLOT_H / 2 - 10;

    this.buciBar?.destroy();
    this.buciBar = new BuciBarManager(this, {
      x,
      y,
      context: 'battle',
      battleActivePhase: false,
      onStateChanged: () => {
        // 使用/出售后无天命/通宝显示，仅刷新卜辞栏自身
        this.buciBar?.refresh();
      },
    });
    this.buciBar.refresh();
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

  /** CardActions 增量布局变更后刷新手牌溢出渐隐提示 */
  updateHandOverflowHints(): void {
    this.cardDisplayManager.updateHandOverflowHints();
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

  /**
   * 公共事件「选择手牌」：玩家在手牌区交互选牌（确认/取消），敌人直接返回 AI 判断。
   * 技能经由 ctx.gameScene 调用（见 src/skills/HandSelect.ts）。
   *
   * 玩家侧选牌期间临时置 phase='animating'，复用 updateUIForPhase 隐藏出牌/不出/提示/
   * 主动技按钮与「轮到你出牌」回合指示，结束后恢复原 phase 并刷新 UI。
   */
  async selectHandCards(options: HandSelectOptions): Promise<Card[] | null> {
    if (options.side !== 'player') {
      return this.handSelectManager.selectHandCards(options);
    }
    const prevPhase = this.phase;
    this.phase = 'animating';
    this.updateUIForPhase();
    try {
      return await this.handSelectManager.selectHandCards(options);
    } finally {
      this.phase = prevPhase;
      this.updateUIForPhase();
    }
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
        // 主动技按钮由 updateActiveSkillButton 决定（含无需选牌的改制）
        this.updateActiveSkillButton();
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

    // 主动卦可用性：仅 player_init（主动技可发动阶段）由 updateActiveSkillButton 控制；
    // 其余阶段（跟牌/敌方回合/动画/终局）强制不可用，防止主动卦在非主动技阶段被使用
    if (this.phase !== 'player_init') {
      this.buciBar?.setBattleActivePhase(false);
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
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: color,
      stroke: '#000000',
      strokeThickness: 5,
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

  cancelDamageSettlement(gainTurn?: boolean): void {
    this.damageSettlementManager.cancelDamageSettlement(gainTurn);
  }

  /** 游戏结束（主动技如项羽「破釜」直伤致死时调用，转发给 BattleFlowManager） */
  showGameOver(playerWin: boolean): void {
    this.battleFlowManager.showGameOver(playerWin);
  }

  /** 更新角色框左上角标记区数字（技能经由 SkillVisualManager 调用） */
  updateCharacterMarker(characterId: string, count: number): void {
    this.characterBarManager.setMarkerCount(characterId, count);
  }

  /** 标记角色失去角色牌（技能经由 SkillVisualManager 调用） */
  markCharacterLost(characterId: string): void {
    this.characterBarManager.markCharacterLost(characterId);
  }

  /** 显示角色对话框台词（技能经由 SkillVisualManager 调用） */
  showDialog(characterId: string, text: string): void {
    this.characterBarManager.showDialog(characterId, text);
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

  /**
   * 摸满玩家手牌（公共事件）：补满 + 渲染 + 广播 ON_HAND_REFILLED。
   * 供技能层（如海瑞「谏疏」弃空手牌）与主动技路径复用，转发给 BattleFlowManager。
   */
  async refillPlayerHandAndNotify(): Promise<void> {
    await this.battleFlowManager.refillPlayerHandAndNotify();
  }

  renderPlayerHandAfterSkill(): void {
    this.activeSkillManager.renderPlayerHandAfterSkill();
  }

  initActiveSkills(): void {
    this.activeSkillManager.initActiveSkills();
  }

  resetActiveSkillUses(mode?: 'all' | 'gain-turn'): void {
    this.activeSkillManager.resetActiveSkillUses(mode);
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
