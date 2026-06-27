import type Phaser from 'phaser';

export function waitForDelay(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise(resolve => {
    scene.time.delayedCall(ms, () => resolve());
  });
}

export function waitForTween(
  scene: Phaser.Scene,
  config: Record<string, unknown>,
): Promise<void> {
  return new Promise(resolve => {
    const onComplete = config.onComplete as (() => void) | undefined;
    (scene.tweens as any).add({
      ...config,
      onComplete: () => {
        onComplete?.();
        resolve();
      },
    });
  });
}

export async function sequentialTweens(
  scene: Phaser.Scene,
  configs: Record<string, unknown>[],
): Promise<void> {
  for (const config of configs) {
    await waitForTween(scene, config);
  }
}

export function animateCardsToPositions(
  cards: Phaser.GameObjects.Container[],
  positions: Array<{ x: number; y: number }>,
  duration: number,
  scene: Phaser.Scene,
  offset?: { baseDepth: number },
): Promise<void> {
  if (cards.length === 0) return Promise.resolve();

  if (offset) {
    offset.baseDepth += cards.length;
  }

  return Promise.all(
    cards.map((card, i) => {
      card.setDepth((offset?.baseDepth ?? 100) - cards.length + i);
      return waitForTween(scene, {
        targets: card,
        x: positions[i]!.x,
        y: positions[i]!.y,
        duration,
        ease: 'Sine.easeOut',
      });
    }),
  ).then(() => {});
}

export function fadeOutAndDestroy(
  cards: Phaser.GameObjects.Container[],
  duration: number,
  scene: Phaser.Scene,
): Promise<void> {
  if (cards.length === 0) return Promise.resolve();

  return Promise.all(
    cards.map(card =>
      waitForTween(scene, {
        targets: card,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        y: card.y - 30,
        duration,
        ease: 'Sine.easeIn',
      }).then(() => card.destroy()),
    ),
  ).then(() => {});
}

export function waitForCounterTween(
  scene: Phaser.Scene,
  config: { from: number; to: number; duration: number; ease?: string; onUpdate?: (val: number) => void },
): Promise<void> {
  return new Promise(resolve => {
    scene.tweens.addCounter({
      from: config.from,
      to: config.to,
      duration: config.duration,
      ease: config.ease ?? 'Cubic.easeOut',
      onUpdate: (tween) => {
        const val = tween.getValue();
        if (val !== null) {
          config.onUpdate?.(val);
        }
      },
      onComplete: () => resolve(),
    });
  });
}

/**
 * 系数增长动画：将系数标签文本从当前系数渐增到目标系数。
 * 技能（如韩信点兵）调用此函数来展示系数翻倍的可视化效果。
 */
export async function animateCoefficientUpdate(
  scene: Phaser.Scene,
  labelText: Phaser.GameObjects.Text,
  typeLabel: string,
  fromCoeff: number,
  toCoeff: number,
  duration: number = 800,
): Promise<void> {
  const formatCoeff = (v: number) => {
    if (Number.isInteger(v)) return `${v}`;
    return v.toFixed(1);
  };
  await waitForCounterTween(scene, {
    from: fromCoeff,
    to: toCoeff,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: (val) => {
      labelText.setText(`✖️ ${formatCoeff(val)}（${typeLabel}）`);
    },
  });
}

export async function animateMultiplierUpdate(
  scene: Phaser.Scene,
  labelText: Phaser.GameObjects.Text,
  fromMultiplier: number,
  toMultiplier: number,
  duration: number = 800,
): Promise<void> {
  await waitForCounterTween(scene, {
    from: fromMultiplier,
    to: toMultiplier,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: (val) => {
      labelText.setText(`✖️ ${Math.round(val)}`);
    },
  });
}
