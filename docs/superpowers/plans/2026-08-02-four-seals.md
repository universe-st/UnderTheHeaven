# 实现计划：四象印（Four Seals）

> 日期：2026-08-02
> 规格：[2026-08-02-four-seals-design.md](../specs/2026-08-02-four-seals-design.md)

## 步骤

1. **素材**：拷贝 `Four_Symbols_split/*.png` → `public/seal_qinglong.png`、`seal_baihu.png`、`seal_zhuque.png`、`seal_xuanwu.png`；LoadingScene `loadAssets()` 注册 4 张图片。
2. **模型层**：
   - 新增 `src/models/FourSeal.ts`（类型 + 常量 + `randomSeal`）。
   - `Card.ts` 加 `seal?: FourSeal`。
   - `Shop.ts`：`ShopItem` 加 `kind 'card'`；`cardPrice()`；`generateShopStock` 卜辞槽位按概率替换为扑克牌；`purchase` 入 `cardPool`。
   - `RunState.ts` 加 `cardPool: Card[]`；`RunManager.load()` 补默认值。
3. **战斗效果**：新增 `src/engine/FourSealEffects.ts` 纯函数；`DamageSettlementManager` 集成青龙/朱雀（结算开头抬 sumRanks/baseCoefficient）、玄武（结算末回血）、白虎（扣血段拆两次）。
4. **商店与融合**：`ShopScene` 渲染扑克牌商品（牌面 + 印徽标 + 价格）；`GameScene.initBattle` runMode 下从 `getRun()?.cardPool` 融合。
5. **印角标**：`CardDisplayManager.createCardDisplay` 按 `card.seal` 显示小印徽标。
6. **测试**：`Shop.test` 补扑克牌生成/定价/带印/购买用例；新增 `FourSealEffects.test`。
7. **验证**：`npm run test` + `npm run build`。
8. **文档**：更新 `docs/design/game/05-战间系统.md`（黄金台商品类型）与 `06-牌与道具系统.md`（四象印章节）。

## 关键实现细节

- 朱雀系数加成同时抬 `baseCoefficient` 与 `coefficient`（与卜辞加成一致），避免章邯「绝守」重算丢失。
- 白虎扣血段从 `stage3ApplyDamage` 中拆出 `applyDamageOnce(...)`，第一段正常、第二段重建计数数字再扣一次。
- 商店扑克牌生成用 `getNextCardId()` 分配 uid，购买后 `{ ...card }` 入 `cardPool`（seal 保留）。
- 战斗融合复用现有 `purchasedCards` 逻辑，runMode 下改为读 `run.cardPool`；测试模式（testConfig.purchasedCards）优先。
