import Phaser from 'phaser';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { ensureVfxTextures, VFX_TEX } from '../../utils/VfxTextures';
import { waitForDelay } from '../../utils/AnimationUtils';

/** 运行时生成的玻璃碎片粒子纹理键（与静态资源不冲突） */
const SHARD_TEXTURE_KEY = 'uth_glass_shard';

/** 卡面羊皮纸色系碎片配色 */
const SHARD_TINTS = [0xf6efdd, 0xe8dcc0, 0xd8c9a3, 0xffffff];

/**
 * 临时牌碎裂特效。
 *
 * 临时牌（isTemp）打出后不会进入牌库，为让玩家直观感受到这一点，
 * 当临时牌从牌桌上消失时（结算完成后清桌、或被对方跟牌顶掉），
 * 播放「冲击闪光 + 冲击环 + 碎片迸射 + 尘雾」动画并伴随碎裂音效。
 * 碎裂后原牌变为半透明残影（与诸葛亮「料机」无效化牌的效果一致）
 * 静止在原位，等待碎片粒子播完后由调用方将残影与其它牌一起淡出清除。
 */
export class CardShatterManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * 一批临时牌同时碎裂：只播放一次音效，逐张错开 70ms 播放碎裂动画。
   * 牌变为半透明残影静止在原位；resolve 于所有碎片粒子动画播完之后，
   * 残影的清除由调用方负责（通常是与其它牌一起淡出）。
   */
  shatterCardsAsync(cards: Phaser.GameObjects.Container[]): Promise<void> {
    if (cards.length === 0) return Promise.resolve();
    this.ensureShardTexture();
    ensureVfxTextures(this.scene);
    GameAudioManager.playSfx(this.scene, 'sfx_glass_break');
    return Promise.all(
      cards.map((card, i) => this.shatterOneAsync(card, i * 70)),
    ).then(() => {});
  }

  private async shatterOneAsync(
    card: Phaser.GameObjects.Container,
    delay: number,
  ): Promise<void> {
    if (delay > 0) await waitForDelay(this.scene, delay);

    const { x, y } = card;
    const depth = card.depth + 100;

    // 1) 冲击闪光：白金色光晕瞬间炸开
    const flash = this.scene.add.image(x, y, VFX_TEX.softGlow)
      .setDepth(depth + 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff3cf)
      .setScale(0.25)
      .setAlpha(0.95);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // 2) 冲击环：金色圆环向外扩散
    const ring = this.scene.add.image(x, y, VFX_TEX.ring)
      .setDepth(depth + 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe9b0)
      .setScale(0.25)
      .setAlpha(0.85);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // 3) 碎片：羊皮纸色细碎片自牌面向四周迸射，受重力下坠并旋转淡出
    const shardEmitter = this.scene.add.particles(x, y, SHARD_TEXTURE_KEY, {
      speed: { min: 160, max: 520 },
      angle: { min: 0, max: 360 },
      gravityY: 900,
      lifespan: { min: 500, max: 900 },
      scale: { start: 1.2, end: 0.1, ease: 'quad.out' },
      alpha: { start: 1, end: 0, ease: 'quad.in' },
      rotate: { start: 0, end: 270 },
      tint: SHARD_TINTS,
      quantity: 18,
      emitting: false,
    });
    shardEmitter.setDepth(depth);
    shardEmitter.explode(18);

    // 4) 金色火花：少量星形火花提亮冲击瞬间
    const sparkEmitter = this.scene.add.particles(x, y, VFX_TEX.spark, {
      speed: { min: 180, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 260,
      lifespan: { min: 280, max: 480 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 180 },
      tint: [0xffe08a, 0xffc94d, 0xfff3c4],
      blendMode: Phaser.BlendModes.ADD,
      quantity: 6,
      emitting: false,
    });
    sparkEmitter.setDepth(depth + 1);
    sparkEmitter.explode(6);

    // 5) 尘雾：低能量褐色尘雾缓慢散开，补足「碎成齑粉」的体感
    const dustEmitter = this.scene.add.particles(x, y, VFX_TEX.softGlow, {
      speed: { min: 30, max: 100 },
      angle: { min: 0, max: 360 },
      gravityY: -30,
      lifespan: { min: 400, max: 700 },
      scale: { start: 0.25, end: 0.7 },
      alpha: { start: 0.3, end: 0 },
      tint: 0xbfa77a,
      quantity: 8,
      emitting: false,
    });
    dustEmitter.setDepth(depth - 1);
    dustEmitter.explode(8);

    // 6) 轻微镜头震动增强冲击感
    this.scene.cameras.main.shake(90, 0.0022);

    // 7) 原牌变半透明残影留在原位，继承原本的深度（zIndex）层级
    card.setAlpha(0.35);

    return new Promise(resolve => {
      shardEmitter.once('complete', () => {
        shardEmitter.destroy();
        sparkEmitter.destroy();
        dustEmitter.destroy();
        resolve();
      });
    });
  }

  private ensureShardTexture(): void {
    if (this.scene.textures.exists(SHARD_TEXTURE_KEY)) return;
    const g = this.scene.make.graphics();
    g.fillStyle(0xffffff, 1);
    // 细长三角碎片
    g.fillTriangle(0, 0, 16, 0, 8, 12);
    g.generateTexture(SHARD_TEXTURE_KEY, 16, 12);
    g.destroy();
  }
}
