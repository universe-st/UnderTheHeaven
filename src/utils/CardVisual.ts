import Phaser from 'phaser';
import type { Card } from '../models/Card';
import { JOKER_MIN_RANK } from '../models/Card';
import { SEAL_IMAGE_KEYS, SEAL_SOURCE_SIZE } from '../models/FourSeal';
import { FONT_FAMILY, CARD_W, CARD_H } from '../constants/Layout';

const suitSymbol: Record<string, string> = {
  spade: '♠', club: '♣', heart: '♥', diamond: '♦',
};

/**
 * 绘制一张标准扑克牌卡面（与游戏内对战手牌完全相同的样式，180×252 基准）。
 * 包含：米白卡面、双层描边、四角菱形装饰、边饰圆点、中央菱徽、
 * 左上角点数+花色、中央淡花色、JOKER（虎/龍）图案、四象印盖章。
 *
 * 黄金台等场景如需更大尺寸，可对返回的 Container 整体 setScale。
 */
export function createPokerCardVisual(
  scene: Phaser.Scene,
  card: Card,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;

  const shadowG = scene.add.graphics();
  container.add(shadowG);
  container.setData('_shadowG', shadowG);
  shadowG.fillStyle(0x1a0a04, 0.25);
  shadowG.fillRoundedRect(-halfW + 5, -halfH + 6, CARD_W, CARD_H, 8);

  const isRed = card.suit === 'heart' || card.suit === 'diamond';
  const textColor = isRed ? '#b02828' : '#1a0a04';
  const isJoker = card.rank >= JOKER_MIN_RANK;

  const g = scene.add.graphics();

  // Card background
  g.fillStyle(0xfaf5eb, 1);
  g.fillRoundedRect(-halfW, -halfH, CARD_W, CARD_H, 8);

  // Outer border — double line
  g.lineStyle(2.5, 0x6b4e2b, 0.85);
  g.strokeRoundedRect(-halfW + 3, -halfH + 3, CARD_W - 6, CARD_H - 6, 7);
  g.lineStyle(1, 0xb8963e, 0.5);
  g.strokeRoundedRect(-halfW + 8, -halfH + 8, CARD_W - 16, CARD_H - 16, 6);

  // Corner ornaments — diamond shapes at four corners
  const cornerM = 16;
  const cornerSz = 8;
  const corners: Array<[number, number]> = [
    [-halfW + cornerM, -halfH + cornerM],
    [halfW - cornerM, -halfH + cornerM],
    [-halfW + cornerM, halfH - cornerM],
    [halfW - cornerM, halfH - cornerM],
  ];

  g.fillStyle(0xb8963e, 0.35);
  for (const [cx, cy] of corners) {
    g.fillPoints([
      new Phaser.Math.Vector2(cx, cy - cornerSz),
      new Phaser.Math.Vector2(cx + cornerSz, cy),
      new Phaser.Math.Vector2(cx, cy + cornerSz),
      new Phaser.Math.Vector2(cx - cornerSz, cy),
    ], true);
  }

  // Decorative dots along inner border edges (one dot every 30px)
  g.fillStyle(0xb8963e, 0.25);
  const step = 28;
  for (let t = halfH - 30; t >= -halfH + 30; t -= step) {
    g.fillCircle(-halfW + 18, t, 2);
    g.fillCircle(halfW - 18, t, 2);
  }
  for (let l = halfW - 30; l >= -halfW + 30; l -= step) {
    g.fillCircle(l, -halfH + 18, 2);
    g.fillCircle(l, halfH - 18, 2);
  }

  // Central medallion — rotated square frame
  const midSize = 36;
  g.lineStyle(1.2, 0xb8963e, 0.25);
  const midPoints = [
    new Phaser.Math.Vector2(0, -midSize - 8),
    new Phaser.Math.Vector2(midSize + 8, 0),
    new Phaser.Math.Vector2(0, midSize + 8),
    new Phaser.Math.Vector2(-midSize - 8, 0),
  ];
  g.strokePoints(midPoints, true);

  // Small circle inside medallion
  g.lineStyle(1, 0xb8963e, 0.2);
  g.strokeCircle(0, 0, 14);

  container.add(g);

  // ═══ Top-left corner: rank + suit ═══
  const cornerX = -halfW + 16;
  const cornerY = -halfH + 10;

  if (!isJoker) {
    const rankTxt = scene.add.text(cornerX, cornerY, card.rankLabel, {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: textColor,
    }).setOrigin(0, 0);
    container.add(rankTxt);

    const suitTxt = scene.add.text(cornerX, cornerY + 34, suitSymbol[card.suit!]!, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: textColor,
    }).setOrigin(0, 0);
    container.add(suitTxt);

    // Large faded suit symbol in center
    const centerSuit = scene.add.text(0, 0, suitSymbol[card.suit!]!, {
      fontSize: '60px',
      fontFamily: FONT_FAMILY,
      color: textColor,
    }).setOrigin(0.5).setAlpha(0.12);
    container.add(centerSuit);
  }

  // ═══ Joker rendering ═══
  if (isJoker) {
    const jokerColor = card.rank === 30 ? '#c9a030' : '#1a0a04';

    const cornerLabel = scene.add.text(cornerX, cornerY, card.rankLabel, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: jokerColor,
    }).setOrigin(0, 0);
    container.add(cornerLabel);

    const patternName = card.rank === 30 ? 'card_pattern_dragon' : 'card_pattern_tiger';
    if (scene.textures.exists(patternName)) {
      const pattern = scene.add.image(0, 0, patternName);
      const maxPatternW = CARD_W * 0.7;
      const maxPatternH = CARD_H * 0.7;
      const scale = Math.min(maxPatternW / pattern.width, maxPatternH / pattern.height);
      if (scale < 1) {
        pattern.setScale(scale);
      }
      container.add(pattern);
    }

    const label = scene.add.text(0, halfH - 22, 'JOKER', {
      fontSize: '13px',
      fontFamily: FONT_FAMILY,
      color: '#8a6830',
    }).setOrigin(0.5);
    container.add(label);
  }

  // ═══ 四象印徽标（盖在卡面中央，如盖章）═══
  // 同时把印类型与印图片引用存入 data，供战斗结算（DamageSettlementManager）
  // 在对应时机做「金光闪烁」动画：card.getData('seal') / card.getData('sealImg')。
  if (card.seal) {
    const sealKey = SEAL_IMAGE_KEYS[card.seal];
    if (scene.textures.exists(sealKey)) {
      const sealImg = scene.add.image(0, 0, sealKey);
      sealImg.setScale(58 / SEAL_SOURCE_SIZE);
      sealImg.setAlpha(0.92);
      container.add(sealImg);
      container.setData('seal', card.seal);
      container.setData('sealImg', sealImg);
    }
  }

  container.setData('uid', card.uid);
  container.setData('rank', card.rank);
  container.setData('score', card.score);
  container.setData('suit', card.suit ?? '');
  container.setData('isTemp', card.isTemp === true);

  return container;
}
