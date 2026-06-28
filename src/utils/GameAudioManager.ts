import type Phaser from 'phaser';
import { loadAudioSettings } from '../AudioSettings';

export class GameAudioManager {
  private static sceneSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private static bgmSounds = new Map<string, Phaser.Sound.BaseSound>();
  private static sfxSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private static voiceSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();

  static init(scene: Phaser.Scene): void {
    const key = scene.scene.key;
    scene.events.once('shutdown', () => GameAudioManager.stopAll(key));
  }

  static track(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound): void {
    const key = scene.scene.key;
    let sounds = GameAudioManager.sceneSounds.get(key);
    if (!sounds) {
      sounds = new Set();
      GameAudioManager.sceneSounds.set(key, sounds);
    }
    sounds.add(sound);
    sound.once('destroy', () => sounds?.delete(sound));
  }

  static playBgm(scene: Phaser.Scene, key: string, config?: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound {
    GameAudioManager.stopBgm(scene);

    const settings = loadAudioSettings();
    const sound = scene.sound.add(key, { ...config, volume: settings.bgmVolume });
    sound.play();

    GameAudioManager.bgmSounds.set(scene.scene.key, sound);
    GameAudioManager.track(scene, sound);

    return sound;
  }

  static stopBgm(scene: Phaser.Scene): void {
    const bgm = GameAudioManager.bgmSounds.get(scene.scene.key);
    if (bgm) {
      bgm.stop();
      bgm.destroy();
      GameAudioManager.bgmSounds.delete(scene.scene.key);
    }
  }

  static stopAll(sceneKey: string): void {
    GameAudioManager.stopBgmByKey(sceneKey);

    const sounds = GameAudioManager.sceneSounds.get(sceneKey);
    if (sounds) {
      for (const s of sounds) {
        if (s.isPlaying) s.stop();
        s.destroy();
      }
      sounds.clear();
      GameAudioManager.sceneSounds.delete(sceneKey);
    }
  }

  static playSfx(scene: Phaser.Scene, key: string, config?: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound {
    const settings = loadAudioSettings();
    const sound = scene.sound.add(key, { ...config, volume: settings.sfxVolume });
    sound.play();
    GameAudioManager.track(scene, sound);

    const sceneKey = scene.scene.key;
    let sfxSet = GameAudioManager.sfxSounds.get(sceneKey);
    if (!sfxSet) {
      sfxSet = new Set();
      GameAudioManager.sfxSounds.set(sceneKey, sfxSet);
    }
    sfxSet.add(sound);
    sound.once('destroy', () => sfxSet?.delete(sound));

    return sound;
  }

  static setBgmVolume(volume: number): void {
    for (const bgm of GameAudioManager.bgmSounds.values()) {
      if ('volume' in bgm) (bgm as Phaser.Sound.BaseSound & { volume: number }).volume = volume;
    }
  }

  static setSfxVolume(volume: number): void {
    for (const sounds of GameAudioManager.sfxSounds.values()) {
      for (const sound of sounds) {
        if ('volume' in sound) (sound as Phaser.Sound.BaseSound & { volume: number }).volume = volume;
      }
    }
  }

  static trackVoice(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound): void {
    const sceneKey = scene.scene.key;
    let vSet = GameAudioManager.voiceSounds.get(sceneKey);
    if (!vSet) {
      vSet = new Set();
      GameAudioManager.voiceSounds.set(sceneKey, vSet);
    }
    vSet.add(sound);
    sound.once('destroy', () => vSet?.delete(sound));
  }

  static setVoiceVolume(volume: number): void {
    for (const sounds of GameAudioManager.voiceSounds.values()) {
      for (const sound of sounds) {
        if ('volume' in sound) (sound as Phaser.Sound.BaseSound & { volume: number }).volume = volume;
      }
    }
  }

  static unlock(scene: Phaser.Scene): void {
    if (typeof scene.sound?.unlock === 'function') {
      scene.sound.unlock();
    }
  }

  /** Call this on first user interaction to ensure audio is unlocked */
  static resumeOnInteraction(scene: Phaser.Scene): void {
    const handler = () => {
      GameAudioManager.unlock(scene);
      scene.input.off('pointerdown', handler);
    };
    scene.input.on('pointerdown', handler);
  }

  private static stopBgmByKey(sceneKey: string): void {
    const bgm = GameAudioManager.bgmSounds.get(sceneKey);
    if (bgm) {
      bgm.stop();
      bgm.destroy();
      GameAudioManager.bgmSounds.delete(sceneKey);
    }
  }

  /** Clear all static maps. Call on scene restart to prevent leaks. */
  static reset(): void {
    for (const [key, sounds] of GameAudioManager.sceneSounds) {
      for (const s of sounds) {
        if (s.isPlaying) s.stop();
        s.destroy();
      }
    }
    for (const bgm of GameAudioManager.bgmSounds.values()) {
      bgm.stop();
      bgm.destroy();
    }
    for (const sounds of GameAudioManager.sfxSounds.values()) {
      for (const s of sounds) {
        if (s.isPlaying) s.stop();
        s.destroy();
      }
    }
    for (const sounds of GameAudioManager.voiceSounds.values()) {
      for (const s of sounds) {
        if (s.isPlaying) s.stop();
        s.destroy();
      }
    }
    GameAudioManager.sceneSounds.clear();
    GameAudioManager.bgmSounds.clear();
    GameAudioManager.sfxSounds.clear();
    GameAudioManager.voiceSounds.clear();
  }
}
