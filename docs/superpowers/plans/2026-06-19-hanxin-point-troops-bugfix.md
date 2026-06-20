# 韩信「点兵」技能 Bug 修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in Han Xin's "点兵" (Point Troops) skill: (1) per-suit card scale animation not playing, and (2) skill trigger glow effects sometimes failing.

**Architecture:** Two independent fixes in `src/scenes/GameScene.ts`: Bug 1 is a missing `setData('suit', ...)` in `createCardDisplay()`; Bug 2 is a double-call race in `setSkillTriggered()` plus a competing tween in `animateGlowLoop()`.

**Tech Stack:** Phaser 4, TypeScript

---

### Task 1: Fix per-suit card scale animation (Bug 1)

**Files:**
- Modify: `src/scenes/GameScene.ts:1002`

- [ ] **Step 1: Add `suit` data to card display containers**

In `createCardDisplay()`, after line 1002 (`container.setData('rank', card.rank);`), add a line to also store the suit data. Use `card.suit ?? ''` so Joker cards (suit=null) get an empty string (falsy), preserving the existing `if (suit && ...)` guard in the animation loop.

```typescript
// In createCardDisplay(), replace line 1002:
//   container.setData('rank', card.rank);
// With:
    container.setData('rank', card.rank);
    container.setData('suit', card.suit ?? '');
```

The Han Xin animation loop at line 2306-2319 reads `card.getData('suit')` — after this fix, the value will be `'spade'`/`'club'`/`'heart'`/`'diamond'` for normal cards, and `''` (falsy) for Joker cards, so the animation correctly animates the first card of each real suit.

---

### Task 2: Fix skill trigger glow double-call race (Bug 2)

**Files:**
- Modify: `src/scenes/GameScene.ts:573-590` (`setSkillTriggered`)
- Modify: `src/scenes/GameScene.ts:641-691` (`animateGlowLoop`)

**Root cause:** `setSkillTriggered(true)` calls `reorderCharacterSlots()` which internally calls `animateGlowLoop()` for all triggered characters — then `setSkillTriggered` calls `animateGlowLoop()` again. The second `animateGlowLoop()` calls `stopGlowLoop()` which creates an untracked fade-out tween (alpha→0) that competes with the new tracked fade-in tweens (alpha: 0→1), causing unpredictable visual results.

- [ ] **Step 2a: Prevent double call to `animateGlowLoop` in `setSkillTriggered`**

Replace the `setSkillTriggered` method (lines 573-590) to only call `animateGlowLoop` when `reorderCharacterSlots` returns early (character already at index 0). When `reorderCharacterSlots` runs, it handles glow restart internally.

```typescript
  private setSkillTriggered(charId: PlayerCharacterId, triggered: boolean): void {
    const idx = this.playerCharacterIds.indexOf(charId);
    if (idx === -1) return;
    if (triggered) {
      this.skillTriggeredCharacters.add(charId);
      if (idx > 0) {
        this.reorderCharacterSlots(charId);
        // reorderCharacterSlots handles animateGlowLoop for all triggered chars
      } else {
        this.animateGlowLoop(idx);
      }
    } else {
      this.skillTriggeredCharacters.delete(charId);
      const glowContainer = this.characterSlotContainers[idx]?.getAt(0) as Phaser.GameObjects.Container | undefined;
      if (glowContainer) {
        this.stopGlowLoop(idx, glowContainer);
      }
    }
  }
```

- [ ] **Step 2b: Remove competing fade-out tween from `animateGlowLoop`**

In `animateGlowLoop`, replace the call `this.stopGlowLoop(idx, glowContainer)` (line 647) with direct tween cleanup that does NOT create a fade-out tween. Also kill any untracked tweens on `glowContainer` to clean up leftovers from prior `stopGlowLoop` calls.

```typescript
  private animateGlowLoop(idx: number): void {
    const glowEls = this.characterSlotGlows[idx];
    if (!glowEls) return;
    const glowContainer = this.characterSlotContainers[idx]?.getAt(0) as Phaser.GameObjects.Container | undefined;
    if (!glowContainer) return;

    const existingTweens = this.characterSlotGlowTweens.get(idx);
    if (existingTweens) {
      for (const t of existingTweens) t.stop();
      this.characterSlotGlowTweens.delete(idx);
    }
    this.tweens.killTweensOf(glowContainer);

    const tweens: Phaser.Tweens.Tween[] = [];

    tweens.push(this.tweens.add({
      targets: glowContainer,
      alpha: { from: 0, to: 1 },
      duration: 200,
      ease: 'Sine.easeOut',
    }));

    tweens.push(this.tweens.add({
      targets: glowContainer,
      alpha: { from: 0.7, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    }));

    tweens.push(this.tweens.add({
      targets: glowContainer,
      scaleX: { from: 1, to: 1.06 },
      scaleY: { from: 1, to: 1.06 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    }));

    const halfSlot = 64;
    tweens.push(this.tweens.add({
      targets: glowEls.sweepGfx,
      y: { from: -halfSlot, to: halfSlot },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    }));

    this.characterSlotGlowTweens.set(idx, tweens);
  }
```

**Note on `stopGlowLoop`**: The `stopGlowLoop` method (line 693-705) is kept unchanged — it is still used by `setSkillTriggered(false)` for proper fade-out when the skill deactivates. The fix only removes its usage from within `animateGlowLoop`, where the fade-out was problematic.

---

### Task 3: Verify TypeScript compilation

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

---

### Task 4: Commit

- [ ] **Step 4: Commit changes**

```bash
git add src/scenes/GameScene.ts docs/superpowers/plans/2026-06-19-hanxin-point-troops-bugfix.md
git commit -m "fix: Han Xin point troops - suit animation and glow race condition"
```
