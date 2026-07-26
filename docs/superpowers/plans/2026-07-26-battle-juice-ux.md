# 战斗画面·动画·操作优化（方案 A）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升对战场景的回合反馈、AI 出牌可读性、打击感与选牌操作，达到「斗地主类手游」的成熟手感。

**Architecture:** 三个纯函数模块（手牌布局 / 气泡钳制 / 提示出牌）先行 TDD；场景层新增 `TurnIndicatorManager` 与 `JuiceManager` 两个 Manager；其余改动落在现有 Manager（CardDisplay / DragInput / BattleFlow / Button / CharacterBar / DamageSettlement）。设计规格：`docs/superpowers/specs/2026-07-26-battle-juice-ux-design.md`。

**Tech Stack:** Phaser 4 + TypeScript（strict）+ Vitest。

**关键现状（实现前必读）：**
- 点按选牌已存在于 `DragInputManager.onCardClick`（pointerup 位移 <8px 触发），本计划只做手势冲突分流，不重做点选。
- `findBeatingPlays(hand, lastPlay)` 与 `findAllPlays(hand)` 已存在于 `src/engine/HandRecognizer.ts`。
- 手牌固定间距 `CARD_OVERLAP_OFFSET = 135`，手牌 baseY = `height - 90`。
- 按钮组：出牌 `(w/2-160, h-320)`、不出 `(w/2+160, h-320)`，宽 250。
- `patternHintText` 位于 `(w/2, h-370)`；敌方信息栏 x=120 y=50 w=420 h=34；玩家信息栏 x=120 y=h-380。

---

### Task 1: 纯函数 — 手牌布局 `calcHandLayout`

**Files:**
- Create: `src/engine/handLayout.ts`
- Test: `src/engine/__tests__/handLayout.test.ts`
- Modify: `src/constants/Layout.ts`（新增 `HAND_AREA_MARGIN`）

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { calcHandLayout, MIN_CARD_OVERLAP } from '../handLayout';

const CARD_W = 180;
const BASE_OFFSET = 135;
const AVAILABLE = 2280; // 2400 - 60*2

describe('calcHandLayout', () => {
  it('0 张牌：totalWidth 为 0，不可滑动', () => {
    const l = calcHandLayout(0, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.totalWidth).toBe(0);
    expect(l.scrollable).toBe(false);
  });

  it('1 张牌：不除零，使用基础间距，不可滑动', () => {
    const l = calcHandLayout(1, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.totalWidth).toBe(CARD_W);
    expect(l.offset).toBe(BASE_OFFSET);
    expect(l.scrollable).toBe(false);
  });

  it('少量牌（10 张）：固定基础间距', () => {
    const l = calcHandLayout(10, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBe(BASE_OFFSET);
    expect(l.totalWidth).toBe(CARD_W + 9 * BASE_OFFSET);
    expect(l.scrollable).toBe(false);
  });

  it('17 张牌：超宽，压缩间距但仍 ≥ 下限', () => {
    const l = calcHandLayout(17, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBeCloseTo((AVAILABLE - CARD_W) / 16);
    expect(l.offset).toBeGreaterThanOrEqual(MIN_CARD_OVERLAP);
    expect(l.scrollable).toBe(false);
    expect(l.totalWidth).toBeCloseTo(AVAILABLE);
  });

  it('60 张牌：压到下限仍超宽 → 可滑动，间距锁定下限', () => {
    const l = calcHandLayout(60, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBe(MIN_CARD_OVERLAP);
    expect(l.scrollable).toBe(true);
    expect(l.totalWidth).toBe(CARD_W + 59 * MIN_CARD_OVERLAP);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- handLayout`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/engine/handLayout.ts`：

```typescript
export const MIN_CARD_OVERLAP = 40;

export interface HandLayout {
  offset: number;
  scrollable: boolean;
  totalWidth: number;
}

/**
 * 手牌横向布局三级策略：
 * 1. 常规：基础间距放得下 → baseOffset
 * 2. 压缩：超宽 → 间距压缩（下限 minOffset），整列居中
 * 3. 溢出：压到下限仍超宽 → 间距锁定 minOffset，scrollable = true（调用方负责横向滑动）
 */
export function calcHandLayout(
  cardCount: number,
  availableWidth: number,
  baseOffset: number,
  cardWidth: number,
  minOffset: number = MIN_CARD_OVERLAP,
): HandLayout {
  if (cardCount <= 0) {
    return { offset: baseOffset, scrollable: false, totalWidth: 0 };
  }
  const baseTotal = cardWidth + (cardCount - 1) * baseOffset;
  if (baseTotal <= availableWidth) {
    return { offset: baseOffset, scrollable: false, totalWidth: baseTotal };
  }
  const compressed = (availableWidth - cardWidth) / (cardCount - 1);
  if (compressed >= minOffset) {
    return { offset: compressed, scrollable: false, totalWidth: availableWidth };
  }
  return {
    offset: minOffset,
    scrollable: true,
    totalWidth: cardWidth + (cardCount - 1) * minOffset,
  };
}
```

`src/constants/Layout.ts` 在 `SELECTED_OFFSET` 后新增：

```typescript
export const HAND_AREA_MARGIN = 60;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- handLayout`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/engine/handLayout.ts src/engine/__tests__/handLayout.test.ts src/constants/Layout.ts
git commit -m "feat(engine): calcHandLayout — 手牌三级布局策略纯函数（常规/压缩/溢出滑动）"
```

---

### Task 2: 纯函数 — 对话气泡钳制

**Files:**
- Create: `src/utils/bubbleLayout.ts`
- Test: `src/utils/__tests__/bubbleLayout.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { clampBubbleCenterX, clampBubbleTailX } from '../bubbleLayout';

describe('clampBubbleCenterX', () => {
  it('居中锚点：不钳制', () => {
    expect(clampBubbleCenterX(1200, 300, 2400, 16)).toBe(1200);
  });

  it('左边缘锚点：气泡右移，左边距 = margin', () => {
    expect(clampBubbleCenterX(54, 300, 2400, 16)).toBe(166);
  });

  it('右边缘锚点：气泡左移，右边距 = margin', () => {
    expect(clampBubbleCenterX(2380, 300, 2400, 16)).toBe(2234);
  });
});

describe('clampBubbleTailX', () => {
  it('偏移在框内：原样返回', () => {
    expect(clampBubbleTailX(-112, 300)).toBe(-112);
  });

  it('偏移超出框宽一半：钳制到 boxW/2 - 24', () => {
    expect(clampBubbleTailX(-500, 300)).toBe(-126);
    expect(clampBubbleTailX(500, 300)).toBe(126);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- bubbleLayout`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/utils/bubbleLayout.ts`：

```typescript
/** 气泡中心 x 钳制在屏幕内（含左右 margin） */
export function clampBubbleCenterX(
  anchorX: number,
  boxW: number,
  screenWidth: number,
  margin: number,
): number {
  const half = boxW / 2;
  return Math.min(Math.max(anchorX, margin + half), screenWidth - margin - half);
}

/** 气泡尾巴相对气泡中心的水平偏移，钳制在气泡框内（预留 24px 圆角余量） */
export function clampBubbleTailX(offsetX: number, boxW: number): number {
  const limit = boxW / 2 - 24;
  return Math.min(Math.max(offsetX, -limit), limit);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- bubbleLayout`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/bubbleLayout.ts src/utils/__tests__/bubbleLayout.test.ts
git commit -m "feat(utils): bubbleLayout — 对话气泡屏幕边缘钳制纯函数"
```

---

### Task 3: 纯函数 — 提示出牌 `findHintPlays`

**Files:**
- Create: `src/engine/findHintPlays.ts`
- Test: `src/engine/__tests__/findHintPlays.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { canBeat, identifyHand } from '../HandRecognizer';
import { findHintPlays } from '../findHintPlays';

function makeCard(rank: number, suit: Card['suit'] = 'spade'): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: String(rank) };
}

beforeEach(() => resetCardIdCounter());

describe('findHintPlays', () => {
  it('跟牌：首选能压过上家的最小单张', () => {
    const hand = [makeCard(3), makeCard(4, 'club'), makeCard(5, 'heart'), makeCard(6, 'diamond')];
    const lastPlay = identifyHand([makeCard(4, 'heart')])!; // 单张 4
    const plays = findHintPlays(hand, lastPlay, p => canBeat(p, lastPlay));
    expect(plays.length).toBeGreaterThan(0);
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(5);
  });

  it('炸弹排在最后（不优先拆炸弹）', () => {
    const hand = [
      makeCard(9), makeCard(9, 'club'), makeCard(9, 'heart'), makeCard(9, 'diamond'),
      makeCard(6, 'club'),
    ];
    const lastPlay = identifyHand([makeCard(5)])!; // 单张 5
    const plays = findHintPlays(hand, lastPlay, p => canBeat(p, lastPlay));
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(6);
    expect(plays[plays.length - 1]!.type).toBe(HandType.Bomb);
  });

  it('自由出牌（lastPlay = null）：最小单张优先', () => {
    const hand = [makeCard(3), makeCard(7, 'club'), makeCard(7, 'heart'), makeCard(13)];
    const plays = findHintPlays(hand, null, () => true);
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(3);
  });

  it('canBeat 全部否决时返回空数组', () => {
    const hand = [makeCard(3), makeCard(4, 'club')];
    const lastPlay = identifyHand([makeCard(20)])!; // 单张 2
    const plays = findHintPlays(hand, lastPlay, () => false);
    expect(plays).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- findHintPlays`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/engine/findHintPlays.ts`：

```typescript
import type { Card } from '../models/Card';
import type { HandPattern } from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';
import { findAllPlays } from './HandRecognizer';

function isBombPattern(p: HandPattern): boolean {
  return p.type === HandType.Bomb || p.type === HandType.Rocket;
}

/**
 * 「提示」按钮候选出法：
 * - lastPlay 非空时只保留 canBeat 判定通过的出法（调用方注入角色接牌规则与被封锁牌型）
 * - 排序：非炸弹优先（不拆炸弹）→ 张数少优先 → 主点数小优先
 * 返回数组顺序即「提示」按钮循环顺序。
 */
export function findHintPlays(
  hand: Card[],
  lastPlay: HandPattern | null,
  canBeat: (pattern: HandPattern) => boolean,
): HandPattern[] {
  let plays = findAllPlays(hand);
  if (lastPlay) {
    plays = plays.filter(p => canBeat(p));
  }
  const byCost = (a: HandPattern, b: HandPattern) =>
    a.cards.length - b.cards.length || a.mainValue - b.mainValue;
  const nonBombs = plays.filter(p => !isBombPattern(p)).sort(byCost);
  const bombs = plays.filter(p => isBombPattern(p)).sort(byCost);
  return [...nonBombs, ...bombs];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- findHintPlays`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/engine/findHintPlays.ts src/engine/__tests__/findHintPlays.test.ts
git commit -m "feat(engine): findHintPlays — 提示按钮候选出法（非炸弹优先、代价最小）"
```

---

### Task 4: CardDisplayManager — 动态布局 + 滑动 + 牌型标签

**Files:**
- Modify: `src/scenes/managers/CardDisplayManager.ts`

- [ ] **Step 1: 扩展 CardDisplayHost 接口与导入**

文件头部 imports 替换为（新增 calcHandLayout、HAND_AREA_MARGIN、HAND_TYPE_LABELS 不需要——label 文本由调用方传入）：

```typescript
import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { JOKER_MIN_RANK } from '../../models/Card';
import { UIFactory } from '../../utils/UIFactory';
import { calcHandLayout } from '../../engine/handLayout';
import {
  FONT_FAMILY, CARD_W, CARD_H, CARD_OVERLAP_OFFSET, SELECTED_OFFSET,
  HAND_AREA_MARGIN,
  DEPTH_PLAYER_HAND, DEPTH_ENEMY_HAND, DEPTH_CENTER_BASE,
} from '../../constants/Layout';
```

`CardDisplayHost` 接口新增字段：

```typescript
  handScrollX: number;
```

（放在 `selectedIndices: Set<number>;` 之后）

- [ ] **Step 2: 新增布局与滑动方法**

在 `CardDisplayManager` 类中 `renderPlayerHand` 之前新增：

```typescript
  /** 当前手牌布局：首牌中心 x、间距、是否可滑动。滑动模式下同步钳制 handScrollX。 */
  getHandLayout(): { startX: number; offset: number; scrollable: boolean } {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    const available = width - HAND_AREA_MARGIN * 2;
    const layout = calcHandLayout(hand.length, available, CARD_OVERLAP_OFFSET, CARD_W);
    let startX: number;
    if (layout.scrollable) {
      const minScroll = available - layout.totalWidth;
      this.host.handScrollX = Phaser.Math.Clamp(this.host.handScrollX, minScroll, 0);
      startX = HAND_AREA_MARGIN + CARD_W / 2 + this.host.handScrollX;
    } else {
      this.host.handScrollX = 0;
      startX = (width - layout.totalWidth) / 2 + CARD_W / 2;
    }
    return { startX, offset: layout.offset, scrollable: layout.scrollable };
  }

  isHandScrollable(): boolean {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    return calcHandLayout(hand.length, width - HAND_AREA_MARGIN * 2, CARD_OVERLAP_OFFSET, CARD_W).scrollable;
  }

  /** 手牌横向滑动 dx 像素（溢出模式下由 DragInputManager 调用），就地更新牌位置 */
  scrollHandBy(dx: number): void {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    const available = width - HAND_AREA_MARGIN * 2;
    const layout = calcHandLayout(hand.length, available, CARD_OVERLAP_OFFSET, CARD_W);
    if (!layout.scrollable) return;
    const minScroll = available - layout.totalWidth;
    this.host.handScrollX = Phaser.Math.Clamp(this.host.handScrollX + dx, minScroll, 0);
    this.applyHandPositions();
  }

  applyHandPositions(): void {
    const { startX, offset } = this.getHandLayout();
    for (let i = 0; i < this.host.cardObjects.length; i++) {
      this.host.cardObjects[i]!.setX(startX + i * offset);
    }
  }
```

- [ ] **Step 3: renderPlayerHand 改用动态布局**

`renderPlayerHand` 中替换布局计算（删除 `const overlapOffset = CARD_OVERLAP_OFFSET; const totalW = ...; const startX = ...;` 三行）：

```typescript
  renderPlayerHand(animateEntry: boolean = false): void {
    this.host.cardObjects.forEach(c => c.destroy());
    this.host.cardObjects = [];

    const hand = this.host.battle.player.hand;
    const { width, height } = this.host.scale;
    const baseY = height - 90;
    const { startX, offset } = this.getHandLayout();
    const offscreenX = width + CARD_W;

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * offset;
      const isSelected = this.host.selectedIndices.has(i);
      const y = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const initX = animateEntry ? offscreenX : targetX;
      const obj = this.createCardInteractive(hand[i]!, initX, y, i, isSelected);
      obj.setDepth(DEPTH_PLAYER_HAND + i);
      this.host.cardObjects.push(obj);

      if (animateEntry) {
        this.host.tweens.add({
          targets: obj,
          x: targetX,
          duration: 200,
          delay: i * 50,
          ease: 'Cubic.easeOut',
        });
      }
    }
  }
```

- [ ] **Step 4: 新增牌型标签**

在 `clearCenterCards` 之前新增字段与方法：

```typescript
  private patternLabel: Phaser.GameObjects.Container | null = null;

  /** 中央出牌区上方显示牌型标签（玩家/AI 出牌后调用），炸弹系用火焰色 */
  showPatternLabel(label: string, isBomb: boolean): void {
    this.clearPatternLabel();
    const text = this.host.add.text(0, 0, label, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: isBomb ? '#ffd090' : '#ffe9c0',
    }).setOrigin(0.5);
    const padX = 26;
    const padY = 10;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const bg = this.host.add.graphics();
    bg.fillStyle(isBomb ? 0x8a2a10 : 0x8a5a20, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(1.5, 0xe8c880, 0.7);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const container = this.host.add.container(1200, 370, [bg, text])
      .setDepth(DEPTH_CENTER_BASE + 300)
      .setAlpha(0)
      .setScale(0.8);
    this.patternLabel = container;
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  clearPatternLabel(): void {
    this.patternLabel?.destroy();
    this.patternLabel = null;
  }
```

在 `clearCenterCards()` 方法体第一行、以及 `fadeOutCenterCards()` 方法体第一行各加：

```typescript
    this.clearPatternLabel();
```

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿（此任务无新单测，保证无回归）

- [ ] **Step 6: 提交**

```bash
git add src/scenes/managers/CardDisplayManager.ts
git commit -m "feat(battle): 手牌动态布局（压缩/滑动）+ 中央区牌型标签"
```

---

### Task 5: DragInputManager — 手势分流（滚动 / 框选 / 点按）

**Files:**
- Modify: `src/scenes/managers/DragInputManager.ts`

- [ ] **Step 1: 重写 DragInputManager**

构造函数改为接收 `CardDisplayManager`（第二个参数，类型用 `import type`）：

```typescript
import type { CardDisplayManager } from './CardDisplayManager';
```

`DragInputHost` 接口删除不再直接使用的 `CARD_W/CARD_H/CARD_OVERLAP_OFFSET` 布局依赖（imports 中只保留 `SELECTED_OFFSET`），新增 `handScrollX` 字段不需要——host 接口保持不变，布局全部走 cardDisplay。

完整替换后的文件核心逻辑如下（保持类名与公开方法签名不变）：

```typescript
import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { SELECTED_OFFSET, CARD_H } from '../../constants/Layout';
import type { CardDisplayManager } from './CardDisplayManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface DragInputHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly input: Phaser.Input.InputPlugin;
  battle: BattleState;
  cardObjects: Phaser.GameObjects.Container[];
  selectedIndices: Set<number>;
  phase: GamePhase;
  updatePatternHint(): void;
  updateActiveSkillButton(): void;
}

export class DragInputManager {
  private host: DragInputHost;
  private cardDisplay: CardDisplayManager;

  private dragStartIndex: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragActive = false;
  private scrollActive = false;
  private lastPointerX = 0;
  private dragSelectMode: 'add' | 'remove' | null = null;
  private dragTouchedIndices: Set<number> = new Set();
  private dragSnapshot: Set<number> = new Set();

  constructor(host: DragInputHost, cardDisplay: CardDisplayManager) {
    this.host = host;
    this.cardDisplay = cardDisplay;
  }

  setup(): void {
    const input = this.host.input;

    input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlayerTurn()) return;
      const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      if (idx === null) return;

      this.dragStartIndex = idx;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.lastPointerX = pointer.x;
      this.dragActive = false;
      this.scrollActive = false;
      this.dragSelectMode = null;
      this.dragSnapshot = new Set(this.host.selectedIndices);
    });

    input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;
      if (!pointer.isDown) {
        this.resetDragState();
        return;
      }

      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!this.dragActive && !this.scrollActive) {
        if (dist < 8) return;
        // 手势分流：手牌可滑动且水平位移为主 → 滚动；否则 → 框选
        if (this.cardDisplay.isHandScrollable() && Math.abs(dx) > Math.abs(dy) * 2) {
          this.scrollActive = true;
        } else {
          this.dragActive = true;
          this.dragSelectMode = this.host.selectedIndices.has(this.dragStartIndex) ? 'remove' : 'add';
        }
      }

      if (this.scrollActive) {
        this.cardDisplay.scrollHandBy(pointer.x - this.lastPointerX);
        this.lastPointerX = pointer.x;
        return;
      }

      const currentIdx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      this.applyDragRange(currentIdx);
    });

    input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;

      if (!this.dragActive && !this.scrollActive) {
        const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
        if (idx !== null && idx === this.dragStartIndex) {
          this.onCardClick(idx);
        }
      }

      this.resetDragState();
    });
  }

  resetDragState(): void {
    this.dragStartIndex = null;
    this.dragActive = false;
    this.scrollActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices.clear();
    this.dragSnapshot.clear();
  }

  // applyDragRange / onCardClick / isPlayerTurn 保持现有实现不变
  // getCardIndexAtPosition 改为使用 cardDisplay.getHandLayout()：

  private getCardIndexAtPosition(x: number, y: number): number | null {
    const hand = this.host.battle.player.hand;
    if (hand.length === 0) return null;

    const { height } = this.host.scale;
    const baseY = height - 90;
    const { startX, offset } = this.cardDisplay.getHandLayout();

    if (y < baseY - CARD_H / 2 - 10 || y > baseY + CARD_H / 2 + 10) return null;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const cx = startX + i * offset;
      const d = Math.abs(x - cx);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestDist > 90) return null; // CARD_W / 2
    return bestIdx;
  }

  private applyDragRange(currentIdx: number | null): void {
    // ……保持现有实现原样……
  }

  private isPlayerTurn(): boolean {
    const phase = this.host.phase;
    return phase === 'player_init' || phase === 'player_respond';
  }

  onCardClick(index: number): void {
    // ……保持现有实现原样……
  }
}
```

> 注意：`applyDragRange` 与 `onCardClick` 两个方法体从现文件原样保留（不改逻辑），上面用注释标出以免重复 200 行；实现时不得删除其内容。

- [ ] **Step 2: GameScene 构造顺序调整**

`src/scenes/GameScene.ts` create() 中：将 `this.cardDisplayManager = new CardDisplayManager(this);` 移到 `this.dragInputManager` 之前，并把 dragInput 构造改为：

```typescript
    this.cardDisplayManager = new CardDisplayManager(this);
    this.dragInputManager = new DragInputManager(this, this.cardDisplayManager);
```

同时 GameScene 新增公开字段（与 `selectedIndices` 同区）：

```typescript
  handScrollX = 0;
```

`resetSceneState()` 中新增：

```typescript
    this.handScrollX = 0;
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 4: 提交**

```bash
git add src/scenes/managers/DragInputManager.ts src/scenes/GameScene.ts
git commit -m "feat(battle): 手牌手势分流 — 横向滑动/框选/点按三态"
```

---

### Task 6: TurnIndicatorManager — 回合横幅 + AI 思考呼吸 + 行动方高亮框

**Files:**
- Create: `src/scenes/managers/TurnIndicatorManager.ts`
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: 新建 TurnIndicatorManager**

```typescript
import Phaser from 'phaser';
import { FONT_FAMILY, DEPTH_UI } from '../../constants/Layout';

export interface TurnIndicatorHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;
}

/**
 * 回合状态视觉：
 * - 玩家回合：屏幕中下大字横幅（弹入 + 呼吸微光）
 * - AI 回合：「对方思考中…」呼吸灯
 * - 当前行动方信息区金色描边呼吸框（敌方信息栏 / 我方信息栏）
 */
export class TurnIndicatorManager {
  private host: TurnIndicatorHost & Phaser.Scene;

  private banner: Phaser.GameObjects.Text | null = null;
  private thinking: Phaser.GameObjects.Text | null = null;
  private enemyFrame: Phaser.GameObjects.Graphics | null = null;
  private playerFrame: Phaser.GameObjects.Graphics | null = null;
  private bannerBreath: Phaser.Tweens.Tween | null = null;
  private thinkBreath: Phaser.Tweens.Tween | null = null;
  private frameBreath: Phaser.Tweens.Tween | null = null;

  constructor(host: TurnIndicatorHost & Phaser.Scene) {
    this.host = host;
  }

  create(w: number, h: number): void {
    this.banner = this.host.add.text(w / 2, h - 440, '', {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#6a4a20',
      stroke: '#f5eeda',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_UI).setVisible(false)
      .setShadow(0, 0, '#ffd700', 10, true, true);

    this.thinking = this.host.add.text(590, 67, '对方思考中…', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false);

    this.enemyFrame = this.host.add.graphics().setDepth(DEPTH_UI + 1).setVisible(false);
    this.enemyFrame.lineStyle(3, 0xffd700, 0.9);
    this.enemyFrame.strokeRoundedRect(44, 8, 512, 92, 8);

    this.playerFrame = this.host.add.graphics().setDepth(DEPTH_UI + 1).setVisible(false);
    this.playerFrame.lineStyle(3, 0xffd700, 0.9);
    this.playerFrame.strokeRoundedRect(104, h - 412, 452, 92, 8);
  }

  showPlayerTurn(text: string): void {
    this.hideThinking();
    this.setFrameActive('player');
    if (!this.banner) return;
    this.banner.setText(text).setVisible(true).setAlpha(0).setScale(0.8);
    this.bannerBreath?.stop();
    this.bannerBreath = null;
    this.host.tweens.add({
      targets: this.banner,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.banner || !this.banner.visible) return;
        this.bannerBreath = this.host.tweens.add({
          targets: this.banner,
          alpha: { from: 0.82, to: 1 },
          duration: 750,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  showAiThinking(): void {
    this.hideBanner();
    this.setFrameActive('enemy');
    if (!this.thinking) return;
    this.thinking.setVisible(true).setAlpha(1);
    this.thinkBreath?.stop();
    this.thinkBreath = this.host.tweens.add({
      targets: this.thinking,
      alpha: { from: 0.4, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  hideAll(): void {
    this.hideBanner();
    this.hideThinking();
    this.setFrameActive(null);
  }

  destroy(): void {
    this.bannerBreath?.stop();
    this.thinkBreath?.stop();
    this.frameBreath?.stop();
    this.bannerBreath = null;
    this.thinkBreath = null;
    this.frameBreath = null;
    this.banner = null;
    this.thinking = null;
    this.enemyFrame = null;
    this.playerFrame = null;
  }

  private hideBanner(): void {
    this.bannerBreath?.stop();
    this.bannerBreath = null;
    this.banner?.setVisible(false).setAlpha(1).setScale(1);
  }

  private hideThinking(): void {
    this.thinkBreath?.stop();
    this.thinkBreath = null;
    this.thinking?.setVisible(false).setAlpha(1);
  }

  private setFrameActive(side: 'player' | 'enemy' | null): void {
    this.frameBreath?.stop();
    this.frameBreath = null;
    this.enemyFrame?.setVisible(false).setAlpha(1);
    this.playerFrame?.setVisible(false).setAlpha(1);
    const frame = side === 'enemy' ? this.enemyFrame : side === 'player' ? this.playerFrame : null;
    if (!frame) return;
    frame.setVisible(true);
    this.frameBreath = this.host.tweens.add({
      targets: frame,
      alpha: { from: 0.35, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
```

- [ ] **Step 2: GameScene 接线**

1. 删除字段声明 `turnIndicatorText` 与 `thinkingText`，新增：

```typescript
  turnIndicatorManager!: TurnIndicatorManager;
```

（import 该 Manager）

2. 删除 `createTurnIndicator()` 方法及其调用；在 `create()` 中 `this.createPatternHint(width, height);` 之后插入：

```typescript
    this.turnIndicatorManager = new TurnIndicatorManager(this);
    this.turnIndicatorManager.create(width, height);
```

3. `resetSceneState()` 中 `this.tweens.killAll();` 之前新增：

```typescript
    this.turnIndicatorManager?.destroy();
    this.tweens.timeScale = 1;
```

4. `updateUIForPhase()` 整个替换为：

```typescript
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
```

5. `updateTurnIndicator()` 替换为：

```typescript
  updateTurnIndicator(who: 'player' | 'enemy'): void {
    if (who === 'player') {
      this.turnIndicatorManager.showPlayerTurn('轮到你出牌');
    } else {
      this.turnIndicatorManager.showAiThinking();
    }
  }
```

6. GameScene 新增字段（btnPlay 声明旁）：

```typescript
  btnHint!: Phaser.GameObjects.Container;
  btnHintText!: Phaser.GameObjects.Text;
```

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 无类型错误（btnHint 的创建在 Task 8 完成前此处仅判空，需先加 `btnHint`/`btnHintText` 字段声明即可编译）

- [ ] **Step 4: 提交**

```bash
git add src/scenes/managers/TurnIndicatorManager.ts src/scenes/GameScene.ts
git commit -m "feat(battle): TurnIndicatorManager — 回合横幅/AI 思考呼吸/行动方高亮框"
```

---

### Task 7: BattleFlowManager — 牌型标签接线 + AI 思考节奏分级

**Files:**
- Modify: `src/scenes/managers/BattleFlowManager.ts`

- [ ] **Step 1: 导入 HAND_TYPE_LABELS**

文件头部 `import { HandType } from '../../models/BattleTypes';` 改为：

```typescript
import { HandType, HAND_TYPE_LABELS } from '../../models/BattleTypes';
```

- [ ] **Step 2: 玩家出牌后显示标签**

`executePlay` 中 `this.host.centerCardsOwner = 'player';` 之后插入：

```typescript
    this.cardDisplay.showPatternLabel(
      HAND_TYPE_LABELS[pattern.type],
      pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
    );
```

- [ ] **Step 3: AI 出牌显示标签（三处）**

`aiRespond` 两处 `this.host.centerCardsOwner = 'enemy';` 之后、`aiInitiatePlay` 一处 `this.host.centerCardsOwner = 'enemy';` 之后，各插入：

```typescript
    this.cardDisplay.showPatternLabel(
      HAND_TYPE_LABELS[pattern.type],
      pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
    );
```

- [ ] **Step 4: AI 思考节奏分级**

`aiRespond` 开头 `await waitForDelay(this.scene, 400);` 替换为：

```typescript
    await waitForDelay(this.scene, 300 + Math.random() * 300);
```

`aiRespond` 中 pass 分支：

```typescript
    if (!cards || cards.length === 0) {
      await waitForDelay(this.scene, 200 + Math.random() * 300);
      await this.executePass('enemy');
      return;
    }
```

`aiRespond` 中 `const pattern = identifyHand(cards)!;` 之后插入（炸弹前停顿制造紧张感）：

```typescript
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      await waitForDelay(this.scene, 500);
    }
```

`aiInitiatePlay` 开头 `await waitForDelay(this.scene, 400);` 替换为：

```typescript
    await waitForDelay(this.scene, 300 + Math.random() * 300);
```

`aiInitiatePlay` 中 `const pattern = identifyHand(cards)!;` 之后插入同样的炸弹停顿 500ms。

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 6: 提交**

```bash
git add src/scenes/managers/BattleFlowManager.ts
git commit -m "feat(battle): 出牌牌型标签接线 + AI 思考节奏分级（炸弹前停顿）"
```

---

### Task 8: 提示按钮（ButtonManager + BattleFlowManager.onHintClick）

**Files:**
- Modify: `src/scenes/managers/ButtonManager.ts`
- Modify: `src/scenes/managers/BattleFlowManager.ts`

- [ ] **Step 1: ButtonManager 新增「提示」按钮**

`ButtonHost` 接口新增：

```typescript
  btnHint: Phaser.GameObjects.Container;
  btnHintText: Phaser.GameObjects.Text;
```

构造函数新增第三个回调参数：

```typescript
  private onHintClick: () => void;

  constructor(
    host: ButtonHost & Phaser.Scene,
    onPlayClick: () => Promise<void>,
    onPassClick: () => Promise<void>,
    onHintClick: () => void,
  ) {
    this.host = host;
    this.scene = host;
    this.onPlayClick = onPlayClick;
    this.onPassClick = onPassClick;
    this.onHintClick = onHintClick;
  }
```

`createButtons` 中（出牌按钮创建之前）新增提示按钮，位置 `w / 2 - 480`：

```typescript
    this.host.btnHint = this.host.add.container(w / 2 - 480, btnY).setDepth(DEPTH_UI);
    const hintBg = this.host.add.graphics();
    hintBg.fillStyle(0xd8c8a0, 1);
    hintBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    hintBg.lineStyle(1.5, 0x8a6030, 0.85);
    hintBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.host.btnHint.add(hintBg);

    this.host.btnHintText = this.host.add.text(0, 0, '提  示', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.host.btnHint.add(this.host.btnHintText);

    const hintZone = this.host.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    hintZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.onHintClick();
    });
    this.host.btnHint.add(hintZone);
```

- [ ] **Step 2: GameScene 传入回调**

`create()` 中 ButtonManager 构造改为：

```typescript
    this.buttonManager = new ButtonManager(
      this,
      () => this.battleFlowManager.onPlayClick(),
      () => this.battleFlowManager.onPassClick(),
      () => this.battleFlowManager.onHintClick(),
    );
```

- [ ] **Step 3: BattleFlowManager 实现 onHintClick**

文件头部新增导入：

```typescript
import { findHintPlays } from '../../engine/findHintPlays';
```

类中新增公开方法：

```typescript
  /** 「提示」按钮：自动选中当前最优出法；重复点击在候选间循环 */
  onHintClick(): void {
    if (this.host.phase !== 'player_init' && this.host.phase !== 'player_respond') return;

    const hand = this.host.battle.player.hand;
    const lastPlay = this.host.phase === 'player_respond' ? this.host.battle.lastPlay : null;
    const blockedTypes = lastPlay
      ? getBlockedResponseTypes(this.host.battle.enemyCharacterId, lastPlay)
      : [];

    const candidates = findHintPlays(hand, lastPlay, (p) => {
      if (blockedTypes.includes(p.type)) return false;
      if (!lastPlay) return true;
      return canPlayerBeat(this.host.battle.player.characterId, p, lastPlay);
    });
    if (candidates.length === 0) return;

    const selectedUids = new Set(this.host.getSelectedCards().map(c => c.uid));
    const currentIdx = candidates.findIndex(c =>
      c.cards.length === selectedUids.size && c.cards.every(cc => selectedUids.has(cc.uid)),
    );
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % candidates.length : 0;
    const choice = candidates[nextIdx]!;

    this.host.selectedIndices.clear();
    for (const card of choice.cards) {
      const idx = hand.findIndex(h => h.uid === card.uid);
      if (idx >= 0) this.host.selectedIndices.add(idx);
    }

    this.cardDisplay.renderPlayerHand();
    this.host.updatePatternHint();
  }
```

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 5: 提交**

```bash
git add src/scenes/managers/ButtonManager.ts src/scenes/managers/BattleFlowManager.ts src/scenes/GameScene.ts
git commit -m "feat(battle): 提示按钮 — 自动选中最优出法，重复点击循环候选"
```

---

### Task 9: JuiceManager — 顿帧 / 分级震屏 / 受击闪白

**Files:**
- Create: `src/scenes/managers/JuiceManager.ts`
- Modify: `src/scenes/managers/DamageSettlementManager.ts`

- [ ] **Step 1: 新建 JuiceManager**

```typescript
import Phaser from 'phaser';
import { DEPTH_DAMAGE } from '../../constants/Layout';
import { waitForTween } from '../../utils/AnimationUtils';

/**
 * 打击感（Juice）三件套：
 * - hitstop：命中瞬间 tween 时间缩放骤降后恢复（真实停顿感，不死锁 async 流程）
 * - shakeForDamage：按伤害量/炸弹分级震屏
 * - flashVictimSide：受击方半屏闪白
 */
export class JuiceManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  hitstop(ms: number = 80): void {
    this.scene.tweens.timeScale = 0.15;
    this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.timeScale = 1;
    });
  }

  shakeForDamage(damage: number, isBomb: boolean): void {
    const cam = this.scene.cameras.main;
    if (isBomb || damage >= 100) {
      cam.shake(300, 0.012);
    } else if (damage >= 50) {
      cam.shake(200, 0.008);
    } else {
      cam.shake(120, 0.004);
    }
  }

  async flashVictimSide(target: 'enemy' | 'player'): Promise<void> {
    const { width, height } = this.scene.scale;
    const centerY = target === 'enemy' ? height / 4 : (height * 3) / 4;
    const flash = this.scene.add.rectangle(width / 2, centerY, width, height / 2, 0xffffff, 0.35)
      .setDepth(DEPTH_DAMAGE - 1);
    await waitForTween(this.scene, {
      targets: flash,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeOut',
    });
    flash.destroy();
  }
}
```


- [ ] **Step 2: DamageSettlementManager 集成**

1. 头部新增导入：

```typescript
import { HandType } from '../../models/BattleTypes';
import { JuiceManager } from './JuiceManager';
```

（`HandType` 若已从 BattleTypes 导入则合并）

2. 类中新增字段并在构造函数初始化：

```typescript
  private juice: JuiceManager;
```
```typescript
    this.juice = new JuiceManager(host);
```

3. `playDamageSettlement` 中 counterText 创建改为按牌型分级：

```typescript
    const isBombPattern = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    const counterText = this.host.add.text(centerX, centerY, '0', {
      fontSize: isBombPattern ? '108px' : '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: isBombPattern ? '#dd3300' : '#cc3333',
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#ff8800', 14, true, true);
```

4. `stage3ApplyDamage` 中 `counterText.destroy();` 之后，将：

```typescript
    const battleObj = target === 'enemy' ? this.host.battle.enemy : this.host.battle.player;
    const newVitality = Math.max(0, battleObj.vitality - damageInfo.finalDamage);
    await this.host.animateHealthBarDepletionAsync(target, newVitality, 300);
```

替换为：

```typescript
    const battleObj = target === 'enemy' ? this.host.battle.enemy : this.host.battle.player;
    const newVitality = Math.max(0, battleObj.vitality - damageInfo.finalDamage);

    const isBomb = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    this.juice.hitstop(80);
    this.juice.shakeForDamage(damageInfo.finalDamage, isBomb);
    await Promise.all([
      this.juice.flashVictimSide(target),
      this.host.animateHealthBarDepletionAsync(target, newVitality, 300),
    ]);
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 4: 提交**

```bash
git add src/scenes/managers/JuiceManager.ts src/scenes/managers/DamageSettlementManager.ts
git commit -m "feat(battle): JuiceManager — 顿帧/分级震屏/受击闪白 + 炸弹伤害数字强化"
```

---

### Task 10: CharacterBarManager — 对话气泡屏幕钳制

**Files:**
- Modify: `src/scenes/managers/CharacterBarManager.ts`

- [ ] **Step 1: 导入钳制函数**

头部新增：

```typescript
import { clampBubbleCenterX, clampBubbleTailX } from '../../utils/bubbleLayout';
```

- [ ] **Step 2: 重写 showDialog 的定位逻辑**

`showDialog` 中，先创建 textObj 测量（在 container 之前），再钳制定位。将现有实现从 `const container = h.add.container(anchorX, anchorY)...` 起到 tail 绘制部分，替换为以下逻辑（文字创建提前，tail 使用 tailX）：

```typescript
  showDialog(characterId: string, text: string): void {
    if (!text) return;

    const h = this.host;
    const lines = this.wrapDialogText(text, 15);
    const fontSize = 22;
    const padX = 16;
    const padY = 12;

    let anchorX: number;
    let anchorY: number;
    const tailDir: 'up' | 'down' = h.playerCharacterIds.includes(characterId as PlayerCharacterId) ? 'down' : 'up';

    if (tailDir === 'down') {
      const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
      if (idx < 0 || idx >= h.characterSlotContainers.length) return;
      const slot = h.characterSlotContainers[idx]!;
      const barX = h.characterBarContainer ? h.characterBarContainer.x : 0;
      const barY = h.characterBarContainer ? h.characterBarContainer.y : 0;
      anchorX = slot.x + barX;
      anchorY = slot.y + barY - 140;
    } else {
      anchorX = 54;
      anchorY = 160;
    }

    const textObj = h.add.text(0, 0, lines.join('\n'), {
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

    const { width: screenW, height: screenH } = h.scale;
    const centerX = clampBubbleCenterX(anchorX, boxW, screenW, 16);
    const tailX = clampBubbleTailX(anchorX - centerX, boxW);
    const topY = Phaser.Math.Clamp(anchorY, 8, screenH - totalH - 8);

    const container = h.add.container(centerX, topY).setDepth(DEPTH_DAMAGE - 5).setAlpha(0);

    const tailSize = 8;
    const graphicsTop = tailDir === 'down' ? 0 : tailSize;
    const textY = tailDir === 'down' ? padY + 5 : padY + tailSize + 5;

    const gfx = h.add.graphics();
    gfx.fillStyle(0xfffdf5, 0.95);
    gfx.fillRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.fillTriangle(tailX - tailSize, boxH, tailX + tailSize, boxH, tailX, totalH);
    } else {
      gfx.fillTriangle(tailX - tailSize, tailSize, tailX + tailSize, tailSize, tailX, 0);
    }
    gfx.lineStyle(2, 0x6a4a2a, 0.7);
    gfx.strokeRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.lineBetween(tailX - tailSize, boxH, tailX, totalH);
      gfx.lineBetween(tailX + tailSize, boxH, tailX, totalH);
    } else {
      gfx.lineBetween(tailX - tailSize, tailSize, tailX, 0);
      gfx.lineBetween(tailX + tailSize, tailSize, tailX, 0);
    }
    container.add(gfx);

    textObj.setY(textY);
    container.add(textObj);

    h.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        h.time.delayedCall(2200, () => {
          h.tweens.add({
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
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 4: 提交**

```bash
git add src/scenes/managers/CharacterBarManager.ts
git commit -m "fix(battle): 对话气泡屏幕边缘钳制，尾巴跟随角色实际位置"
```

---

### Task 11: 手牌溢出滑动的渐隐提示

**Files:**
- Modify: `src/scenes/managers/CardDisplayManager.ts`

- [ ] **Step 1: 新增渐隐边缘与箭头提示**

`CardDisplayManager` 新增字段：

```typescript
  private handFadeLeft: Phaser.GameObjects.Graphics | null = null;
  private handFadeRight: Phaser.GameObjects.Graphics | null = null;
```

新增方法：

```typescript
  /** 溢出滑动模式下显示两端渐隐提示；非溢出时隐藏 */
  updateHandOverflowHints(): void {
    const { width, height } = this.host.scale;
    const scrollable = this.isHandScrollable();

    if (!this.handFadeLeft) {
      this.handFadeLeft = this.host.add.graphics().setDepth(DEPTH_PLAYER_HAND + 500);
      this.handFadeLeft.fillGradientStyle(0x1a0f08, 0x1a0f08, 0x1a0f08, 0x1a0f08, 0.85, 0, 0.85, 0);
      this.handFadeLeft.fillRect(0, height - 260, 90, 260);
      this.handFadeRight = this.host.add.graphics().setDepth(DEPTH_PLAYER_HAND + 500);
      this.handFadeRight.fillGradientStyle(0x1a0f08, 0x1a0f08, 0x1a0f08, 0x1a0f08, 0, 0.85, 0, 0.85);
      this.handFadeRight.fillRect(width - 90, height - 260, 90, 260);
    }

    const minScroll = (width - HAND_AREA_MARGIN * 2) -
      calcHandLayout(this.host.battle.player.hand.length, width - HAND_AREA_MARGIN * 2, CARD_OVERLAP_OFFSET, CARD_W).totalWidth;
    const showLeft = scrollable && this.host.handScrollX < -1;
    const showRight = scrollable && this.host.handScrollX > minScroll + 1;
    this.handFadeLeft!.setVisible(showLeft);
    this.handFadeRight!.setVisible(showRight);
  }
```

在 `renderPlayerHand` 末尾与 `scrollHandBy` 末尾各调用一次：

```typescript
    this.updateHandOverflowHints();
```

- [ ] **Step 2: 类型检查 + 全量测试**

Run: `npm run build && npm run test`
Expected: 编译无错误；测试全绿

- [ ] **Step 3: 提交**

```bash
git add src/scenes/managers/CardDisplayManager.ts
git commit -m "feat(battle): 手牌溢出滑动两端渐隐提示"
```

---

### Task 12: 全量验证

- [ ] **Step 1: 全量单测**

Run: `npm run test`
Expected: 全部通过

- [ ] **Step 2: 类型检查 + 构建**

Run: `npm run build`
Expected: 无类型错误，构建成功

- [ ] **Step 3: 手动验证清单（npm run dev）**

对照规格逐项验证：

- [ ] 玩家回合显示大字横幅 + 我方信息栏金框呼吸；AI 回合显示思考呼吸灯 + 敌方金框
- [ ] 双方出牌后中央区上方显示牌型标签，下次出牌时替换；炸弹标签为火焰色
- [ ] AI 出炸弹前有明显停顿
- [ ] 伤害命中时有顿帧 + 震屏（小/中/大分级）+ 受击半屏闪白；炸弹伤害数字更大更红
- [ ] 点按可选/取消选牌；拖拽框选不受影响；提示按钮选中正确牌且重复点击循环候选
- [ ] 17 张手牌压缩显示在屏内；（测试模式构造 50+ 张）横向滑动可见全部牌，两端渐隐按滚动位置出现/消失
- [ ] 边缘角色说话时气泡完整、尾巴指向角色
- [ ] 场景重启（再来一局）后无残留状态（横幅/标签/滑动位置/金框均重置）

---

## Self-Review 记录

- Spec 覆盖：回合反馈（Task 6）✅、AI 出牌明朗化（Task 7 标签 + 节奏）✅、打击感（Task 9）✅、点按选牌（现状已存在 + Task 5 手势分流）✅、提示按钮（Task 3 + 8）✅、手牌三级策略（Task 1 + 4 + 5 + 11）✅、气泡钳制（Task 2 + 10）✅
- 类型一致性：`getHandLayout()`/`scrollHandBy()`/`isHandScrollable()`/`applyHandPositions()` 在 Task 4 定义、Task 5 使用；`btnHint`/`btnHintText` 在 Task 6 Step 2.6 声明、Task 8 创建；`showPatternLabel(label, isBomb)` Task 4 定义、Task 7 调用，签名一致
- 已知取舍：点按选牌为既有功能，本计划不重复实现；行动方高亮落在我方信息栏而非单个角色 slot（回合归属是玩家整体，非单个角色）
