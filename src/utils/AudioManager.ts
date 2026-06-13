import Phaser from 'phaser';
import { loadAudioSettings } from '../AudioSettings';

export class AudioManager {
  private static sceneSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private static bgmSounds = new Map<string, Phaser.Sound.BaseSound>();

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

  static setBgmVolume(volume: number): void {
    for (const bgm of AudioManager.bgmSounds.values()) {
      (bgm as any).volume = volume;
    }
  }

  static unlock(scene: Phaser.Scene): void {
    const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
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
