import type Phaser from 'phaser';
import type { Card } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { PlayerCharacterId } from '../../models/Character';
import type { ActiveSkillDefinition, CharacterSlotManager } from '../../skills';
import { LiuBoWenChouCe } from '../../skills';
import { GameAudioManager } from '../../utils/GameAudioManager';
import type { CardDisplayManager } from './CardDisplayManager';
import { FONT_FAMILY, DEPTH_UI } from '../../constants/Layout';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface ActiveSkillHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;

  battle: BattleState;
  phase: GamePhase;
  selectedIndices: Set<number>;
  cardObjects: Phaser.GameObjects.Container[];
  playerCharacterIds: PlayerCharacterId[];
  respondChainDepth: number;

  btnPlay: Phaser.GameObjects.Container;
  btnPass: Phaser.GameObjects.Container;
  btnSkill: Phaser.GameObjects.Container | null;
  btnSkillText: Phaser.GameObjects.Text | null;
  skillDropdown: Phaser.GameObjects.Container | null;
  activeSkills: ActiveSkillDefinition[];
  activeSkillUseCounts: Map<string, number>;
  activeSkillEligibleIds: string[];
  currentActiveSkillId: string | null;

  getSelectedCards(): Card[];
  updateUIForPhase(): void;
  updatePatternHint(): void;
}

export class ActiveSkillManager {
  private host: ActiveSkillHost;
  private scene: Phaser.Scene;
  private slotManager: CharacterSlotManager;
  private cardDisplay: CardDisplayManager;
  private onAiInitiatePlay: () => Promise<void>;
  private onRefillPlayerHand: () => void;

  constructor(
    host: ActiveSkillHost & Phaser.Scene,
    slotManager: CharacterSlotManager,
    cardDisplay: CardDisplayManager,
    onAiInitiatePlay: () => Promise<void>,
    onRefillPlayerHand: () => void,
  ) {
    this.host = host;
    this.scene = host;
    this.slotManager = slotManager;
    this.cardDisplay = cardDisplay;
    this.onAiInitiatePlay = onAiInitiatePlay;
    this.onRefillPlayerHand = onRefillPlayerHand;
  }

  getBattle(): BattleState {
    return this.host.battle;
  }

  renderPlayerHandAfterSkill(): void {
    this.host.selectedIndices.clear();
    this.cardDisplay.renderPlayerHand(false);
    this.host.updatePatternHint();
    this.host.updateUIForPhase();
  }

  initActiveSkills(): void {
    this.host.activeSkills = [];
    this.host.activeSkillUseCounts = new Map();

    if (this.host.playerCharacterIds.includes('liubowen')) {
      this.host.activeSkills.push(LiuBoWenChouCe);
      this.host.activeSkillUseCounts.set(LiuBoWenChouCe.id, 0);
    }
  }

  updateActiveSkillButton(): void {
    const { height } = this.host.scale;

    if (this.host.phase !== 'player_init') {
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      return;
    }

    const selected = this.host.getSelectedCards();
    if (selected.length === 0) {
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const eligibleIds: string[] = [];
    for (const skill of this.host.activeSkills) {
      const used = this.host.activeSkillUseCounts.get(skill.id) ?? 0;
      if (used >= skill.maxUses) continue;
      if (skill.cardFilter(selected)) {
        eligibleIds.push(skill.id);
      }
    }

    this.host.activeSkillEligibleIds = eligibleIds;

    if (eligibleIds.length === 0) {
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const firstSkill = this.host.activeSkills.find(s => s.id === eligibleIds[0]);
    if (!firstSkill) {
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const btnY = height - 320;
    if (!this.host.btnSkill) {
      this.host.btnSkill = this.host.add.container(0, btnY).setDepth(DEPTH_UI);
    }

    this.host.btnSkill.removeAll(true);

    const skillBg = this.host.add.graphics();
    skillBg.fillStyle(0x3a1a5a, 1);
    skillBg.fillRoundedRect(-125, -40, 250, 80, 6);
    skillBg.lineStyle(2, 0xffd700, 0.8);
    skillBg.strokeRoundedRect(-125, -40, 250, 80, 6);
    this.host.btnSkill.add(skillBg);

    const glowBorder = this.host.add.graphics();
    glowBorder.lineStyle(1.5, 0xffd700, 0.5);
    glowBorder.strokeRoundedRect(-123, -38, 246, 76, 5);
    this.host.btnSkill.add(glowBorder);

    if (eligibleIds.length > 1 && this.host.currentActiveSkillId === firstSkill.id) {
      this.host.currentActiveSkillId = firstSkill.id;
    } else if (!this.host.currentActiveSkillId || !eligibleIds.includes(this.host.currentActiveSkillId)) {
      this.host.currentActiveSkillId = eligibleIds[0] ?? null;
    }

    const displaySkill = this.host.activeSkills.find(s => s.id === this.host.currentActiveSkillId) ?? firstSkill;
    this.host.btnSkillText = this.host.add.text(0, 0, displaySkill.name, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#ffd700',
      stroke: '#1a0a2a',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.host.btnSkill.add(this.host.btnSkillText);

    const skillZone = this.host.add.zone(0, 0, 250, 80).setInteractive({ cursor: 'pointer' });
    skillZone.on('pointerdown', () => {
      this.onSkillClick();
    });
    this.host.btnSkill.add(skillZone);

    this.host.btnSkill.setVisible(true);

    if (eligibleIds.length > 1) {
      this.updateSkillDropdownTrigger(btnY);
    } else {
      this.closeSkillDropdown();
    }

    this.updateButtonLayout();
  }

  closeSkillDropdown(): void {
    this.host.skillDropdown?.destroy();
    this.host.skillDropdown = null;
  }

  updateSkillDropdownTrigger(btnY: number): void {
    this.host.skillDropdown?.destroy();
    this.host.skillDropdown = null;

    const panelW = 250;
    const panelH = Math.min(this.host.activeSkillEligibleIds.length * 52 + 16, 280);

    this.host.skillDropdown = this.host.add.container(0, btnY - 80 - panelH / 2 - 8).setDepth(DEPTH_UI);

    const listBg = this.host.add.graphics();
    listBg.fillStyle(0x2a1a4a, 0.95);
    listBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    listBg.lineStyle(1.5, 0xffd700, 0.6);
    listBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    this.host.skillDropdown.add(listBg);

    const itemH = 48;
    const startY = -panelH / 2 + 12;
    for (const skillId of this.host.activeSkillEligibleIds) {
      const skill = this.host.activeSkills.find(s => s.id === skillId);
      if (!skill) continue;
      const idx = this.host.activeSkillEligibleIds.indexOf(skillId);
      const itemY = startY + idx * itemH + itemH / 2;

      const itemText = this.host.add.text(0, itemY, skill.name, {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: skillId === this.host.currentActiveSkillId ? '#ffd700' : '#c8a080',
        stroke: '#1a0a24',
        strokeThickness: 2,
      }).setOrigin(0.5);
      this.host.skillDropdown.add(itemText);

      const itemZone = this.host.add.zone(0, itemY - itemH / 2 + panelH / 2, panelW, itemH)
        .setInteractive({ cursor: 'pointer' });
      const listY = btnY - 80 - panelH / 2 - 8;
      itemZone.setPosition(0, itemY - listY);
      itemZone.on('pointerdown', () => {
        this.host.currentActiveSkillId = skillId;
        this.updateActiveSkillButton();
      });
      this.host.skillDropdown.add(itemZone);
    }
  }

  async onSkillClick(): Promise<void> {
    if (!this.host.currentActiveSkillId) return;
    const skill = this.host.activeSkills.find(s => s.id === this.host.currentActiveSkillId);
    if (!skill) return;

    const selected = this.host.getSelectedCards();
    if (!skill.cardFilter(selected)) return;

    const prevPhase = this.host.phase;
    this.host.phase = 'animating';
    this.host.updateUIForPhase();

    for (const idx of this.host.selectedIndices) {
      const cardObj = this.host.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        this.host.tweens.killTweensOf(cardObj);
        const glowG = cardObj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
        if (glowG) {
          this.host.tweens.killTweensOf(glowG);
        }
      }
    }

    GameAudioManager.playSfx(this.scene, 'sfx_skill_trigger');
    await this.slotManager.glowOn('liubowen');
    await this.slotManager.moveToFront('liubowen');
    await this.slotManager.shakeAndPulse('liubowen');
    this.slotManager.showDialog('liubowen', '人算不如天算，天算不如我算！');

    await skill.execute(this.scene, selected);

    const used = this.host.activeSkillUseCounts.get(skill.id) ?? 0;
    this.host.activeSkillUseCounts.set(skill.id, used + 1);

    await this.slotManager.glowOff('liubowen');
    await this.slotManager.restoreSlot('liubowen');

    const playerHand = this.host.battle.player.hand;

    if (playerHand.length === 0) {
      this.host.battle.lastPlay = null;
      this.onRefillPlayerHand();
      this.cardDisplay.renderPlayerHand(true);
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'enemy';
      this.host.phase = 'ai_init';
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      await this.onAiInitiatePlay();
      return;
    }

    const isInit = prevPhase === 'player_init';
    if (isInit) {
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
    } else {
      this.host.battle.lastPlay = null;
      this.host.battle.turnHolder = 'enemy';
      this.host.phase = 'ai_init';
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      await this.onAiInitiatePlay();
      return;
    }

    this.host.updateUIForPhase();
  }

  updateButtonLayout(): void {
    const { width } = this.host.scale;
    const skillVisible = this.host.btnSkill?.visible ?? false;
    const playVisible = this.host.btnPlay?.visible ?? false;
    const passVisible = this.host.btnPass?.visible ?? false;

    const visibleButtons: Phaser.GameObjects.Container[] = [];
    if (skillVisible && this.host.btnSkill) visibleButtons.push(this.host.btnSkill);
    if (playVisible) visibleButtons.push(this.host.btnPlay);
    if (passVisible) visibleButtons.push(this.host.btnPass);

    if (visibleButtons.length === 0) return;

    const btnW = 250;
    const gap = 10;
    const totalW = visibleButtons.length * btnW + (visibleButtons.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + btnW / 2;

    for (let i = 0; i < visibleButtons.length; i++) {
      const targetX = startX + i * (btnW + gap);
      const btn = visibleButtons[i]!;
      if (btn.x !== targetX) {
        this.host.tweens.add({
          targets: btn,
          x: targetX,
          duration: 200,
          ease: 'Sine.easeOut',
        });
      }
    }
  }
}
