import Phaser from 'phaser';
import { PLAYER_CHARACTER_LIST } from '../models/Character';
import type { PlayerCharacter, CharacterAbility } from '../models/Character';
import { GameAudioManager } from '../utils/GameAudioManager';
import { UIFactory } from '../utils/UIFactory';
import {
  FONT_FAMILY, AVATAR_SOURCE_SIZE,
  DEPTH_OVERLAY,
  HALL_OF_FAME_CLOSE_DISPLAY,
} from '../constants/Layout';

/** 朝代分组展示顺序（按历史时间先后），未列出的朝代归最后 */
const DYNASTY_ORDER = ['商', '周', '春秋', '战国', '秦', '秦汉', '西汉', '东汉', '三国', '西晋', '南北朝', '隋唐', '宋', '明'];

/**
 * 详情弹窗三级深度：遮罩 → 面板 → 文字（基于 DEPTH_OVERLAY 向上叠加），
 * 保证弹窗打开时背景（滚动列表、卡片 hover）被完全压暗、文字始终在面板之上。
 */
const MODAL_DEPTH_SHADE = DEPTH_OVERLAY + 5;
const MODAL_DEPTH_PANEL = DEPTH_OVERLAY + 15;
const MODAL_DEPTH_TEXT = DEPTH_OVERLAY + 25;

const CONTENT_LEFT = 100;
const CONTENT_RIGHT = 2300;
const CONTENT_TOP = 200;
const CONTENT_BOTTOM = 1040;

const CARD_W = 380;
const CARD_H = 300;
const COL_GAP = 44;
const COLS = 5;
const GROUP_TITLE_H = 66;
const GROUP_GAP = 36;
/** 组内行间距（超过一行时行与行之间的垂直间距，与组间距一致） */
const ROW_GAP = 36;

/** 拖动超过该像素数判定为滚动（而非点击） */
const DRAG_THRESHOLD = 10;
/** 惯性指数衰减系数（越大停得越快） */
const INERTIA_DECAY = 6;
/** 惯性速度低于该值（px/s）时停止 */
const INERTIA_STOP = 50;
/** 松手时滑动速度高于该值（px/s）才启动惯性 */
const INERTIA_KICK = 200;

export class HallOfFameScene extends Phaser.Scene {
  private scrollOffset = 0;
  private maxScroll = 0;
  private contentContainer: Phaser.GameObjects.Container | null = null;
  private maskShape: Phaser.GameObjects.Graphics | null = null;
  private maskFilter: Phaser.Filters.Mask | null = null;
  private detailModal: Phaser.GameObjects.Container | null = null;

  // ── 滚动交互状态（滚轮 + 拖动，共用 scrollOffset） ──
  private isDragging = false;
  private dragMoved = false;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private inertiaVelocity = 0;
  private moveSamples: Array<{ t: number; y: number }> = [];
  private downChar: PlayerCharacter | null = null;
  private cardZoneToChar = new Map<Phaser.GameObjects.Zone, PlayerCharacter>();

  constructor() {
    super({ key: 'HallOfFameScene' });
  }

  private resetSceneState(): void {
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.contentContainer?.destroy();
    this.contentContainer = null;
    this.maskShape?.destroy();
    this.maskShape = null;
    this.maskFilter = null;
    this.detailModal?.destroy();
    this.detailModal = null;
    this.isDragging = false;
    this.dragMoved = false;
    this.dragStartY = 0;
    this.dragStartOffset = 0;
    this.inertiaVelocity = 0;
    this.moveSamples = [];
    this.downChar = null;
    this.cardZoneToChar.clear();
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    const { width, height } = this.scale;
    const cx = width / 2;
    this.cameras.main.fadeIn(400);

    UIFactory.darkBgWithBorder(this, width, height, 16);

    this.createTitle(cx);

    // 左上角「关闭」按钮（古风图标，返回主菜单）
    this.createCloseButton(70, 70);

    this.createGroupedGrid();

    this.setupScrollInput();

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);

    // 名人堂背景音乐《群英同堂》（进入场景即播放，返回菜单由关闭按钮 stopBgm 后恢复菜单 BGM）
    GameAudioManager.playBgm(this, 'bgm_hall_of_fame', { loop: true });
  }

  update(_time: number, delta: number): void {
    if (this.inertiaVelocity === 0) return;
    const dt = delta / 1000;
    this.scrollOffset += this.inertiaVelocity * dt;
    this.inertiaVelocity *= Math.exp(-INERTIA_DECAY * dt);
    if (Math.abs(this.inertiaVelocity) < INERTIA_STOP) this.inertiaVelocity = 0;
    const clamped = Phaser.Math.Clamp(this.scrollOffset, 0, this.maxScroll);
    if (this.scrollOffset !== clamped) {
      // 滚动到边界：停住
      this.scrollOffset = clamped;
      this.inertiaVelocity = 0;
    }
    this.applyScroll();
  }

  // ═══════════════════════════════════════════════
  //  标题栏（古风装饰）
  // ═══════════════════════════════════════════════

  private createTitle(cx: number): void {
    const titleY = 104;

    UIFactory.titleFrame(this, cx, titleY, 660, 136);

    this.add.text(cx, titleY - 12, '名 人 堂', {
      fontSize: '56px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xb89040, 0.5);
    divider.lineBetween(cx - 130, titleY + 24, cx + 130, titleY + 24);
    divider.fillStyle(0xd4a843, 0.8);
    divider.fillPoints([
      new Phaser.Math.Vector2(cx - 130, titleY + 24),
      new Phaser.Math.Vector2(cx - 125, titleY + 19),
      new Phaser.Math.Vector2(cx - 120, titleY + 24),
      new Phaser.Math.Vector2(cx - 125, titleY + 29),
    ], true);
    divider.fillPoints([
      new Phaser.Math.Vector2(cx + 130, titleY + 24),
      new Phaser.Math.Vector2(cx + 125, titleY + 19),
      new Phaser.Math.Vector2(cx + 120, titleY + 24),
      new Phaser.Math.Vector2(cx + 125, titleY + 29),
    ], true);

    this.add.text(cx, titleY + 48, '天下英杰，尽入此堂', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0.5);

    // 左右装饰纹样（菱形 + 横线 + 竖线）
    const deco = this.add.graphics();
    this.drawTitleDeco(deco, cx - 330, titleY, 1);
    this.drawTitleDeco(deco, cx + 330, titleY, -1);
  }

  /** 标题框外侧装饰：横饰线 + 菱形 + 竖线，dir 为 -1/1 控制方向 */
  private drawTitleDeco(gfx: Phaser.GameObjects.Graphics, x: number, y: number, dir: 1 | -1): void {
    gfx.lineStyle(2, 0xb48c3c, 0.55);
    gfx.lineBetween(x, y, x + dir * 84, y);

    gfx.fillStyle(0xd4a843, 0.85);
    gfx.fillPoints([
      new Phaser.Math.Vector2(x + dir * 66, y - 8),
      new Phaser.Math.Vector2(x + dir * 74, y),
      new Phaser.Math.Vector2(x + dir * 66, y + 8),
      new Phaser.Math.Vector2(x + dir * 58, y),
    ], true);

    gfx.lineStyle(1.5, 0xb48c3c, 0.6);
    gfx.lineBetween(x + dir * 96, y - 20, x + dir * 96, y + 20);
  }

  // ═══════════════════════════════════════════════
  //  按朝代分组的角色墙（可滚动）
  // ═══════════════════════════════════════════════

  private createGroupedGrid(): void {
    const groups = new Map<string, PlayerCharacter[]>();
    for (const c of PLAYER_CHARACTER_LIST) {
      const list = groups.get(c.dynasty) ?? [];
      list.push(c);
      groups.set(c.dynasty, list);
    }
    const ordered = DYNASTY_ORDER
      .map(d => ({ dynasty: d, chars: groups.get(d) ?? [] }))
      .filter(g => g.chars.length > 0);

    // 计算内容总高度（组内支持多行：行数 × CARD_H + 行间 ROW_GAP，组间 GROUP_GAP）
    let totalH = 24;
    for (let i = 0; i < ordered.length; i++) {
      const rows = Math.ceil(ordered[i]!.chars.length / COLS);
      totalH += GROUP_TITLE_H + rows * CARD_H + Math.max(0, rows - 1) * ROW_GAP
        + (i < ordered.length - 1 ? GROUP_GAP : 0);
    }
    totalH += 24;

    const clipX = CONTENT_LEFT;
    const clipY = CONTENT_TOP;
    const clipW = CONTENT_RIGHT - CONTENT_LEFT;
    const clipH = CONTENT_BOTTOM - CONTENT_TOP;

    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(clipX, clipY, clipW, clipH);
    maskShape.setDepth(-10000);
    this.maskShape = maskShape;

    const container = this.add.container(0, 0);
    container.enableFilters();
    const maskFilter = container.filters!.internal.addMask(maskShape);
    maskFilter.autoUpdate = false;
    this.maskFilter = maskFilter;
    this.contentContainer = container;

    this.maxScroll = Math.max(0, totalH - clipH);
    this.scrollOffset = 0;

    const gridStartX = clipX + (clipW - (COLS * CARD_W + (COLS - 1) * COL_GAP)) / 2;
    let y = clipY + 24;

    for (const group of ordered) {
      this.addGroupTitle(container, group.dynasty, clipX + 6, y + GROUP_TITLE_H / 2);
      y += GROUP_TITLE_H;
      const rows = Math.ceil(group.chars.length / COLS);
      for (let i = 0; i < group.chars.length; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cardX = gridStartX + col * (CARD_W + COL_GAP) + CARD_W / 2;
        // 超过一行的组换行排布（rowY 基础上按行下移），避免卡片重叠导致点击命中错误角色
        const cardY = y + row * (CARD_H + ROW_GAP) + CARD_H / 2;
        this.createCharacterCard(container, group.chars[i]!, cardX, cardY);
      }
      y += rows * CARD_H + Math.max(0, rows - 1) * ROW_GAP + GROUP_GAP;
    }
  }

  /** 印章式组标题：朱红印章 + 向右延伸的金色饰条 */
  private addGroupTitle(container: Phaser.GameObjects.Container, title: string, x: number, y: number): void {
    const sealW = 116;
    const sealH = 52;

    const seal = this.add.graphics();
    seal.fillStyle(0x8e2f22, 0.92);
    seal.fillRoundedRect(x, y - sealH / 2, sealW, sealH, 8);
    seal.lineStyle(1.5, 0xd4a843, 0.75);
    seal.strokeRoundedRect(x, y - sealH / 2, sealW, sealH, 8);
    seal.lineStyle(0.75, 0xe8d5a3, 0.35);
    seal.strokeRoundedRect(x + 3, y - sealH / 2 + 3, sealW - 6, sealH - 6, 6);
    container.add(seal);

    const sealText = this.add.text(x + sealW / 2, y, title, {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#f5ead0',
      stroke: '#5a1010',
      strokeThickness: 1,
    }).setOrigin(0.5);
    container.add(sealText);

    // 印章与饰条之间的菱形点缀
    const diamond = this.add.graphics();
    diamond.fillStyle(0xd4a843, 0.7);
    diamond.fillPoints([
      new Phaser.Math.Vector2(x + sealW + 8, y - 5),
      new Phaser.Math.Vector2(x + sealW + 13, y),
      new Phaser.Math.Vector2(x + sealW + 8, y + 5),
      new Phaser.Math.Vector2(x + sealW + 3, y),
    ], true);
    container.add(diamond);

    // 饰条延伸到内容区右侧
    const strip = this.add.graphics();
    strip.lineStyle(1.5, 0xb89040, 0.5);
    strip.lineBetween(x + sealW + 26, y, CONTENT_RIGHT - 16, y);
    container.add(strip);
  }

  /** 角色卡：古风双线边框 + 四角金角 + 头像 + 名字；hover 高亮上浮，点击弹详情 */
  private createCharacterCard(container: Phaser.GameObjects.Container, char: PlayerCharacter, cx: number, cy: number): void {
    const card = this.add.container(cx, cy);

    const gfx = this.add.graphics();
    const draw = (hover: boolean) => {
      gfx.clear();
      // 底色
      gfx.fillStyle(0x1a0a04, 0.92);
      gfx.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      // 上部提亮（纸面质感）
      gfx.fillStyle(hover ? 0x3d2110 : 0x2c1508, hover ? 0.9 : 0.82);
      gfx.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H * 0.55, 10);
      // 内描边
      gfx.lineStyle(1, 0x5a4030, 0.45);
      gfx.strokeRoundedRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, 8);
      // 外描边
      gfx.lineStyle(hover ? 2.5 : 1.5, hover ? 0xe8d5a3 : 0xc8a050, hover ? 1 : 0.75);
      gfx.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
      // 四角金角
      const hw = CARD_W / 2;
      const hh = CARD_H / 2;
      const len = 20;
      gfx.lineStyle(2, hover ? 0xf0e0b0 : 0xd4a843, 0.9);
      gfx.lineBetween(-hw, -hh + len, -hw, -hh);
      gfx.lineBetween(-hw, -hh, -hw + len, -hh);
      gfx.lineBetween(hw - len, -hh, hw, -hh);
      gfx.lineBetween(hw, -hh, hw, -hh + len);
      gfx.lineBetween(-hw, hh - len, -hw, hh);
      gfx.lineBetween(-hw, hh, -hw + len, hh);
      gfx.lineBetween(hw - len, hh, hw, hh);
      gfx.lineBetween(hw, hh - len, hw, hh);
    };
    draw(false);
    card.add(gfx);

    // 头像底板 + 头像（上缘距卡顶约 22px，避免贴顶；下缘与名字区留间距）
    const portraitSize = 164;
    const avatarY = -46;
    const avatarGfx = this.add.graphics();
    avatarGfx.fillStyle(0x120804, 1);
    avatarGfx.fillRoundedRect(-portraitSize / 2, avatarY - portraitSize / 2, portraitSize, portraitSize, 10);
    avatarGfx.lineStyle(1.5, 0xb89040, 0.55);
    avatarGfx.strokeRoundedRect(-portraitSize / 2, avatarY - portraitSize / 2, portraitSize, portraitSize, 10);
    card.add(avatarGfx);

    const charImg = this.add.image(0, avatarY, `char_${char.id}`);
    charImg.setScale(portraitSize / AVATAR_SOURCE_SIZE);
    card.add(charImg);

    // 名字 + 朝代
    card.add(this.add.text(0, 58, char.name, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#2a1008',
      strokeThickness: 2,
    }).setOrigin(0.5));

    card.add(this.add.text(0, 100, `◆ ${char.dynasty} ◆`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#a08040',
    }).setOrigin(0.5));

    const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
    const setHover = (hover: boolean) => {
      draw(hover);
      this.tweens.killTweensOf(card);
      this.tweens.add({
        targets: card,
        y: hover ? cy - 10 : cy,
        duration: 130,
        ease: 'Sine.easeOut',
      });
    };
    zone.on('pointerover', () => setHover(true));
    zone.on('pointerout', () => setHover(false));
    card.add(zone);

    this.cardZoneToChar.set(zone, char);
    container.add(card);
  }

  // ═══════════════════════════════════════════════
  //  滚动：鼠标滚轮 + 触摸拖动（含惯性）
  // ═══════════════════════════════════════════════

  private setupScrollInput(): void {
    // 拖动开始：记录起点与按下命中的角色卡
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.detailModal) return;
      if (p.x < CONTENT_LEFT || p.x > CONTENT_RIGHT || p.y < CONTENT_TOP || p.y > CONTENT_BOTTOM) return;
      this.inertiaVelocity = 0;
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartY = p.y;
      this.dragStartOffset = this.scrollOffset;
      this.moveSamples = [{ t: this.time.now, y: p.y }];
      this.downChar = this.findCharAt(p);
    });

    // 拖动中：内容跟随手指，超过阈值判定为滚动
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || this.detailModal) return;
      const dy = p.y - this.dragStartY;
      if (Math.abs(dy) > DRAG_THRESHOLD) this.dragMoved = true;
      if (this.dragMoved) {
        this.scrollOffset = Phaser.Math.Clamp(this.dragStartOffset - dy, 0, this.maxScroll);
        this.applyScroll();
        this.moveSamples.push({ t: this.time.now, y: p.y });
        while (this.moveSamples.length > 2 && this.time.now - this.moveSamples[0]!.t > 120) {
          this.moveSamples.shift();
        }
      }
    });

    // 松手：未拖动视为点击（弹详情）；拖动则按速度启动惯性
    this.input.on('pointerup', (_p: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      const downChar = this.downChar;
      this.downChar = null;
      if (!this.dragMoved) {
        if (downChar) {
          GameAudioManager.playSfx(this, 'sfx_button');
          this.showDetail(downChar);
        }
        return;
      }
      const vel = this.computeSwipeVelocity();
      if (Math.abs(vel) > INERTIA_KICK) this.inertiaVelocity = -vel;
    });

    // 鼠标滚轮：向下滚 = 内容上移（offset 增大），向上滚反之
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, deltaX: number, deltaY: number) => {
      if (this.detailModal) return;
      const d = deltaX !== 0 ? deltaX : deltaY;
      this.inertiaVelocity = 0;
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + d, 0, this.maxScroll);
      this.applyScroll();
    });
  }

  /** 计算松手瞬间的滑动速度（px/s，正值 = 手指向下滑） */
  private computeSwipeVelocity(): number {
    if (this.moveSamples.length < 2) return 0;
    const first = this.moveSamples[0]!;
    const last = this.moveSamples[this.moveSamples.length - 1]!;
    const dt = last.t - first.t;
    if (dt < 16) return 0;
    return ((last.y - first.y) / dt) * 1000;
  }

  /** 命中检测：按下点命中的角色卡（若命中） */
  private findCharAt(p: Phaser.Input.Pointer): PlayerCharacter | null {
    const hits = this.input.hitTestPointer(p);
    for (const h of hits) {
      const zone = h as Phaser.GameObjects.Zone;
      if (this.cardZoneToChar.has(zone)) {
        return this.cardZoneToChar.get(zone) ?? null;
      }
    }
    return null;
  }

  private applyScroll(): void {
    if (this.contentContainer) this.contentContainer.setY(-this.scrollOffset);
  }

  private createCloseButton(x: number, y: number): void {
    const size = 76;
    const gfx = this.add.graphics();
    const draw = (hover: boolean) => {
      gfx.clear();
      gfx.fillStyle(hover ? 0x3a2010 : 0x2a1508, 0.92);
      gfx.fillCircle(x, y, size / 2);
      gfx.lineStyle(hover ? 2.5 : 1.5, hover ? 0xe8d5a3 : 0xc8a050, 0.9);
      gfx.strokeCircle(x, y, size / 2);
    };
    draw(false);

    const icon = this.add.image(x, y, 'icon_hall_of_fame_close');
    icon.setScale(HALL_OF_FAME_CLOSE_DISPLAY / icon.width);

    const zone = this.add.zone(x, y, size + 16, size + 16).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      GameAudioManager.stopBgm(this);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MenuScene');
      });
    });
  }

  // ═══════════════════════════════════════════════
  //  角色详情弹窗
  // ═══════════════════════════════════════════════

  private showDetail(char: PlayerCharacter): void {
    this.closeDetail();

    const { width: sw, height: sh } = this.scale;
    const cx = sw / 2;

    // ── 版式常量 ──
    const panelW = 1180;
    const radius = 22;
    const padX = 56;
    const headerH = 180;        // 顶部标题区高度（装饰 / 名字 / 朝代 / 分隔线）
    const contentPadB = 60;     // 面板底部内边距
    const avatarSize = 380;     // 头像大图边长
    const leftColW = 430;       // 左列（头像）宽度
    const textX0 = padX + leftColW + 44;   // 右列文字起点（面板内相对坐标）
    const textW = panelW - textX0 - padX;  // 右列文字区宽度

    // ── 换行测量（隐藏测量文本，避免闪帧） ──
    const wrap = (text: string, maxW: number, fontSize: string): string[] => {
      const measure = this.add.text(0, 0, '', { fontSize, fontFamily: FONT_FAMILY }).setVisible(false);
      const lines: string[] = [];
      let cur = '';
      for (const ch of text) {
        const test = cur + ch;
        measure.setText(test);
        if (measure.width > maxW && cur.length > 0) {
          lines.push(cur);
          cur = ch;
        } else {
          cur = test;
        }
      }
      measure.destroy();
      if (cur.length > 0) lines.push(cur);
      return lines;
    };

    // ── 预计算内容高度（面板自适应，且不超出画布） ──
    const visibleAbilities = char.abilities.filter(a => !a.hidden);
    const abilityBlocks: Array<{ ability: CharacterAbility; lines: string[] }> = [];
    let skillsH = 0;
    for (const ability of visibleAbilities) {
      const lines = wrap(ability.description, textW, '28px');
      abilityBlocks.push({ ability, lines });
      skillsH += 46 + lines.length * 38 + 14;
    }
    if (abilityBlocks.length > 1) skillsH += (abilityBlocks.length - 1) * 22;

    const bioLines = wrap(char.bio, textW, '28px');
    const bioH = 92 + bioLines.length * 38 + 10;

    const leftH = avatarSize + 24;
    const rightH = skillsH + bioH + 44;
    const contentH = Math.max(leftH, rightH);
    const panelH = Phaser.Math.Clamp(headerH + contentH + contentPadB, 600, sh - 60);

    const px = (sw - panelW) / 2;
    const py = (sh - panelH) / 2;
    const contentTop = py + headerH;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.detailModal = container;

    // ── ① 全屏遮罩（加深压暗，点按关闭） ──
    const overlay = this.add.graphics().setDepth(MODAL_DEPTH_SHADE);
    overlay.fillStyle(0x000000, 0.82);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeDetail());
    container.add(overlay);

    // ── ② 面板阴影 / 金色光晕（与背景拉开层级） ──
    const glow = this.add.graphics().setDepth(MODAL_DEPTH_PANEL - 1);
    glow.lineStyle(30, 0x000000, 0.16);
    glow.strokeRoundedRect(px - 15, py - 15, panelW + 30, panelH + 30, radius + 15);
    glow.lineStyle(18, 0x000000, 0.22);
    glow.strokeRoundedRect(px - 9, py - 9, panelW + 18, panelH + 18, radius + 9);
    glow.lineStyle(3, 0xd4a843, 0.28);
    glow.strokeRoundedRect(px - 2, py - 2, panelW + 4, panelH + 4, radius + 2);
    container.add(glow);

    // ── ③ 面板本体（深檀纸面 + 双线金边 + 四角角饰） ──
    const panel = this.add.graphics().setDepth(MODAL_DEPTH_PANEL);
    panel.fillStyle(0x2a1407, 0.97);
    panel.fillRoundedRect(px, py, panelW, panelH, radius);
    panel.fillStyle(0x3a1c0a, 0.55);  // 顶部标题区提亮（纸面质感）
    panel.fillRoundedRect(px, py, panelW, headerH + 8, { tl: radius, tr: radius, bl: 0, br: 0 });
    panel.fillStyle(0x1f0e04, 0.35);  // 内容区微深
    panel.fillRoundedRect(px, py + headerH + 8, panelW, panelH - headerH - 8, { tl: 0, tr: 0, bl: radius, br: radius });
    // 双线金边
    panel.lineStyle(2.5, 0xc8a050, 0.95);
    panel.strokeRoundedRect(px, py, panelW, panelH, radius);
    panel.lineStyle(1, 0xd4a843, 0.75);
    panel.strokeRoundedRect(px + 6, py + 6, panelW - 12, panelH - 12, radius - 4);
    panel.lineStyle(1, 0x8a6830, 0.45);
    panel.strokeRoundedRect(px + 11, py + 11, panelW - 22, panelH - 22, radius - 7);
    // 四角古风角饰
    const cornerInset = 14;
    this.drawModalCorner(panel, px + cornerInset, py + cornerInset, 1, 1);
    this.drawModalCorner(panel, px + panelW - cornerInset, py + cornerInset, -1, 1);
    this.drawModalCorner(panel, px + cornerInset, py + panelH - cornerInset, 1, -1);
    this.drawModalCorner(panel, px + panelW - cornerInset, py + panelH - cornerInset, -1, -1);
    container.add(panel);

    // 面板拦截点击（避免穿透到遮罩触发关闭）
    const panelZone = this.add.zone(px, py, panelW, panelH)
      .setInteractive({ cursor: 'default' })
      .setDepth(MODAL_DEPTH_PANEL + 1);
    container.add(panelZone);

    // ── ④ 标题区：角色名（大字金 + 描边） + 朝代 ──
    const headDeco = this.add.graphics().setDepth(MODAL_DEPTH_TEXT - 1);
    this.drawModalDivider(headDeco, cx - 210, cx + 210, py + 36);
    container.add(headDeco);

    const nameTxt = this.add.text(cx, py + 88, char.name, {
      fontSize: '62px',
      fontFamily: FONT_FAMILY,
      color: '#f0d9a0',
      stroke: '#4a2406',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(MODAL_DEPTH_TEXT);
    container.add(nameTxt);

    const dynastyTxt = this.add.text(cx, py + 142, `◆ ${char.dynasty} ◆`, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#c8a868',
      stroke: '#3a1c05',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(MODAL_DEPTH_TEXT);
    container.add(dynastyTxt);

    const headerLine = this.add.graphics().setDepth(MODAL_DEPTH_TEXT - 1);
    this.drawModalDivider(headerLine, px + padX, px + panelW - padX, py + 172);
    container.add(headerLine);

    // ── ⑤ 左列：头像大图（深色底板 + 金边框 + 角饰 + 饰带） ──
    const avatarCX = px + padX + leftColW / 2;
    const avatarCY = contentTop + contentH / 2;
    const platePad = 14;
    const plateSize = avatarSize + platePad * 2;

    const plate = this.add.graphics().setDepth(MODAL_DEPTH_PANEL + 2);
    plate.fillStyle(0x100604, 0.98);
    plate.fillRoundedRect(avatarCX - plateSize / 2, avatarCY - plateSize / 2, plateSize, plateSize, 14);
    plate.fillStyle(0x2a1508, 0.6);
    plate.fillRoundedRect(avatarCX - plateSize / 2, avatarCY - plateSize / 2, plateSize, plateSize * 0.5, { tl: 14, tr: 14, bl: 0, br: 0 });
    plate.lineStyle(2, 0xc8a050, 0.9);
    plate.strokeRoundedRect(avatarCX - plateSize / 2, avatarCY - plateSize / 2, plateSize, plateSize, 14);
    plate.lineStyle(1, 0xd4a843, 0.6);
    plate.strokeRoundedRect(avatarCX - plateSize / 2 + 4, avatarCY - plateSize / 2 + 4, plateSize - 8, plateSize - 8, 10);
    const aInset = 9;
    this.drawModalCorner(plate, avatarCX - plateSize / 2 + aInset, avatarCY - plateSize / 2 + aInset, 1, 1);
    this.drawModalCorner(plate, avatarCX + plateSize / 2 - aInset, avatarCY - plateSize / 2 + aInset, -1, 1);
    this.drawModalCorner(plate, avatarCX - plateSize / 2 + aInset, avatarCY + plateSize / 2 - aInset, 1, -1);
    this.drawModalCorner(plate, avatarCX + plateSize / 2 - aInset, avatarCY + plateSize / 2 - aInset, -1, -1);
    container.add(plate);

    const avatarImg = this.add.image(avatarCX, avatarCY, `char_${char.id}`);
    avatarImg.setScale(avatarSize / AVATAR_SOURCE_SIZE);
    avatarImg.setDepth(MODAL_DEPTH_PANEL + 3);
    container.add(avatarImg);

    // 头像下方金饰带
    const belt = this.add.graphics().setDepth(MODAL_DEPTH_PANEL + 2);
    this.drawModalDivider(belt, px + padX + 10, px + padX + leftColW - 10, avatarCY + plateSize / 2 + 24);
    container.add(belt);

    // ── ⑥ 右列：技能列表 + 小传 ──
    const colX = px + textX0;
    // 技能区顶部留白 24px，首项技能名不与内容区顶部粘连
    let ty = contentTop + 24;

    for (let i = 0; i < abilityBlocks.length; i++) {
      const block = abilityBlocks[i]!;
      // 技能名：金色竖条 + 大字
      const nameBar = this.add.graphics().setDepth(MODAL_DEPTH_TEXT - 1);
      nameBar.lineStyle(3, 0xd4a843, 0.9);
      nameBar.lineBetween(colX, ty - 18, colX, ty + 18);
      container.add(nameBar);

      const skillName = this.add.text(colX + 18, ty, block.ability.name, {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#f0c860',
        stroke: '#3a1c05',
        strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(MODAL_DEPTH_TEXT);
      container.add(skillName);
      ty += 50;

      for (const line of block.lines) {
        const desc = this.add.text(colX + 6, ty, line, {
          fontSize: '28px',
          fontFamily: FONT_FAMILY,
          color: '#f2e6c8',
          stroke: '#2a1407',
          strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(MODAL_DEPTH_TEXT);
        container.add(desc);
        ty += 38;
      }
      ty += 12;

      // 技能之间：细金线分隔
      if (i < abilityBlocks.length - 1) {
        const sep = this.add.graphics().setDepth(MODAL_DEPTH_TEXT - 1);
        this.drawModalDivider(sep, colX + 8, px + panelW - padX, ty);
        container.add(sep);
        ty += 22;
      }
    }

    // 小传：印章式标题 + 正文（印章与上方技能区、与下方正文各留约 28px 间距）
    ty += 28;
    const sealCY = ty + 26;
    this.createSealTitle(container, colX, sealCY, '小传', MODAL_DEPTH_TEXT);
    ty = sealCY + 26 + 28;
    for (const line of bioLines) {
      const bioTxt = this.add.text(colX + 6, ty, line, {
        fontSize: '28px',
        fontFamily: FONT_FAMILY,
        color: '#e8dcc0',
        stroke: '#2a1407',
        strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(MODAL_DEPTH_TEXT);
      container.add(bioTxt);
      ty += 38;
    }

    // ── ⑦ 关闭按钮（置顶层级，hover 反馈保留） ──
    const closeX = px + panelW - 44;
    const closeY = py + 44;
    const closeBg = this.add.graphics().setDepth(MODAL_DEPTH_TEXT + 4);
    const closeText = this.add.text(closeX, closeY, '✕', {
      fontSize: '38px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a1c05',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(MODAL_DEPTH_TEXT + 5);
    const drawClose = (hover: boolean) => {
      closeBg.clear();
      if (hover) {
        closeBg.fillStyle(0x5a3018, 0.95);
        closeBg.fillCircle(closeX, closeY, 32);
        closeBg.lineStyle(2, 0xe8d5a3, 0.9);
        closeBg.strokeCircle(closeX, closeY, 32);
      }
    };
    drawClose(false);
    container.add([closeBg, closeText]);

    const closeZone = this.add.zone(closeX, closeY, 68, 68)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(MODAL_DEPTH_TEXT + 5);
    closeZone.on('pointerover', () => { drawClose(true); closeText.setColor('#ffffff'); });
    closeZone.on('pointerout', () => { drawClose(false); closeText.setColor('#e8d5a3'); });
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.closeDetail();
    });
    container.add(closeZone);

    // 淡入动画
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    });
  }

  private closeDetail(): void {
    if (!this.detailModal) return;
    const modal = this.detailModal;
    this.tweens.add({
      targets: modal,
      alpha: 0,
      duration: 120,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.detailModal === modal) {
          modal.destroy();
          this.detailModal = null;
        }
      },
    });
  }

  /** 弹窗四角古风角饰：双 L 回纹 + 菱形点缀，dx/dy 为方向（±1） */
  private drawModalCorner(gfx: Phaser.GameObjects.Graphics, x: number, y: number, dx: 1 | -1, dy: 1 | -1): void {
    const len = 34;
    // 外 L（粗金）
    gfx.lineStyle(3, 0xe0b860, 0.9);
    gfx.lineBetween(x, y + dy * len, x, y);
    gfx.lineBetween(x, y, x + dx * len, y);
    // 内回纹 L（细金）
    gfx.lineStyle(1.5, 0xb89040, 0.85);
    gfx.lineBetween(x + dx * 11, y + dy * (len - 8), x + dx * 11, y + dy * 11);
    gfx.lineBetween(x + dx * 11, y + dy * 11, x + dx * (len - 8), y + dy * 11);
    // 角内菱形
    gfx.fillStyle(0xe0b860, 0.95);
    const d = 7;
    const ox = x + dx * (len - 17);
    const oy = y + dy * (len - 17);
    gfx.fillPoints([
      new Phaser.Math.Vector2(ox, oy - d),
      new Phaser.Math.Vector2(ox + d, oy),
      new Phaser.Math.Vector2(ox, oy + d),
      new Phaser.Math.Vector2(ox - d, oy),
    ], true);
  }

  /** 细金线分隔（技能之间 / 标题装饰），中心菱形点缀 */
  private drawModalDivider(gfx: Phaser.GameObjects.Graphics, x1: number, x2: number, y: number): void {
    const cx = (x1 + x2) / 2;
    gfx.lineStyle(1, 0xb89040, 0.55);
    gfx.lineBetween(x1, y, cx - 14, y);
    gfx.lineBetween(cx + 14, y, x2, y);
    gfx.fillStyle(0xd4a843, 0.9);
    gfx.fillPoints([
      new Phaser.Math.Vector2(cx, y - 5),
      new Phaser.Math.Vector2(cx + 5, y),
      new Phaser.Math.Vector2(cx, y + 5),
      new Phaser.Math.Vector2(cx - 5, y),
    ], true);
  }

  /** 印章式小标题（如「小传」）：朱红底 + 金描边 + 白字 */
  private createSealTitle(container: Phaser.GameObjects.Container, x: number, y: number, text: string, depth: number): void {
    const w = 118;
    const h = 50;
    const gfx = this.add.graphics().setDepth(depth);
    gfx.fillStyle(0x8e2f22, 0.95);
    gfx.fillRoundedRect(x, y - h / 2, w, h, 8);
    gfx.lineStyle(1.5, 0xd4a843, 0.8);
    gfx.strokeRoundedRect(x, y - h / 2, w, h, 8);
    gfx.lineStyle(0.75, 0xe8d5a3, 0.4);
    gfx.strokeRoundedRect(x + 3, y - h / 2 + 3, w - 6, h - 6, 6);
    container.add(gfx);

    const label = this.add.text(x + w / 2, y, text, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#f5ead0',
      stroke: '#5a1010',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(depth + 1);
    container.add(label);
  }
}
