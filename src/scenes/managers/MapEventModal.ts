import type Phaser from 'phaser';
import type { RunState } from '../../models/RunState';
import type { GameEvent } from '../../models/Events';
import { applyEventChoice, rollEvent } from '../../models/Events';
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
const TEXT_BODY = '#4a3018';

const CHOICE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '28px',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
  color: '#ffe9b0',
  stroke: '#2a1008',
  strokeThickness: 3,
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
    const event = rollEvent(run, Math.random);
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
    const panelW = 920;
    const panelH = 300 + event.choices.length * 96;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 事件必须做出选择 */ }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));

    container.add(this.scene.add.text(cx, py + 56, event.title, {
      fontSize: '44px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: TEXT_TITLE,
      stroke: '#f0e8d8',
      strokeThickness: 3,
    }).setOrigin(0.5));

    container.add(this.scene.add.text(cx, py + 142, event.description, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: TEXT_BODY,
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: panelW - 160 },
    }).setOrigin(0.5));

    event.choices.forEach((choice, idx) => {
      const btn = UIFactory.button(this.scene, cx, py + 240 + idx * 96, '▸', choice.label, () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.resolve(run, event, idx, callbacks);
      }, { w: 720, h: 72, textStyle: CHOICE_BUTTON_STYLE });
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
    const panelW = 920;
    const panelH = 400;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => { /* 等待点击继续 */ }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));

    container.add(this.scene.add.text(cx, py + 56, '际 遇', {
      fontSize: '44px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: TEXT_TITLE,
      stroke: '#f0e8d8',
      strokeThickness: 3,
    }).setOrigin(0.5));

    container.add(this.scene.add.text(cx, py + 180, description, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: TEXT_BODY,
      align: 'center',
      lineSpacing: 12,
      wordWrap: { width: panelW - 160 },
    }).setOrigin(0.5));

    const btn = UIFactory.button(this.scene, cx, py + panelH - 72, '▸', '继 续', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.close();
      if (startBattle) {
        callbacks.onBattle();
      } else {
        callbacks.onDone();
      }
    }, { w: 320, h: 72, textStyle: CHOICE_BUTTON_STYLE });
    container.add(btn);
  }
}
