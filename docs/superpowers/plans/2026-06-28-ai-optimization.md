# AI 决策优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize enemy AI with per-character BotProfile personalities and skill-linked `onAIDecision` hooks.

**Architecture:** Parameterize the existing scoring engine with `BotProfile` configs per enemy; add `onAIDecision` to `SkillDefinition` for skill-specific decision influence; engine stays decoupled via injected callback.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add BotProfile types to AIBrain.ts

**Files:**
- Modify: `src/engine/AIBrain.ts` (add types at top)

- [ ] **Step 1: Add typedoc comment and new interfaces**

```typescript
// Add after the existing threshold constants (line ~18)

// ========== AI 个性档案类型 ==========

export interface ScoreWeights {
  damageWeight: number;
  clearingWeight: number;
  comboPreserveWeight: number;
  savingMaterialWeight: number;
  closeMarginBonus: number;
  complexityWeight: number;
}

export interface SelectionConfig {
  candidateCount: number;
  randomThreshold: number;
}

export interface BotProfile {
  aggression: number;
  comboPreference: number;
  handClearingTendency: number;
  weights: ScoreWeights | null;
  selection: SelectionConfig;
  passThreshold: number;
  bombOverride: { base: number; fuzzRange: number } | null;
}

export interface AIDecisionContext {
  hand: Card[];
  battleState: BattleState;
  lastPlay: HandPattern | null;
  isFollow: boolean;
}

export interface ScoredPlay {
  play: HandPattern;
  score: number;
}
```

- [ ] **Step 2: Add DEFAULT_WEIGHTS after the new types**

```typescript
export const DEFAULT_WEIGHTS: ScoreWeights = {
  damageWeight: 0.05,
  clearingWeight: 3,
  comboPreserveWeight: 2,
  savingMaterialWeight: 3,
  closeMarginBonus: 4,
  complexityWeight: 4,
};
```

- [ ] **Step 3: Run build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/AIBrain.ts
git commit -m "feat(ai): add BotProfile types and ScoreWeights"
```

---

### Task 2: Add AIDecisionHook type to SkillTypes.ts

**Files:**
- Modify: `src/skills/SkillTypes.ts`

- [ ] **Step 1: Import AIDecisionContext type (or define it locally)**

Since `SkillTypes.ts` is in `skills/` and `AIDecisionContext` is in `engine/AIBrain.ts`, we need to decide the import direction. To keep `engine/` from importing `skills/`, define the context types in a shared location or duplicate the minimal interface.

Best approach: define `AIDecisionHook` in `SkillTypes.ts` using inline types to avoid cross-layer import:

```typescript
// Add near the bottom of SkillTypes.ts, before the ActiveSkillDefinition section

import type { HandPattern } from '../models/BattleTypes';
import type { Card } from '../models/Card';

// Add these after the existing ScoredPlay would be defined, but since
// we keep it decoupled, define it here too.

export interface AIDecisionContext {
  hand: Card[];
  battleState: import('../models/BattleTypes').BattleState;
  lastPlay: HandPattern | null;
  isFollow: boolean;
}

export type AIDecisionHook = (
  plays: { play: HandPattern; score: number }[],
  ctx: AIDecisionContext,
) => void;
```

- [ ] **Step 2: Add optional onAIDecision to SkillDefinition**

```typescript
// In SkillDefinition interface, after execute:
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  timing: SkillTiming;
  priority?: number;
  dialogLines?: string[];
  filter: SkillFilter;
  execute: SkillExecutor;
  /** AI 决策钩子：仅敌人技能实现，AI 评估出牌时调用修改评分 */
  onAIDecision?: AIDecisionHook;
}
```

- [ ] **Step 3: Run build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/skills/SkillTypes.ts
git commit -m "feat(ai): add AIDecisionHook and SkillDefinition.onAIDecision"
```

---

### Task 3: Add getSkillsByCharacter to SkillRegistry

**Files:**
- Modify: `src/skills/SkillRegistry.ts`

- [ ] **Step 1: Add method to SkillRegistry class**

```typescript
// Add after getSkillsByTiming()

  getSkillsByCharacter(characterId: string): SkillDefinition[] {
    const skillIds: string[] = [];
    for (const [skillId, owner] of this.skillOwnerMap) {
      if (owner === characterId) skillIds.push(skillId);
    }
    return this.skills.filter(s => skillIds.includes(s.id));
  }
```

- [ ] **Step 2: Run build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run existing tests**

Run: `npm run test`
Expected: all pass (existing SkillRegistry tests unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/skills/SkillRegistry.ts
git commit -m "feat(ai): add getSkillsByCharacter method to SkillRegistry"
```

---

### Task 4: Parameterize scorePlay with profile

**Files:**
- Modify: `src/engine/AIBrain.ts`

- [ ] **Step 1: Modify scorePlay signature and add weight application**

Change `scorePlay` from:
```typescript
function scorePlay(
  play: HandPattern,
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId?: EnemyCharacterId,
): number {
  let score = 0;
  const damage = calculateDamage(play);
  score += damage * 0.05;
  score += play.cards.length * 3;
  // etc...
```

To:
```typescript
function scorePlay(
  play: HandPattern,
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId?: EnemyCharacterId,
  profile?: BotProfile,
): number {
  const w = profile?.weights ?? DEFAULT_WEIGHTS;
  let score = 0;

  const damage = calculateDamage(play);
  score += damage * w.damageWeight;

  score += play.cards.length * w.clearingWeight;

  // 组合完整保护
  const remaining = getRemainingHand(hand, play.cards);
  if (remaining.length > 0) {
    const remainingPlays = findAllPlays(remaining);
    const goodComboCount = remainingPlays.filter(p =>
      COMPLEX_COMBO_TYPES.has(p.type),
    ).length;
    score += goodComboCount * w.comboPreserveWeight;
  }

  // 接牌节省性
  if (isFollow && lastPlay) {
    const margin = play.mainValue - lastPlay.mainValue;
    score -= margin * w.savingMaterialWeight;
    if (margin <= 2) score += w.closeMarginBonus;
  }

  // 牌型复杂度
  if (!isFollow) {
    const priority = patternPriority(play.type);
    const pref = profile?.comboPreference ?? 0.5;
    score += (11 - priority) * w.complexityWeight * pref;
  }

  // 新增：血量压力
  // (computed in selectPlay from battleState)

  // 新增：最少浪费（顺子/连对/飞机奖励从最小开出）
  if (play.type === HandType.Straight || play.type === HandType.ConsecutivePairs ||
      play.type === HandType.Airplane || play.type === HandType.AirplaneSingle ||
      play.type === HandType.AirplanePair) {
    const minCard = [...play.cards].sort((a, b) => a.rank - b.rank)[0]!;
    if (minCard.rank === play.mainValue) {
      score += 5;
    }
  }

  // 移除：原南蛮军硬编码（将在 Task 5-6 迁移到 onAIDecision）

  return score;
}
```

- [ ] **Step 2: Modify selectPlay to accept profile**

```typescript
function selectPlay(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId?: EnemyCharacterId,
  profile?: BotProfile,
): HandPattern {
  if (plays.length === 1) return plays[0]!;

  const scored = plays.map(p => ({
    play: p,
    score: scorePlay(p, hand, isFollow, lastPlay, enemyCharacterId, profile),
  }));
  scored.sort((a, b) => b.score - a.score);

  const sel = profile?.selection ?? { candidateCount: 3, randomThreshold: 0.10 };
  const topN = scored.slice(0, Math.min(sel.candidateCount, scored.length));
  const bestScore = topN[0]!.score;

  const closeCandidates = topN.filter(s => {
    if (bestScore <= 0) return true;
    return (bestScore - s.score) / bestScore < sel.randomThreshold;
  });

  if (closeCandidates.length > 1) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)]!.play;
  }
  return topN[0]!.play;
}
```

- [ ] **Step 3: Run test to verify existing behavior preserved**

Run: `npm run test`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/engine/AIBrain.ts
git commit -m "feat(ai): parameterize scorePlay and selectPlay with profile"
```

---

### Task 5: Add BOT_PROFILES constant and pass to decidePlay

**Files:**
- Modify: `src/engine/AIBrain.ts`

- [ ] **Step 1: Add BOT_PROFILES constant before decidePlay**

```typescript
// ========== AI 个性档案 ==========

const BOT_PROFILES: Record<EnemyCharacterId, BotProfile> = {
  shizu: {
    aggression: 0.3,
    comboPreference: 0.3,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 2, randomThreshold: 0.05 },
    passThreshold: 0.2,
    bombOverride: null,
  },
  huangjinjun: {
    aggression: 0.6,
    comboPreference: 0.4,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.0,
    bombOverride: null,
  },
  nanmanjun: {
    aggression: 0.5,
    comboPreference: 0.5,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  qiangdao: {
    aggression: 0.5,
    comboPreference: 0.4,
    handClearingTendency: 0.4,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  banner_army: {
    aggression: 0.5,
    comboPreference: 0.3,
    handClearingTendency: 0.2,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  mongol_army: {
    aggression: 0.7,
    comboPreference: 0.4,
    handClearingTendency: 0.4,
    weights: null,
    selection: { candidateCount: 4, randomThreshold: 0.15 },
    passThreshold: 0.0,
    bombOverride: null,
  },
  xiliang_army: {
    aggression: 0.8,
    comboPreference: 0.6,
    handClearingTendency: 0.6,
    weights: null,
    selection: { candidateCount: 4, randomThreshold: 0.20 },
    passThreshold: 0.3,
    bombOverride: null,
  },
  xiongnu_army: {
    aggression: 0.4,
    comboPreference: 0.3,
    handClearingTendency: 0.2,
    weights: null,
    selection: { candidateCount: 2, randomThreshold: 0.08 },
    passThreshold: 0.3,
    bombOverride: null,
  },
};
```

- [ ] **Step 2: Modify decidePlay to accept adjustPlayScores callback**

```typescript
export function decidePlay(
  battleState: BattleState,
  adjustPlayScores?: (plays: ScoredPlay[], ctx: AIDecisionContext) => void,
): Card[] | null {
  const aiHand = battleState.enemy.hand;
  const enemyCharId = battleState.enemyCharacterId;
  const profile = enemyCharId ? BOT_PROFILES[enemyCharId] : undefined;

  // ... same generate all/beating plays ...

  // ---- 主动出牌模式 ----
  if (battleState.phase === 'play') {
    const allPlays = generateAllPlays(aiHand);
    if (allPlays.length === 0) return null;

    const bombs = allPlays.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );
    const normalPlays = allPlays.filter(
      p => p.type !== HandType.Bomb && p.type !== HandType.Rocket,
    );

    if (normalPlays.length > 0) {
      const selected = selectPlayWithHooks(
        normalPlays, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }

    if (bombs.length > 0) {
      const selected = selectPlayWithHooks(
        bombs, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }

    return null;
  }

  // ---- 接牌模式 ----
  if (!battleState.lastPlay) return null;

  const beating = generateBeatingPlays(aiHand, battleState.lastPlay);
  if (beating.length > 0) {
    const sameTypeBeating = beating.filter(
      p => p.type === battleState.lastPlay!.type,
    );
    if (sameTypeBeating.length > 0) {
      const selected = selectPlayWithHooks(
        sameTypeBeating, aiHand, true, battleState.lastPlay, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }

    const bombBeating = beating.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );
    if (bombBeating.length > 0) {
      const selected = selectPlayWithHooks(
        bombBeating, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }
  }

  // ---- 炸弹强行接管 ----
  const lastType = battleState.lastPlay.type;
  if (lastType !== HandType.Bomb && lastType !== HandType.Rocket) {
    const allPlays = generateAllPlays(aiHand);
    const bombPlays = allPlays.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );

    const bombCfg = profile?.bombOverride;
    const handSize = aiHand.length;
    const opponentHandSize = battleState.player.hand.length;
    const use = bombCfg
      ? (handSize <= bombCfg.base + (Math.floor(Math.random() * (bombCfg.fuzzRange * 2 + 1)) - bombCfg.fuzzRange) ||
         opponentHandSize <= bombCfg.base + (Math.floor(Math.random() * (bombCfg.fuzzRange * 2 + 1)) - bombCfg.fuzzRange))
      : shouldUseBomb(handSize, opponentHandSize);

    if (bombPlays.length > 0 && use) {
      const selected = selectPlayWithHooks(
        bombPlays, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }
  }

  // ---- 放弃判定（passThreshold） ----
  // 有合法接牌但 passThreshold 高于最高评分时放弃
  if (profile && profile.passThreshold > 0 && beating.length > 0) {
    const ctx: AIDecisionContext = {
      hand: aiHand,
      battleState,
      lastPlay: battleState.lastPlay,
      isFollow: true,
    };
    const topScored = scorePlayCandidates(beating, aiHand, true, battleState.lastPlay, enemyCharId, profile, adjustPlayScores, battleState);
    if (topScored.length > 0 && topScored[0]!.score < profile.passThreshold * 50) {
      return null;
    }
  }

  return null;
}
```

- [ ] **Step 3: Add helper functions**

```typescript
function scorePlayCandidates(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId: EnemyCharacterId | undefined,
  profile: BotProfile | undefined,
  adjustPlayScores: ((plays: ScoredPlay[], ctx: AIDecisionContext) => void) | undefined,
  battleState: BattleState,
): ScoredPlay[] {
  const scored: ScoredPlay[] = plays.map(p => ({
    play: p,
    score: scorePlay(p, hand, isFollow, lastPlay, enemyCharacterId, profile),
  }));

  // 血量压力修正
  if (profile && battleState) {
    const opponentVitality = isFollow
      ? battleState.player.vitality
      : battleState.enemy.vitality;
    for (const s of scored) {
      const damage = calculateDamage(s.play);
      if (damage >= opponentVitality) {
        s.score += 30 * profile.aggression;
      } else if (opponentVitality - damage < opponentVitality * 0.3) {
        s.score += 15 * profile.aggression;
      }
    }
  }

  // 调用外部钩子（onAIDecision）
  if (adjustPlayScores) {
    adjustPlayScores(scored, {
      hand,
      battleState,
      lastPlay,
      isFollow,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function selectPlayWithHooks(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId: EnemyCharacterId | undefined,
  profile: BotProfile | undefined,
  adjustPlayScores: ((plays: ScoredPlay[], ctx: AIDecisionContext) => void) | undefined,
  battleState: BattleState,
): HandPattern | undefined {
  const scored = scorePlayCandidates(plays, hand, isFollow, lastPlay, enemyCharacterId, profile, adjustPlayScores, battleState);
  if (scored.length === 0) return undefined;
  if (scored.length === 1) return scored[0]!.play;

  const sel = profile?.selection ?? { candidateCount: 3, randomThreshold: 0.10 };
  const topN = scored.slice(0, Math.min(sel.candidateCount, scored.length));
  const bestScore = topN[0]!.score;

  const closeCandidates = topN.filter(s => {
    if (bestScore <= 0) return true;
    return (bestScore - s.score) / bestScore < sel.randomThreshold;
  });

  if (closeCandidates.length > 1) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)]!.play;
  }
  return topN[0]!.play;
}
```

Note: The existing `selectPlay` and `scorePlay` functions remain for backward compatibility but should be used by internal calls only. The new entry point functions `scorePlayCandidates` and `selectPlayWithHooks` wrap them with hook injection.

- [ ] **Step 4: Run test to verify existing behavior preserved**

Run: `npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/AIBrain.ts
git commit -m "feat(ai): add BOT_PROFILES and hook integration to decidePlay"
```

---

### Task 6: Migrate Nanmanjun hardcoded scoring to onAIDecision

**Files:**
- Modify: `src/skills/NanmanJunTengJia.ts`
- Modify: `src/engine/AIBrain.ts` (remove lines 125-130)

- [ ] **Step 1: Read current NanmanJunTengJia.ts content**

Run: `cat src/skills/NanmanJunTengJia.ts`

- [ ] **Step 2: Add onAIDecision to Nanmanjun skill definition**

```typescript
// In NanmanJunTengJia.ts, after the existing execute function
// Add inside the skill definition object:

onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    for (const card of p.play.cards) {
      if (card.suit === 'spade' || card.suit === 'club') p.score += 5;
      if (card.suit === 'heart') p.score -= 10;
    }
  }
},
```

- [ ] **Step 3: Remove the old hardcoded scoring in AIBrain.ts**

Remove lines 124-130 (the `if (enemyCharacterId === 'nanmanjun')` block inside `scorePlay`).

```typescript
      // ⑥ 南蛮军藤甲：偏好打出黑桃牌（敌方黑色牌不计算伤害），避免打出红桃牌
      if (enemyCharacterId === 'nanmanjun') {
        for (const card of play.cards) {
          if (card.suit === 'spade' || card.suit === 'club') score += 5;
          if (card.suit === 'heart') score -= 10;
        }
      }
```

- [ ] **Step 4: Run build and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/skills/NanmanJunTengJia.ts src/engine/AIBrain.ts
git commit -m "refactor(ai): migrate Nanmanjun hardcoded scoring to onAIDecision hook"
```

---

### Task 7: Add onAIDecision to remaining enemy skills

**Files:**
- Modify: `src/skills/BannerArmyQiShe.ts`
- Modify: `src/skills/HuangjinJunHuangTian.ts`
- Modify: `src/skills/MongolArmyQiangLve.ts`
- Modify: `src/skills/XiongnuArmyLangShou.ts`
- Modify: `src/skills/QiangdaoJianJing.ts`
- Modify: `src/skills/XiliangArmyHanYong.ts`

- [ ] **Step 1: Read each skill file, add onAIDecision to each**

For each file, read it first, then add the `onAIDecision` property to the skill definition object.

**BannerArmyQiShe.ts** — 八旗军：偏好方片单张
```typescript
onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single &&
        p.play.cards[0]?.suit === 'diamond') {
      p.score += 20;
    }
  }
},
```

**HuangjinJunHuangTian.ts** — 黄巾军：优先出最小点数牌（触发黄天弃小摸大）
```typescript
onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    const minRank = Math.min(...p.play.cards.map(c => c.rank));
    // 点数越小加分越多（鼓励出小牌触发黄天）
    p.score += Math.max(0, 15 - minRank) * 1.5;
  }
},
```

**MongolArmyQiangLve.ts** — 蒙古军：偏好黑桃单张（抢掠偷牌）
```typescript
onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single &&
        p.play.cards[0]?.suit === 'spade') {
      p.score += 15;
    }
  }
},
```

**XiongnuArmyLangShou.ts** — 匈奴军：偏好红桃单张（狼狩回血）
```typescript
onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single &&
        p.play.cards[0]?.suit === 'heart') {
      p.score += 15;
    }
  }
},
```

**QiangdaoJianJing.ts** — 强盗：偏好单张（剪径偷牌）
```typescript
onAIDecision: (plays, ctx) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single) {
      p.score += 10;
    }
  }
},
```

**XiliangArmyHanYong.ts** — 西凉军：手牌越少，清空手牌奖励越高
```typescript
onAIDecision: (plays, ctx) => {
  const handSize = ctx.hand.length;
  // 手牌越少，清空式出牌的额外奖励越高
  for (const p of plays) {
    const remaining = p.play.cards.length;
    if (remaining >= handSize) {
      p.score += (handSize <= 3) ? 30 : (handSize <= 6) ? 15 : 5;
    }
    // 大牌型额外奖励
    if (p.play.type === HandType.Straight ||
        p.play.type === HandType.Bomb ||
        p.play.type === HandType.Rocket) {
      p.score += 10;
    }
  }
},
```

- [ ] **Step 2: Run build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/skills/BannerArmyQiShe.ts src/skills/HuangjinJunHuangTian.ts src/skills/MongolArmyQiangLve.ts src/skills/XiongnuArmyLangShou.ts src/skills/QiangdaoJianJing.ts src/skills/XiliangArmyHanYong.ts
git commit -m "feat(ai): add onAIDecision hooks to all enemy skills"
```

---

### Task 8: Integrate in BattleFlowManager

**Files:**
- Modify: `src/scenes/managers/BattleFlowManager.ts`

- [ ] **Step 1: Find the aiRespond method (around line 433) and modify the decidePlay call**

Current code (line 435):
```typescript
const cards = decidePlay(this.host.battle);
```

Change to:
```typescript
const cards = decidePlay(this.host.battle, (plays, ctx) => {
  const enemySkills = this.host.battle.enemyCharacterId
    ? this.host.skillRunner?.getRegistry()?.getSkillsByCharacter(this.host.battle.enemyCharacterId) ?? []
    : [];
  for (const skill of enemySkills) {
    skill.onAIDecision?.(plays, ctx);
  }
});
```

- [ ] **Step 2: Find aiInitiatePlay (around line 510) and apply same change**

Look for the second call to `decidePlay` (in the `aiInitiatePlay` method) and apply the same pattern.

```typescript
const cards = decidePlay(this.host.battle, (plays, ctx) => {
  const enemySkills = this.host.battle.enemyCharacterId
    ? this.host.skillRunner?.getRegistry()?.getSkillsByCharacter(this.host.battle.enemyCharacterId) ?? []
    : [];
  for (const skill of enemySkills) {
    skill.onAIDecision?.(plays, ctx);
  }
});
```

- [ ] **Step 3: Check SkillRunner has getRegistry() accessor**

Read `src/skills/SkillRunner.ts` to confirm the registry is accessible. If `SkillRunner` doesn't expose the registry, the BattleFlowManager needs to receive a reference to `SkillRegistry` instead (passed through constructor).

Add a `getRegistry()` method to `SkillRunner` if not present:

```typescript
// In SkillRunner.ts
getRegistry(): SkillRegistry {
  return this.registry;
}
```

- [ ] **Step 4: Run build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/scenes/managers/BattleFlowManager.ts
git commit -m "feat(ai): wire up onAIDecision hooks in BattleFlowManager"
```

---

### Task 9: Write tests — default profile and backward compatibility

**Files:**
- Modify: `src/engine/__tests__/AIBrain.test.ts`

- [ ] **Step 1: Add test for default weights preserving existing behavior**

```typescript
import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { decidePlay, DEFAULT_WEIGHTS } from '../AIBrain';

// ... existing makeCard / makeBattle helpers ...

describe('decidePlay - BotProfile weights', () => {
  it('default weights match existing scoring behavior for single card hand', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(5)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.rank).toBe(5);
  });

  it('default weights preserve existing pair preference', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(7), makeCard(7, 'club'), makeCard(3)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    // Should pick a pair over single 3 (higher clearing score)
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });

  it('new scoring dimensions default to zero influence', () => {
    resetCardIdCounter();
    // Without profile, scores should be same as before
    const state = makeBattle({
      enemy: { hand: [makeCard(5)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).toEqual([expect.objectContaining({ rank: 5 })]);
  });
});
```

- [ ] **Step 2: Run tests to confirm pass**

Run: `npm run test`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/AIBrain.test.ts
git commit -m "test(ai): add default profile backward compatibility tests"
```

---

### Task 10: Write tests — per-enemy strategy verification

**Files:**
- Modify: `src/engine/__tests__/AIBrain.test.ts`

- [ ] **Step 1: Add enemy-specific strategy tests**

```typescript
import { ENEMY_CHARACTERS } from '../../models/Character';
import type { EnemyCharacterId } from '../../models/Character';

function makeBattleWithEnemy(overrides: Partial<BattleState> = {}, enemyId?: EnemyCharacterId): BattleState {
  return {
    ...makeBattle(overrides),
    enemyCharacterId: enemyId,
  };
}

function makeCardSet(ranks: number[], suits?: Card['suit'][]): Card[] {
  return ranks.map((r, i) => makeCard(r, suits?.[i] ?? 'spade'));
}

describe('decidePlay - enemy strategies', () => {
  // 士卒: conservative, picks smallest
  it('shizu picks smallest card when leading', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: makeCardSet([5, 8, 12]), deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'shizu');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(5);
  });

  // 八旗军: prefers diamond singles
  it('banner_army prefers diamond single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'diamond'),   // diamond single
          makeCard(8, 'spade'),     // also playable
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'banner_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('diamond');
  });

  // 蒙古军: prefers spade singles
  it('mongol_army prefers spade single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'spade'),
          makeCard(8, 'diamond'),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'mongol_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('spade');
  });

  // 匈奴军: prefers heart singles
  it('xiongnu_army prefers heart single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'heart'),
          makeCard(8, 'spade'),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'xiongnu_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('heart');
  });

  // 强盗: prefers singles over pairs
  it('qiangdao prefers single over pair', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'club'), makeCard(5, 'spade'), // pair available
          makeCard(8, 'diamond'),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'qiangdao');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    // Should pick single 8 (or 5) rather than pair, because onAIDecision adds +10 to singles
    expect(result).toHaveLength(1);
  });

  // 黄巾军: prefers small cards (triggers 黄天)
  it('huangjinjun prefers smallest card when leading', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: makeCardSet([3, 7, 10]),
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'huangjinjun');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(3);
  });

  // 南蛮军: avoids hearts
  it('nanmanjun avoids heart cards', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'heart'),
          makeCard(7, 'spade'),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'nanmanjun');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).not.toBe('heart');
  });

  // 南蛮军: prefers spade/club cards
  it('nanmanjun prefers black cards', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [
          makeCard(5, 'diamond'),
          makeCard(7, 'spade'),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'nanmanjun');
    const result = decidePlay(state);
    // When both are singles, should prefer spade 7 over diamond 5
    // (the +5 from onAIDecision outweighs the slightly larger rank)
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('spade');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/AIBrain.test.ts
git commit -m "test(ai): per-enemy strategy verification tests"
```

---

### Task 11: Write tests — pass threshold and respond mode

**Files:**
- Modify: `src/engine/__tests__/AIBrain.test.ts`

- [ ] **Step 1: Add respond mode and pass threshold tests**

```typescript
describe('decidePlay - respond mode with passThreshold', () => {
  it('shizu may pass when passThreshold is high', () => {
    resetCardIdCounter();
    // shizu has passThreshold 0.2 — with a single card that barely beats
    const state = makeBattleWithEnemy({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: {
        hand: [makeCard(6)],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      lastPlay: { type: HandType.Single, cards: [makeCard(5)], mainValue: 5, length: 1 },
      phase: 'respond',
    }, 'shizu');
    // 士卒 is conservative - margin of 1 gives small score, may pass
    const result = decidePlay(state);
    // Either pass (null) or play the 6 — both acceptable for shizu
    expect(result === null || (result.length === 1 && result[0]!.rank === 6)).toBe(true);
  });

  it('huangjinjun always beats when possible (passThreshold=0)', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: {
        hand: [makeCard(10)],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      lastPlay: { type: HandType.Single, cards: [makeCard(5)], mainValue: 5, length: 1 },
      phase: 'respond',
    }, 'huangjinjun');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(10);
  });

  it('returns null when no card can beat last play', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: { hand: [makeCard(3)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      lastPlay: { type: HandType.Single, cards: [makeCard(10)], mainValue: 10, length: 1 },
      phase: 'respond',
    }, 'shizu');
    const result = decidePlay(state);
    expect(result).toBeNull();
  });

  it('prefers same-type beating card over bomb in respond mode', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: {
        hand: [
          makeCard(12), makeCard(12, 'club'), makeCard(12, 'diamond'), makeCard(12, 'heart'), // bomb
          makeCard(7),  // single 7
          makeCard(9),  // single 9
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      lastPlay: { type: HandType.Single, cards: [makeCard(5)], mainValue: 5, length: 1 },
      phase: 'respond',
    }, 'shizu');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    // Should not use bomb to beat a single 5 — use single 7 or 9 instead
    expect(result!.length).toBe(1);
    expect(result![0]!.rank).toBeLessThan(12);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/engine/__tests__/AIBrain.test.ts
git commit -m "test(ai): respond mode and pass threshold tests"
```

---

### Task 12: Write tests — onAIDecision hook independent verification

**Files:**
- Modify: `src/engine/__tests__/AIBrain.test.ts`

- [ ] **Step 1: Add test for onAIDecision via injected callback**

```typescript
describe('decidePlay - onAIDecision callback integration', () => {
  it('adjustPlayScores callback modifies decision', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: {
        hand: [makeCard(5), makeCard(10)],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    });

    // Without hook: bigger card 10 would normally be selected
    // With hook that heavily penalizes rank > 7: should pick 5
    const result = decidePlay(state, (plays) => {
      for (const p of plays) {
        const avgRank = p.play.cards.reduce((s, c) => s + c.rank, 0) / p.play.cards.length;
        if (avgRank > 7) p.score -= 100;
      }
    });
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(5);
  });

  it('passing no callback preserves original behavior', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(5), makeCard(10)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result1 = decidePlay(state);
    const result2 = decidePlay(state);
    // Both calls should produce valid results
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: 15+ tests, all pass

- [ ] **Step 3: Final build check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/__tests__/AIBrain.test.ts
git commit -m "test(ai): onAIDecision callback integration tests"
```
