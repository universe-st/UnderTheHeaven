# 伤害结算动画 — 设计规格

## 概述

将当前直接扣血的逻辑替换为五阶段结算动画，让玩家看清伤害的计算过程。

## 动画阶段

| 阶段 | 时长 | 描述 |
|------|------|------|
| 1. 逐牌揭示 | N × 60ms | 场中牌从左到右依次放大缩回，伤害计数器逐张增加 rank 值 |
| 2. 系数标签 | 200ms 渐入 + 100ms 保持 | 计数器右移，右侧出现"✖️ 系数（牌型）"；清空手牌时再出现"✖️ 5（清空手牌）" |
| 3. 计数增长 | 600ms | 标签消失，计数器从 rank 之和增长到最终伤害值，移动到屏幕中央 |
| 4. 飞向血条 | 250ms | 伤害数字飞向受伤角色的血条位置 |
| 5. 血条扣减 | 300ms | 血条宽度平滑过渡到新值，文字同步更新 |

## 核心方法

### `playDamageSettlement(pattern, target, isEmptyHand, onComplete)`

- `pattern: HandPattern` — 造成伤害的牌型
- `target: 'enemy' | 'player'` — 受伤方
- `isEmptyHand: boolean` — 是否清空手牌（触发 ×5）
- `onComplete: () => void` — 动画完成后回调（继续回合或 GameOver）

### `animateHealthBarDepletion(target, newVitality, duration, onComplete)`

- 将指定角色的 `vitality` 从当前值平滑过渡到 `newVitality`
- 每帧重绘血条

## 修改点

1. **`DamageCalculator.ts`** — 导出 `getCoefficient(handType, length)` 供 UI 显示系数
2. **`GameScene.ts`** — 新增 `playDamageSettlement` 和 `animateHealthBarDepletion`
3. **6 处原始伤害点** — 替换 `vitality -= dmg` + `showFloatingText()` 为 `playDamageSettlement()`
   - `executePlay` L734（玩家清空手牌）
   - `handlePostPlayEmptyHandCheck` L766（无动画路径清空手牌）
   - `executePass('player')` L815
   - `executePass('enemy')` L837
   - `aiRespond` L935（AI 清空手牌）
   - `aiInitiatePlay` L1018（AI 清空手牌）

## 节奏参数

- 每卡缩放: 30ms 放大 + 30ms 缩回（ease: Sine.easeIn / Sine.easeOut）
- Card stagger: 60ms
- 标签渐入: 200ms（alpha 0→1），保持 100ms
- 标签消失: 150ms（alpha 1→0）
- 计数增长: 600ms（Cubic.easeOut）
- 飞行: 250ms（Back.easeIn）
- 血条过渡: 300ms（Sine.easeInOut）
