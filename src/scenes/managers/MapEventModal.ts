import type Phaser from 'phaser';
import type { RunState } from '../../models/RunState';
import type { GameEvent } from '../../models/Events';
import { applyEventChoice, rollEvent } from '../../models/Events';
import { purchase } from '../../models/Shop';
import { UIFactory } from '../../utils/UIFactory';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_OVERLAY } from '../../constants/Layout';

export interface MapEventModalCallbacks {
  /** 事件触发伏兵战斗：弹窗已关闭，由调用方按契约进入 GameScene */
  onBattle(): void;
  /** 事件结算完毕（含流浪武士招募购买）：由调用方 applyVictory + 存档 + 重建地图 */
  onDone(): void;
}

/** 事件背景图 key 前缀：public/events/event_bg_<eventId>.jpg */
export function eventBgKey(eventId: string): string {
  return `event_bg_${eventId}`;
}

// ── 弹窗布局（2400×1080 画布）──────────────────────────────
const PANEL_W = 1240;
const PANEL_H = 860;
const PANEL_RADIUS = 12;
const IMG_PAD = 8; // 背景图内嵌边距（露出面板金边）
const TITLE_Y_OFF = 78; // 标题中心（相对面板顶）
const DIVIDER_Y_OFF = 136;
const AREA_X_OFF = 130; // 正文可视区左（相对面板左）
const AREA_Y_OFF = 170; // 正文可视区顶（相对面板顶）
const AREA_W = PANEL_W - 270; // 正文可视区宽
const AREA_H = 300; // 正文可视区高 → 底部 py+470
const SCROLLBAR_X_OFF = PANEL_W - 46;
const CHOICE_W = 940;
const CHOICE_H = 86;
const CHOICE_GAP = 18;
const CHOICES_BOTTOM_OFF = 56; // 选项组底边距面板底
const CONTINUE_W = 380;
const CONTINUE_H = 86;

const TEXT_TITLE_COLOR = '#ffe9b0';
const TEXT_BODY_COLOR = '#ffe9b0';

/** 带阴影+高光描边的文字样式（shadow 深色投影、stroke 亮色高光描边） */
function glowingTextStyle(
  fontSize: string,
  opts?: {
    color?: string;
    strokeColor?: string;
    strokeThickness?: number;
    fontStyle?: string;
    align?: 'center' | 'left' | 'right' | 'justify';
    lineSpacing?: number;
    /** 正文换行宽度（配合 useAdvancedWrap 支持中文按字符换行） */
    wordWrapWidth?: number;
    shadowBlur?: number;
  }
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize,
    fontFamily: FONT_FAMILY,
    fontStyle: opts?.fontStyle ?? 'bold',
    color: opts?.color ?? TEXT_BODY_COLOR,
    align: opts?.align ?? 'center',
    lineSpacing: opts?.lineSpacing ?? 10,
    ...(opts?.wordWrapWidth ? { wordWrap: { width: opts.wordWrapWidth, useAdvancedWrap: true } } : {}), // 高级换行：中文无空格也能按字换行
    stroke: opts?.strokeColor ?? '#2a1406',
    strokeThickness: opts?.strokeThickness ?? 4,
    shadow: {
      offsetX: 3,
      offsetY: 4,
      color: 'rgba(8, 2, 0, 0.9)',
      blur: opts?.shadowBlur ?? 6,
      stroke: true,
      fill: true,
    },
  };
}

const CHOICE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '34px',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
  color: '#ffe9b0',
  stroke: '#2a1008',
  strokeThickness: 3,
  shadow: {
    offsetX: 2,
    offsetY: 3,
    color: 'rgba(8, 2, 0, 0.85)',
    blur: 4,
    stroke: true,
    fill: true,
  },
};

/**
 * 地图事件弹窗：抽取随机事件 → 展示选项 → applyEventChoice 结算 →
 * 显示结果描述 → 「继续」分流（战斗 / 普通完成）。
 *
 * v3（2026-09）：放大窗口（1240×860），每个事件使用独立背景插画（public/events/），
 * 标题放大 + 全部文字加阴影与高光描边；正文支持自动换行 + 滚轮/触摸拖动/惯性滚动，
 * 选项固定在窗口底部。
 */
export class MapEventModal {
  private container: Phaser.GameObjects.Container | null = null;

  // ── 滚动状态 ─────────────────────────────
  private scrollContent: Phaser.GameObjects.Text | null = null;
  private scrollThumbGfx: Phaser.GameObjects.Graphics | null = null;
  private scrollOffset = 0;
  private scrollMax = 0;
  private dragging = false;
  private dragLastY = 0;
  private dragSamples: { t: number; y: number }[] = [];
  private inertiaEvent: Phaser.Time.TimerEvent | null = null;
  private inertiaVelocity = 0;
  private readonly onWheel = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number): void => {
    if (!this.scrollContent || this.scrollMax <= 0) return;
    this.stopInertia();
    this.scrollOffset += deltaY;
    this.applyScroll();
  };
  private readonly onDragMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragging) return;
    const dy = pointer.y - this.dragLastY;
    this.dragLastY = pointer.y;
    const now = this.scene.time.now;
    this.dragSamples.push({ t: now, y: pointer.y });
    if (this.dragSamples.length > 4) this.dragSamples.shift();
    this.scrollOffset -= dy;
    this.applyScroll();
  };
  private readonly onDragEnd = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.scene.input.off('pointermove', this.onDragMove);
    this.scene.input.off('pointerup', this.onDragEnd);

    // 惯性：取最近 ~120ms 的位移计算松手速度
    const now = this.scene.time.now;
    const recent = this.dragSamples.filter((s) => now - s.t <= 120);
    if (recent.length >= 2) {
      const first = recent[0]!;
      const last = recent[recent.length - 1]!;
      const dt = last.t - first.t;
      if (dt > 0) {
        const v = ((last.y - first.y) / dt) * 1000; // px/s（手指上移 = 内容下移）
        this.startInertia(-v);
        return;
      }
    }
    this.scrollContent?.setTint(0xffffff);
  };

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(run: RunState, callbacks: MapEventModalCallbacks): void {
    const event = rollEvent(run, Math.random);
    this.showChoices(run, event, callbacks);
  }

  close(): void {
    this.dragging = false;
    this.scene.input.off('pointermove', this.onDragMove);
    this.scene.input.off('pointerup', this.onDragEnd);
    this.scene.input.off('wheel', this.onWheel);
    this.stopInertia();
    this.container?.destroy();
    this.container = null;
    this.scrollContent = null;
    this.scrollThumbGfx = null;
    this.scrollOffset = 0;
    this.scrollMax = 0;
    this.dragSamples = [];
  }

  private stopInertia(): void {
    if (this.inertiaEvent) {
      this.inertiaEvent.remove(false);
      this.inertiaEvent = null;
    }
    this.inertiaVelocity = 0;
  }

  private startInertia(velocity: number): void {
    this.stopInertia();
    if (Math.abs(velocity) < 80) {
      this.scrollContent?.setTint(0xffffff);
      return;
    }
    this.inertiaVelocity = velocity;
    this.inertiaEvent = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!this.scrollContent) {
          this.stopInertia();
          return;
        }
        const dt = 0.016;
        this.scrollOffset += this.inertiaVelocity * dt;
        this.inertiaVelocity *= Math.exp(-4.2 * dt); // 指数衰减
        this.applyScroll();
        if (Math.abs(this.inertiaVelocity) < 60) {
          this.stopInertia();
        }
      },
    });
  }

  private applyScroll(): void {
    if (!this.scrollContent || !this.scrollThumbGfx) return;
    this.scrollOffset = Math.min(this.scrollMax, Math.max(0, this.scrollOffset));
    this.scrollContent.y = this.scrollBaseY - this.scrollOffset;

    // 滚动条
    const { width, height } = this.scene.scale;
    const px = (width - PANEL_W) / 2;
    const py = (height - PANEL_H) / 2;
    const areaY = py + AREA_Y_OFF;
    const areaH = AREA_H;
    const trackX = px + SCROLLBAR_X_OFF;
    const thumbH = Math.max(40, (areaH / this.scrollContent.height) * areaH);
    const thumbY = areaY + this.scrollMax > 0
      ? (areaH - thumbH) * (this.scrollOffset / this.scrollMax)
      : areaY;
    this.scrollThumbGfx.clear();
    this.scrollThumbGfx.fillStyle(0xb89040, 0.25);
    this.scrollThumbGfx.fillRoundedRect(trackX, areaY, 8, areaH, 4);
    this.scrollThumbGfx.fillStyle(0xe8c878, 0.9);
    this.scrollThumbGfx.fillRoundedRect(trackX, thumbY, 8, thumbH, 4);
  }

  private scrollBaseY = 0;

  private buildBackdrop(event: GameEvent | null, container: Phaser.GameObjects.Container, px: number, py: number): void {
    const radius = PANEL_RADIUS;

    // 1. 深色底板（图片内嵌时露出的金边由下面的描边提供）
    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(0x1a0f05, 0.92);
    panelBg.fillRoundedRect(px, py, PANEL_W, PANEL_H, radius);
    panelBg.lineStyle(2, 0xc8a050, 0.9);
    panelBg.strokeRoundedRect(px, py, PANEL_W, PANEL_H, radius);
    panelBg.lineStyle(1, 0x8a6830, 0.55);
    panelBg.strokeRoundedRect(px + 4, py + 4, PANEL_W - 8, PANEL_H - 8, radius - 2);
    container.add(panelBg);

    // 2. 事件背景插画（圆角蒙版 + cover 铺满）
    const imgX = px + IMG_PAD;
    const imgY = py + IMG_PAD;
    const imgW = PANEL_W - IMG_PAD * 2;
    const imgH = PANEL_H - IMG_PAD * 2;
    const key = event ? eventBgKey(event.id) : '';
    if (key && this.scene.textures.exists(key)) {
      const img = this.scene.add.image(px + PANEL_W / 2, py + PANEL_H / 2, key);
      const s = Math.max(imgW / img.width, imgH / img.height);
      img.setScale(s);
      // 圆角蒙版
      const maskShape = this.scene.add.graphics();
      maskShape.fillStyle(0xffffff, 1);
      maskShape.fillRoundedRect(imgX, imgY, imgW, imgH, radius);
      maskShape.setVisible(false);
      img.setMask(maskShape.createGeometryMask());
      container.add(img);
    }

    // 3. 全局压暗（保证浅色文字在图上可读）
    const dim = this.scene.add.graphics();
    dim.fillStyle(0x000000, 0.42);
    dim.fillRoundedRect(imgX, imgY, imgW, imgH, radius);
    container.add(dim);

    // 4. 标题与正文区再压一层（更强可读性）
    const band = this.scene.add.graphics();
    band.fillStyle(0x000000, 0.34);
    band.fillRoundedRect(px + 40, py + 60, PANEL_W - 80, 96, 10);
    band.fillRoundedRect(px + 40, py + AREA_Y_OFF - 14, PANEL_W - 80, AREA_H + 28, 12);
    container.add(band);
  }

  private buildTitle(container: Phaser.GameObjects.Container, title: string, cx: number, py: number): void {
    container.add(
      this.scene.add.text(cx, py + TITLE_Y_OFF, title, glowingTextStyle('68px', {
        color: TEXT_TITLE_COLOR,
        strokeColor: '#fff3d0',
        strokeThickness: 5,
        shadowBlur: 10,
      })).setOrigin(0.5)
    );
    UIFactory.divider(this.scene, cx, py + DIVIDER_Y_OFF, 220);
  }

  /** 构建正文滚动区：换行 + 蒙版 + 滚轮/拖动/惯性滚动 + 滚动条 */
  private buildScrollBody(container: Phaser.GameObjects.Container, text: string, px: number, py: number): void {
    const areaX = px + AREA_X_OFF;
    const areaY = py + AREA_Y_OFF;

    const body = this.scene.add.text(areaX, areaY, text, glowingTextStyle('32px', {
      color: TEXT_BODY_COLOR,
      strokeColor: '#2a1406',
      strokeThickness: 3,
      lineSpacing: 12,
      wordWrapWidth: AREA_W,
      shadowBlur: 5,
    })).setOrigin(0, 0);
    this.scrollContent = body;
    this.scrollBaseY = areaY;
    this.scrollMax = Math.max(0, body.height - AREA_H);
    this.scrollOffset = 0;

    // 蒙版：仅正文区可见
    const maskShape = this.scene.add.graphics();
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(px + 40, areaY - 14, PANEL_W - 80, AREA_H + 28);
    maskShape.setVisible(false);
    body.setMask(maskShape.createGeometryMask());
    container.add(body);

    // 提示文字：可滚动时显示
    if (this.scrollMax > 0) {
      container.add(this.scene.add.text(px + PANEL_W / 2, areaY + AREA_H + 16, '◮ 可上下滑动查看 ◮', glowingTextStyle('24px', {
        color: 'rgba(255, 233, 176, 0.75)',
        strokeColor: '#1a0c02',
        strokeThickness: 2,
        shadowBlur: 3,
      })).setOrigin(0.5));
    }

    // 滚动条
    const thumbGfx = this.scene.add.graphics();
    container.add(thumbGfx);
    this.scrollThumbGfx = thumbGfx;
    this.applyScroll();

    // 拖动交互区（仅正文区，不遮挡底部按钮）
    const dragZone = this.scene.add.zone(px + PANEL_W / 2, areaY - 14 + (AREA_H + 28) / 2, PANEL_W - 80, AREA_H + 28)
      .setInteractive({ cursor: 'grab' });
    dragZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.scrollMax <= 0) return;
      this.dragging = true;
      this.dragLastY = pointer.y;
      this.dragSamples = [{ t: this.scene.time.now, y: pointer.y }];
      this.scene.input.on('pointermove', this.onDragMove);
      this.scene.input.on('pointerup', this.onDragEnd);
    });
    container.add(dragZone);
  }

  private showChoices(run: RunState, event: GameEvent, callbacks: MapEventModalCallbacks): void {
    this.close();

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const px = (width - PANEL_W) / 2;
    const py = (height - PANEL_H) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 事件必须做出选择 */ }));

    this.buildBackdrop(event, container, px, py);
    this.buildTitle(container, event.title, cx, py);
    this.buildScrollBody(container, event.description, px, py);

    // 选项固定在底部
    const n = event.choices.length;
    const totalH = n * CHOICE_H + (n - 1) * CHOICE_GAP;
    const groupBottom = py + PANEL_H - CHOICES_BOTTOM_OFF;
    const startY = groupBottom - totalH + CHOICE_H / 2;

    event.choices.forEach((choice, idx) => {
      const btn = UIFactory.button(this.scene, cx, startY + idx * (CHOICE_H + CHOICE_GAP), '▸', choice.label, () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.resolve(run, event, idx, callbacks);
      }, { w: CHOICE_W, h: CHOICE_H, textStyle: CHOICE_BUTTON_STYLE });
      container.add(btn);
    });

    this.scene.input.on('wheel', this.onWheel);
  }

  private resolve(run: RunState, event: GameEvent, choiceIdx: number, callbacks: MapEventModalCallbacks): void {
    const result = applyEventChoice(run, event, choiceIdx, Math.random);

    let description = result.description;
    if (result.shopItem) {
      description += purchase(run, result.shopItem) ? '招募成功！' : '（通宝不足或阵容已满，招募作罢。）';
    }

    this.showResult(event, description, result.startBattle === true, callbacks);
  }

  private showResult(event: GameEvent, description: string, startBattle: boolean, callbacks: MapEventModalCallbacks): void {
    this.close();

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const px = (width - PANEL_W) / 2;
    const py = (height - PANEL_H) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 等待点击继续 */ }));

    this.buildBackdrop(event, container, px, py);
    this.buildTitle(container, '际 遇', cx, py);
    this.buildScrollBody(container, description, px, py);

    const btn = UIFactory.button(this.scene, cx, py + PANEL_H - 78, '▸', '继 续', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.close();
      if (startBattle) {
        callbacks.onBattle();
      } else {
        callbacks.onDone();
      }
    }, { w: CONTINUE_W, h: CONTINUE_H, textStyle: CHOICE_BUTTON_STYLE });
    container.add(btn);

    this.scene.input.on('wheel', this.onWheel);
  }
}