import Phaser from 'phaser';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../../constants/Layout';

/**
 * 创建音量滑块并附加到 parent 容器。
 *
 * 滑块包含：标签、轨道、填充条、数值百分比、手柄。
 * 拖拽手柄（含扩展触摸区）或点击轨道即可更新值，并通过 onChange 回调返回 [0,1] 区间的值。
 */
export function createVolumeSlider(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  labelX: number,
  y: number,
  trackX: number,
  trackW: number,
  label: string,
  initialValue: number,
  onChange: (value: number) => void,
): void {
  const trackH = 10;
  const handleR = 16;
  const trackColor = 0xd8d0c0;
  const fillColor1 = 0xc8a040;
  const fillColor2 = 0x8a6830;

  const labelText = scene.add.text(labelX, y - 18, label, {
    fontSize: '24px',
    fontFamily: FONT_FAMILY,
    color: '#4a2a10',
  }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
  parent.add(labelText);

  const trackY = y + 18;
  const trackRectX = trackX;

  const trackGfx = scene.add.graphics();
  trackGfx.setDepth(DEPTH_OVERLAY_TEXT);
  trackGfx.fillStyle(trackColor, 0.5);
  trackGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
  trackGfx.lineStyle(1, 0xb8a898, 0.4);
  trackGfx.strokeRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
  parent.add(trackGfx);

  const fillGfx = scene.add.graphics();
  fillGfx.setDepth(DEPTH_OVERLAY_TEXT);
  parent.add(fillGfx);

  const valueText = scene.add.text(trackX + trackW, y - 18, `${Math.round(initialValue * 100)}%`, {
    fontSize: '20px',
    fontFamily: FONT_FAMILY,
    color: '#4a2a10',
  }).setOrigin(1, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
  parent.add(valueText);

  const handleGfx = scene.add.graphics();
  handleGfx.setDepth(DEPTH_OVERLAY_TEXT);
  parent.add(handleGfx);

  const handleZone = scene.add.zone(trackRectX + trackW / 2, trackY, trackW + handleR * 4, handleR * 6)
    .setInteractive({ cursor: 'pointer' })
    .setDepth(DEPTH_OVERLAY_TEXT);
  parent.add(handleZone);

  let currentValue = initialValue;
  const updateUI = (value: number) => {
    currentValue = Phaser.Math.Clamp(value, 0, 1);
    const fillWidth = trackW * currentValue;
    const handleX = trackRectX + fillWidth;

    fillGfx.clear();
    if (fillWidth > 0) {
      fillGfx.fillStyle(fillColor1, 0.9);
      fillGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, fillWidth, trackH, trackH / 2);
      if (fillWidth > trackH) {
        fillGfx.fillStyle(fillColor2, 0.6);
        fillGfx.fillRoundedRect(trackRectX + fillWidth / 2, trackY - trackH / 2, fillWidth / 2, trackH, trackH / 2);
      }
    }

    handleGfx.clear();
    handleGfx.fillStyle(0xf8f4ec, 0.4);
    handleGfx.fillCircle(handleX, trackY, handleR + 3);
    handleGfx.fillStyle(0xf5f0e5, 1);
    handleGfx.fillCircle(handleX, trackY, handleR);
    handleGfx.lineStyle(2, fillColor2, 0.9);
    handleGfx.strokeCircle(handleX, trackY, handleR);

    valueText.setText(`${Math.round(currentValue * 100)}%`);

    onChange(currentValue);
  };

  updateUI(initialValue);

  let dragging = false;

  handleZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    dragging = true;
    const ratio = (pointer.x - trackRectX) / trackW;
    updateUI(ratio);
  });

  handleZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!dragging) return;
    const ratio = (pointer.x - trackRectX) / trackW;
    updateUI(ratio);
  });

  handleZone.on('pointerup', () => {
    dragging = false;
  });

  scene.input.on('pointerup', () => {
    dragging = false;
  });
}
