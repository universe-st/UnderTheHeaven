# 四象印（Four Seals）需求规格

> 日期：2026-08-02
> 状态：已与用户确认

## 1. 背景与目标

新增「四象印」设定：青龙、白虎、朱雀、玄武四印可盖在扑克牌上。
黄金台（商店）会按概率刷新**扑克牌商品**（全新商品类型，购买后进入己方牌库），
其中 25% 的扑克牌带四印之一，带印牌价格 +10。
带印牌在战斗中打出时触发对应四印效果。

素材来源：`/Users/kuangshensheng/Downloads/Four_Symbols_split`（青龙/白虎/朱雀/玄武 各 SVG+PNG，PNG 约 800×800 RGBA 透明底）。

## 2. 已确认的设计决策（用户选定）

| 决策项 | 结论 |
|--------|------|
| 四印名 | 青龙（非「青雀」，与素材一致）：青龙、白虎、朱雀、玄武 |
| 青龙效果 | 计算伤害得分 +10（sumPoints +10，参与系数乘法） |
| 朱雀效果 | 牌型系数 +1（coefficient +1，加入 baseCoefficient 供技能重算） |
| 玄武效果 | 打出时回复等同于得分的气数（回复 sumPoints，上限 vitalityMax） |
| 白虎效果 | 伤害数字结算两次：动画中数字跳两次、每次等额，实际总伤害 = 单次伤害 ×2 |
| 带印商品 | 仅黄金台刷出的**扑克牌**（角色/卜辞/天命回复不带印） |
| 扑克牌定价 | 按点数：3→3、…、10→10、J→11、Q→12、K→13、A→15、2→20、虎→25、龙→30；带印再 +10 |
| 货架结构 | 扑克牌是其中一种随机商品类型，按概率出现，可能一台都不出 |

## 3. 设计

### 3.1 四印类型与常量（`src/models/FourSeal.ts`）

```ts
export type FourSeal = 'qinglong' | 'baihu' | 'zhuque' | 'xuanwu';
export const FOUR_SEALS: readonly FourSeal[];
export const SEAL_LABELS: Record<FourSeal, string>;      // 青龙/白虎/朱雀/玄武
export const SEAL_IMAGE_KEYS: Record<FourSeal, string>;  // seal_qinglong 等
export const SEAL_CHANCE = 0.25;      // 扑克牌带印概率
export const SEAL_PRICE_EXTRA = 10;   // 带印加价
export const CARD_SLOT_CHANCE = 0.35; // 货架卜辞槽位变扑克牌槽位的概率
export function randomSeal(rng): FourSeal | null; // 25% 带印，四印等概率
```

### 3.2 卡牌模型（`src/models/Card.ts`）

`Card` 接口新增可选字段 `seal?: FourSeal`（`import type { FourSeal } from './FourSeal'`）。
印随牌走：购买的带印牌进入牌池后永久保留，每场战斗融合进玩家牌库，每次打出都触发。

### 3.3 商店模型（`src/models/Shop.ts`）

- `ShopItem` 新增 `{ kind: 'card'; card: Card; price: number }`。
- `cardPrice(card) = card.rank`（虎 25 / 龙 30）；带印时 `+ SEAL_PRICE_EXTRA`。
- `generateShopStock`：保留现有角色（1-2）/ 天命回复（30%）逻辑；
  **每个卜辞槽位以 `CARD_SLOT_CHANCE` 概率替换为扑克牌槽位**。
  扑克牌生成：54 张标准牌等概率抽一张（随机 suit+rank），25% 概率随机盖一印，uid 用 `getNextCardId()`。
- `purchase()`：`kind 'card'` → `run.cardPool.push({ ...item.card })`（扣款逻辑不变）。

### 3.4 局状态（`src/models/RunState.ts` / `RunManager.ts`）

- `RunState` 新增 `cardPool: Card[]`（已购扑克牌池），`createNewRun` 初始 `[]`。
- 存档兼容：`RunManager.load()` 读取后补默认值 `data.run.cardPool ??= []`（不 bump SAVE_VERSION）。

### 3.5 战斗牌库融合（`GameScene.initBattle`）

现有 `purchasedCards` 融合逻辑复用：
```ts
const purchased = this.testConfig?.purchasedCards
  ?? (runMode ? getRun()?.cardPool : undefined);
```
runMode 下从存档牌池取牌融合进玩家牌库（`{ ...card, uid: getNextCardId() }`，seal 随对象保留）。

### 3.6 四印效果（`src/engine/FourSealEffects.ts` + `DamageSettlementManager`）

纯函数（可单测）：
```ts
export interface DamageInfoLike { sumRanks: number; baseCoefficient: number; coefficient: number; }
export function applySealBonuses(info: DamageInfoLike, seals: readonly FourSeal[]): void
// 青龙：sumRanks += 10 × 青龙张数；朱雀：baseCoefficient += 1 × 朱雀张数、coefficient += 1 × 朱雀张数
export function hasSeal(seals, 'baihu'): boolean
export function xuanwuHealAmount(sumRanks): number  // = sumRanks
```

`DamageSettlementManager.playDamageSettlement` 集成：
1. 结算开头（`damageInfo` 初始化后、stage1 前）：收集 `pattern.cards` 中所有 seal，
   仅 `target === 'enemy'` 时（玩家打出）调用 `applySealBonuses`，随后重算 `finalDamage`。
   **朱雀加成必须抬 `baseCoefficient`**（与卜辞加成一致），保证章邯「绝守」等
   以 `baseCoefficient` 重算的技能不丢失四印加成。
2. 玄武：`target === 'enemy'` 且含玄武印时，结算末尾回复玩家气数 = `sumRanks`
   （上限 vitalityMax），复用 `showHeal` 式动画（绿色 +N 数字 + sfx_heal）。
   满血时不触发（参照李时珍「本草」filter）。
3. 白虎：`target === 'enemy'` 且含白虎印时，伤害结算执行两次（每次等额 finalDamage，
   观感连击）：拆分现有 stage3 扣血段为可复用子流程，第一段正常结算，
   第二段重新生成计数数字并再次扣血；总伤害 = finalDamage × 2。

同手多印叠加规则：
- 青龙/朱雀：每张带印牌各 +10 / +1，可叠加。
- 白虎：每手最多触发一次（多张白虎不 ×4）。
- 玄武：每手回复一次 sumPoints（多张不翻倍）。

### 3.7 显示

- **LoadingScene**：注册 `seal_qinglong / seal_baihu / seal_zhuque / seal_xuanwu` 图片。
- **ShopScene**：扑克牌商品卡显示牌面（suit 符号 + rankLabel，王显示「虎/龍」+ 图案）、
  带印时显示印徽标（`seal_*` 图，等比缩放）与「四象·青龙」小字、价格含 +10 提示。
- **CardDisplayManager.createCardDisplay**：`card.seal` 存在时，卡面中央添加小印徽标。

## 4. 影响面

| 文件 | 改动 |
|------|------|
| `src/models/FourSeal.ts` | 新增 |
| `src/models/Card.ts` | Card 加 `seal?` |
| `src/models/Shop.ts` | ShopItem 加 kind 'card'、生成逻辑、purchase |
| `src/models/RunState.ts` | RunState 加 `cardPool` |
| `src/models/RunManager.ts` | load() 兼容补字段 |
| `src/engine/FourSealEffects.ts` | 新增纯函数 |
| `src/scenes/managers/DamageSettlementManager.ts` | 四印结算集成（白虎拆两次） |
| `src/scenes/GameScene.ts` | initBattle 读 cardPool |
| `src/scenes/ShopScene.ts` | 扑克牌商品渲染 |
| `src/scenes/managers/CardDisplayManager.ts` | 印角标 |
| `src/scenes/LoadingScene.ts` | 注册 4 张图片 |
| `public/seal_*.png` | 新增素材 |
| 测试 | Shop.test、FourSealEffects.test |

## 5. 不做（本期范围外）

- 敌方不带印；锦囊牌/事件牌不带印。
- 不接入技能事件总线（四印效果在结算链路内实现，不新增 SkillTiming）。
- 扑克牌商品不参与「特价商品」等未实现机制。

## 6. 验收标准

1. 黄金台偶发刷新扑克牌商品，价格 = 点数（带印 +10），带印牌显示对应印徽标。
2. 购买扑克牌后进入牌池（`run.cardPool`），下一场战斗融合进玩家牌库。
3. 打出带印牌：青龙 +10 分、朱雀 系数 +1、玄武 回 sumPoints 气、白虎 数字结算两次总伤 ×2。
4. 旧存档加载不报错，`cardPool` 自动补空数组。
5. `npm run test` 与 `npm run build` 通过。
