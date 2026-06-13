const STORAGE_KEY = 'uth_audio';

export interface AudioSettingsData {
  bgmVolume: number;
  sfxVolume: number;
}

const DEFAULTS: AudioSettingsData = {
  bgmVolume: 0.3,
  sfxVolume: 0.5,
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function loadAudioSettings(): AudioSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const bgm = typeof parsed.bgmVolume === 'number' ? clamp(parsed.bgmVolume, 0, 1) : DEFAULTS.bgmVolume;
      const sfx = typeof parsed.sfxVolume === 'number' ? clamp(parsed.sfxVolume, 0, 1) : DEFAULTS.sfxVolume;
      return { bgmVolume: bgm, sfxVolume: sfx };
    }
  } catch {
    // corrupted data, fall through
  }
  return { ...DEFAULTS };
}

export function saveAudioSettings(settings: AudioSettingsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable
  }
}
