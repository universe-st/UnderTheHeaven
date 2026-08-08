---
name: game-skill-design
description: "使用本 skill 当你需要为天下牌游戏设计或编写角色技能（触发技或主动技）。涵盖时机选择、视觉动效、async/await 规范、SkillContext 字段用法、SkillFilter 逻辑、以及如何将技能注册到角色系统。触发条件：添加新技能、修改技能效果、调整技能触发时机、技能动画需求、技能与角色系统对接。"
---

# 游戏技能编写

> 天下牌的游戏技能系统：事件驱动的触发技（`SkillDefinition`）与 UI 触发的主动技（`ActiveSkillDefinition`）。技能通过 `SkillRegistry.registerForBattle()` 按角色数据注册，与角色代码完全解耦。

**关键源文件：** `src/skills/SkillTypes.ts`, `src/skills/SkillRunner.ts`, `src/skills/SkillRegistry.ts`, `src/skills/SkillEventBus.ts`, `src/skills/SkillVisualManagerImpl.ts`, `src/skills/SkillUtils.ts`, `src/utils/AnimationUtils.ts`

---

## 1. 技能视觉效果设计

### 1.1 SkillVisualManager 接口

`SkillVisualManager` 是技能代码中调用视觉效果的接口，传入每个技能的 `execute(cctx, visuals)` 的第二个参数。提供以下方法：

| 方法 | 用途 | 调用示例 |
|------|------|---------|
| `animateCardScale(cards, scaleTo?, duration?)` | 牌缩放动画（默认 1.35 倍，300ms，yoyo 回弹） | `visuals.animateCardScale(clubContainers)` |
| `showHeal(target, amount)` | 弹出绿色 "+N" 治疗数字，飞升后淡出 | `visuals.showHeal('player', clubRankSum)` |
| `playSkillTriggerSound()` | 播放技能触发音效（`sfx_skill_trigger`） | `visuals.playSkillTriggerSound()` |
| `playSfx(key)` | 播放指定音效键 | `visuals.playSfx('sfx_card_reveal')` |
| `getScene()` | 获取当前 Phaser.Scene（用于 tweens/delay） | `const scene = visuals.getScene()` |
| `cancelDamageSettlement()` | 取消当前伤害结算（中断 Stage 1/2/3，清空中央牌） | `visuals.cancelDamageSettlement()` |

### 1.2 SkillRunner 自动完成的动画

`SkillRunner.executeWithAnimation()` 在技能 `execute` 调用之前/之后**自动处理**以下动画，技能代码中**无需手写**：

```
对玩家角色（isPlayer = true）：
  1. glowOn(ownerId)          — 光晕渐入 + 呼吸循环
  2. moveToFront(ownerId)     — 角色头像移至栏位首位
  3. shakeAndPulse(ownerId)   — 加速晃动 + 放大强调
  4. await skill.execute()    — ⬅ 你的技能逻辑在此
  5. glowOff(ownerId)         — 光晕渐出
  6. restoreSlot(ownerId)     — 头像回到原位

对敌人角色：直接执行技能，跳过动画管线
```

技能代码只需要关注**业务逻辑 + 卡片/分数类动画**（如系数增长、数字弹出等），角色头像动效全由 `SkillRunner` 负责。

### 1.3 SkillUtils 公共动画工具

`src/skills/SkillUtils.ts` 提供了通用的单牌结算动画函数：

| 函数 | 用途 |
|------|------|
| `nullifyCardDamage(ctx, visuals)` | 单牌分数归零：设置 alpha=0.35，分数计数器动画到 0 |
| `modifyCardDamage(ctx, visuals, bonus)` | 单牌分数加减：`scoreBonus += bonus`，计数器动画到目标值 |
| `multiplyCardDamage(ctx, visuals, multiplier)` | 单牌分数乘算：`scoreBonus = newTotal - baseScore`，计数器动画到目标值 |

### 1.4 AnimationUtils 公共异步工具

`src/utils/AnimationUtils.ts` 提供了可等待的动画辅助函数：

```typescript
waitForDelay(scene, ms)           // 延迟 ms 毫秒
waitForTween(scene, config)       // 返回 Promise 的 tween
waitForCounterTween(scene, {...})  // 计数器数字渐变动画
animateCoefficientUpdate(scene, labelText, typeLabel, fromCoeff, toCoeff, duration)
animateMultiplierUpdate(scene, labelText, fromMultiplier, toMultiplier, duration)
```

### 1.5 刘伯温「筹策」临时牌动画

主动技可能创建自定义视觉效果。刘伯温「筹策」的 `createTempCardToHand()` 展示了完整模式：
- 在屏幕中央创建容器（depth 999, alpha 0）
- 绘制卡牌背景、花色符号、点数文字
- 叠加蜘蛛网裂痕纹理（Graphics lineBetween 绘制）
- 叠加黄色滤镜（0xffd700, alpha 0.18）
- 缩放飞入动画（scale 0.3→1, Back.easeOut, 500ms）
- 裂纹和滤镜淡入（300ms）
- 卡片飞向手牌目标位置（400ms）
- 销毁 overlay 容器

---

## 2. 从技能描述分析触发时机

### 2.1 SkillTiming 枚举

```typescript
enum SkillTiming {
  ON_PLAY = 'on_play',                       // 出牌时
  ON_COEFFICIENT_REVEALED = 'on_coefficient_revealed',  // 系数揭示后
  ON_DAMAGE_MULTIPLIER_REVEALED = 'on_damage_multiplier_revealed',  // 伤害倍数揭示后
  ON_DAMAGE_CALCULATED = 'on_damage_calculated',  // 伤害计算完成
  ON_SINGLE_CARD_SETTLEMENT = 'on_single_card_settlement',  // 单牌逐张结算
  AFTER_DAMAGE = 'after_damage',             // 伤害结算完成后
  AFTER_HEALTH_DECREASE = 'after_health_decrease',  // 扣血后（扁鹊回生）
  AFTER_SINGLE_CARD_SETTLEMENT = 'after_single_card_settlement',  // 单牌结算后（匈奴狼狩/蒙古抢掠）
  ON_GAIN_TURN = 'on_gain_turn',             // 获得回合/牌权
  ON_TURN_START = 'on_turn_start',           // 回合开始
  ON_AI_SCORE = 'on_ai_score',               // AI 打分（尚未启用）
  PASSIVE_MODIFIER = 'passive_modifier',     // 被动修改器（八旗军骑射封锁响应等）
  HAND_VALIDATION = 'hand_validation',       // 手牌验证（新增出牌方式）
}
```

### 2.2 时机选择决策流程

```
技能描述中的关键词是什么？
├─ "出牌时" / "打出牌时" → ON_PLAY
├─ "系数" / "翻倍" → ON_COEFFICIENT_REVEALED
├─ "伤害倍数" / "倍数+X" / "花色数"（倍数修改类） → ON_DAMAGE_MULTIPLIER_REVEALED
├─ "结算" / "计分" / "不计算分数" / "伤害+X"（逐牌） → ON_SINGLE_CARD_SETTLEMENT
├─ "造成伤害后" / "受伤后" / "弃置牌" → AFTER_DAMAGE
├─ "气数降到0时" / "回复气数" → AFTER_HEALTH_DECREASE
├─ "单牌结算后" / "获得对方的牌"（逐牌结算完成后） → AFTER_SINGLE_CARD_SETTLEMENT
├─ "获得牌权时" / "回合开始时" → ON_TURN_START
│   └─ 需要区分先后手？先手用 ON_GAIN_TURN（对方摸满手牌后），后手发动用 ON_TURN_START
├─ "令对方牌明置" → ON_GAIN_TURN
├─ "可额外打出" / "新出牌方式" → HAND_VALIDATION
├─ "对方无法用X响应" / "封锁" → PASSIVE_MODIFIER
└─ "造成伤害计算" / "全局乘算" → ON_DAMAGE_CALCULATED
```

### 2.3 时机判断范例

| 技能 | 描述关键语 | 选择 timing | 理由 |
|------|-----------|-----------|------|
| 韩信「点兵」 | "伤害倍数+X" | `ON_DAMAGE_MULTIPLIER_REVEALED` | 修改伤害倍数，在倍数揭示后触发 |
| 文天祥「丹心」 | "红桃牌结算伤害+10" | `ON_SINGLE_CARD_SETTLEMENT` | 逐牌修改计分，在 Stage 1 触发 |
| 李时珍「本草」 | "打出牌时回复" | `ON_PLAY` | 出牌动作触发 |
| 黄巾军「黄天」 | "获得牌权时弃牌摸牌" | `ON_TURN_START` | 回合开始触发 |
| 诸葛亮「料机」 | "【明置】牌不计算分数" | `ON_SINGLE_CARD_SETTLEMENT` + `priority: 20` | 逐牌结算，高优先级（需在加分技能之前归零） |
| 牛皋「猛攻」 | "造成伤害后弃牌" | `AFTER_DAMAGE` | 伤害结算完成后触发 |
| 诸葛亮「先算」 | "摸满手牌后令对方牌明置" | `ON_GAIN_TURN` | 在对方回合开始前触发 |
| 扁鹊「回生」 | "气数降到0时回复一半" | `AFTER_HEALTH_DECREASE` | 扣血后、生命值判定前触发 |
| 匈奴军「狼狩」 | "单牌结算后回复气数" | `AFTER_SINGLE_CARD_SETTLEMENT` | 单牌结算完成后触发 |
| 八旗军「骑射」 | "对方无法用单张响应" | `PASSIVE_MODIFIER` | 通过 PassiveSkillUtils 注册封锁类型 |

### 2.4 priority 机制

`priority` 值越小越先执行。默认值 100。
- 诸葛亮「料机」`priority: 20`：需在文天祥「丹心」（`priority: 8`）之前执行，先归零再让其他技能加分
- 韩信「点兵」`priority: 10`：系数类技能通常偏低，先于其他修改
- 大多数技能使用默认或接近默认值

---

## 3. 使用 async/await 确保流程正常

### 3.1 类型签名

```typescript
type SkillExecutor = (
  context: SkillContext,
  visuals: SkillVisualManager,
) => Promise<void>;
```

**技能 `execute` 必须返回 `Promise<void>`**，定义为 `async` 函数。

### 3.2 SkillEventBus 的 async 设计

`SkillEventBus.emit()` 使用 `for...of` + `await`，串行执行所有处理器：

```typescript
async emit(timing: SkillTiming, context: SkillContext): Promise<void> {
  const handlers = this.listeners.get(timing);
  if (!handlers || handlers.length === 0) return;
  for (const handler of handlers) {
    await handler(context);
  }
}
```

调用方（GameScene）统一 `await eventBus.emit(...)`，确保技能全部执行完毕后继续流程。

### 3.3 execute 内必须 await 所有异步操作

技能 `execute` 内部的 tweens、延迟、动画必须全部 `await`，否则动画会被跳过：

```typescript
// ✅ 正确
execute: async (ctx, visuals) => {
  visuals.playSkillTriggerSound();
  await waitForDelay(scene, 100);
  await waitForCounterTween(scene, { ... });
}

// ❌ 错误 — 动画不会等待，视觉效果会丢失
execute: (ctx, visuals) => {
  scene.tweens.add({ ... });   // 无 await
}
```

### 3.4 常用异步操作

```typescript
// 延迟
await waitForDelay(scene, ms);

// Tween
await waitForTween(scene, { targets, x, y, duration, ease });

// 计数器动画
await waitForCounterTween(scene, { from, to, duration, onUpdate });

// 系数增长动画
await animateCoefficientUpdate(scene, label, typeLabel, 1.5, 4.5, 800);

// 伤害倍数增长动画
await animateMultiplierUpdate(scene, label, oldMultiplier, newMultiplier, 800);
```

### 3.5 异常处理

`SkillRunner.executeWithAnimation()` 在 `try/catch` 中包装技能执行，异常会被静默捕获（`console.warn`），不阻塞后续技能或游戏流程。

技能内部可以自行 `try/catch` 处理预期错误：

```typescript
execute: async (ctx, visuals) => {
  try {
    await someRiskyOperation(ctx);
  } catch {
    // 安静的失败，不会传给 SkillRunner
  }
}
```

---

## 4. 技能范例与分类

### 4.1 触发技（SkillDefinition）

**定义结构：**
```typescript
interface SkillDefinition {
  id: string;              // 唯一标识，小写蛇形命名
  name: string;            // 中文名
  description: string;     // 技能描述
  timing: SkillTiming;     // 触发时机
  priority?: number;       // 执行优先级（越小越先，默认 100）
  dialogLines?: string[];  // 角色台词（随机抽取）
  filter: SkillFilter;     // 过滤函数，返回 false 则跳过
  execute: SkillExecutor;  // 技能逻辑
}
```

**现有触发技列表（20 个）：**

| 技能 ID | 名称 | 角色 | timing | 类型 |
|---------|------|------|--------|------|
| `hanxin_dianbing` | 点兵 | 韩信 | ON_DAMAGE_MULTIPLIER_REVEALED | 倍数修改 |
| `lishizhen_bencao` | 本草 | 李时珍 | ON_PLAY | 治疗 |
| `wentianxiang_danxin` | 丹心 | 文天祥 | ON_SINGLE_CARD_SETTLEMENT | 🔧 花色加成 |
| `luocheng_wuqiang` | 舞枪 | 罗成 | ON_SINGLE_CARD_SETTLEMENT | 🔧 花色加成 |
| `xuewanche_xiaorui` | 骁锐 | 薛万彻 | ON_SINGLE_CARD_SETTLEMENT | 🔧 花色加成 |
| `gaoshun_xianzhen` | 陷阵 | 高顺 | ON_SINGLE_CARD_SETTLEMENT | 🔧 花色加成 |
| `zhangfei_duanhe` | 断喝 | 张飞 | ON_SINGLE_CARD_SETTLEMENT | 取消结算 |
| `zhanghan_jueshou` | 绝守 | 章邯 | ON_COEFFICIENT_REVEALED | 系数修改 |
| `bianque_huisheng` | 回生 | 扁鹊 | AFTER_HEALTH_DECREASE | 复活治疗 |
| `niugao_menggong` | 猛攻 | 牛皋 | AFTER_DAMAGE | 弃牌 |
| `nanmanjun_tengjia_black` | 藤甲(黑) | 南蛮军 | ON_SINGLE_CARD_SETTLEMENT | 减伤 |
| `nanmanjun_tengjia_heart` | 藤甲(红桃) | 南蛮军 | ON_SINGLE_CARD_SETTLEMENT | 增伤 |
| `qiangdao_jianjing` | 剪径 | 强盗 | AFTER_DAMAGE | 偷牌 |
| `huangjinjun_huangtian` | 黄天 | 黄巾军 | ON_TURN_START | 弃牌补牌 |
| `zhugeliang_xiansuan` | 先算 | 诸葛亮 | ON_GAIN_TURN | 明置牌 |
| `zhugeliang_liaoji` | 料机 | 诸葛亮 | ON_SINGLE_CARD_SETTLEMENT | 伤害归零 |
| `banner_army_qishe` | 骑射 | 八旗军 | PASSIVE_MODIFIER | 封锁响应 |
| `mongol_army_qianglve` | 抢掠 | 蒙古军 | AFTER_SINGLE_CARD_SETTLEMENT | 抢夺黑桃 |
| `xiliang_army_hanyong` | 悍勇 | 西凉军 | ON_COEFFICIENT_REVEALED | 空手加成 |
| `xiongnu_army_langshou` | 狼狩 | 匈奴军 | AFTER_SINGLE_CARD_SETTLEMENT | 红桃吸血 |

### 4.2 添加新触发技步骤

1. 在 `src/skills/` 下创建文件（如 `MySkill.ts`）
2. 导出 `SkillDefinition` 对象，实现 `filter` 和 `execute`
3. 在 `src/skills/index.ts` 的 `ALL_SKILL_DEFINITIONS` 数组中添加引用和导入
4. 在 `src/models/Character.ts` 对应角色的 `abilities` 中添加 `{ skillId, name, description }`

> **花色加成类技能请使用工厂函数**（见 §4.5），勿逐文件复制粘贴。

### 4.3 触发技范例：韩信「点兵」（倍数类）

```typescript
// src/skills/HanxinDianBing.ts
export const HanxinDianBing: SkillDefinition = {
  id: 'hanxin_dianbing',
  name: '点兵',
  description: '你打出牌的伤害倍数+X，X为打出牌的花色数',
  timing: SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED,
  priority: 10,
  dialogLines: ['多多益善！', '战无不胜，攻无不克！'],

  filter: (ctx) => {
    return ctx.target === 'enemy'
      && ctx.damageInfo !== undefined
      && ctx.centerCardContainers !== undefined
      && ctx.centerCardContainers.length > 0;
  },

  execute: async (ctx, visuals) => {
    const scene = visuals.getScene();
    const { damageInfo, centerCardContainers, multiplierLabel, pattern } = ctx;
    if (!damageInfo || !centerCardContainers || !pattern) return;

    const suitCount = countSuits(pattern.cards);
    if (suitCount === 0) return;

    const oldMultiplier = damageInfo.damageMultiplier;
    const newMultiplier = oldMultiplier + suitCount;

    visuals.playSkillTriggerSound();
    // 花色牌放大动画
    const seenSuits = new Set<string>();
    const cardsToAnimate: Phaser.GameObjects.Container[] = [];
    for (const card of centerCardContainers) {
      const suit = card.getData('suit') as string | undefined;
      if (suit && !seenSuits.has(suit)) {
        seenSuits.add(suit);
        cardsToAnimate.push(card);
      }
    }
    if (cardsToAnimate.length > 0) {
      visuals.animateCardScale(cardsToAnimate, 1.35, 200);
    }

    // 修改伤害倍数和最终伤害
    damageInfo.damageMultiplier = newMultiplier;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * newMultiplier,
    );

    // 倍数标签渐增动画
    if (multiplierLabel) {
      await animateMultiplierUpdate(scene, multiplierLabel,
        oldMultiplier, newMultiplier, 800);
    }
  },
};
```

### 4.4 触发技范例：张飞「断喝」（取消伤害结算类）

```typescript
// src/skills/ZhangFeiDuanHe.ts
export const ZhangFeiDuanHe: SkillDefinition = {
  id: 'zhangfei_duanhe',
  name: '断喝',
  description: '若你手牌数量不大于四张，敌方对你结算伤害时，如果结算到了与你手牌中拥有花色的牌，你直接令已计数伤害归零并无效后续待结算牌',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 5,
  dialogLines: ['燕人张飞在此！', '谁敢与我一战！'],

  filter: (ctx) => {
    if (ctx.target !== 'player') return false;
    if (!ctx.singleCard) return false;
    const hand = ctx.battle.player.hand;
    if (hand.length > 4) return false;
    const cardSuit = ctx.singleCard.card.getData('suit') as string;
    return hand.some(c => c.suit === cardSuit);
  },

  execute: async (ctx, visuals) => {
    visuals.playSkillTriggerSound();
    await waitForDelay(ctx.gameScene, 200);
    visuals.cancelDamageSettlement();  // 使用 SkillVisualManager 提供的接口
  },
};
```

### 4.5 花色加成类技能 — 使用工厂函数

对于"某花色牌结算时计分 +N"类技能，**不要逐文件复制粘贴**。使用 `SkillUtils.ts` 中的 `createSuitScoreBonusSkill()` 工厂函数：

```typescript
// src/skills/WenTianxiangDanXin.ts（实际代码 ~8 行）
import { createSuitScoreBonusSkill } from './SkillUtils';

export const WenTianxiangDanXin = createSuitScoreBonusSkill({
  id: 'wentianxiang_danxin',
  name: '丹心',
  description: '单牌伤害结算时，你的红桃牌计分+10',
  suit: 'heart',
  bonus: 10,
  dialogLines: ['人生自古谁无死，留取丹心照汗青！'],
});
```

工厂函数签名：
```typescript
function createSuitScoreBonusSkill(config: {
  id: string; name: string; description: string;
  suit: 'spade' | 'club' | 'heart' | 'diamond';  // 触发花色
  bonus: number;                                   // 计分加成
  dialogLines: string[];                           // 角色台词
}): SkillDefinition
```

内部复用 `SkillUtils.modifyCardDamage()`，统一处理分数修正动画。当前使用此模式的技能：文天祥「丹心」、罗成「舞枪」、薛万彻「骁锐」、高顺「陷阵」。

### 4.6 触发技范例：黄巾军「黄天」（回合开始类）

```typescript
// src/skills/HuangjinJunHuangTian.ts
export const HuangjinJunHuangTian: SkillDefinition = {
  id: 'huangjinjun_huangtian',
  name: '黄天',
  description: '获得牌权时，随机弃置一张点数最小的牌并摸一张',
  timing: SkillTiming.ON_TURN_START,
  priority: 100,

  filter: (ctx) => ctx.battle.enemy.hand.length > 0,

  execute: async (ctx, visuals) => {
    const hand = ctx.battle.enemy.hand;
    // ... 找到最小点数索引 ...
    visuals.playSkillTriggerSound();
    await discardCardsFromHand(ctx.gameScene, 'enemy', [idx]);
    await drawCardsToHand(ctx.gameScene, 'enemy', 1);
  },
};
```

### 4.7 主动技（ActiveSkillDefinition）

**定义结构：**
```typescript
interface ActiveSkillDefinition {
  id: string;
  name: string;
  description: string;
  maxUses: number;            // 最大使用次数
  cardFilter: (selectedCards: Card[]) => boolean;
  execute: (scene: Phaser.Scene, selectedCards: Card[]) => Promise<void>;
  ownerCharacterId: string;   // 必须指定归属角色
}
```

- 主动技**不走事件总线**，通过 UI 按钮由玩家主动触发
- 当选中牌通过 `cardFilter` 时显示对应技能按钮
- 主动技按钮与「出牌」「不出」按钮并列

**现有主动技：** 刘伯温「筹策」（限 1 次，选两张牌创造临时牌）。

### 4.8 添加新主动技步骤

1. 在 `src/skills/` 下创建文件，导出 `ActiveSkillDefinition`
2. 在 `src/skills/index.ts` 中导入并导出
3. 在 `GameScene.initActiveSkills()` 中注册
4. 在 `src/models/Character.ts` 对应角色的 `abilities` 中添加

---

## 5. 其他重要内容

### 5.1 SkillContext 字段解析

| 字段 | 类型 | 填充时机 | 说明 |
|------|------|---------|------|
| `gameScene` | `Phaser.Scene` | 始终填充 | 当前场景引用 |
| `battle` | `BattleState` | 始终填充 | 对战状态（手牌/牌堆/血量） |
| `sourceCharacterId` | `string` | 由 SkillRunner 设置 | 当前技能归属的角色 ID |
| `target` | `'enemy' \| 'player'` | 出牌/伤害相关 timing | 当前操作的目标方 |
| `pattern` | `HandPattern` | ON_PLAY 之后 | 当前打出的牌型 |
| `playedCards` | `Card[]` | ON_PLAY | 打出的牌（Card 对象数组） |
| `centerCardContainers` | `Container[]` | ON_PLAY 之后 | 中央区域的牌容器引用 |
| `coefficientLabel` | `Text` | ON_COEFFICIENT_REVEALED | 系数标签文本引用 |
| `multiplierLabel` | `Text` | ON_DAMAGE_MULTIPLIER_REVEALED | 伤害倍数标签文本引用 |
| `damageInfo` | `object` | 系数/伤害/倍数相关 timing | sumRanks, coefficient, baseCoefficient, damageMultiplier, finalDamage |
| `singleCard` | `object` | ON_SINGLE_CARD_SETTLEMENT | 当前结算牌：card, scoreText, baseScore, scoreBonus |
| `playerCharacterIds` | `string[]` | 始终填充 | 玩家角色 ID 数组 |
| `enemyCharacterId` | `string` | 始终填充 | 敌方角色 ID |
| `isEmptyHand` | `boolean` | ON_PLAY | 是否空手出牌 |
| `aiScoreContext` | `object` | ON_AI_SCORE | AI 打分上下文 |
| `handValidation` | `object` | HAND_VALIDATION | 手牌验证上下文 |

### 5.2 SkillFilter 使用技巧

`filter` 决定技能是否应在当前上下文触发，**返回 `false` 则技能被跳过**。

检查要点：
- `ctx.target` 方向：攻击时 `'enemy'`，受伤时 `'player'`
- 必要字段是否为 `undefined`：`damageInfo`、`singleCard`、`centerCardContainers`
- 花色/点数条件：通过 `ctx.singleCard.card.getData('suit')` 获取
- 血量条件：`ctx.battle.player.vitality < ctx.battle.player.vitalityMax`
- 角色归属：`ctx.playerCharacterIds.includes('角色ID')`
- 手牌数量：`ctx.battle.enemy.hand.length >= N`

**filter 应该是纯判定函数，不应修改任何状态。**

### 5.3 SkillRegistry.registerForBattle 机制

技能与角色通过此方法在进入对战时动态绑定：

```typescript
registry.registerForBattle(
  allSkills,                              // 所有技能定义
  playerCharacters,                       // [{ id, abilities: [{ skillId }] }]
  enemyCharacters,                        // [{ id, abilities: [{ skillId }] }]
);
```

- 遍历角色 `abilities`，收集 `skillId`，建立 `skillId → characterId` 映射
- 只注册当前对战中角色拥有的技能
- `SkillRunner` 通过 `getSkillOwner(skillId)` 获取归属角色以执行动画

### 5.4 弃置牌与清空重摸机制

弃牌统一通过 `src/utils/CardActions.ts` 的 `discardCardsFromHand()` 处理。调用方不需要处理清空重摸。

摸牌使用 `drawCardsToHand(scene, target, count)`，自动处理牌堆不足时重洗弃牌堆。

转移/偷取类技能使用 `{ skipDiscardPile: true }` 选项防止牌进入弃牌堆，并使用 `addCardsToHand()` 将牌加入对方手牌。

### 5.5 状态重置规范

所有 Scene 必须遵循 `resetSceneState()` 模式（详见 `AGENTS.md`）。技能相关重置应在 `resetSceneState()` 中完成：

```typescript
private resetSceneState(): void {
  // 技能系统重置
  this.skillEventBus?.clear();
  this.skillRegistry?.clear();
  this.activeSkills = [];
  this.activeSkillButtons = [];
  // ...
  this.tweens.killAll();
}
```

---

## 6. 常见错误与注意事项

1. **不要在 filter 中修改状态** — filter 应该是纯判断函数
2. **不要手写角色头像动画** — glowOn/moveToFront/shakeAndPulse 由 SkillRunner 自动调用
3. **务必 await 动画** — 不 await 会导致动画被跳过或发生竞态
4. **技能 ID 必须唯一** — 不可与已有技能 ID 重复
5. **同时注册 index.ts 和 Character.ts** — 漏注册会导致技能不生效
6. **ON_SINGLE_CARD_SETTLEMENT 修改 scoreBonus** — 不要直接修改 sumRanks
7. **ON_COEFFICIENT_REVEALED 修改 coefficient** — 并同步重算 finalDamage（公式：`round(sumRanks × coefficient × damageMultiplier)`）
8. **ON_DAMAGE_MULTIPLIER_REVEALED 修改 damageMultiplier** — 并同步重算 finalDamage（同上公式）
9. **主动技的 execute 签名为 `(scene, selectedCards)`** — 不是 `(ctx, visuals)`
