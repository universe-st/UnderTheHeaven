# 备战界面设计文档

**日期:** 2026-07-04
**状态:** 待批准

---

## 1. 概述

新增「备战」界面（`PrepScene`），提供战前经济循环：玩家在测试选择后进入备战界面，可在黄金台购买角色、在商铺购买卡牌，完成后进入正式对战。

### 核心数据

| 属性 | 初始值 | 说明 |
|------|--------|------|
| 金钱 | 10 元 | 在黄金台和商铺消费用 |
| 天命 | 1000 | 展示在状态栏（后续可能用于其他用途） |
| 已拥有角色 | 从 TestSelectScene 选择的角色 | 免费获得，状态栏展示 |

---

## 2. 流程

```
TestSelectScene  →  PrepScene  →  GameScene
   (选择角色/敌方/血量)   (购买角色+卡牌)   (对战)
```

### TestSelectScene 改动

- 「开始测试」按钮跳转目标改为 `PrepScene`，传入以下数据：
  - `selectedPlayerCharacterIds: PlayerCharacterId[]`
  - `enemyCharacterId: EnemyCharacterId`
  - `playerVitality: number`
  - `enemyVitality: number`

### PrepScene 流程

1. 接收 TestSelectScene 传来的数据
2. 初始化金钱 = 10，天命 = 1000，拥有角色 = 已选择的角色列表
3. 生成黄金台 3 个随机角色（不能是已拥有角色）
4. 生成商铺 3 张随机卡牌
5. 用户交互：购买角色 / 购买卡牌 / 查看状态
6. 点击「开始战斗」按钮 → 跳转 GameScene，传入：
   - 原始 TestSelectScene 数据（selectedPlayerCharacterIds、enemyCharacterId、playerVitality、enemyVitality）
   - 额外：购买的卡牌追加到玩家初始牌组

### GameScene 改动

- 可选：若传入 `extraDeckCards: Card[]`，将这些卡牌与标准牌组合并后分配给玩家和敌方

---

## 3. 界面布局

基于画布 2400×1080，使用 UIFactory 保持一致视觉风格（深色底+金色边框）。

```
┌─────────────────────────────────────────────────────┐
│                   整 军 备 战                        │
│                    ─── ───                          │
├──────────────┬──────────────────┬───────────────────┤
│   黄 金 台    │     商 铺        │     状 态         │
│              │                  │                   │
│  [角色卡1]   │   [卡牌1] ¥3     │   天命: 1000      │
│  cost: 5     │   [卡牌2] ¥3     │   金钱: 10 元     │
│  [角色卡2]   │   [卡牌3] ¥3     │   拥有角色:       │
│  cost: 3     │                  │   · 韩信          │
│  [角色卡3]   │                  │   · 扁鹊          │
│  cost: 8     │                  │                   │
│              │                  │                   │
│  ┌──────┐    │  ┌──────┐       │                   │
│  │ 购买 │    │  │ 购买 │       │                   │
│  └──────┘    │  └──────┘       │                   │
├──────────────┴──────────────────┴───────────────────┤
│                    [ 开 始 战 斗 ]                    │
└─────────────────────────────────────────────────────┘
```

### 三个版块布局

- **三列等宽排列**，每列宽度约 750px，间距 30px
- 起始 X = 60，Y = 180，高度 ~700px
- 开始战斗按钮：底部居中，Y ≈ 940

---

## 4. 各板块细节

### 4.1 黄金台（Golden Terrace）

- **标题**: 「黄金台」
- **内容**: 3 张角色卡片纵向排列
- **刷新规则**: 从 `PLAYER_CHARACTER_LIST` 中随机选 3 个，排除已拥有角色（若可选的不足 3 个，则显示可用数量）
- **角色卡显示**: 头像 + 名称 + 费用（`cost` 字段）+ 技能简述
- **购买逻辑**:
  - 点击「购买」按钮（或在角色卡上点击）
  - 若金钱 ≥ 角色 cost，扣除金钱，角色加入已拥有列表
  - 若金钱不足，弹出提示（或按钮灰色不可点击）
  - 购买后角色卡从黄金台移除（不可重复购买同个角色）
- **视觉**: 使用 UIFactory.panel 绘制区域背景

### 4.2 商铺（Shop）

- **标题**: 「商铺」
- **内容**: 3 张卡牌纵向排列
- **卡牌生成**: 从 `createDeck()` 随机取 3 张，花色+点数完整显示
- **价格**: 统一 3 元（固定）
- **购买逻辑**:
  - 点击「购买」按钮
  - 若金钱 ≥ 3，扣除 3 元，卡牌加入已购牌组
  - 若金钱不足，按钮灰色
  - 购买后卡牌从商铺移除
- **卡牌显示**: 使用与 GameScene 一致的卡牌渲染风格（花色符号 + 点数标签）

### 4.3 状态（Status）

- **标题**: 「状态」
- **内容**:
  - 天命: `1000`（只展示，暂不可操作）
  - 金钱: 当前剩余金额（实时更新）
  - 已拥有角色: 列表展示所有已拥有角色名称（包括 TestSelect 选择的 + 黄金台购买的）

### 4.4 开始战斗按钮

- 底部居中，使用 `UIFactory.button` 风格
- 文本: 「▶ 开 始 战 斗」
- 点击后跳转到 GameScene

---

## 5. 数据模型

```typescript
// PrepScene 内部状态
interface PrepState {
  money: number;                          // 当前金钱（初始 10）
  tianming: number;                       // 天命（初始 1000）
  ownedCharacterIds: PlayerCharacterId[]; // 已拥有角色（TestSelect 所选 + 购买的）
  purchasedCards: Card[];                 // 商铺购买的卡牌（追加到初始牌组）
  goldenTerraceCharacters: PlayerCharacterId[]; // 黄金台刷新的 3 个角色
  shopCards: Card[];                      // 商铺刷新的 3 张卡牌
}

// 从 TestSelectScene 传入的数据
interface PrepSceneConfig {
  selectedPlayerCharacterIds: PlayerCharacterId[];
  enemyCharacterId: EnemyCharacterId;
  playerVitality: number;
  enemyVitality: number;
}

// 传入 GameScene 的数据（扩展 TestBattleConfig）
interface PrepBattleConfig extends TestBattleConfig {
  purchasedCards?: Card[];  // 购买的卡牌追加到初始牌组
}
```

---

## 6. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/scenes/PrepScene.ts` | **新建** | 备战主场景 |
| `src/scenes/TestSelectScene.ts` | 修改 | 开始按钮跳转 PrepScene |
| `src/scenes/GameScene.ts` | 修改 | 接受并处理 purchasedCards |
| `src/models/Card.ts` | 无修改 | 复用现有 Card 类型和 createDeck |
| `src/models/Character.ts` | 无修改 | 复用现有 PLAYER_CHARACTERS |
| `src/utils/UIFactory.ts` | 无修改 | 复用现有 UI 组件 |
| `src/constants/Layout.ts` | 可选 | 可能新增 PrepScene 专用常量 |
| `src/config.ts` | 修改 | 注册 PrepScene |

---

## 7. 边界情况与约束

1. **黄金台无足够角色可刷**: 若已拥有角色 ≥ 总角色数 - 1，显示剩余可用角色（可能少于 3 个），可更改为文本提示"暂无更多角色"
2. **金钱耗尽**: 所有购买按钮变为灰色/禁用，显示"金钱不足"
3. **购买后实时刷新**: 金钱/状态栏实时更新
4. **已购买角色/卡牌不可重复购买**: 购买后从列表中移除
5. **重置**: 每次进入 PrepScene 时使用初始值（金钱=10，天命=1000），不做持久化（当前仅为测试用）
6. **购买的卡牌追加到牌组**: 在 GameScene 的 `initBattle()` 中，创建标准 54 张牌组后，将 `purchasedCards` 追加到 playerDeck（仅加入玩家牌组，不加入敌方牌组），然后重新洗牌、发牌。敌方牌组仍为标准 54 张。
7. **购买的额外角色**: 购买的角色 ID 追加到 `playerCharacterIds` 数组，GameScene 的多角色技能系统会自动处理
8. **空牌组追加**: 若 purchasedCards 为空，GameScene 行为不变
