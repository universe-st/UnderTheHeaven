import type Phaser from 'phaser';
import type { RunState } from '../../models/RunState';
import type { GameEvent } from '../../models/Events';
import { applyEventChoice, randomEvent } from '../../models/Events';
import { purchase } from '../../models/Shop';
import { UIFactory } from '../../utils/UIFactory';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_OVERLAY } from '../../constants/Layout';

export interface MapEventModalCallbacks {
  /** 事件触发伏兵战斗：弹窗已关闭，由调用方按契约进入 GameScene */
  onBattle(): void;
  /** 事件结算完毕（含流浪武士招募购买）：由调用方 applyVictory + 存档 + 重建地图 */
  onDone(): void;
}

const TEXT_TITLE = '#3a2010';
const TEXT_BODY = '#5a4030';

const CHOICE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '24px',
  fontFamily: FONT_FAMILY,
  color: '#e8d5a3',
  stroke: '#2a1008',
  strokeThickness: 2,
};

/**
 * 地图事件弹窗：抽取随机事件 → 展示选项 → applyEventChoice 结算 →
 * 显示结果描述 → 「继续」分流（战斗 / 普通完成）。
 * 流浪武士招募（result.shopItem）在结果展示前走 purchase 流程。
 */
export class MapEventModal {
  private container: Phaser.GameObjects.Container | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(run: RunState, callbacks: MapEventModalCallbacks): void {
    const event = randomEvent(Math.random);
    this.showChoices(run, event, callbacks);
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
  }

  private showChoices(run: RunState, event: GameEvent, callbacks: MapEventModalCallbacks): void {
    this.close();

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const panelW = 880;
    const panelH = 250 + event.choices.length * 92;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 事件必须做出选择 */ }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));

    container.add(this.scene.add.text(cx, py + 54, event.title, {
      fontSize: '38px',
      fontFamily: FONT_FAMILY,
      color: TEXT_TITLE,
    }).setOrigin(0.5));

    container.add(this.scene.add.text(cx, py + 136, event.description, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: TEXT_BODY,
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: panelW - 140 },
    }).setOrigin(0.5));

    event.choices.forEach((choice, idx) => {
      const btn = UIFactory.button(this.scene, cx, py + 216 + idx * 92, '▸', choice.label, () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.resolve(run, event, idx, callbacks);
      }, { w: 680, h: 68, textStyle: CHOICE_BUTTON_STYLE });
      container.add(btn);
    });
  }

  private resolve(run: RunState, event: GameEvent, choiceIdx: number, callbacks: MapEventModalCallbacks): void {
    const result = applyEventChoice(run, event, choiceIdx, Math.random);

    let description = result.description;
    if (result.shopItem) {
      description += purchase(run, result.shopItem) ? '招募成功！' : '（通宝不足或阵容已满，招募作罢。）';
    }

    this.showResult(description, result.startBattle === true, callbacks);
  }

  private showResult(description: string, startBattle: boolean, callbacks: MapEventModalCallbacks): void {
    this.close();

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const panelW = 880;
    const panelH = 380;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 等待点击继续 */ }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));

    container.add(this.scene.add.text(cx, py + 54, '际 遇', {
      fontSize: '38px',
      fontFamily: FONT_FAMILY,
      color: TEXT_TITLE,
    }).setOrigin(0.5));

    container.add(this.scene.add.text(cx, py + 170, description, {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: TEXT_BODY,
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: panelW - 140 },
    }).setOrigin(0.5));

    const btn = UIFactory.button(this.scene, cx, py + panelH - 72, '▸', '继 续', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.close();
      if (startBattle) {
        callbacks.onBattle();
      } else {
        callbacks.onDone();
      }
    }, { w: 300, h: 68, textStyle: CHOICE_BUTTON_STYLE });
    container.add(btn);
  }
}
