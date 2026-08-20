import type Phaser from 'phaser';
import type { Card } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { PlayerCharacterId } from '../../models/Character';
import type { ActiveSkillDefinition, CharacterSlotManager } from '../../skills';
import { LiuBoWenChouCe, ZuChongZhiYuanZhou, ZhangJuZhengGaiZhi, ZhouChuChuHai, WeiZhengZhiJian, XiangYuPoFu, YiYinZhiWei, ZhouGongDanZhiLiActive, ZhouYuFanjian, TangYinMiaoHui, LuYuChaSheng } from '../../skills';
import { hasLiXin } from '../../skills/ZhouChuChuHaiLogic';
import { isCharacterSkillSuppressed, shouldYanSongMoveToFront } from '../../engine/CharacterAbilities';
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
  resetActiveSkillUses(mode?: 'all' | 'gain-turn'): void;

  getBattle(): BattleState;
  renderPlayerHandAfterSkill(): void;
  initActiveSkills(): void;
}

export class ActiveSkillManager {
  private host: ActiveSkillHost & Phaser.Scene;
  private scene: Phaser.Scene;
  private slotManager: CharacterSlotManager;
  private cardDisplay: CardDisplayManager;
  private onAiInitiatePlay: () => Promise<void>;
  private onRefillPlayerHand: () => Promise<void>;
  /** 主动技阶段进入/离开回调（用于战斗卜辞栏「使用」可用性联动） */
  private onBuciActivePhaseChange: ((active: boolean) => void) | null;

  constructor(
    host: ActiveSkillHost & Phaser.Scene,
    slotManager: CharacterSlotManager,
    cardDisplay: CardDisplayManager,
    onAiInitiatePlay: () => Promise<void>,
    onRefillPlayerHand: () => Promise<void>,
    onBuciActivePhaseChange: ((active: boolean) => void) | null = null,
  ) {
    this.host = host;
    this.scene = host;
    this.slotManager = slotManager;
    this.cardDisplay = cardDisplay;
    this.onAiInitiatePlay = onAiInitiatePlay;
    this.onRefillPlayerHand = onRefillPlayerHand;
    this.onBuciActivePhaseChange = onBuciActivePhaseChange;
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
    // 只做注册：保留已有使用次数（发动次数的清零由 resetActiveSkillUses()
    // 执行——「获得牌权型」技能在玩家获得牌权时重置，「失去牌权型」（改制）
    // 在玩家失去牌权（对方获得牌权）时重置，见 resetActiveSkillUses）。
    const counts = this.host.activeSkillUseCounts;
    this.host.activeSkills = [];

    if (this.host.playerCharacterIds.includes('liubowen')) {
      this.host.activeSkills.push(LiuBoWenChouCe);
      if (!counts.has(LiuBoWenChouCe.id)) counts.set(LiuBoWenChouCe.id, 0);
    }
    if (this.host.playerCharacterIds.includes('zuchongzhi')) {
      this.host.activeSkills.push(ZuChongZhiYuanZhou);
      if (!counts.has(ZuChongZhiYuanZhou.id)) counts.set(ZuChongZhiYuanZhou.id, 0);
    }
    if (this.host.playerCharacterIds.includes('zhangjuzheng')) {
      this.host.activeSkills.push(ZhangJuZhengGaiZhi);
      if (!counts.has(ZhangJuZhengGaiZhi.id)) counts.set(ZhangJuZhengGaiZhi.id, 0);
    }
    // 周处「除害」：每次获得牌权限一次；已转换（失去除害、获得励心）后不再注册
    if (this.host.playerCharacterIds.includes('zhouchu')
        && !hasLiXin(this.host.battle.player.skillFlags)) {
      this.host.activeSkills.push(ZhouChuChuHai);
      if (!counts.has(ZhouChuChuHai.id)) counts.set(ZhouChuChuHai.id, 0);
    }
    // 魏征「直谏」：每次获得牌权限一次，弃置一张手牌
    if (this.host.playerCharacterIds.includes('weizheng')) {
      this.host.activeSkills.push(WeiZhengZhiJian);
      if (!counts.has(WeiZhengZhiJian.id)) counts.set(WeiZhengZhiJian.id, 0);
    }
    // 项羽「破釜」：每次获得牌权限一次，直伤爆发
    if (this.host.playerCharacterIds.includes('xiangyu')) {
      this.host.activeSkills.push(XiangYuPoFu);
      if (!counts.has(XiangYuPoFu.id)) counts.set(XiangYuPoFu.id, 0);
    }
    // 伊尹「至味」：每次获得牌权限一次，弃四张异花色牌回气数
    if (this.host.playerCharacterIds.includes('yiyin')) {
      this.host.activeSkills.push(YiYinZhiWei);
      if (!counts.has(YiYinZhiWei.id)) counts.set(YiYinZhiWei.id, 0);
    }
    // 周公旦「制礼」（主动技）：每次获得牌权限一次，弃"制礼"点数牌摸等量牌；
    // 未发动制礼（zhiliRanks 为空）时由 canUseWithSelection 拦截，按钮不显示
    if (this.host.playerCharacterIds.includes('zhougongdan')) {
      this.host.activeSkills.push(ZhouGongDanZhiLiActive);
      if (!counts.has(ZhouGongDanZhiLiActive.id)) counts.set(ZhouGongDanZhiLiActive.id, 0);
    }
    // 周瑜「反间」：每次获得牌权限一次，随机标记一张敌方手牌；已有标记时
    // canUseWithoutSelection 拦截，按钮不显示
    if (this.host.playerCharacterIds.includes('zhouyu')) {
      this.host.activeSkills.push(ZhouYuFanjian);
      if (!counts.has(ZhouYuFanjian.id)) counts.set(ZhouYuFanjian.id, 0);
    }
    // 唐寅「妙绘」：每次获得牌权限一次，选一张临时牌变普通牌，20% 附加随机四象印
    if (this.host.playerCharacterIds.includes('tangyin')) {
      this.host.activeSkills.push(TangYinMiaoHui);
      if (!counts.has(TangYinMiaoHui.id)) counts.set(TangYinMiaoHui.id, 0);
    }
    // 陆羽「茶圣」：每次获得牌权限一次，弃置任意张梅花牌，分数永久+1
    if (this.host.playerCharacterIds.includes('luyu')) {
      this.host.activeSkills.push(LuYuChaSheng);
      if (!counts.has(LuYuChaSheng.id)) counts.set(LuYuChaSheng.id, 0);
    }

    this.host.activeSkillUseCounts = counts;
  }

  /**
   * 重置主动技发动次数。
   * - 默认（'all'）：重置全部技能——在玩家「失去牌权」（对方获得牌权）时调用，
   *   覆盖张居正「改制」等 resetOnLostTurn 技能；
   * - 'gain-turn'：仅重置「每次获得牌权限一次」类技能（resetOnLostTurn 缺省的，
   *   如筹策、圆周、除害）——在玩家「获得牌权」（进入出牌阶段）时调用。
   */
  resetActiveSkillUses(mode: 'all' | 'gain-turn' = 'all'): void {
    for (const skill of this.host.activeSkills) {
      const resetOnGainTurn = skill.resetOnLostTurn !== true;
      if (mode === 'all' || resetOnGainTurn) {
        this.host.activeSkillUseCounts.set(skill.id, 0);
      }
    }
  }

  updateActiveSkillButton(): void {
    const { height } = this.host.scale;

    if (this.host.phase !== 'player_init') {
      this.notifyBuciActivePhase(false);
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      return;
    }

    const selected = this.host.getSelectedCards();
    const eligibleIds: string[] = [];
    for (const skill of this.host.activeSkills) {
      const used = this.host.activeSkillUseCounts.get(skill.id) ?? 0;
      if (used >= skill.maxUses) continue;
      if (selected.length === 0) {
        // 无需选牌的主动技（如改制）：未选中牌也可发动
        if (skill.requiresSelection === false) {
          if ((!skill.canUseWithoutSelection || skill.canUseWithoutSelection(this.host))
              // 严嵩「结党」压制：被压制角色的主动技不显示、不能发动
              && !isCharacterSkillSuppressed(this.host.playerCharacterIds, skill.ownerCharacterId)) {
            eligibleIds.push(skill.id);
          }
        }
      } else if (skill.cardFilter(selected)) {
        // cardFilter 通过后，若技能提供了 canUseWithSelection（需访问 scene 状态），
        // 叠加检查（如项羽「破釜」气数足够才能发动，否则按钮不显示）
        if ((!skill.canUseWithSelection || skill.canUseWithSelection(this.host, selected))
            // 严嵩「结党」压制：被压制角色的主动技不显示、不能发动
            && !isCharacterSkillSuppressed(this.host.playerCharacterIds, skill.ownerCharacterId)) {
          eligibleIds.push(skill.id);
        }
      }
    }

    this.host.activeSkillEligibleIds = eligibleIds;

    if (eligibleIds.length === 0) {
      this.notifyBuciActivePhase(false);
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    const firstSkill = this.host.activeSkills.find(s => s.id === eligibleIds[0]);
    if (!firstSkill) {
      this.notifyBuciActivePhase(false);
      if (this.host.btnSkill) this.host.btnSkill.setVisible(false);
      this.closeSkillDropdown();
      this.updateButtonLayout();
      return;
    }

    // 有可发动的主动技：进入主动技阶段（战斗卜辞栏「使用」可用）
    this.notifyBuciActivePhase(true);

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
      void this.onSkillClick();
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
    const usable = selected.length > 0
      ? (skill.cardFilter(selected)
          && (!skill.canUseWithSelection || skill.canUseWithSelection(this.host, selected))
          // 严嵩「结党」压制：被压制角色的主动技不能点击发动
          && !isCharacterSkillSuppressed(this.host.playerCharacterIds, skill.ownerCharacterId))
      : (skill.requiresSelection === false
          && (!skill.canUseWithoutSelection || skill.canUseWithoutSelection(this.host))
          // 严嵩「结党」压制：被压制角色的主动技不能点击发动
          && !isCharacterSkillSuppressed(this.host.playerCharacterIds, skill.ownerCharacterId));
    if (!usable) return;

    // 主动技发动中：退出主动技阶段（战斗卜辞栏「使用」不可用）
    this.notifyBuciActivePhase(false);

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
    await this.slotManager.glowOn(skill.ownerCharacterId);
    await this.slotManager.moveToFront(skill.ownerCharacterId);
    await this.slotManager.shakeAndPulse(skill.ownerCharacterId);

    if (skill.dialogLines && skill.dialogLines.length > 0) {
      const line = skill.dialogLines[Math.floor(Math.random() * skill.dialogLines.length)]!;
      this.slotManager.showDialog(skill.ownerCharacterId, line);
    }

    await skill.execute(this.host, selected);

    const used = this.host.activeSkillUseCounts.get(skill.id) ?? 0;
    this.host.activeSkillUseCounts.set(skill.id, used + 1);

    await this.slotManager.glowOff(skill.ownerCharacterId);
    await this.slotManager.restoreSlot(skill.ownerCharacterId);

    // 严嵩「结党」新效果：其它玩家角色发动主动技后，若严嵩在最后一个站位，移到最前面
    // 能执行到这里都通过了 usable 的 isCharacterSkillSuppressed 检查，是成功发动的主动技
    if (shouldYanSongMoveToFront(this.host.playerCharacterIds, skill.ownerCharacterId)) {
      await this.slotManager.moveToFront('yansong');
    }

    const playerHand = this.host.battle.player.hand;

    if (playerHand.length === 0) {
      this.host.battle.lastPlay = null;
      // 摸满玩家手牌（公共事件）：补满 + 渲染 + 广播 ON_HAND_REFILLED
      // （孙膑「减灶」/姜尚「辅王」等「摸满手牌后」技能照常触发）
      await this.onRefillPlayerHand();
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'enemy';
      this.host.phase = 'ai_init';
      this.host.resetActiveSkillUses();
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
      this.host.resetActiveSkillUses();
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

  /** 主动技阶段进入/离开通知（有可发动的主动技 → true） */
  private notifyBuciActivePhase(active: boolean): void {
    this.onBuciActivePhaseChange?.(active);
  }
}
