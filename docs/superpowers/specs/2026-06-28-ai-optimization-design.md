# AI 决策优化 — 需求规格说明

> 版本：1.0
> 日期：2026-06-28
> 状态：待实现

---

## 1. 概述

优化敌人 AI 决策系统，使每种敌人拥有符合自身技能特性的战术风格，同时保持单一评分引擎架构。

### 1.1 目标

1. **敌人个性差异化**：8 种敌人各有独特的出牌倾向，匹配其技能特性
2. **评分系统增强**：新增血量压力、牌权控制、最少浪费等评分维度
3. **技能深度联动**：敌人技能通过 `onAIDecision` 钩子影响 AI 决策
4. **全面测试覆盖**：为每种敌人的核心决策路径编写测试用例

### 1.2 非目标

- ❌ 不修改玩家角色技能系统
- ❌ 不为玩家角色添加 AI 钩子
- ❌ 不引入搜索/前瞻型 AI
- ❌ 不支持难度分级（所有敌人同强度，但风格不同）
- ❌ 不改动现有技能执行流程

---

## 2. 核心架构

### 2.1 新增/修改类型定义

```typescript
// src/engine/AIBrain.ts

interface ScoreWeights {
  damageWeight: number;          // 伤害贡献权重（默认 0.05）
  clearingWeight: number;        // 清空手牌权重（默认 3）
  comboPreserveWeight: number;   // 组合保护权重（默认 2）
  savingMaterialWeight: number;  // 接牌节省权重（默认 3, margin加权）
  closeMarginBonus: number;      // 刚好管上奖励（默认 4）
  complexityWeight: number;      // 复合牌型偏好权重（默认 4）
}

interface SelectionConfig {
  candidateCount: number;        // 候选数量
  randomThreshold: number;       // 随机化阈值（0~1）
}

interface BotProfile {
  aggression: number;            // 0~1：激进程度
  comboPreference: number;       // 0~1：复合牌型偏好
  handClearingTendency: number;  // 0~1：清空手牌倾向
  weights: ScoreWeights;         // 评分权重覆盖（null=使用默认）
  selection: SelectionConfig;    // 选择机制配置
  passThreshold: number;         // 接牌放弃阈值（0=永不放弃）
  bombOverride: {                // 炸弹阈值覆盖（null=使用全局默认）
    base: number;
    fuzzRange: number;
  } | null;
}

interface AIDecisionContext {
  hand: Card[];
  battleState: BattleState;
  lastPlay: HandPattern | null;
  isFollow: boolean;
}

interface ScoredPlay {
  play: HandPattern;
  score: number;
}
```

```typescript
// src/skills/SkillTypes.ts

// 新增：AI 决策钩子类型
type AIDecisionHook = (
  plays: ScoredPlay[],
  ctx: AIDecisionContext,
) => void;

// SkillDefinition 新增可选属性（向后兼容）
// onAIDecision?: AIDecisionHook;
```

### 2.2 SkillRegistry 新增方法

`SkillRegistry` 当前有 `getSkillsByTiming()` 和 `getSkillOwner()`。AI 需要按角色 ID 获取技能钩子：

```typescript
// SkillRegistry.ts 新增
getSkillsByCharacter(characterId: string): SkillDefinition[] {
  const skillIds = [...this.skillOwnerMap.entries()]
    .filter(([, owner]) => owner === characterId)
    .map(([skillId]) => skillId);
  return this.skills.filter(s => skillIds.includes(s.id));
}
```

此举不会破坏任何现有调用方。

### 2.3 评分引擎改动

`scorePlay` 函数新增 `profile: BotProfile` 参数，原有 5 项评分因素保留并参数化，新增 3 项：

```
score = 0

① 基础伤害贡献: damage * weights.damageWeight
② 清空手牌奖励: cards.length * weights.clearingWeight
③ 组合完整保护: remainingGoodCombos * weights.comboPreserveWeight
④ 接牌节省性（仅 isFollow）:
     margin * -weights.savingMaterialWeight
     if margin <= 2 → score += weights.closeMarginBonus
⑤ 牌型复杂度（仅主动出牌）:
     (11 - priority) * weights.complexityWeight * comboPreference
⑥ 血量压力（新增）:
     max(0, opponentVitality - damage) * aggression * pressureFactor
     对方残血可击杀时加分
⑦ 保留炸弹（新增）:
     if 候选是炸弹 && damage < opponentVitality → penalty
     非致命时刻不舍得用炸弹
⑧ 最少浪费（新增·仅顺子/连对/飞机）:
     if 从最小点开出 → bonus
     避免从中间拆散组合
⑨ 技能钩子:
     外部注入的评分修正回调（由 BattleFlowManager 提供，
     内部调用 skillRegistry.getSkillsByCharacter() 获取
     敌方的 onAIDecision 并按顺序执行）
     
     decidePlay 新增签名：
     decidePlay(battleState, adjustPlayScores?)
     保持 engine/ 层不直接依赖 skills/ 层
```

### 2.4 决策选择机制

`selectPlay` 改为读取 `profile.selection`：

| aggression | candidateCount | randomThreshold | 行为 |
|-----------|---------------|-----------------|------|
| 0.0~0.3 | 1~2 | 0.05 | 接近确定性 |
| 0.4~0.6 | 3 | 0.10 | 当前默认行为 |
| 0.7~1.0 | 4~5 | 0.20 | 高随机性 |

### 2.5 接牌放弃策略

当 AI 有合法接牌时，不再永远接牌。新增 `passThreshold` 控制：

```
if beatingPlays.length === 0 → pass (必须放弃)
else:
  topScore = scorePlay(bestPlay, ...)
  if topScore < passThreshold → pass (战略放弃)
  else → 接牌
```

`passThreshold` 受 `aggression` 影响：低 aggression 时有更大概率战略放弃，让对手多出手牌。

---

## 3. 各敌人 BotProfile

### 3.1 士卒

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.3 | 保守 |
| comboPreference | 0.3 | 偏简单牌型 |
| handClearingTendency | 0.3 | 不强求清空 |
| passThreshold | 0.2 | 偶尔战略放弃 |
| bombOverride | null | 使用默认 |
| onAIDecision | null | 无技能钩子 |

### 3.2 黄巾军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.6 | 较激进 |
| comboPreference | 0.4 | 适中 |
| handClearingTendency | 0.3 | 普通 |
| passThreshold | 0.0 | 能接就接（触发黄天） |
| onAIDecision | 点数小加分 | 优先弃小摸大 |

### 3.3 南蛮军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.5 | 中等 |
| comboPreference | 0.5 | 中等 |
| handClearingTendency | 0.3 | 普通 |
| onAIDecision | 黑桃♠/梅花♣加分，红桃♥扣分 | 原硬编码行为迁移 |

### 3.4 强盗

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.5 | 中等 |
| comboPreference | 0.4 | 适中 |
| handClearingTendency | 0.4 | 略倾向清空 |
| onAIDecision | 单张加分 | 多出单张触发剪径偷牌 |

### 3.5 八旗军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.5 | 中等 |
| comboPreference | 0.3 | 偏简单牌型 |
| handClearingTendency | 0.2 | 不追求清空 |
| onAIDecision | 方片♦单张加分 | 骑射封锁对手单张响应 |

### 3.6 蒙古军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.7 | 激进 |
| comboPreference | 0.4 | 适中 |
| handClearingTendency | 0.4 | 略倾向清空 |
| onAIDecision | 黑桃♠单张加分 | 抢掠偷牌 |

### 3.7 西凉军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.8 | 最激进 |
| comboPreference | 0.6 | 偏好大牌型 |
| handClearingTendency | 0.6 | 倾向清空（触发悍勇） |
| passThreshold | 0.3 | 手牌少时更易放弃接牌换取牌权 |
| onAIDecision | 手牌少→清空加分越高 | 利用悍勇+3倍数 |

### 3.8 匈奴军

| 参数 | 值 | 说明 |
|------|-----|------|
| aggression | 0.4 | 偏保守 |
| comboPreference | 0.3 | 偏简单牌型 |
| handClearingTendency | 0.2 | 不追求清空 |
| passThreshold | 0.3 | 较易放弃 |
| onAIDecision | 红桃♥单张加分 | 狼狩回血 |

---

## 4. 默认权重常量

```typescript
const DEFAULT_WEIGHTS: ScoreWeights = {
  damageWeight: 0.05,
  clearingWeight: 3,
  comboPreserveWeight: 2,
  savingMaterialWeight: 3,  // margin 乘数
  closeMarginBonus: 4,
  complexityWeight: 4,      // 每级优先级差值
};
```

---

## 5. 迁移步骤

### Step 1: 新建类型（纯新增，零影响）

- 在 `AIBrain.ts` 新增 `BotProfile`、`ScoreWeights`、`SelectionConfig`、`AIDecisionContext`、`ScoredPlay` 接口
- 在 `SkillTypes.ts` 的 `SkillDefinition` 接口新增可选 `onAIDecision` 属性

### Step 2: 评分引擎参数化

- `scorePlay` 新增 `profile: BotProfile` 参数（默认参数为当前值兼容调用方）
- 提取现有硬编码权重为 `DEFAULT_WEIGHTS` 常量
- 新增血量压力、保留炸弹、最少浪费评分维度，默认为 0 不影响现有行为
- 在评分末尾添加 `onAIDecision` 调用点

### Step 3: 决策选择机制参数化

- `selectPlay` 新增 `profile: BotProfile` 参数
- 读取 `profile.selection` 控制候选数和随机性

### Step 4: 新增 BOT_PROFILES 常量 & 迁移南蛮军硬编码

- 在 `AIBrain.ts` 新增 `BOT_PROFILES: Record<EnemyCharacterId, BotProfile>`
- 删除 `AIBrain.ts:125-130` 的南蛮军花色硬编码
- 在 `NanmanJunTengJia.ts` 新增 `onAIDecision` 实现
- `decidePlay` 根据 `battleState.enemyCharacterId` 读取对应 profile

### Step 5: 为各敌人技能补充 onAIDecision

逐个文件新增：
- `BannerArmyQiShe.ts` — 方片单张加分
- `HuangjinJunHuangTian.ts` — 小牌加分
- `MongolArmyQiangLve.ts` — 黑桃单张加分
- `XiongnuArmyLangShou.ts` — 红桃单张加分
- `QiangdaoJianJing.ts` — 单张加分
- `XiliangArmyHanYong.ts` — 手牌少时清空奖励递增

### Step 6: 接牌放弃逻辑

- `aiRespond` / 接牌分支在读 `profile.passThreshold` 后判定是否战略放弃
- 仅在 `missionCritical` 场景（清空手牌线、击杀线）放弃判断

---

## 6. 测试计划

所有测试在 `src/engine/__tests__/AIBrain.test.ts` 中新增。

### 6.1 Step 2 测试

| 用例 | 描述 |
|------|------|
| 默认权重不改变现有行为 | 用默认 profile 跑现有场景，分数快照一致 |
| weights 覆盖生效 | 修改 weights 后评分变化符合预期 |
| 新增维度默认为 0 | 血量压力/保留炸弹/最少浪费不改变默认行为 |

### 6.2 Step 3-4 测试（各敌人策略）

每敌人在 2 种模式下验证：

| 敌人 | 主动出牌预期 | 接牌预期 |
|------|------------|---------|
| 士卒 | 最小单张 | 最小合法接牌 |
| 黄巾军 | 最小牌倾向 | 能接就接 |
| 南蛮军 | 倾向♠♣、回避♥ | 同上 |
| 强盗 | 倾向单张 | 正常接牌 |
| 八旗军 | 倾向♦单张 | 正常接牌 |
| 蒙古军 | 倾向♠单张 | 正常接牌 |
| 西凉军 | 手牌少时倾向大牌型 | 手牌少时易放弃接牌 |
| 匈奴军 | 倾向♥单张 | 正常接牌 |

### 6.3 Step 5 测试

每个技能 `onAIDecision` 独立测试：给定输入 plays 列表，验证评分叠加正确。

### 6.4 Step 6 测试

| 用例 | 描述 |
|------|------|
| passThreshold=0 不放弃 | 有合法接牌时一定接 |
| passThreshold=1 放弃 | 有合法接牌时放弃 |
| 残血不放弃 | 手牌即将清空时忽略 passThreshold |

---

## 7. 接口变更汇总

| 文件 | 变更 | 兼容性 |
|------|------|-------|
| `src/engine/AIBrain.ts` | 新增接口、常量、BotProfile；参数化评分 + selectPlay；`decidePlay` 新增可选 `adjustPlayScores` 回调 | 向后兼容（可选参数） |
| `src/skills/SkillTypes.ts` | 新增 `AIDecisionHook` 类型；SkillDefinition 新增可选 `onAIDecision` | 向后兼容（可选属性） |
| `src/skills/SkillRegistry.ts` | 新增 `getSkillsByCharacter()` 方法 | 向后兼容（纯新增） |
| `src/scenes/managers/BattleFlowManager.ts` | `aiRespond`/`aiInitiatePlay` 调用 `decidePlay` 时传入回调，从 `skillRegistry` 获取并应用 `onAIDecision` | 兼容 |
| `src/skills/NanmanJunTengJia.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/BannerArmyQiShe.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/HuangjinJunHuangTian.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/MongolArmyQiangLve.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/XiongnuArmyLangShou.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/QiangdaoJianJing.ts` | 新增 onAIDecision 实现 | 纯新增 |
| `src/skills/XiliangArmyHanYong.ts` | 新增 onAIDecision 实现 | 纯新增 |
