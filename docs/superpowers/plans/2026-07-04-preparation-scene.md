# 备战界面 (PrepScene) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建备战界面（PrepScene），包含黄金台（角色购买）、商铺（卡牌购买）、状态面板，实现从 TestSelectScene → PrepScene → GameScene 的完整流程。

**Architecture:** 新建 Phaser 场景 `PrepScene.ts`，使用 `UIFactory` 保持视觉统一。修改 `TestSelectScene` 的跳转逻辑指向 PrepScene，修改 `GameScene` 的 `initBattle()` 接受并处理购买的卡牌追加到玩家牌组。

**Tech Stack:** Phaser 4, TypeScript, UIFactory

---

### Task 1: 注册 PrepScene 到 config.ts 并添加布局常量

**Files:**
- Modify: `src/config.ts:16`
- Create: `src/constants/Layout.ts` (已存在，追加常量)

- [ ] **Step 1.1: 在 Layout.ts 追加 PrepScene 布局常量**

在 `src/constants/Layout.ts` 末尾添加：

```typescript
export const PREP_PANEL_X = 60;
export const PREP_PANEL_Y = 180;
export const PREP_PANEL_W = 740;
export const PREP_PANEL_H = 700;
export const PREP_PANEL_GAP = 30;
export const PREP_PANEL_RIGHT = PREP_PANEL_X + PREP_PANEL_W;
export const PREP_ITEM_H = 170;
export const PREP_ITEM_GAP = 14;
```

- [ ] **Step 1.2: 在 config.ts 注册 PrepScene**

```typescript
import { PrepScene } from './scenes/PrepScene';
// ...
scene: [LoadingScene, MenuScene, GameScene, TestSelectScene, PrepScene]
```

- [ ] **Step 1.3: Verify TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: No errors (PrepScene doesn't exist yet so this may fail — that's OK, proceed)

---

### Task 2: 创建 PrepScene.ts 骨架

**Files:**
- Create: `src/scenes/PrepScene.ts`

- [ ] **Step 2.1: 编写 PrepScene 基础骨架和状态定义**

```typescript
import Phaser from 'phaser';
import type { PlayerCharacterId, EnemyCharacterId } from '../models/Character';
import { PLAYER_CHARACTERS, PLAYER_CHARACTER_LIST } from '../models/Character';
import type { Card } from '../models/Card';
import { createDeck, getNextCardId, sortHand } from '../models/Card';
import { UIFactory } from '../utils/UIFactory';
import { FONT_FAMILY, PREP_PANEL_X, PREP_PANEL_Y, PREP_PANEL_W, PREP_PANEL_H, PREP_PANEL_GAP, PREP_ITEM_H, PREP_ITEM_GAP, AVATAR_SOURCE_SIZE } from '../constants/Layout';
import { GameAudioManager } from '../utils/GameAudioManager';

export interface PrepSceneConfig {
  selectedPlayerCharacterIds: PlayerCharacterId[];
  enemyCharacterId: EnemyCharacterId;
  playerVitality: number;
  enemyVitality: number;
}

interface PrepState {
  money: number;
  tianming: number;
  ownedCharacterIds: PlayerCharacterId[];
  purchasedCards: Card[];
  goldenTerraceCharacters: PlayerCharacterId[];
  shopCards: Card[];
}

export class PrepScene extends Phaser.Scene {
  private config!: PrepSceneConfig;
  private state!: PrepState;
  private statusMoneyText!: Phaser.GameObjects.Text;
  private statusTianmingText!: Phaser.GameObjects.Text;
  private statusRolesText!: Phaser.GameObjects.Text;
  private goldenTerraceContainer!: Phaser.GameObjects.Container;
  private shopContainer!: Phaser.GameObjects.Container;
  private startBtnGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'PrepScene' });
  }

  init(data: PrepSceneConfig): void {
    this.config = data;
  }

  private resetSceneState(): void {
    this.config = null!;
    this.state = null!;
    this.statusMoneyText = null!;
    this.statusTianmingText = null!;
    this.statusRolesText = null!;
    this.goldenTerraceContainer = null!;
    this.shopContainer = null!;
    this.startBtnGfx = null!;
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);

    // Title
    const titleY = 100;
    this.add.text(cx, titleY, '整 军 备 战', {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 3,
    }).setOrigin(0.5);
    UIFactory.divider(this, cx, titleY + 40);

    // Initialize state
    const shopDeck = createDeck();
    this.state = {
      money: 10,
      tianming: 1000,
      ownedCharacterIds: [...this.config.selectedPlayerCharacterIds],
      purchasedCards: [],
      goldenTerraceCharacters: this.generateRandomChars(3),
      shopCards: this.pickRandomCards(shopDeck, 3),
    };

    // Create three columns
    this.createGoldenTerraceColumn(width, height);
    this.createShopColumn(width, height);
    this.createStatusColumn(width, height);

    // Start battle button
    this.createStartBattleButton(width, height);

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
  }

  // ── helpers ──

  private generateRandomChars(count: number): PlayerCharacterId[] {
    const allIds = PLAYER_CHARACTER_LIST.map(c => c.id);
    const available = allIds.filter(id => !this.state.ownedCharacterIds.includes(id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  private pickRandomCards(deck: Card[], count: number): Card[] {
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // ── Background ──

  private drawBackground(w: number, h: number): void {
    UIFactory.darkBgWithBorder(this, w, h, 8);
  }
}
```

- [ ] **Step 2.2: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS (or minor type errors that we'll fix as we fill in methods)

---

### Task 3: 黄金台版块

**Files:**
- Modify: `src/scenes/PrepScene.ts`

- [ ] **Step 3.1: 实现黄金台列布局**

在 `PrepScene.create()` 内部调用下方方法。在 "// ── helpers ──" 之上追加：

```typescript
  private createGoldenTerraceColumn(w: number, h: number): void {
    const px = PREP_PANEL_X;
    const py = PREP_PANEL_Y;
    const pw = PREP_PANEL_W;
    const ph = PREP_PANEL_H;

    UIFactory.panel(this, px, py, pw, ph, '黄 金 台');

    const container = this.add.container(0, 0);
    this.goldenTerraceContainer = container;

    const chars = this.state.goldenTerraceCharacters;
    if (chars.length === 0) {
      container.add(
        this.add.text(px + pw / 2, py + ph / 2, '暂无更多角色', {
          fontSize: '22px',
          fontFamily: FONT_FAMILY,
          color: '#6a5030',
        }).setOrigin(0.5)
      );
      return;
    }

    const innerX = px + 40;
    const cardW = pw - 80;
    const startY = py + 50;

    chars.forEach((charId, index) => {
      const char = PLAYER_CHARACTERS[charId];
      const cy = startY + index * (PREP_ITEM_H + PREP_ITEM_GAP);
      this.createGoldenTerraceItem(innerX, cy, cardW, PREP_ITEM_H, charId, char, container);
    });
  }

  private createGoldenTerraceItem(
    x: number, y: number, w: number, h: number,
    id: PlayerCharacterId, char: typeof PLAYER_CHARACTERS[PlayerCharacterId],
    container: Phaser.GameObjects.Container
  ): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a0a04, 0.7);
    gfx.fillRoundedRect(x, y, w, h, 8);
    gfx.lineStyle(1, 0x5a4030, 0.6);
    gfx.strokeRoundedRect(x, y, w, h, 8);
    container.add(gfx);

    // Avatar
    const avatarSize = 90;
    const avatarX = x + 60;
    const avatarY = y + h / 2;
    const avatarBg = this.add.graphics();
    avatarBg.fillStyle(0x2a1508, 1);
    avatarBg.fillRoundedRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 6);
    container.add(avatarBg);

    const charImg = this.add.image(avatarX, avatarY, `char_${id}`);
    charImg.setScale(avatarSize / AVATAR_SOURCE_SIZE);
    container.add(charImg);

    // Name
    const nameX = avatarX + avatarSize / 2 + 20;
    const nameTxt = this.add.text(nameX, y + 22, char.name, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(0, 0.5);
    container.add(nameTxt);

    // Cost
    const costTxt = this.add.text(nameX, y + 58, `费用 ${char.cost} 元`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0, 0.5);
    container.add(costTxt);

    // Abilities
    const abiStr = char.abilities.map(a => a.name).join(' · ');
    const abiTxt = this.add.text(nameX, y + 88, abiStr, {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#6a5030',
    }).setOrigin(0, 0.5);
    container.add(abiTxt);

    // Abilities description on hover (simplified: show first ability desc)
    const abiDesc = char.abilities.length > 0 ? char.abilities[0]!.description : '';

    // Buy button
    const canBuy = this.state.money >= char.cost;
    const btnX = x + w - 100;
    const btnY = y + h / 2;

    const btnBg = this.add.graphics();
    const drawBuyBtn = (hover: boolean) => {
      btnBg.clear();
      if (!canBuy) {
        btnBg.fillStyle(0x2a1a0f, 0.5);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(1, 0x5a4030, 0.4);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      } else if (hover) {
        btnBg.fillStyle(0x6b3820, 1);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(2, 0xe8d5a3, 1);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      } else {
        btnBg.fillStyle(0x5a3018, 1);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(1.5, 0xc8a050, 0.85);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      }
    };
    drawBuyBtn(false);
    container.add(btnBg);

    const btnText = this.add.text(btnX, btnY, canBuy ? '购 买' : '不足', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: canBuy ? '#e8d5a3' : '#5a4030',
    }).setOrigin(0.5);
    container.add(btnText);

    if (canBuy) {
      const zone = this.add.zone(btnX, btnY, 100, 44).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => drawBuyBtn(true));
      zone.on('pointerout', () => drawBuyBtn(false));
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this, 'sfx_button');
        this.buyGoldenTerraceCharacter(id, index);
      });
      container.add(zone);
    }

    // Whole card zone (for showing desc)
    const cardZone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ cursor: 'pointer' });
    cardZone.on('pointerover', () => {
      gfx.clear();
      gfx.fillStyle(0x2a1508, 1);
      gfx.fillRoundedRect(x, y, w, h, 8);
      gfx.lineStyle(2, 0xc8a050, 0.8);
      gfx.strokeRoundedRect(x, y, w, h, 8);
      // Show tooltip-ish effect: briefly show ability description
      if (abiDesc) {
        // Could add a tooltip floating above — for now just highlight
      }
    });
    cardZone.on('pointerout', () => {
      gfx.clear();
      gfx.fillStyle(0x1a0a04, 0.7);
      gfx.fillRoundedRect(x, y, w, h, 8);
      gfx.lineStyle(1, 0x5a4030, 0.6);
      gfx.strokeRoundedRect(x, y, w, h, 8);
    });
    container.add(cardZone);
  }

  private buyGoldenTerraceCharacter(id: PlayerCharacterId, index: number): void {
    const char = PLAYER_CHARACTERS[id];
    this.state.money -= char.cost;
    this.state.ownedCharacterIds.push(id);
    this.state.goldenTerraceCharacters.splice(index, 1);
    this.refreshGoldenTerrace();
    this.refreshStatus();
  }

  private refreshGoldenTerrace(): void {
    this.goldenTerraceContainer.destroy();
    const { width, height } = this.scale;
    this.createGoldenTerraceColumn(width, height);
  }
```

- [ ] **Step 3.2: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS (note: refreshGoldenTerrace references createGoldenTerraceColumn which is now defined before it — order within class doesn't matter in TypeScript)

---

### Task 4: 商铺版块

**Files:**
- Modify: `src/scenes/PrepScene.ts`

- [ ] **Step 4.1: 实现商铺列布局**

在 `createGoldenTerraceColumn` 之后追加：

```typescript
  private createShopColumn(w: number, h: number): void {
    const px = PREP_PANEL_X + PREP_PANEL_W + PREP_PANEL_GAP;
    const py = PREP_PANEL_Y;
    const pw = PREP_PANEL_W;
    const ph = PREP_PANEL_H;

    UIFactory.panel(this, px, py, pw, ph, '商  铺');

    const container = this.add.container(0, 0);
    this.shopContainer = container;

    const cards = this.state.shopCards;
    if (cards.length === 0) {
      container.add(
        this.add.text(px + pw / 2, py + ph / 2, '已售罄', {
          fontSize: '22px',
          fontFamily: FONT_FAMILY,
          color: '#6a5030',
        }).setOrigin(0.5)
      );
      return;
    }

    const innerX = px + 40;
    const cardW = pw - 80;
    const startY = py + 50;

    cards.forEach((card, index) => {
      const cy = startY + index * (PREP_ITEM_H + PREP_ITEM_GAP);
      this.createShopItem(innerX, cy, cardW, PREP_ITEM_H, card, index, container);
    });
  }

  private createShopItem(
    x: number, y: number, w: number, h: number,
    card: Card, index: number,
    container: Phaser.GameObjects.Container
  ): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a0a04, 0.7);
    gfx.fillRoundedRect(x, y, w, h, 8);
    gfx.lineStyle(1, 0x5a4030, 0.6);
    gfx.strokeRoundedRect(x, y, w, h, 8);
    container.add(gfx);

    // Card mini-visual
    const cardW = 90;
    const cardH = 126;
    const cardX = x + 55;
    const cardY = y + h / 2;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0xf5f0e5, 1);
    cardBg.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 6);
    cardBg.lineStyle(1.5, 0x8a6830, 0.6);
    cardBg.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 6);
    container.add(cardBg);

    // Suit + Rank inside card
    const suitSymbols: Record<string, string> = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };
    const suitStr = card.suit ? suitSymbols[card.suit] ?? '' : '';
    const suitColor = (card.suit === 'heart' || card.suit === 'diamond') ? '#c03030' : '#1a1a1a';

    const rankTxt = this.add.text(cardX, cardY - 8, card.rankLabel, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: suitColor,
    }).setOrigin(0.5);
    container.add(rankTxt);

    if (suitStr) {
      const suitTxt = this.add.text(cardX, cardY + 20, suitStr, {
        fontSize: '22px',
        color: suitColor,
      }).setOrigin(0.5);
      container.add(suitTxt);
    }

    // Card name + price
    const nameX = cardX + cardW / 2 + 20;
    const displayName = card.suit ? `${suitStr}${card.rankLabel}` : card.rankLabel;
    const nameTxt = this.add.text(nameX, y + 30, displayName, {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(0, 0.5);
    container.add(nameTxt);

    const priceTxt = this.add.text(nameX, y + 68, '价格 3 元', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0, 0.5);
    container.add(priceTxt);

    // Buy button
    const canBuy = this.state.money >= 3;
    const btnX = x + w - 100;
    const btnY = y + h / 2;

    const btnBg = this.add.graphics();
    const drawBuyBtn = (hover: boolean) => {
      btnBg.clear();
      if (!canBuy) {
        btnBg.fillStyle(0x2a1a0f, 0.5);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(1, 0x5a4030, 0.4);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      } else if (hover) {
        btnBg.fillStyle(0x6b3820, 1);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(2, 0xe8d5a3, 1);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      } else {
        btnBg.fillStyle(0x5a3018, 1);
        btnBg.fillRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
        btnBg.lineStyle(1.5, 0xc8a050, 0.85);
        btnBg.strokeRoundedRect(btnX - 50, btnY - 22, 100, 44, 6);
      }
    };
    drawBuyBtn(false);
    container.add(btnBg);

    const btnText = this.add.text(btnX, btnY, canBuy ? '购 买' : '不足', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: canBuy ? '#e8d5a3' : '#5a4030',
    }).setOrigin(0.5);
    container.add(btnText);

    if (canBuy) {
      const zone = this.add.zone(btnX, btnY, 100, 44).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => drawBuyBtn(true));
      zone.on('pointerout', () => drawBuyBtn(false));
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this, 'sfx_button');
        this.buyShopCard(index);
      });
      container.add(zone);
    }
  }

  private buyShopCard(index: number): void {
    const card = this.state.shopCards[index]!;
    this.state.money -= 3;
    this.state.purchasedCards.push(card);
    this.state.shopCards.splice(index, 1);
    this.refreshShop();
    this.refreshStatus();
    // Also refresh golden terrace buy buttons (because money changed)
    this.refreshGoldenTerrace();
  }

  private refreshShop(): void {
    this.shopContainer.destroy();
    const { width, height } = this.scale;
    this.createShopColumn(width, height);
  }
```

- [ ] **Step 4.2: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS

---

### Task 5: 状态版块

**Files:**
- Modify: `src/scenes/PrepScene.ts`

- [ ] **Step 5.1: 实现状态列布局**

在 `createShopColumn` 之后追加：

```typescript
  private createStatusColumn(w: number, h: number): void {
    const px = PREP_PANEL_X + (PREP_PANEL_W + PREP_PANEL_GAP) * 2;
    const py = PREP_PANEL_Y;
    const pw = PREP_PANEL_W;
    const ph = PREP_PANEL_H;

    UIFactory.panel(this, px, py, pw, ph, '状  态');

    const innerX = px + 40;
    const startY = py + 60;

    this.statusTianmingText = this.add.text(innerX, startY, `天命: ${this.state.tianming}`, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
    }).setOrigin(0, 0.5);

    this.statusMoneyText = this.add.text(innerX, startY + 50, `金钱: ${this.state.money} 元`, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(0, 0.5);

    // Divider
    const dividerGfx = this.add.graphics();
    dividerGfx.lineStyle(1, 0xb89040, 0.4);
    dividerGfx.lineBetween(innerX, startY + 90, px + pw - 40, startY + 90);

    // Owned characters
    const rolesLabel = this.add.text(innerX, startY + 110, '拥有角色', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0, 0.5);

    this.updateStatusRolesText(innerX, startY + 140);
  }

  private refreshStatus(): void {
    if (this.statusMoneyText) {
      this.statusMoneyText.setText(`金钱: ${this.state.money} 元`);
    }
    if (this.statusTianmingText) {
      this.statusTianmingText.setText(`天命: ${this.state.tianming}`);
    }
    const px = PREP_PANEL_X + (PREP_PANEL_W + PREP_PANEL_GAP) * 2 + 40;
    const py = PREP_PANEL_Y + 60;
    this.updateStatusRolesText(px, py + 140);
  }

  private updateStatusRolesText(innerX: number, startY: number): void {
    if (this.statusRolesText) {
      this.statusRolesText.destroy();
    }

    const roles = this.state.ownedCharacterIds.map(id => PLAYER_CHARACTERS[id]?.name ?? id);
    const lines = roles.map((name, i) => `${i + 1}. ${name}`).join('\n');
    this.statusRolesText = this.add.text(innerX, startY, lines || '(无)', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#a08050',
      lineSpacing: 6,
    }).setOrigin(0, 0);
  }
```

- [ ] **Step 5.2: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS (the `dividerGfx` is created but not stored as instance field — that's fine for a non-interactive element)

---

### Task 6: 开始战斗按钮

- [ ] **Step 6.1: 实现开始战斗按钮和跳转**

在 `createStatusColumn` 之后追加：

```typescript
  private createStartBattleButton(w: number, h: number): void {
    const btnW = 340;
    const btnH = 72;
    const btnX = w / 2;
    const btnY = h - 100;

    const gfx = this.add.graphics();
    this.startBtnGfx = gfx;

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

    this.add.text(btnX, btnY, '▶  开 始 战 斗', {
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
      GameAudioManager.playSfx(this, 'sfx_button');
      this.startBattle();
    });
  }

  private startBattle(): void {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene', {
        selectedPlayerCharacterIds: this.config.selectedPlayerCharacterIds,
        enemyCharacterId: this.config.enemyCharacterId,
        playerVitality: this.config.playerVitality,
        enemyVitality: this.config.enemyVitality,
        purchasedCards: this.state.purchasedCards.length > 0 ? this.state.purchasedCards : undefined,
      });
    });
  }
```

- [ ] **Step 6.2: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS

---

### Task 7: 修改 TestSelectScene 导航

**Files:**
- Modify: `src/scenes/TestSelectScene.ts`

- [ ] **Step 7.1: 将开始按钮跳转目标从 GameScene 改为 PrepScene**

在 `src/scenes/TestSelectScene.ts` 末尾找到 `startTestBattle` 方法（856-869行），将跳转目标改为 PrepScene：

```typescript
  private startTestBattle(): void {
    const config = {
      selectedPlayerCharacterIds: [...this.selectedPlayerIds],
      enemyCharacterId: this.selectedEnemyId,
      playerVitality: this.playerVitality,
      enemyVitality: this.enemyVitality,
    };

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('PrepScene', config);
    });
  }
```

- [ ] **Step 7.2: Update button text**

在 `createStartButton` 中（840行），将按钮文字从 `'▶  开 始 测 试'` 改为 `'▶  前往备战  '`，并保持 click 逻辑不变（跳转已改为 PrepScene）

- [ ] **Step 7.3: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS

---

### Task 8: 修改 GameScene 接受 purchasedCards

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 8.1: 扩展 TestBattleConfig 接口**

在 GameScene.ts 中找到 `interface TestBattleConfig`（约30-35行），追加可选字段：

```typescript
interface TestBattleConfig {
  selectedPlayerCharacterIds?: PlayerCharacterId[];
  enemyCharacterId?: EnemyCharacterId;
  playerVitality?: number;
  enemyVitality?: number;
  purchasedCards?: Card[];  // ← 新增
}
```

- [ ] **Step 8.2: 导入 getNextCardId**

在 GameScene.ts 顶部找到 Card 相关导入，确保已导入 `getNextCardId`：

```typescript
import { createDeck, shuffleDeck, sortHand, Card, getNextCardId } from '../models/Card';
```

- [ ] **Step 8.3: 在 initBattle 中融合购买卡牌**

找到 `initBattle` 方法（326-368行），在创建 playerDeck 后、发牌前追加：

```typescript
  private initBattle(): BattleState {
    const playerDeck = shuffleDeck(createDeck());
    const enemyDeck = shuffleDeck(createDeck());

    // 融合购买的卡牌（仅加入玩家牌组）
    const purchased = this.testConfig?.purchasedCards;
    if (purchased && purchased.length > 0) {
      for (const card of purchased) {
        // 重新分配 UID 避免与现有牌组冲突
        playerDeck.push({
          ...card,
          uid: getNextCardId(),
        });
      }
      shuffleDeck(playerDeck);
    }

    const playerHand = playerDeck.splice(0, 17);
    const enemyHand = enemyDeck.splice(0, 17);

    sortHand(playerHand);
    sortHand(enemyHand);
    // ... rest unchanged
```

- [ ] **Step 8.4: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: PASS

---

### Task 9: LoadingScene 中加载 char_ 头像资源（如尚未加载）

**Files:**
- Review: `src/scenes/LoadingScene.ts`

检查 LoadingScene 中是否已经加载了所有 `char_*` 头像。如果已有 `char_hanxin` 等，黄金台用到的角色头像应该已经可用。

- [ ] **Step 9.1: 检查现有资源加载**

View: `src/scenes/LoadingScene.ts`
如果已加载所有角色头像，无需修改。

---

### Task 10: 完整构建验证

- [ ] **Step 10.1: 运行 TypeScript 检查**

Run: `npx tsc --noEmit --pretty`
Expected: PASS

- [ ] **Step 10.2: 运行 Vite 构建**

Run: `npm run build`
Expected: PASS (exit code 0)

- [ ] **Step 10.3: 运行测试**

Run: `npm run test`
Expected: PASS (existing tests still pass; no new tests for PrepScene as it's purely UI-based)
