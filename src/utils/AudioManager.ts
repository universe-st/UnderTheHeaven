import Phaser from 'phaser';
import { loadAudioSettings } from '../AudioSettings';

export class AudioManager {
  private static sceneSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private static bgmSounds = new Map<string, Phaser.Sound.BaseSound>();
  private static sfxSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private static voiceSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();

  static init(scene: Phaser.Scene): void {
    const key = scene.scene.key;
    scene.events.on('shutdown', () => AudioManager.stopAll(key));
  }

  static track(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound): void {
    const key = scene.scene.key;
    let sounds = AudioManager.sceneSounds.get(key);
    if (!sounds) {
      sounds = new Set();
      AudioManager.sceneSounds.set(key, sounds);
    }
    sounds.add(sound);
    sound.once('destroy', () => sounds?.delete(sound));
  }

  static playBgm(scene: Phaser.Scene, key: string, config?: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound {
    AudioManager.stopBgm(scene);

    const settings = loadAudioSettings();
    const sound = scene.sound.add(key, { ...config, volume: settings.bgmVolume });
    sound.play();

    AudioManager.bgmSounds.set(scene.scene.key, sound);
    AudioManager.track(scene, sound);

    return sound;
  }

  static stopBgm(scene: Phaser.Scene): void {
    const bgm = AudioManager.bgmSounds.get(scene.scene.key);
    if (bgm) {
      bgm.stop();
      bgm.destroy();
      AudioManager.bgmSounds.delete(scene.scene.key);
    }
  }

  static stopAll(sceneKey: string): void {
    AudioManager.stopBgmByKey(sceneKey);

    const sounds = AudioManager.sceneSounds.get(sceneKey);
    if (sounds) {
      for (const s of sounds) {
        if (s.isPlaying) s.stop();
        s.destroy();
      }
      sounds.clear();
      AudioManager.sceneSounds.delete(sceneKey);
    }
  }

  static playSfx(scene: Phaser.Scene, key: string, config?: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound {
    const settings = loadAudioSettings();
    const sound = scene.sound.add(key, { ...config, volume: settings.sfxVolume });
    sound.play();
    AudioManager.track(scene, sound);

    const sceneKey = scene.scene.key;
    let sfxSet = AudioManager.sfxSounds.get(sceneKey);
    if (!sfxSet) {
      sfxSet = new Set();
      AudioManager.sfxSounds.set(sceneKey, sfxSet);
    }
    sfxSet.add(sound);
    sound.once('destroy', () => sfxSet?.delete(sound));

    return sound;
  }

  static setBgmVolume(volume: number): void {
    for (const bgm of AudioManager.bgmSounds.values()) {
      (bgm as any).volume = volume;
    }
  }

  static setSfxVolume(volume: number): void {
    for (const sounds of AudioManager.sfxSounds.values()) {
      for (const sound of sounds) {
        (sound as any).volume = volume;
      }
    }
  }

  static trackVoice(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound): void {
    const sceneKey = scene.scene.key;
    let vSet = AudioManager.voiceSounds.get(sceneKey);
    if (!vSet) {
      vSet = new Set();
      AudioManager.voiceSounds.set(sceneKey, vSet);
    }
    vSet.add(sound);
    sound.once('destroy', () => vSet?.delete(sound));
  }

  static setVoiceVolume(volume: number): void {
    for (const sounds of AudioManager.voiceSounds.values()) {
      for (const sound of sounds) {
        (sound as any).volume = volume;
      }
    }
  }

  static unlock(scene: Phaser.Scene): void {
    // Phaser 4: try multiple ways to get the AudioContext
    const sm = scene.sound as any;
    let ctx: AudioContext | null = null;

    if (typeof AudioContext !== 'undefined') {
      // Direct browser AudioContext as fallback
      ctx = (window as any)._gameAudioCtx;
    }

    // Try Phaser's WebAudioSoundManager context
    if (!ctx && sm.context) {
      ctx = sm.context;
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    // Also try Phaser 4's own unlock mechanism
    if (typeof sm.unlock === 'function') {
      sm.unlock();
    }
  }

  /** Call this on first user interaction to ensure audio is unlocked */
  static resumeOnInteraction(scene: Phaser.Scene): void {
    const handler = () => {
      AudioManager.unlock(scene);
      scene.input.off('pointerdown', handler);
    };
    scene.input.on('pointerdown', handler);
  }

  private static stopBgmByKey(sceneKey: string): void {
    const bgm = AudioManager.bgmSounds.get(sceneKey);
    if (bgm) {
      bgm.stop();
      bgm.destroy();
      AudioManager.bgmSounds.delete(sceneKey);
    }
  }
}
