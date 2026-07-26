# 战斗画面·动画·操作优化设计（方案 A：反馈强化优先）

日期：2026-07-26
状态：已获用户批准

## 背景与目标

当前对战场景（GameScene + managers）功能完整，但用户实测反馈三大痛点：

1. **回合反馈不清** — 不知道轮到谁、该干什么
2. **AI 出牌不明朗** — AI 出的什么牌型不直观
3. **打击感不足** — 伤害数字、扣血表现不够震撼

目标手感对标：**斗地主类手游**（选牌顺滑、牌型自动提示、出牌反馈直接）。

附加需求（用户明确提出）：

- 选牌方式：拖拽框选 + 点按选牌并存
- 手牌过多时需处理溢出（压缩 → 滑动）
- 角色说话气泡必须完整显示（当前在屏幕边缘会被裁切）

## 范围

**做**：回合状态反馈、AI 出牌明朗化、打击感强化、点按选牌、提示按钮、手牌压缩/滑动、气泡钳制。

**不做**：布局骨架重构（手牌弧形排布、中央出牌区重构、角色条重设计）、音效新增（沿用现有音效资源，仅调整播放时机）。

## 设计明细

### 1. 回合状态反馈

- **玩家回合横幅**：屏幕中下部显示「轮到你出牌 / 跟牌或不出」大字横幅（约 48px），带呼吸微光（alpha 0.85↔1.0 循环），替代目前角落小字（`turnIndicatorText`）。无可出之牌时横幅位置上移避开手牌区（沿用现有位置切换逻辑）。
- **AI 回合指示**：「对方思考中…」增加呼吸灯动效；敌方角色头像/信息区加光圈。
- **行动方角色条高亮**：当前行动方的角色条（我方 slot / 敌方信息区）加常驻金色描边，回合切换时淡入淡出过渡。复用 `CharacterBarManager` 现有 glow 系统，新增常驻（非技能触发型）高亮模式。

### 2. AI 出牌明朗化

- **牌型标签**：任何一方出牌后，中央出牌区上方浮现牌型标签（如「三条」「顺子」「炸弹」），文案取自 `HAND_TYPE_LABELS`；标签停留至下一次出牌或中央区清空时替换/消失。玩家与 AI 出牌均显示（信息对称）。
- **AI 思考节奏分级**（`BattleFlowManager` 的 AI 决策延迟）：
  - 普通出牌：0.6~1.0s（随机抖动）
  - 炸弹/火箭：决策后额外停顿约 0.5s 再打出，制造紧张感
  - 不出（pass）：0.4~0.7s

### 3. 打击感强化（Juice）

四件套，集中在伤害结算命中时刻（`DamageSettlementManager.stage3ApplyDamage`）：

| 效果 | 规格 | 分级 |
|------|------|------|
| 顿帧 | 伤害数字命中血条瞬间 `timeScale` 停顿 80ms | 固定 |
| 震屏 | `cameras.main.shake` | 小伤害（< 50）：120ms/0.004；中伤害：200ms/0.008；炸弹/火箭或伤害 ≥ 100：300ms/0.012 |
| 闪白 | 受击方角色区闪白（白色矩形 alpha 0.6 → 0，150ms）+ 屏幕边缘红色 vignette 泛光（200ms） | 固定 |
| 伤害数字 | 放大弹入（Back.easeOut）→ 飞向血条；炸弹/火箭时字号 ×1.5、颜色改为火焰橙红 | 按牌型 |

新增 `JuiceManager`（`src/scenes/managers/`）封装震屏/闪白/顿帧，供 `DamageSettlementManager` 调用，避免结算类继续膨胀。

### 4. 点按选牌（与拖拽框选并存）

落点：`DragInputManager`。

- `pointerdown` 在手牌某张牌上，`pointerup` 时总位移 < 10px → 判定为**点按**：切换该牌选中状态（弹起 `SELECTED_OFFSET` + 金色描边，复用现有选中视觉）。
- 位移 ≥ 10px → 走原有框选逻辑。
- 手牌处于溢出滑动模式时：横向为主（|dx| > 2|dy|）的拖动 → 滚动手牌；纵向/斜向拖动 → 框选；点按判定不变。

### 5. 提示按钮

- 按钮组变为「提示 ｜ 出牌 ｜ 不出」（`ButtonManager`），「提示」仅在玩家回合可见。
- 点击后自动选中"能压过上家的最优牌"：新增纯函数 `findBestPlay(hand, lastPlay, beatRule)` 于 `engine/`（复用 `HandRecognizer.findAllPossiblePlays` 与 `canPlayerBeat` 判定），优先返回点数消耗最小、不拆炸弹的出法；`player_init` 阶段返回最小合法牌型。
- 无可出之牌时「提示」置灰。
- 连续点击「提示」在多个候选出法间循环。

### 6. 手牌排布三级策略

落点：`CardDisplayManager.renderPlayerHand`，间距计算提取为纯函数 `calcHandOverlap(cardCount, availableWidth)`（可单测）。

1. **常规**：`CARD_W + (n-1)×135 ≤ 可用宽度` → 固定 135px 间距（现状不变）
2. **压缩**：超宽 → `间距 = (可用宽度 − CARD_W) / (n−1)`，下限 40px，整列居中
3. **溢出滑动**：间距到下限仍超宽 → 间距固定 40px，整列可横向划动；两端渐隐遮罩 + 箭头提示仍有未显示的牌

滑动实现：手牌容器记录 `handScrollX`（≤ 0），拖拽时按手势方向更新并钳制到 `[可用宽度 − 总宽, 0]`；重render（出牌/补牌）时保持或重新钳制 scrollX。

### 7. 对话气泡钳制

落点：`CharacterBarManager.showDialog`。

- 气泡中心 x 钳制在 `[margin + boxW/2, 屏宽 − margin − boxW/2]`（margin = 16px）
- 气泡尾巴（三角）水平位置跟随角色实际 anchorX，不再固定在气泡中心
- y 方向同样保证气泡整体在屏幕内（顶部受击时不下沉出屏）

钳制逻辑提取为纯函数 `clampBubblePosition(anchorX, boxW, screenWidth, margin)`（可单测）。

## 架构落点总表

| 改动 | 落点 | 类型 |
|------|------|------|
| 回合横幅 / AI 思考呼吸灯 | 新 `TurnIndicatorManager`（`src/scenes/managers/`），从 GameScene 抽出 `updateUIForPhase`/`updateTurnIndicator` 相关视觉 | 新模块 |
| 行动方角色条高亮 | `CharacterBarManager` | 扩展 |
| 牌型标签 | `CardDisplayManager` | 扩展 |
| AI 思考节奏分级 | `BattleFlowManager` | 扩展 |
| 打击感四件套 | 新 `JuiceManager` + `DamageSettlementManager` 调用 | 新模块 |
| 点按选牌 / 滑动手势 | `DragInputManager` | 扩展 |
| 提示按钮 | `ButtonManager` + `engine/findBestPlay.ts` | 扩展 + 新纯函数 |
| 手牌压缩/滑动 | `CardDisplayManager` + `engine/handLayout.ts`（纯函数） | 扩展 + 新纯函数 |
| 气泡钳制 | `CharacterBarManager` + `utils` 纯函数 | 扩展 + 新纯函数 |

## 错误处理与边界

- 手牌 0/1 张时间距计算不除零（n ≤ 1 直接居中）
- `findBestPlay` 无候选返回 null → 提示按钮置灰
- 顿帧不得中断技能事件总线（`SkillEventBus.emit` 的 async 流程保持正常 await，顿帧只影响 tween 时间缩放，结束后恢复 `timeScale = 1`）
- 场景重启时所有新状态（横幅 tween、滚动位置、标签引用）纳入 `resetSceneState()`

## 测试策略

- `calcHandOverlap` / `clampBubblePosition` / `findBestPlay`：Vitest 单测（含边界：0 张、1 张、恰好不超宽、压到下限、溢出阈值）
- 回归：现有 `npm run test` 全量通过；`npm run build` 类型检查通过
- 动画/手感类改动以 `npm run dev` 手动验证为主

## 验证清单（手动）

- [ ] 各回合阶段横幅/思考指示正确切换
- [ ] AI 出牌后牌型标签显示且下次出牌时替换
- [ ] 炸弹/火箭命中时有明显震屏+大数字
- [ ] 点按可选/取消选牌，拖拽框选不受影响
- [ ] 提示按钮在 respond 阶段选出能压过上家的牌，循环点击切换候选
- [ ] 27 张手牌完整显示在屏幕内；构造 50+ 张时可滑动
- [ ] 角色在屏幕左/右边缘说话时气泡完整、尾巴指向角色
