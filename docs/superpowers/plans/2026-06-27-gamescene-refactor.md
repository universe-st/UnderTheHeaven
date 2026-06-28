# GameScene 重构拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GameScene.ts 从 4416 行拆分为 4 个独立的 Manager 类，降至 ~2000 行，每个 Manager 遵循现有 DragInputManager/HealthBarManager 的 Host 接口模式。

**Architecture:** 每个新 Manager 通过一个 `Host` 接口访问 GameScene 的字段和方法，避免循环依赖。所有异步动画方法统一为 Promise 版本，删除 callback 版本。提取过程中保持所有现有功能不变——每个 Task 的末尾都验证 `npm run build` 通过。

**Tech Stack:** TypeScript + Phaser 4，遵循 AGENTS.md 中的 `Host` 接口模式

**现状——提取顺序和预计行数缩减：**

| Task | Manager | 新增文件 | 从 GameScene 移除行数 |
|------|---------|---------|---------------------|
| 1 | DamageSettlementManager | `src/scenes/managers/DamageSettlementManager.ts` | ~340 |
| 2 | ModalManager | `src/scenes/managers/ModalManager.ts` | ~558 |
| 3 | CardDisplayManager | `src/scenes/managers/CardDisplayManager.ts` | ~586 |
| 4 | BattleFlowManager | `src/scenes/managers/BattleFlowManager.ts` | ~598 |

---

### Task 1: DamageSettlementManager

**Files:**
- Create: `src/scenes/managers/DamageSettlementManager.ts`
- Modify: `src/scenes/GameScene.ts`（移除 ~340 行，新增 ~20 行委托代码）

**涵盖方法：** `playDamageSettlement`, `stage1RevealCards`, `stage2ShowCoefficient`, `stage3ApplyDamage`, `applyPostDamageEffects`（stub 保留）

- [ ] **Step 1: 创建 DamageSettlementManager.ts 并实现 Host 接口**

在 `src/scenes/managers/DamageSettlementManager.ts` 中写入：

```typescript
import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { waitForDelay, waitForTween, waitForCounterTween } from '../../utils/AnimationUtils';
import { FONT_FAMILY, CARD_W, DEPTH_DAMAGE } from '../../constants/Layout';
import type { SkillContext } from '../../skills';
import { SkillTiming } from '../../skills';

interface DamageSettlementHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly time: Phaser.Time.Clock;
  battle: BattleState;
  phase: string;
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  damageSettlementCancelled: boolean;
  playerCharacterIds: string[];
  revealedEnemyCards: Set<Card>;
  skillEventBus: { emit(timing: SkillTiming, ctx: SkillContext): Promise<void> };
  animateHealthBarDepletionAsync(target: 'enemy' | 'player', newVitality: number, duration: number): Promise<void>;
  showGameOver(playerWin: boolean): void;
  clearCenterCards(): void;
  fadeOutCenterCardsAsync(): Promise<void>;
  updateVitalityBars(): void;
}

export class DamageSettlementManager {
  private host: DamageSettlementHost;

  constructor(host: DamageSettlementHost) {
    this.host = host;
  }

  // …… 以下为 playDamageSettlement, stage1RevealCards, stage2ShowCoefficient, stage3ApplyDamage, applyPostDamageEffects
  // 从 GameScene 完整复制，将 `this.xxx` 替换为 `this.host.xxx`
}
```

然后依次将 `playDamageSettlement`, `stage1RevealCards`, `stage2ShowCoefficient`, `stage3ApplyDamage`, `applyPostDamageEffects` 五个方法从 GameScene 完整复制到 DamageSettlementManager 类中，将所有 `this.xxx` 调用改为 `this.host.xxx`。

关键映射：
- `this.scale` → `this.host.scale`
- `this.add.text` → `this.host.add.text`
- `this.tweens.add` → `this.host.tweens.add`
- `this.time.delayedCall` → `this.host.time.delayedCall`
- `this.battle` → `this.host.battle`
- `this.phase` → `this.host.phase`
- `this.centerCards` → `this.host.centerCards`
- `this.centerCardsOwner` → `this.host.centerCardsOwner`
- `this.centerDepthCounter` → `this.host.centerDepthCounter`
- `this.damageSettlementCancelled` → `this.host.damageSettlementCancelled`
- `this.playerCharacterIds` → `this.host.playerCharacterIds`
- `this.revealedEnemyCards` → `this.host.revealedEnemyCards`
- `this.skillEventBus.emit(...)` → `this.host.skillEventBus.emit(...)`
- `this.animateHealthBarDepletionAsync(...)` → `this.host.animateHealthBarDepletionAsync(...)`
- `this.showGameOver(...)` → `this.host.showGameOver(...)`
- `this.clearCenterCards()` → `this.host.clearCenterCards()`
- `this.fadeOutCenterCardsAsync()` → `this.host.fadeOutCenterCardsAsync()`
- `this.updateVitalityBars()` → `this.host.updateVitalityBars()`

- [ ] **Step 2: 运行构建验证新文件无类型错误**

```bash
npm run build
```

（TypeScript 严格模式需要完整项目上下文，不能用单文件检查）

- [ ] **Step 3: 修改 GameScene.ts —— 添加导入和字段，委托给 Manager**

在 GameScene.ts 的 import 区域添加：
```typescript
import { DamageSettlementManager } from './managers/DamageSettlementManager';
```

在字段声明区域（`private healthBarManager` 之后）添加：
```typescript
private damageSettlementManager!: DamageSettlementManager;
```

在 `create()` 方法中（`this.healthBarManager = new HealthBarManager(this)` 之后）添加：
```typescript
this.damageSettlementManager = new DamageSettlementManager(this);
```

将 `resetSceneState()` 中 `this.damageSettlementCancelled = false;` 保留不动。

- [ ] **Step 4: 将 GameScene 中的五个方法改为委托调用**

将 `playDamageSettlement` 方法体替换为：
```typescript
private async playDamageSettlement(
  pattern: HandPattern,
  target: 'enemy' | 'player',
  isEmptyHand: boolean,
): Promise<void> {
  await this.damageSettlementManager.playDamageSettlement(pattern, target, isEmptyHand);
}
```

将 `stage1RevealCards`, `stage2ShowCoefficient`, `stage3ApplyDamage`, `applyPostDamageEffects` 四个方法从 GameScene 中完全删除。

- [ ] **Step 5: 运行构建验证**

```bash
npm run build
```

预期：编译通过，无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/scenes/managers/DamageSettlementManager.ts src/scenes/GameScene.ts
git commit -m "refactor: extract DamageSettlementManager from GameScene"
```

---

### Task 2: ModalManager

**Files:**
- Create: `src/scenes/managers/ModalManager.ts`
- Modify: `src/scenes/GameScene.ts`（移除 ~558 行，新增 ~60 行委托代码）

**涵盖方法：**
- `createSettingsButton`, `showSettingsPanel`, `closeSettingsPanel`
- `showVolumeSettings`, `createVolumeSlider`, `closeVolumeSettings`
- `showReturnConfirmModal`, `closeReturnConfirmModal`
- `createHandPatternButton`, `showHandPatternModal`, `closeHandPatternModal`

- [ ] **Step 1: 创建 ModalManager.ts 并实现 Host 接口和所有方法**

在 `src/scenes/managers/ModalManager.ts` 中：

```typescript
import Phaser from 'phaser';
import { HAND_TYPE_LABELS, type HandPattern } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { loadAudioSettings, saveAudioSettings } from '../../AudioSettings';
import { FONT_FAMILY, DEPTH_UI, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT } from '../../constants/Layout';

interface ModalHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly input: Phaser.Input.InputPlugin;
  readonly cameras: Phaser.Cameras.Scene2D.CameraManager;
  readonly scene: Phaser.Scene;
  settingsButton: Phaser.GameObjects.Container;
  handPatternButton: Phaser.GameObjects.Container;
  settingsPanel: Phaser.GameObjects.Container | null;
  volumeSettingsModal: Phaser.GameObjects.Container | null;
  returnConfirmModal: Phaser.GameObjects.Container | null;
  handPatternModal: Phaser.GameObjects.Container | null;
}

export class ModalManager {
  private host: ModalHost;

  constructor(host: ModalHost) {
    this.host = host;
  }

  // …… 完整复制所有 modal 方法
}
```

**Host 接口关键点：** `settingsButton`, `settingsPanel`, `volumeSettingsModal`, `returnConfirmModal`, `handPatternButton`, `handPatternModal` 这些字段在 GameScene 上通过 `!` 断言声明，需要以读写方式被 ModalManager 访问。Java/TS 中接口字段默认是只读的，需要去掉 `readonly`。

复制以下方法并做 `this.xxx` → `this.host.xxx` 替换：
- `createSettingsButton(w: number, _h: number): void` （注意：方法内部创建齿轮图形和交互 zone）
- `showSettingsPanel(): void`
- `closeSettingsPanel(): void`
- `showVolumeSettings(): void`
- `createVolumeSlider(...): void`
- `closeVolumeSettings(): void`
- `showReturnConfirmModal(): void`
- `closeReturnConfirmModal(): void`
- `createHandPatternButton(w: number, _h: number): void`（注意：依赖 `getCoefficient` 和 `HAND_TYPE_LABELS`）
- `showHandPatternModal(): void`
- `closeHandPatternModal(): void`

关键 `this` → `this.host` 映射：
- `this.scale` → `this.host.scale`
- `this.add.*` → `this.host.add.*`
- `this.tweens.add` → `this.host.tweens.add`
- `this.input.on` → `this.host.input.on`
- `this.cameras.main` → `this.host.cameras.main`
- `this.settingsButton` → `this.host.settingsButton`
- `this.settingsPanel` → `this.host.settingsPanel`
- `this.volumeSettingsModal` → `this.host.volumeSettingsModal`
- `this.returnConfirmModal` → `this.host.returnConfirmModal`
- `this.handPatternButton` → `this.host.handPatternButton`
- `this.handPatternModal` → `this.host.handPatternModal`

对于 `this.scene.start(...)` 调用（在 `showReturnConfirmModal` 的确认回调中），替换为 `this.host.scene.start(...)`。

**注意：** `createVolumeSlider` 中的 `this.input.on('pointerup', ...)` 需要用全局 `this.host.input.on` 替代。

- [ ] **Step 2: 运行构建验证**

```bash
npm run build
```

- [ ] **Step 3: 修改 GameScene.ts**

添加导入：
```typescript
import { ModalManager } from './managers/ModalManager';
```

添加字段：
```typescript
private modalManager!: ModalManager;
```

在 `create()` 中添加初始化（在 `this.healthBarManager` 初始化之后）：
```typescript
this.modalManager = new ModalManager(this);
```

将 `createSettingsButton` 方法体替换为委托：
```typescript
private createSettingsButton(w: number, _h: number): void {
  this.modalManager.createSettingsButton(w, _h);
}
```

将 `createHandPatternButton` 方法体替换为委托：
```typescript
private createHandPatternButton(w: number, _h: number): void {
  this.modalManager.createHandPatternButton(w, _h);
}
```

删除以下方法：`showSettingsPanel`, `closeSettingsPanel`, `showVolumeSettings`, `createVolumeSlider`, `closeVolumeSettings`, `showReturnConfirmModal`, `closeReturnConfirmModal`, `showHandPatternModal`, `closeHandPatternModal`。

**注意：** GameScene 中 `settingsButton!`、`handPatternButton!`、`settingsPanel`、`volumeSettingsModal`、`returnConfirmModal`、`handPatternModal` 字段声明 **保留不动** —— ModalManager 通过 Host 接口读写它们。

在 `resetSceneState()` 中，销毁 modal 容器的代码 **保留不动**：
```typescript
this.settingsPanel?.destroy();
this.settingsPanel = null;
this.volumeSettingsModal?.destroy();
this.volumeSettingsModal = null;
this.returnConfirmModal?.destroy();
this.returnConfirmModal = null;
this.handPatternModal?.destroy();
this.handPatternModal = null;
```

- [ ] **Step 4: 运行构建验证**

```bash
npm run build
```

预期：编译通过，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/scenes/managers/ModalManager.ts src/scenes/GameScene.ts
git commit -m "refactor: extract ModalManager from GameScene"
```

---

### Task 3: CardDisplayManager

**Files:**
- Create: `src/scenes/managers/CardDisplayManager.ts`
- Modify: `src/scenes/GameScene.ts`（移除 ~586 行，新增 ~30 行委托代码）

**涵盖方法：**
- `createCardDisplay`, `updateCardShadowGlow`, `createCardInteractive`
- `renderAllCards`, `renderPlayerHand`, `renderEnemyHand`
- `getRevealedEnemyCardIndices`, `getCardFanPositions`
- `animateCardsToPositions`, `clearCenterCards`, `fadeOutCenterCards`, `animateShiftAndReplace`, `createEnemyDisplayCards`
- 所有异步变体：`animateCardsToPositionsAsync`, `fadeOutCenterCardsAsync`, `animateShiftAndReplaceAsync`, `renderEnemyHandAsync`

- [ ] **Step 1: 创建 CardDisplayManager.ts 并实现 Host 接口**

在 `src/scenes/managers/CardDisplayManager.ts` 中：

```typescript
import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { sortPlayedCards } from '../../models/Card';
import { FONT_FAMILY, CARD_W, CARD_H, SELECTED_OFFSET, DEPTH_PLAYER_HAND, DEPTH_ENEMY_HAND, DEPTH_CENTER_BASE } from '../../constants/Layout';
import { waitForTween } from '../../utils/AnimationUtils';

interface CardDisplayHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly time: Phaser.Time.Clock;
  battle: { player: { hand: Card[] }; enemy: { hand: Card[] } };
  cardObjects: Phaser.GameObjects.Container[];
  enemyCardObjects: Phaser.GameObjects.Container[];
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  selectedIndices: Set<number>;
  revealedEnemyCards: Set<Card>;
}

export class CardDisplayManager {
  private host: CardDisplayHost;

  constructor(host: CardDisplayHost) {
    this.host = host;
  }

  // …… 完整复制所有 card 方法
}
```

**关键问题：`sortPlayedCards` 函数**

`sortPlayedCards` 目前在 GameScene.ts 顶部（第 38-63 行）定义为 top-level function，不在 class 内。它也被 `createEnemyDisplayCards` 使用。方案：
- 将其移到 `src/models/Card.ts` 作为导出函数（更合适——它操作 Card 类型）
- 或保留在 GameScene.ts 中并 `export` 它，让 CardDisplayManager import

选择方案 A（移到 Card.ts），更干净。

- [ ] **Step 2: 将 sortPlayedCards 移到 src/models/Card.ts**

在 `src/models/Card.ts` 末尾添加：

```typescript
export function sortPlayedCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const aIsJoker = a.rank >= 25;
    const bIsJoker = b.rank >= 25;
    if (aIsJoker && !bIsJoker) return -1;
    if (!aIsJoker && bIsJoker) return 1;
    if (a.suit && b.suit) {
      const suitOrder = ['diamond', 'club', 'heart', 'spade'];
      const aIdx = suitOrder.indexOf(a.suit);
      const bIdx = suitOrder.indexOf(b.suit);
      if (aIdx !== bIdx) return aIdx - bIdx;
    }
    if (a.suit && !b.suit) return 1;
    if (!a.suit && b.suit) return -1;
    return b.rank - a.rank;
  });
}
```

在 GameScene.ts 中将原 `sortPlayedCards` 函数替换为从 Card.ts 导入：

```typescript
import { createDeck, shuffleDeck, cardDisplayName, sortHand, resetCardIdCounter, sortPlayedCards } from '../models/Card';
```

删除 GameScene.ts 中第 38-63 行的函数定义。

- [ ] **Step 3: 将 card 方法复制到 CardDisplayManager**

将以下方法完整复制并做 `this.xxx` → `this.host.xxx` 映射：

```typescript
createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container
updateCardShadowGlow(container: Phaser.GameObjects.Container, isGlow: boolean): void
createCardInteractive(card: Card, x: number, y: number, index: number, isSelected: boolean = false): Phaser.GameObjects.Container
renderAllCards(): void
renderPlayerHand(animateEntry: boolean = false): void
renderEnemyHand(animateEntry: boolean = false, baseDelay: number = 700, onComplete?: () => void): void
getRevealedEnemyCardIndices(): Set<number>
getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }>
animateCardsToPositions(cards: Phaser.GameObjects.Container[], positions: Array<{ x: number; y: number }>, duration: number, onComplete?: () => void): void
clearCenterCards(): void
fadeOutCenterCards(onComplete: () => void): void
animateShiftAndReplace(oldCards: Phaser.GameObjects.Container[], newCards: Phaser.GameObjects.Container[], duration: number, onComplete: () => void): void
createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[]
animateCardsToPositionsAsync(cards: Phaser.GameObjects.Container[], positions: Array<{ x: number; y: number }>, duration: number): Promise<void>
fadeOutCenterCardsAsync(): Promise<void>
animateShiftAndReplaceAsync(oldCards: Phaser.GameObjects.Container[], newCards: Phaser.GameObjects.Container[], duration: number): Promise<void>
renderEnemyHandAsync(baseDelay: number = 300): Promise<void>
```

关键 `this` → `this.host` 映射：
- `this.scale` → `this.host.scale`
- `this.add.*` → `this.host.add.*`
- `this.tweens.add` → `this.host.tweens.add`
- `this.time.delayedCall` → `this.host.time.delayedCall`
- `this.battle.player.hand` → `this.host.battle.player.hand`
- `this.battle.enemy.hand` → `this.host.battle.enemy.hand`
- `this.cardObjects` → `this.host.cardObjects`
- `this.enemyCardObjects` → `this.host.enemyCardObjects`
- `this.centerCards` → `this.host.centerCards`
- `this.centerCardsOwner` → `this.host.centerCardsOwner`
- `this.centerDepthCounter` → `this.host.centerDepthCounter`
- `this.selectedIndices` → `this.host.selectedIndices`
- `this.revealedEnemyCards` → `this.host.revealedEnemyCards`

- [ ] **Step 4: 在 GameScene 中委托给 CardDisplayManager**

添加导入：
```typescript
import { CardDisplayManager } from './managers/CardDisplayManager';
```

添加字段：
```typescript
private cardDisplayManager!: CardDisplayManager;
```

在 `create()` 中初始化：
```typescript
this.cardDisplayManager = new CardDisplayManager(this);
```

将以下公共方法改为委托：
- `createCardDisplay` → 保留（其他场景不需要，但为了一致性可以委托）
- `renderPlayerHand` → 保留公开，改为委托

实际保留在 GameScene 简化为委托的方法：
- `createCardDisplay` → delegate
- `createCardInteractive` → delegate
- `renderAllCards` → delegate
- `renderPlayerHand` → delegate
- `renderEnemyHand` → delegate
- `getRevealedEnemyCardIndices` → delegate
- `getCardFanPositions` → delegate
- `animateCardsToPositions` → delegate
- `clearCenterCards` → delegate
- `fadeOutCenterCards` → delegate
- `animateShiftAndReplace` → delegate
- `createEnemyDisplayCards` → delegate
- 所有 async 变体 → delegate

**注意：** `updateCardShadowGlow` 同时在 GameScene（`onCardClick`）和 executePlay 中使用。保留委托。

删除所有上述方法的具体实现（仅在 GameScene 中保留委托桩）。

- [ ] **Step 5: 运行构建验证**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/scenes/managers/CardDisplayManager.ts src/scenes/GameScene.ts src/models/Card.ts
git commit -m "refactor: extract CardDisplayManager; move sortPlayedCards to Card model"
```

---

### Task 4: BattleFlowManager

**Files:**
- Create: `src/scenes/managers/BattleFlowManager.ts`
- Modify: `src/scenes/GameScene.ts`（移除 ~598 行，新增 ~40 行委托代码）

**涵盖方法：**
- `executePlay`, `handlePostPlayEmptyHandCheck`
- `executePass`, `showPassAnimation`
- `refillPlayerHand`, `refillEnemyHand`, `refillIfEmpty`
- `aiRespond`, `aiInitiatePlay`
- `onPlayClick`, `onPassClick`
- `findCardIndices`

- [ ] **Step 1: 创建 BattleFlowManager.ts 并实现 Host 接口**

在 `src/scenes/managers/BattleFlowManager.ts` 中：

```typescript
import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { sortHand, sortPlayedCards } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { identifyHand, canBeat, canBeatOrEqual } from '../../engine/HandRecognizer';
import { calculateDamage, calculateDamageWithEmptyHand } from '../../engine/DamageCalculator';
import { decidePlay } from '../../engine/AIBrain';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { VoiceManager, getVoiceKeyForPlay, getRandomPassVoice } from '../../utils/VoiceManager';
import { waitForDelay, waitForTween } from '../../utils/AnimationUtils';
import { PLAYER_CHARACTERS, type PlayerCharacterId, type EnemyCharacterId } from '../../models/Character';
import { SkillEventBus, SkillRegistry, SkillRunner, SkillVisualManagerImpl, ALL_SKILL_DEFINITIONS, SkillTiming, LiuBoWenChouCe, type SkillContext, type CharacterSlotManager } from '../../skills';
import { getBlockedResponseTypes, clearPassiveSkills } from '../../skills/PassiveSkillUtils';
import { FONT_FAMILY, CARD_W, DEPTH_UI, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT, DEPTH_CENTER_BASE } from '../../constants/Layout';

interface BattleFlowHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly time: Phaser.Time.Clock;
  readonly cameras: Phaser.Cameras.Scene2D.CameraManager;
  readonly scene: Phaser.Scene;
  battle: BattleState;
  phase: string;
  selectedIndices: Set<number>;
  cardObjects: Phaser.GameObjects.Container[];
  enemyCardObjects: Phaser.GameObjects.Container[];
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  damageSettlementCancelled: boolean;
  respondChainDepth: number;
  revealedEnemyCards: Set<Card>;
  playerCharacterIds: PlayerCharacterId[];
  skillEventBus: SkillEventBus;
  skillRunner: SkillRunner;
  skillRegistry: SkillRegistry;
  currentActiveSkillId: string | null;
  activeSkills: Array<{ id: string; name: string; maxUses: number; cardFilter(cards: Card[]): boolean; execute(scene: Phaser.Scene, cards: Card[]): Promise<void> }>;
  activeSkillUseCounts: Map<string, number>;
  activeSkillEligibleIds: string[];
  btnPlay: Phaser.GameObjects.Container;
  btnPass: Phaser.GameObjects.Container;
  btnSkill: Phaser.GameObjects.Container | null;
  btnSkillText: Phaser.GameObjects.Text | null;
  skillDropdown: Phaser.GameObjects.Container | null;
  enemyDeckText: Phaser.GameObjects.Text;
  playerDeckText: Phaser.GameObjects.Text;
  turnIndicatorText: Phaser.GameObjects.Text;
  thinkingText: Phaser.GameObjects.Text;
  patternHintText: Phaser.GameObjects.Text;
  playerVitalityBar: Phaser.GameObjects.Graphics;
  enemyVitalityBar: Phaser.GameObjects.Graphics;
  playerVitalityText: Phaser.GameObjects.Text;
  enemyVitalityText: Phaser.GameObjects.Text;
  // 委托给其他 Manager 的方法
  renderPlayerHand(animateEntry?: boolean): void;
  renderEnemyHand(animateEntry?: boolean, baseDelay?: number, onComplete?: () => void): void;
  renderEnemyHandAsync(baseDelay?: number): Promise<void>;
  renderPlayerHandAfterSkill(): void;
  getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }>;
  animateCardsToPositionsAsync(cards: Phaser.GameObjects.Container[], positions: Array<{ x: number; y: number }>, duration: number): Promise<void>;
  clearCenterCards(): void;
  fadeOutCenterCardsAsync(): Promise<void>;
  animateShiftAndReplaceAsync(oldCards: Phaser.GameObjects.Container[], newCards: Phaser.GameObjects.Container[], duration: number): Promise<void>;
  createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[];
  getSelectedCards(): Card[];
  updatePatternHint(): void;
  updateUIForPhase(): void;
  updateVitalityBars(): void;
  updateActiveSkillButton(): void;
  updateTurnIndicator(who: 'player' | 'enemy'): void;
  showGameOver(playerWin: boolean): void;
  playDamageSettlement(pattern: HandPattern, target: 'enemy' | 'player', isEmptyHand: boolean): Promise<void>;
  animateHealthBarDepletionAsync(target: 'enemy' | 'player', newVitality: number, duration: number): Promise<void>;
  refillPlayerHand(): void;
  refillEnemyHand(): void;
  initActiveSkills(): void;
  getBattle(): BattleState;
  // 技能相关
  glowOn(charId: string): Promise<void>;
  glowOff(charId: string): Promise<void>;
  moveToFront(charId: string): Promise<void>;
  shakeAndPulse(charId: string): Promise<void>;
  showDialog(charId: string, text: string): void;
  restoreSlot(charId: string): Promise<void>;
}

export class BattleFlowManager {
  private host: BattleFlowHost;

  constructor(host: BattleFlowHost) {
    this.host = host;
  }

  // …… 完整复制所有 battle flow 方法
}
```

**注意：** BattleFlowHost 是目前最大的 Host 接口，因为 `executePlay`/`aiRespond` 等方法是 GameScene 的核心编排逻辑，需要访问几乎所有其他子系统。

- [ ] **Step 2: 将 battle flow 方法复制到 BattleFlowManager**

复制以下方法并做 `this.xxx` → `this.host.xxx` 映射：
- `executePlay` (lines 2045-2210)
- `handlePostPlayEmptyHandCheck` (lines 2212-2235)
- `executePass` (lines 2237-2297)
- `showPassAnimation` (lines 2299-2328)
- `refillPlayerHand` (lines 2330-2346)
- `refillEnemyHand` (lines 2348-2364)
- `refillIfEmpty` (lines 2370-2382)
- `aiRespond` (lines 2384-2504)
- `aiInitiatePlay` (lines 2506-2624)
- `findCardIndices` (lines 2626-2639)
- `onPlayClick` (lines 1984-2033)
- `onPassClick` (lines 2035-2039)

关键 `this` → `this.host` 映射（除之前 Task 中列出的以外）：
- `this.renderPlayerHand(...)` → `this.host.renderPlayerHand(...)`
- `this.renderEnemyHand(...)` → `this.host.renderEnemyHand(...)`
- `this.renderEnemyHandAsync(...)` → `this.host.renderEnemyHandAsync(...)`
- `this.renderPlayerHandAfterSkill()` → `this.host.renderPlayerHandAfterSkill()`
- `this.getCardFanPositions(...)` → `this.host.getCardFanPositions(...)`
- `this.animateCardsToPositionsAsync(...)` → `this.host.animateCardsToPositionsAsync(...)`
- `this.clearCenterCards()` → `this.host.clearCenterCards()`
- `this.fadeOutCenterCardsAsync()` → `this.host.fadeOutCenterCardsAsync()`
- `this.animateShiftAndReplaceAsync(...)` → `this.host.animateShiftAndReplaceAsync(...)`
- `this.createEnemyDisplayCards(...)` → `this.host.createEnemyDisplayCards(...)`
- `this.getSelectedCards()` → `this.host.getSelectedCards()`
- `this.updatePatternHint()` → `this.host.updatePatternHint()`
- `this.updateUIForPhase()` → `this.host.updateUIForPhase()`
- `this.updateVitalityBars()` → `this.host.updateVitalityBars()`
- `this.updateActiveSkillButton()` → `this.host.updateActiveSkillButton()`
- `this.updateTurnIndicator(...)` → `this.host.updateTurnIndicator(...)`
- `this.showGameOver(...)` → `this.host.showGameOver(...)`
- `this.playDamageSettlement(...)` → `this.host.playDamageSettlement(...)`
- `this.animateHealthBarDepletionAsync(...)` → `this.host.animateHealthBarDepletionAsync(...)`
- `this.refillPlayerHand()` → `this.host.refillPlayerHand()`
- `this.refillEnemyHand()` → `this.host.refillEnemyHand()`
- `this.initActiveSkills()` → `this.host.initActiveSkills()`
- `this.getBattle()` → `this.host.getBattle()`

- [ ] **Step 3: 修改 GameScene.ts —— 添加 BattleFlowManager 委托**

添加导入：
```typescript
import { BattleFlowManager } from './managers/BattleFlowManager';
```

添加字段：
```typescript
private battleFlowManager!: BattleFlowManager;
```

在 `create()` 中初始化（在 healthBarManager 之后）：
```typescript
this.battleFlowManager = new BattleFlowManager(this);
```

将以下方法替换为委托桩：
- `executePlay` → delegate
- `handlePostPlayEmptyHandCheck` → delegate
- `executePass` → delegate
- `showPassAnimation` → delegate
- `refillPlayerHand` → delegate
- `refillEnemyHand` → delegate
- `refillIfEmpty` → delegate
- `aiRespond` → delegate
- `aiInitiatePlay` → delegate
- `findCardIndices` → delegate
- `onPlayClick` → delegate
- `onPassClick` → delegate

删除所有上述方法的完整实现。

**注意：** `refillPlayerHand` 和 `refillEnemyHand` 可能被技能系统直接调用（作为 GameScene 的公共方法）——确保委托桩保留相同的 public 签名。

- [ ] **Step 4: 运行构建验证**

```bash
npm run build
```

预期：编译通过。如有类型错误，修正 Host 接口中的缺失字段。

- [ ] **Step 5: 验证游戏可玩性（手动测试）**

```bash
npm run dev
```

在浏览器中验证：
1. 主菜单 → 战斗场景加载正常
2. 选牌、出牌、过牌功能正常
3. AI 回合正常
4. 伤害结算动画正常
5. 弹窗（设置、音量、返回主菜单、牌型系数）正常
6. 技能按钮正常
7. 游戏结束画面正常

- [ ] **Step 6: Commit**

```bash
git add src/scenes/managers/BattleFlowManager.ts src/scenes/GameScene.ts
git commit -m "refactor: extract BattleFlowManager from GameScene"
```

---

### 验证最终状态

所有 Task 完成后，运行：

```bash
npm run build   # 类型检查
npm run test    # 单元测试
wc -l src/scenes/GameScene.ts   # 应降至 ~2000 行
```

预期 GameScene.ts 剩余内容：
- 字段声明（已大幅减少）
- `resetSceneState()`（更新为仅重置自己拥有的字段）
- `create()` / `init()` / `constructor`
- `initBattle()`, `selectPlayerCharacter()`, `selectEnemyCharacter()`
- `drawBackground()`, `createInfoBars()`, `createButtons()`, `createPatternHint()`, `createTurnIndicator()`
- `createCharacterSlots()` 及角色栏方法
- CharacterSlotManager 实现（`showDialog`, `glowOn`, `shakeAndPulse`, `glowOff`, `moveToFront`, `restoreSlot`, 工具提示）
- `onCardClick`, `getSelectedCards`, `updatePatternHint`, `showPatternHint`, `checkHandValidationHint`
- `updateUIForPhase`, `updateTurnIndicator`, `updateVitalityBars`, `animateHealthBarDepletion`, `animateHealthBarDepletionAsync`
- `showGameOver`, `playerHasPlayablePattern`
- `showFloatingText`
- `initBattleBgm`, `playRandomBattleBgm`, `onBattleBgmComplete`, `cancelDamageSettlement`
- 主动技能系统：`getBattle`, `renderPlayerHandAfterSkill`, `initActiveSkills`, `updateActiveSkillButton`, `closeSkillDropdown`, `updateSkillDropdownTrigger`, `onSkillClick`, `updateButtonLayout`
- `isPlayerTurn` + 各 Manager 的委托桩方法
