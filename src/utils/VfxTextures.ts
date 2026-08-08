import Phaser from 'phaser';

/** 运行时生成的通用特效纹理键（与静态资源不冲突） */
export const VFX_TEX = {
  /** 柔和径向光晕（白色，使用时 tint 上色） */
  softGlow: 'uth_vfx_soft_glow',
  /** 细圆环（冲击波用，白色，使用时 tint 上色） */
  ring: 'uth_vfx_ring',
  /** 四角星火花（白色，使用时 tint 上色） */
  spark: 'uth_vfx_spark',
} as const;

/** 幂等生成通用特效纹理：光晕、圆环、星形火花 */
export function ensureVfxTextures(scene: Phaser.Scene): void {
  const textures = scene.textures;

  if (!textures.exists(VFX_TEX.softGlow)) {
    const size = 128;
    const half = size / 2;
    const g = scene.make.graphics();
    const steps = 12;
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      g.fillStyle(0xffffff, 0.16 * (1 - t) + 0.02);
      g.fillCircle(half, half, t * half);
    }
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(half, half, half * 0.18);
    g.generateTexture(VFX_TEX.softGlow, size, size);
    g.destroy();
  }

  if (!textures.exists(VFX_TEX.ring)) {
    const size = 128;
    const g = scene.make.graphics();
    g.lineStyle(7, 0xffffff, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 6);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeCircle(size / 2, size / 2, size / 2 - 13);
    g.generateTexture(VFX_TEX.ring, size, size);
    g.destroy();
  }

  if (!textures.exists(VFX_TEX.spark)) {
    const size = 32;
    const half = size / 2;
    const g = scene.make.graphics();
    const v = (px: number, py: number) => new Phaser.Math.Vector2(px, py);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        v(half, 0),
        v(half + 3, half - 3),
        v(size, half),
        v(half + 3, half + 3),
        v(half, size),
        v(half - 3, half + 3),
        v(0, half),
        v(half - 3, half - 3),
      ],
      true,
    );
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(half, half, 4);
    g.generateTexture(VFX_TEX.spark, size, size);
    g.destroy();
  }
}
