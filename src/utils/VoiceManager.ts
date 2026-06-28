import type Phaser from 'phaser';
import type { HandPattern } from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';
import { Card } from '../models/Card';
import { loadAudioSettings } from '../AudioSettings';
import { GameAudioManager } from './GameAudioManager';

const RANK_VOICE_SUFFIX: Record<number, string> = {
  20: 'er',
  3: 'san',
  4: 'si',
  5: 'wu',
  6: 'liu',
  7: 'qi',
  8: 'ba',
  9: 'jiu',
  10: 'shi',
  11: 'J',
  12: 'Q',
  13: 'K',
  15: 'A',
  25: 'hu',
  30: 'long',
};

const PATTERN_VOICE_KEY: Record<HandType, string | null> = {
  [HandType.Single]: null,
  [HandType.Pair]: null,
  [HandType.Triple]: null,
  [HandType.TripleOne]: 'voice_sandaiyi',
  [HandType.TriplePair]: 'voice_sandaier',
  [HandType.Straight]: 'voice_shunzi',
  [HandType.ConsecutivePairs]: 'voice_liandui',
  [HandType.Airplane]: 'voice_feiji',
  [HandType.AirplaneSingle]: 'voice_feijidai',
  [HandType.AirplanePair]: 'voice_feijidai',
  [HandType.Bomb]: 'voice_zhadan',
  [HandType.Rocket]: 'voice_wangzha',
};

const PASS_VOICES = ['voice_yaobuqi', 'voice_buyao', 'voice_guo', 'voice_rangnichu'];

export function getRankVoiceSuffix(rank: number): string | null {
  return RANK_VOICE_SUFFIX[rank] ?? null;
}

function getPatternVoice(pattern: HandPattern): string {
  if (pattern.type === HandType.Single) {
    const suffix = getRankVoiceSuffix(pattern.cards[0]!.rank);
    return suffix ? `voice_dan_${suffix}` : '';
  }
  if (pattern.type === HandType.Pair) {
    const suf = getRankVoiceSuffix(pattern.mainValue);
    return suf ? `voice_dui_${suf}` : '';
  }
  if (pattern.type === HandType.Triple) {
    const suf = getRankVoiceSuffix(pattern.mainValue);
    return suf ? `voice_san_${suf}` : '';
  }
  return PATTERN_VOICE_KEY[pattern.type] ?? '';
}

export function getVoiceKeyForPlay(
  pattern: HandPattern,
  isInitPlay: boolean,
  isBombOnNonBomb: boolean,
): string {
  if (isInitPlay) {
    return getPatternVoice(pattern);
  }

  if (isBombOnNonBomb) {
    if (Math.random() < 0.3) {
      return getPatternVoice(pattern);
    }
    return 'voice_zha';
  }

  const roll = Math.random();
  if (roll < 0.3) {
    return getPatternVoice(pattern);
  }
  if (roll < 0.7) {
    return 'voice_guanshang';
  }
  return 'voice_dani';
}

export function getRandomPassVoice(): string {
  return PASS_VOICES[Math.floor(Math.random() * PASS_VOICES.length)]!;
}

export class VoiceManager {
  private static queue: string[] = [];
  private static current: Phaser.Sound.BaseSound | null = null;
  private static cachedSettings: ReturnType<typeof loadAudioSettings> | null = null;

  static reloadSettings(): void {
    VoiceManager.cachedSettings = null;
  }

  static play(scene: Phaser.Scene, key: string, side: 'player' | 'enemy' = 'player'): void {
    if (!key) return;
    const finalKey = side === 'enemy' ? `enemy_${key}` : key;
    VoiceManager.queue.push(finalKey);
    VoiceManager.flush(scene);
  }

  private static flush(scene: Phaser.Scene): void {
    if (VoiceManager.current?.isPlaying) return;
    if (VoiceManager.queue.length === 0) return;

    const key = VoiceManager.queue.shift()!;
    if (!VoiceManager.cachedSettings) {
      VoiceManager.cachedSettings = loadAudioSettings();
    }
    const settings = VoiceManager.cachedSettings;

    try {
      const sound = scene.sound.add(key, { volume: settings.voiceVolume });
      GameAudioManager.trackVoice(scene, sound);
      sound.play();
      VoiceManager.current = sound;
      sound.once('complete', () => {
        VoiceManager.current = null;
        VoiceManager.flush(scene);
      });
    } catch (err) {
      console.warn('VoiceManager: failed to play voice', key, err);
      VoiceManager.current = null;
      VoiceManager.flush(scene);
    }
  }

  static stop(): void {
    VoiceManager.queue.length = 0;
    if (VoiceManager.current) {
      VoiceManager.current.stop();
      VoiceManager.current.destroy();
      VoiceManager.current = null;
    }
  }

  static get voiceKeys(): string[] {
    const keys: string[] = [];
    for (const suf of Object.values(RANK_VOICE_SUFFIX)) {
      keys.push(`voice_dan_${suf}`, `voice_dui_${suf}`, `voice_san_${suf}`);
    }
    for (const vk of Object.values(PATTERN_VOICE_KEY)) {
      if (vk) keys.push(vk);
    }
    keys.push('voice_guanshang', 'voice_dani', 'voice_zha');
    keys.push(...PASS_VOICES);
    return [...new Set(keys)];
  }

  static get enemyVoiceKeys(): string[] {
    const keys: string[] = [];
    for (const suf of Object.values(RANK_VOICE_SUFFIX)) {
      keys.push(`enemy_voice_dan_${suf}`, `enemy_voice_dui_${suf}`, `enemy_voice_san_${suf}`);
    }
    for (const vk of Object.values(PATTERN_VOICE_KEY)) {
      if (vk) keys.push(`enemy_${vk}`);
    }
    keys.push('enemy_voice_guanshang', 'enemy_voice_dani', 'enemy_voice_zha');
    keys.push('enemy_voice_yaobuqi', 'enemy_voice_buyao', 'enemy_voice_guo', 'enemy_voice_rangnichu');
    return [...new Set(keys)];
  }
}
