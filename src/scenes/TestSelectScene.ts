import Phaser from 'phaser';
import { PlayerCharacterId, EnemyCharacterId, PLAYER_CHARACTERS, PLAYER_CHARACTER_LIST, ENEMY_CHARACTER_LIST } from '../models/Character';
import { AudioManager } from '../utils/AudioManager';

const FONT_FAMILY = '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif';

export interface TestBattleConfig {
  selectedPlayerCharacterIds: PlayerCharacterId[];
  enemyCharacterId: EnemyCharacterId;
  playerVitality: number;
  enemyVitality: number;
}

export class TestSelectScene extends Phaser.Scene {
  private selectedPlayerIds: Set<PlayerCharacterId> = new Set();
  private selectedEnemyId: EnemyCharacterId = ENEMY_CHARACTER_LIST[0].id;
  private playerVitality: number = 500;
  private enemyVitality: number = 500;
  private playerVitText!: Phaser.GameObjects.Text;
  private enemyVitText!: Phaser.GameObjects.Text;
  private playerCardScrollOffset: number = 0;
  private playerCardContainer: Phaser.GameObjects.Container | null = null;
  private playerCardMaskShape: Phaser.GameObjects.Graphics | null = null;
  private playerCardMaskFilter: Phaser.Filters.Mask | null = null;
  private playerScrollUpBtn: Phaser.GameObjects.Container | null = null;
  private playerScrollDownBtn: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'TestSelectScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);

    const titleY = 100;
    this.add.text(cx, titleY, '测 试 选 择', {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.drawDivider(cx, titleY + 40);

    this.initDefaults();

    this.createPlayerSection(width, height);
    this.createEnemySection(width, height);
    this.createHealthSection(width, height);
    this.createStartButton(width, height);

    AudioManager.init(this);
    AudioManager.unlock(this);
  }

  private initDefaults(): void {
    // 己方角色栏允许空选
  }

  private drawBackground(w: number, h: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a0f05, 1);
    gfx.fillRect(0, 0, w, h);

    const border = this.add.graphics();
    border.lineStyle(1, 0x6a4a2a, 0.3);
    border.strokeRect(8, 8, w - 16, h - 16);
  }

  private drawDivider(cx: number, cy: number): void {
    const gfx = this.add.graphics();
    const half = 140;
    gfx.lineStyle(1, 0xb89040, 0.5);
    gfx.lineBetween(cx - half, cy, cx - 16, cy);
    gfx.lineBetween(cx + 16, cy, cx + half, cy);
    gfx.fillStyle(0xd4a843, 0.7);
    gfx.fillCircle(cx, cy, 3);
  }

  private drawPanelBg(px: number, py: number, pw: number, ph: number, title: string): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a0f05, 0.8);
    gfx.fillRoundedRect(px, py, pw, ph, 10);
    gfx.lineStyle(1.5, 0xb89040, 0.55);
    gfx.strokeRoundedRect(px, py, pw, ph, 10);
    gfx.lineStyle(1, 0x5a4030, 0.2);
    gfx.strokeRoundedRect(px + 3, py + 3, pw - 6, ph - 6, 8);

    const labelX = px + 16;
    const labelY = py - 10;
    const labelBg = this.add.graphics();
    labelBg.fillStyle(0x1a0f05, 0.9);
    labelBg.fillRoundedRect(labelX - 6, labelY - 10, title.length * 24 + 12, 28, 6);
    labelBg.lineStyle(1, 0xb89040, 0.4);
    labelBg.strokeRoundedRect(labelX - 6, labelY - 10, title.length * 24 + 12, 28, 6);

    this.add.text(labelX, labelY + 4, title, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
    }).setOrigin(0, 0.5);
  }

  private createPlayerSection(w: number, h: number): void {
    const px = 80;
    const py = 180;
    const pw = w - 160;
    const ph = 200;

    this.drawPanelBg(px, py, pw, ph, '己方角色');

    const playerIds: PlayerCharacterId[] = ['hanxin', 'liubowen', 'lishizhen', 'zhugeliang', 'wentianxiang', 'niugao'];
    const cardW = 280;
    const cardH = 110;
    const gapX = 30;
    const cols = 3;
    const rowGap = 16;
    const rowHeight = cardH + rowGap;
    const totalRows = Math.ceil(playerIds.length / cols);
    const startX = px + (pw - cols * cardW - (cols - 1) * gapX) / 2 + cardW / 2;

    const clipX = px + 4;
    const clipY = py + 42;
    const clipW = pw - 8;
    const clipH = ph - 48;

    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(clipX, clipY, clipW, clipH);
    maskShape.setDepth(-10000);
    this.playerCardMaskShape = maskShape;

    const container = this.add.container(0, 0);
    container.enableFilters();
    const maskFilter = container.filters!.internal.addMask(maskShape);
    maskFilter.autoUpdate = false;
    this.playerCardMaskFilter = maskFilter;
    this.playerCardContainer = container;

    const visibleRows = Math.floor(clipH / rowHeight);
    const canScroll = totalRows > visibleRows;
    const maxScroll = Math.max(0, (totalRows - visibleRows) * rowHeight);
    this.playerCardScrollOffset = Math.max(0, Math.min(this.playerCardScrollOffset, maxScroll));

    for (let i = 0; i < playerIds.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = clipY + row * rowHeight + cardH / 2 - this.playerCardScrollOffset;
      this.createPlayerCard(cx, cy, cardW, cardH, playerIds[i], container);
    }

    if (canScroll) {
      this.createPlayerScrollButtons(px + pw + 6, py + ph / 2, totalRows, visibleRows, rowHeight, container);
    }
  }

  private createPlayerCard(cx: number, cy: number, cardW: number, cardH: number, id: PlayerCharacterId, parent?: Phaser.GameObjects.Container): void {
    const char = PLAYER_CHARACTERS[id];
    const isSelected = this.selectedPlayerIds.has(id);

    const gfx = this.add.graphics();
    const draw = (selected: boolean, hover: boolean) => {
      gfx.clear();
      if (selected) {
        gfx.fillStyle(0x3a2010, 1);
        gfx.lineStyle(2.5, 0xe8d5a3, 1);
      } else if (hover) {
        gfx.fillStyle(0x2a1508, 1);
        gfx.lineStyle(2, 0xc8a050, 0.8);
      } else {
        gfx.fillStyle(0x1a0a04, 0.7);
        gfx.lineStyle(1.5, 0x5a4030, 0.6);
      }
      gfx.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      gfx.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
    };
    draw(isSelected, false);

    const nameTxt = this.add.text(cx, cy - 18, char.name, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: isSelected ? '#e8d5a3' : '#c8a050',
    }).setOrigin(0.5).setData('_nameText', true);

    const costTxt = this.add.text(cx, cy + 14, `费用 ${char.cost}`, {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0.5);

    const abilitiesStr = char.abilities.map(a => a.name).join(' · ');
    const abiTxt = this.add.text(cx, cy + 38, abilitiesStr, {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#6a5030',
    }).setOrigin(0.5);

    const zone = this.add.zone(cx, cy, cardW, cardH).setInteractive({ cursor: 'pointer' });

    if (parent) {
      parent.add([gfx, nameTxt, costTxt, abiTxt, zone]);
    }

    zone.on('pointerover', () => draw(isSelected, true));
    zone.on('pointerout', () => draw(isSelected, false));
    zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      if (this.selectedPlayerIds.has(id)) {
        this.selectedPlayerIds.delete(id);
      } else {
        this.selectedPlayerIds.add(id);
      }
      if (this.playerCardContainer) {
        this.applyPlayerCardScroll(this.playerCardContainer);
      }
    });
  }

  private createPlayerScrollButtons(
    panelRight: number, centerY: number,
    totalRows: number, visibleRows: number,
    rowHeight: number, cardContainer: Phaser.GameObjects.Container
  ): void {
    const btnSize = 48;
    const btnX = panelRight;
    const maxScroll = Math.max(0, (totalRows - visibleRows) * rowHeight);

    const createArrowBtn = (y: number, label: string, direction: 'up' | 'down'): Phaser.GameObjects.Container => {
      const c = this.add.container(btnX, y);

      const bg = this.add.graphics();
      const drawBg = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(hover ? 0x6b3820 : 0x5a3018, 1);
        bg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
        bg.lineStyle(1.5, hover ? 0xe8d5a3 : 0xc8a050, 0.85);
        bg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 6);
      };
      drawBg(false);
      c.add(bg);

      const txt = this.add.text(0, 0, label, {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: '#e8d5a3',
      }).setOrigin(0.5);
      c.add(txt);

      const zone = this.add.zone(btnX, y, btnSize + 8, btnSize + 8).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => drawBg(true));
      zone.on('pointerout', () => drawBg(false));
      zone.on('pointerdown', () => {
        AudioManager.playSfx(this, 'sfx_button');
        const scrollAmt = direction === 'up' ? -rowHeight : rowHeight;
        this.playerCardScrollOffset = Phaser.Math.Clamp(
          this.playerCardScrollOffset + scrollAmt, 0, maxScroll
        );
        this.applyPlayerCardScroll(cardContainer);
        this.updateScrollButtonStates(rowHeight, maxScroll);
      });

      return c;
    };

    this.playerScrollUpBtn = createArrowBtn(centerY - btnSize / 2 - 4, '▲', 'up');
    this.playerScrollDownBtn = createArrowBtn(centerY + btnSize / 2 + 4, '▼', 'down');
    this.updateScrollButtonStates(rowHeight, maxScroll);
  }

  private applyPlayerCardScroll(cardContainer: Phaser.GameObjects.Container): void {
    const { width, height } = this.scale;
    const px = 80;
    const py = 180;
    const pw = width - 160;
    const cardW = 280;
    const cardH = 110;
    const gapX = 30;
    const cols = 3;
    const rowGap = 16;
    const rowHeight = cardH + rowGap;
    const startX = px + (pw - cols * cardW - (cols - 1) * gapX) / 2 + cardW / 2;
    const clipY = py + 42;
    const playerIds: PlayerCharacterId[] = ['hanxin', 'liubowen', 'lishizhen', 'zhugeliang', 'wentianxiang', 'niugao'];

    const children = cardContainer.list;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }

    for (let i = 0; i < playerIds.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = clipY + row * rowHeight + cardH / 2 - this.playerCardScrollOffset;
      this.createPlayerCard(cx, cy, cardW, cardH, playerIds[i], cardContainer);
    }
  }

  private updateScrollButtonStates(rowHeight: number, maxScroll: number): void {
    const atTop = this.playerCardScrollOffset <= 0;
    const atBottom = this.playerCardScrollOffset >= maxScroll;

    if (this.playerScrollUpBtn) {
      this.playerScrollUpBtn.setAlpha(atTop ? 0.3 : 1);
      this.playerScrollUpBtn.list.forEach(child => {
        if (child instanceof Phaser.GameObjects.Zone) {
          child.setInteractive({ cursor: atTop ? 'default' : 'pointer' });
        }
      });
    }
    if (this.playerScrollDownBtn) {
      this.playerScrollDownBtn.setAlpha(atBottom ? 0.3 : 1);
      this.playerScrollDownBtn.list.forEach(child => {
        if (child instanceof Phaser.GameObjects.Zone) {
          child.setInteractive({ cursor: atBottom ? 'default' : 'pointer' });
        }
      });
    }
  }

  private refreshPlayerSection(): void {
    const { width, height } = this.scale;
    this.playerCardScrollOffset = 0;
    this.playerCardMaskShape?.destroy();
    this.playerCardMaskShape = null;
    this.playerCardMaskFilter = null;
    this.playerCardContainer?.destroy();
    this.playerCardContainer = null;
    this.playerScrollUpBtn?.destroy();
    this.playerScrollUpBtn = null;
    this.playerScrollDownBtn?.destroy();
    this.playerScrollDownBtn = null;
    this.clearSection(150, 410);
    this.createPlayerSection(width, height);
  }

  private createEnemySection(w: number, h: number): void {
    const px = 80;
    const py = 420;
    const pw = w - 160;
    const ph = 170;

    this.drawPanelBg(px, py, pw, ph, '敌方角色');

    const enemies = ENEMY_CHARACTER_LIST;
    const cardW = 340;
    const cardH = 100;
    const gapX = 40;
    const totalW = enemies.length * cardW + (enemies.length - 1) * gapX;
    const startX = px + (pw - totalW) / 2 + cardW / 2;
    const cy = py + 60 + cardH / 2;

    for (let i = 0; i < enemies.length; i++) {
      const cx = startX + i * (cardW + gapX);
      this.createEnemyCard(cx, cy, cardW, cardH, enemies[i].id);
    }
  }

  private createEnemyCard(cx: number, cy: number, cardW: number, cardH: number, id: EnemyCharacterId): void {
    const char = ENEMY_CHARACTER_LIST.find(e => e.id === id)!;
    const isSelected = this.selectedEnemyId === id;

    const gfx = this.add.graphics();
    const draw = (selected: boolean, hover: boolean) => {
      gfx.clear();
      if (selected) {
        gfx.fillStyle(0x3a2010, 1);
        gfx.lineStyle(2.5, 0xe8d5a3, 1);
      } else if (hover) {
        gfx.fillStyle(0x2a1508, 1);
        gfx.lineStyle(2, 0xc8a050, 0.8);
      } else {
        gfx.fillStyle(0x1a0a04, 0.7);
        gfx.lineStyle(1.5, 0x5a4030, 0.6);
      }
      gfx.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      gfx.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
    };
    draw(isSelected, false);

    this.add.text(cx, cy - 20, char.name, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: isSelected ? '#e8d5a3' : '#c8a050',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 8, char.ability.name, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 34, char.ability.description, {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#6a5030',
    }).setOrigin(0.5);

    const zone = this.add.zone(cx, cy, cardW, cardH).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => draw(isSelected, true));
    zone.on('pointerout', () => draw(isSelected, false));
    zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      if (this.selectedEnemyId !== id) {
        this.selectedEnemyId = id;
        this.refreshEnemySection();
      }
    });
  }

  private refreshEnemySection(): void {
    const { width, height } = this.scale;
    this.clearSection(390, 590);
    this.createEnemySection(width, height);
  }

  private createHealthSection(w: number, h: number): void {
    const px = 80;
    const py = 630;
    const pw = w - 160;
    const ph = 190;

    this.drawPanelBg(px, py, pw, ph, '血量设置');

    const rowY1 = py + 52;
    const rowY2 = py + 124;

    this.createHealthRow(px, pw, rowY1, '己方血量', this.playerVitality, (v) => {
      this.playerVitality = v;
      this.playerVitText.setText(`${v}`);
    });

    this.createHealthRow(px, pw, rowY2, '敌方血量', this.enemyVitality, (v) => {
      this.enemyVitality = v;
      this.enemyVitText.setText(`${v}`);
    });
  }

  private createHealthRow(
    panelX: number, panelW: number, rowY: number,
    label: string, initialValue: number,
    onChange: (v: number) => void
  ): void {
    const labelX = panelX + 40;
    const centerX = panelX + panelW / 2;
    const valueX = labelX + 320;

    this.add.text(labelX, rowY, label, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
    }).setOrigin(0, 0.5);

    const btnSize = 48;
    const btnGap = 20;
    const valueOffset = 120;

    const minusBtnX = centerX - valueOffset;
    const valueTextX = centerX;
    const plusBtnX = centerX + valueOffset;

    const createBtnBg = (x: number, label: string): { gfx: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone } => {
      const gfx = this.add.graphics();
      const draw = (hover: boolean) => {
        gfx.clear();
        gfx.fillStyle(hover ? 0x6b3820 : 0x5a3018, 1);
        gfx.fillRoundedRect(x - btnSize / 2, rowY - btnSize / 2, btnSize, btnSize, 8);
        gfx.lineStyle(1.5, hover ? 0xe8d5a3 : 0xc8a050, 0.85);
        gfx.strokeRoundedRect(x - btnSize / 2, rowY - btnSize / 2, btnSize, btnSize, 8);
      };
      draw(false);

      this.add.text(x, rowY, label, {
        fontSize: '32px',
        fontFamily: FONT_FAMILY,
        color: '#e8d5a3',
      }).setOrigin(0.5);

      const zone = this.add.zone(x, rowY, btnSize + 8, btnSize + 8).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));

      return { gfx, zone };
    };

    const minus = createBtnBg(minusBtnX, '−');
    const plus = createBtnBg(plusBtnX, '+');

    const valueText = this.add.text(valueTextX, rowY, `${initialValue}`, {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#2a1008',
      strokeThickness: 2,
    }).setOrigin(0.5);

    if (label === '己方血量') this.playerVitText = valueText;
    else this.enemyVitText = valueText;

    minus.zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      const newVal = Math.max(100, (label === '己方血量' ? this.playerVitality : this.enemyVitality) - 50);
      onChange(newVal);
    });

    plus.zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      const newVal = Math.min(2000, (label === '己方血量' ? this.playerVitality : this.enemyVitality) + 50);
      onChange(newVal);
    });
  }

  private createStartButton(w: number, h: number): void {
    const btnW = 340;
    const btnH = 72;
    const btnX = w / 2;
    const btnY = 900;

    const gfx = this.add.graphics();
    const drawNormal = () => {
      gfx.clear();
      gfx.fillStyle(0x5a3018, 1);
      gfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
      gfx.fillStyle(0x7a4a28, 0.35);
      gfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, btnH / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      gfx.lineStyle(1.5, 0xc8a050, 0.85);
      gfx.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    };
    const drawHover = () => {
      gfx.clear();
      gfx.fillStyle(0x6b3820, 1);
      gfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
      gfx.fillStyle(0x8a4a28, 0.45);
      gfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, btnH / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      gfx.lineStyle(2, 0xe8d5a3, 1);
      gfx.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    };
    drawNormal();

    this.add.text(btnX, btnY, '▶  开 始 测 试', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#2a1008',
      strokeThickness: 2,
    }).setOrigin(0.5);

    const zone = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => drawHover());
    zone.on('pointerout', () => drawNormal());
    zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.startTestBattle();
    });
  }

  private startTestBattle(): void {
    const config: TestBattleConfig = {
      selectedPlayerCharacterIds: [...this.selectedPlayerIds],
      enemyCharacterId: this.selectedEnemyId,
      playerVitality: this.playerVitality,
      enemyVitality: this.enemyVitality,
    };

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene', config);
    });
  }

  private clearSection(yStart: number, yEnd: number): void {
    const children = this.children.list;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const ch = child as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
      if (ch.y !== undefined && ch.y >= yStart && ch.y <= yEnd) {
        child.destroy();
      }
    }
  }
}
