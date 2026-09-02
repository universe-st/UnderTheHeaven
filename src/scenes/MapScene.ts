import Phaser from 'phaser';
import type { EnemyCharacterId } from '../models/Character';
import { ENEMY_CHARACTER_LIST, PLAYER_CHARACTERS } from '../models/Character';
import type { MapNode, NodeType, RunState } from '../models/RunState';
import { enemyVitalityFor, isRunComplete, MAP_FLOORS } from '../models/RunState';
import * as RunManager from '../models/RunManager';
import { UIFactory } from '../utils/UIFactory';
import { GameAudioManager } from '../utils/GameAudioManager';
import { FONT_FAMILY, AVATAR_SOURCE_SIZE, DEPTH_OVERLAY, DEPTH_UI, DEPTH_OVERLAY_TEXT, NODE_ICON_DISPLAY, CURRENCY_ICON_DISPLAY } from '../constants/Layout';
import { MapEventModal } from './managers/MapEventModal';
import { DeckModal } from './managers/DeckModal';
import { BuciBarManager } from './managers/BuciBarManager';
import { rollEvent, applyEventChoice } from '../models/Events';
import { purchase } from '../models/Shop';
import {
  triggerSkipBattle,
  triggerEventAutopick,
  triggerDestinyUpOnBattleWin,
} from '../engine/BuciEffects';

/** 与 GameScene 的 runMode 契约负载 */
interface RunModePayload {
  nodeId: string;
  nodeType: NodeType;
  floor: number;
  enemyId: EnemyCharacterId;
  enemyVitality: number;
}

const LAYER_STRIDE = 210;
const CONTENT_PAD_TOP = 170;
const CONTENT_PAD_BOTTOM = 210;
const NODE_RADIUS = 46;
const TOP_BAR_H = 96;

/** 节点图标：加载键（古风水墨 PNG，见 LoadingScene.loadAssets） */
const NODE_ICONS: Record<NodeType, string> = {
  normal: 'node_normal',
  elite: 'node_elite',
  boss: 'node_boss',
  shop: 'node_shop',
  event: 'node_event',
};

const NODE_LABELS: Record<NodeType, string> = {
  normal: '普通',
  elite: '精英',
  boss: 'Boss',
  shop: '黄金台',
  event: '事件',
};

const NODE_DESCS: Record<NodeType, string> = {
  normal: '普通战斗\n胜利奖励：通宝 8-15',
  elite: '精英战斗\n强敌当前，胜利奖励：通宝 20-30',
  boss: 'Boss 战\n守关强敌，战败天命损失双倍',
  shop: '黄金台\n招募人物、购置卜辞',
  event: '事件\n未知的际遇',
};

export class MapScene extends Phaser.Scene {
  private mapContainer: Phaser.GameObjects.Container | null = null;
  private rosterModal: Phaser.GameObjects.Container | null = null;
  private confirmModal: Phaser.GameObjects.Container | null = null;
  private eventModal: MapEventModal;
  private deckModal: DeckModal;
  private destinyText: Phaser.GameObjects.Text | null = null;
  private tongbaoText: Phaser.GameObjects.Text | null = null;
  private tongbaoIcon: Phaser.GameObjects.Image | null = null;
  private floorText: Phaser.GameObjects.Text | null = null;
  private buciBar: BuciBarManager | null = null;
  private isDragging = false;
  private dragMoved = false;
  private dragStartY = 0;
  private mapStartY = 0;

  constructor() {
    super({ key: 'MapScene' });
    this.eventModal = new MapEventModal(this);
    this.deckModal = new DeckModal(this);
  }

  private resetSceneState(): void {
    this.mapContainer?.destroy();
    this.mapContainer = null;
    this.rosterModal?.destroy();
    this.rosterModal = null;
    this.confirmModal?.destroy();
    this.confirmModal = null;
    this.eventModal.close();
    this.deckModal.close();
    this.buciBar?.destroy();
    this.buciBar = null;
    this.destinyText = null;
    this.tongbaoText = null;
    this.tongbaoIcon = null;
    this.floorText = null;
    this.isDragging = false;
    this.dragMoved = false;
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    if (!RunManager.getRun()) {
      RunManager.startNewRun();
    }

    const { width, height } = this.scale;
    this.cameras.main.fadeIn(300);

    UIFactory.darkBgWithBorder(this, width, height, 8);

    this.buildMap();
    this.buildTopBar();
    this.buildBuciBar();
    this.setupDragInput();
    this.showPendingInterest();

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    GameAudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  // ── 地图布局 ──

  private contentHeight(): number {
    return CONTENT_PAD_TOP + (MAP_FLOORS - 1) * LAYER_STRIDE + CONTENT_PAD_BOTTOM;
  }

  /** 第 1 层在底部，第 36 层在顶部 */
  private layerY(floor: number): number {
    return this.contentHeight() - CONTENT_PAD_BOTTOM - (floor - 1) * LAYER_STRIDE;
  }

  private nodeX(node: MapNode, layerCount: number, cx: number): number {
    return cx + (node.index - (layerCount - 1) / 2) * 400;
  }

  private clampMapY(y: number): number {
    const minY = this.scale.height - this.contentHeight() - 30;
    return Phaser.Math.Clamp(y, minY, 0);
  }

  private buildMap(): void {
    const run = RunManager.getRun();
    if (!run) return;

    const { width, height } = this.scale;
    const cx = width / 2;

    this.mapContainer?.destroy();
    const container = this.add.container(0, 0);

    // 相邻层节点连线（暗金色细线，画在节点之下）
    const linkGfx = this.add.graphics();
    linkGfx.lineStyle(1.5, 0x8a6830, 0.3);
    for (let f = 0; f < run.layers.length - 1; f++) {
      const lower = run.layers[f]!;
      const upper = run.layers[f + 1]!;
      for (const a of lower) {
        for (const b of upper) {
          linkGfx.lineBetween(
            this.nodeX(a, lower.length, cx), this.layerY(a.floor),
            this.nodeX(b, upper.length, cx), this.layerY(b.floor),
          );
        }
      }
    }
    container.add(linkGfx);

    for (const layer of run.layers) {
      for (const node of layer) {
        container.add(this.createNode(node, layer.length, cx, run));
      }
    }

    this.mapContainer = container;
    container.y = this.clampMapY(height * 0.5 - this.layerY(run.floor));
  }

  private createNode(node: MapNode, layerCount: number, cx: number, run: RunState): Phaser.GameObjects.Container {
    const nc = this.add.container(this.nodeX(node, layerCount, cx), this.layerY(node.floor));
    const r = NODE_RADIUS;
    const isPast = node.floor < run.floor;
    const selectable = node.floor === run.floor && !node.cleared && !isRunComplete(run);

    const g = this.add.graphics();
    if (isPast) {
      if (node.cleared) {
        g.fillStyle(0x3a3226, 1);
        g.lineStyle(2, 0x6a5a40, 0.9);
      } else {
        g.fillStyle(0x20180e, 1);
        g.lineStyle(1.5, 0x3a2e1c, 0.8);
      }
    } else if (selectable) {
      g.fillStyle(0x3a2410, 1);
      g.lineStyle(2.5, 0xd4a843, 1);
    } else {
      g.fillStyle(0x2a1c0e, 1);
      g.lineStyle(1.5, 0x5a4030, 0.8);
    }
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
    nc.add(g);

    // 图标：古风 PNG，按状态调节明暗（已过层压暗、可选层与未来层原色——未来层由容器整体调暗）
    const icon = this.add.image(0, -2, NODE_ICONS[node.type]).setOrigin(0.5);
    icon.setScale(NODE_ICON_DISPLAY / icon.width);
    if (isPast) {
      icon.setAlpha(node.cleared ? 0.55 : 0.4);
    }
    nc.add(icon);

    if (isPast) {
      nc.add(this.add.text(r - 6, -r + 6, node.cleared ? '✓' : '✗', {
        fontSize: '30px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: node.cleared ? '#a8d070' : '#a05030',
        stroke: '#1a0a04',
        strokeThickness: 3,
      }).setOrigin(0.5));
    }

    nc.add(this.add.text(0, r + 24, `第${node.floor}层·${NODE_LABELS[node.type]}`, {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: selectable ? '#ffdf80' : '#8a7a50',
      stroke: '#1a0a04',
      strokeThickness: 2,
    }).setOrigin(0.5));

    // 未来层整体 40% 亮度
    if (!isPast && !selectable) {
      nc.setAlpha(0.4);
    }

    if (selectable) {
      const glow = this.add.graphics();
      glow.lineStyle(3, 0xd4a843, 0.8);
      glow.strokeCircle(0, 0, r + 9);
      glow.setAlpha(0.2);
      nc.add(glow);
      this.tweens.add({
        targets: glow,
        alpha: 0.85,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const zone = this.add.zone(0, 10, r * 2 + 40, r * 2 + 74).setInteractive({ cursor: 'pointer' });
      zone.on('pointerup', () => {
        if (!this.dragMoved) {
          this.onNodeTapped(node);
        }
      });
      nc.add(zone);
    }

    return nc;
  }

  // ── 拖拽滚动 ──

  private modalOpen(): boolean {
    return this.rosterModal !== null || this.confirmModal !== null
      || this.eventModal.isOpen || this.deckModal.isOpen;
  }

  private setupDragInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.modalOpen() || !this.mapContainer) return;
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartY = p.y;
      this.mapStartY = this.mapContainer.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || !this.mapContainer) return;
      const dy = p.y - this.dragStartY;
      if (Math.abs(dy) > 10) {
        this.dragMoved = true;
      }
      this.mapContainer.y = this.clampMapY(this.mapStartY + dy);
    });
    this.input.on('pointerup', () => {
      this.isDragging = false;
    });
  }

  // ── 节点交互 ──

  private onNodeTapped(node: MapNode): void {
    const run = RunManager.getRun();
    if (!run) return;
    if (node.floor !== run.floor || node.cleared || isRunComplete(run)) return;
    GameAudioManager.playSfx(this, 'sfx_button');
    this.showNodeConfirm(node);
  }

  private showNodeConfirm(node: MapNode): void {
    this.closeConfirm();

    const { width, height } = this.scale;
    const cx = width / 2;
    const panelW = 640;
    const panelH = 420;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.confirmModal = container;

    container.add(UIFactory.modalOverlay(this, width, height, () => this.closeConfirm()));
    container.add(UIFactory.modalPanel(this, px, py, panelW, panelH, 10));

    container.add(this.add.text(cx, py + 58, `第${node.floor}层 · ${NODE_LABELS[node.type]}`, {
      fontSize: '42px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#3a2010',
      stroke: '#f0e8d8',
      strokeThickness: 3,
    }).setOrigin(0.5));

    container.add(this.add.text(cx, py + 170, NODE_DESCS[node.type], {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#4a3018',
      align: 'center',
      lineSpacing: 14,
    }).setOrigin(0.5));

    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3,
    };
    container.add(UIFactory.button(this, cx - 150, py + panelH - 78, '▸', '前 往', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.enterNode(node);
    }, { w: 220, h: 64, textStyle: btnStyle }));
    container.add(UIFactory.button(this, cx + 150, py + panelH - 78, '✕', '取 消', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeConfirm();
    }, { w: 220, h: 64, textStyle: btnStyle }));
  }

  private closeConfirm(): void {
    this.confirmModal?.destroy();
    this.confirmModal = null;
  }

  private enterNode(node: MapNode): void {
    this.closeConfirm();
    const run = RunManager.getRun();
    if (!run) return;

    if (node.type === 'shop') {
      this.scene.start('ShopScene', { nodeId: node.id });
      return;
    }
    if (node.type === 'event') {
      // 天雷无妄：事件节点弹选项前自动随机选一个（无需玩家点击），并回天命
      const autopick = triggerEventAutopick(run);
      if (autopick !== null) {
        RunManager.save();
        this.showBuciHint(autopick);
        this.autoResolveEvent(node);
        return;
      }
      this.eventModal.open(run, {
        onBattle: () => this.startEventBattle(node),
        onDone: () => this.completeEventNode(node),
      });
      return;
    }
    // 战斗节点（normal/elite/boss）：天山遁触发则跳过战斗、按胜利结算
    const skip = triggerSkipBattle(run);
    if (skip !== null) {
      RunManager.save();
      this.showBuciHint(skip);
      this.completeBattleNodeBySkip(node);
      return;
    }
    this.startBattle(node);
  }

  /**
   * 天山遁跳过战斗：按胜利结算推进（清节点/推进层数/加通宝/存档），不进入战斗。
   * 复刻 applyVictory 结算语义，与 completeEventNode 一致；
   * 若跳过的恰为第 36 层最终 Boss，与正常战斗胜利一样跳转 RunEndScene。
   */
  private completeBattleNodeBySkip(node: MapNode): void {
    const run = RunManager.getRun();
    if (!run) return;
    const reward = RunManager.settleNodeClear(node);
    if (!reward) return;
    RunManager.save();
    if (isRunComplete(run)) {
      this.scene.start('RunEndScene', { victory: true });
      return;
    }
    this.buildMap();
    this.refreshTopBar();
    this.showPendingInterest();
  }

  /**
   * 天雷无妄自动结算事件：随机抽取事件 → 随机选一个选项（无玩家交互）。
   * 伏兵（startBattle）照常分流进入战斗；流浪武士招募与手动路径一致执行购买；
   * 否则按普通完成推进。
   */
  private autoResolveEvent(node: MapNode): void {
    const run = RunManager.getRun();
    if (!run) return;
    const event = rollEvent(run, Math.random);
    const choiceIdx = Math.floor(Math.random() * event.choices.length);
    const result = applyEventChoice(run, event, choiceIdx, Math.random);
    if (result.shopItem) {
      purchase(run, result.shopItem);
    }
    RunManager.save();
    if (result.startBattle) {
      this.startEventBattle(node);
      return;
    }
    this.completeEventNode(node);
  }

  private startBattle(node: MapNode): void {
    const enemyId = node.enemyId
      ?? ENEMY_CHARACTER_LIST[Math.floor(Math.random() * ENEMY_CHARACTER_LIST.length)]!.id;
    const runMode: RunModePayload = {
      nodeId: node.id,
      nodeType: node.type,
      floor: node.floor,
      enemyId,
      enemyVitality: enemyVitalityFor(node),
    };
    this.scene.start('GameScene', { runMode });
  }

  /** 伏兵事件战斗：敌人随机，气数 = 层数 × 100；节点由 GameScene 胜利后清理 */
  private startEventBattle(node: MapNode): void {
    const enemyId = ENEMY_CHARACTER_LIST[Math.floor(Math.random() * ENEMY_CHARACTER_LIST.length)]!.id;
    const runMode: RunModePayload = {
      nodeId: node.id,
      nodeType: 'event',
      floor: node.floor,
      enemyId,
      enemyVitality: node.floor * 100,
    };
    this.scene.start('GameScene', { runMode });
  }

  /** 普通事件（含招募）处理完：事件节点通宝奖励为 0，仅推进层数（利息照常结算） */
  private completeEventNode(node: MapNode): void {
    RunManager.settleNodeClear(node);
    RunManager.save();
    this.buildMap();
    this.refreshTopBar();
    // 事件完成不重建场景，需就地消费利息提示
    this.showPendingInterest();
  }

  // ── 卜辞触发提示 ──

  /** 被动卦触发（天山遁/天雷无妄等）的浮动提示 */
  private showBuciHint(message: string): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const txt = this.add.text(cx, height * 0.34, message, {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#1a0800',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH_OVERLAY_TEXT);

    this.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.6, to: 1 },
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          y: txt.y - 80,
          alpha: 0,
          delay: 800,
          duration: 1300,
          ease: 'Sine.easeIn',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ── 利息动画提示 ──

  /**
   * 节点通过（战斗胜利 / 商店离开 / 事件完成）返回地图时，
   * 消费 RunManager 记录的利息并播放上浮动画，明确提示利息结算。
   */
  private showPendingInterest(): void {
    const interest = RunManager.consumePendingInterest();
    if (interest <= 0) return;
    const { width, height } = this.scale;
    const cx = width / 2;

    const txt = this.add.text(cx, height * 0.34, `利息 +${interest}`, {
      fontSize: '52px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#1a0800',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH_OVERLAY_TEXT);

    this.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.6, to: 1 },
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          y: txt.y - 100,
          alpha: 0,
          delay: 800,
          duration: 1300,
          ease: 'Sine.easeIn',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ── 顶栏 ──

  private buildTopBar(): void {
    const { width } = this.scale;
    const run = RunManager.getRun();
    if (!run) return;

    const bar = this.add.container(0, 0).setDepth(DEPTH_UI);

    const g = this.add.graphics();
    g.fillStyle(0x140a04, 0.92);
    g.fillRect(0, 0, width, TOP_BAR_H);
    g.lineStyle(1.5, 0xb89040, 0.5);
    g.lineBetween(0, TOP_BAR_H, width, TOP_BAR_H);
    bar.add(g);

    this.destinyText = this.add.text(60, TOP_BAR_H / 2, '', {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    const coinIcon = this.add.image(440, TOP_BAR_H / 2, 'node_tongbao').setOrigin(0, 0.5);
    coinIcon.setScale(CURRENCY_ICON_DISPLAY / coinIcon.width);
    this.tongbaoIcon = coinIcon;
    this.tongbaoText = this.add.text(440 + CURRENCY_ICON_DISPLAY + 6, TOP_BAR_H / 2, '', {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    this.floorText = this.add.text(width / 2, TOP_BAR_H / 2, '', {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);
    bar.add([this.destinyText, this.tongbaoIcon, this.tongbaoText, this.floorText]);

    const deckBtn = UIFactory.button(this, width - 426, TOP_BAR_H / 2, '牌', '组', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.deckModal.open(run);
    }, {
      w: 240, h: 64,
      textStyle: { fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3 },
    });
    bar.add(deckBtn);

    const rosterBtn = UIFactory.button(this, width - 170, TOP_BAR_H / 2, '☰', '阵 容', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.showRosterModal();
    }, {
      w: 240, h: 64,
      textStyle: { fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3 },
    });
    bar.add(rosterBtn);

    this.refreshTopBar();
  }

  private refreshTopBar(): void {
    const run = RunManager.getRun();
    if (!run) return;
    this.destinyText?.setText(`❤ 天命 ${run.destiny}/${run.destinyMax}`);
    this.tongbaoText?.setText(`通宝 ${run.tongbao}`);
    this.floorText?.setText(`第 ${Math.min(run.floor, MAP_FLOORS)} / ${MAP_FLOORS} 层`);
    // 天命/通宝变化后同步卜辞栏（使用/出售/触发都会改变对局状态）
    this.buciBar?.refresh();
  }

  /**
   * 卜辞栏（仅展示，context:'map' 不可点击）。
   * 摆放在顶栏下方右侧：
   *   顶栏（TOP_BAR_H=96）: y ∈ [0, 96]
   *   卜辞栏（SLOT_H=100）: 中心 y=158 → y ∈ [108, 208]，与顶栏底 gap=12 ≥ 10 ✅
   *   最右节点（第 2 列中心 x=width/2+600=1800）: 卜辞栏左边缘 = width-190-188 = width-378，
   *   与 x=1800 的 gap ≥ 220（width=2400） ✅
   */
  private buildBuciBar(): void {
    const { width } = this.scale;
    this.buciBar?.destroy();
    this.buciBar = new BuciBarManager(this, {
      x: width - 190,
      y: 158,
      context: 'map',
      onStateChanged: () => this.refreshTopBar(),
    });
    this.buciBar.refresh();
  }

  // ── 阵容弹窗 ──

  private showRosterModal(): void {
    const run = RunManager.getRun();
    if (!run || this.rosterModal) return;

    const { width, height } = this.scale;
    const cx = width / 2;
    const panelW = 1060;
    const panelH = 780;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.rosterModal = container;

    container.add(UIFactory.modalOverlay(this, width, height, () => this.closeRosterModal()));
    container.add(UIFactory.modalPanel(this, px, py, panelW, panelH, 10));

    container.add(this.add.text(cx, py + 50, '阵  容', {
      fontSize: '42px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#3a2010',
      stroke: '#f0e8d8', strokeThickness: 3,
    }).setOrigin(0.5));

    const closeText = this.add.text(px + panelW - 40, py + 32, '✕', {
      fontSize: '36px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#6a4a2a',
    }).setOrigin(0.5);
    const closeZone = this.add.zone(px + panelW - 40, py + 32, 52, 52).setInteractive({ cursor: 'pointer' });
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeRosterModal();
    });
    container.add([closeText, closeZone]);

    // 已招募角色头像网格（最多 2 行 × 5 列）
    const avatarSize = 96;
    const strideX = 190;
    const strideY = 210;
    const gridX = px + 130;
    const gridY = py + 170;
    run.roster.forEach((id, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const ax = gridX + col * strideX;
      const ay = gridY + row * strideY;
      const img = this.add.image(ax, ay, `char_${id}`);
      img.setScale(avatarSize / AVATAR_SOURCE_SIZE);
      container.add(img);
      container.add(this.add.text(ax, ay + avatarSize / 2 + 22, PLAYER_CHARACTERS[id].name, {
        fontSize: '26px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#2a1008',
        stroke: '#f0e8d8', strokeThickness: 2,
      }).setOrigin(0.5));
    });

    const rosterRows = Math.max(1, Math.ceil(run.roster.length / 5));
    const buciTitleY = gridY + (rosterRows - 1) * strideY + avatarSize / 2 + 70;
    container.add(this.add.text(cx, buciTitleY, '卜 辞 牌', {
      fontSize: '32px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#3a2010',
      stroke: '#f0e8d8', strokeThickness: 2,
    }).setOrigin(0.5));

    if (run.buciCards.length === 0) {
      container.add(this.add.text(cx, buciTitleY + 60, '（尚未获得卜辞）', {
        fontSize: '26px', fontFamily: FONT_FAMILY, color: '#7a5a2a',
      }).setOrigin(0.5));
    } else {
      run.buciCards.forEach((buci, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        container.add(this.add.text(
          px + 180 + col * 400,
          buciTitleY + 52 + row * 44,
          `${buci.name}${buci.count > 1 ? ` ×${buci.count}` : ''}  ${buci.desc}`,
          { fontSize: '24px', fontFamily: FONT_FAMILY, color: '#3a2812' },
        ).setOrigin(0, 0.5));
      });
    }
  }

  private closeRosterModal(): void {
    this.rosterModal?.destroy();
    this.rosterModal = null;
  }
}
