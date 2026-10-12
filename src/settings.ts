export interface Settings {
  renderDistance: number;
  sensitivity: number;
  fov: number;
  showFps: boolean;
  sound: boolean;
}

const KEY = 'owb:settings';
export const DEFAULT_SETTINGS: Settings = { renderDistance: 6, sensitivity: 1, fov: 75, showFps: false, sound: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
