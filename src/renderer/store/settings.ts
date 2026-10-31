import { create } from 'zustand';

export interface Settings {
  voiceURI: string | null;
  readingRate: number;
  textScale: number;
  noteNames: boolean;
  hum: boolean;
}

const KEY = 'howl.settings';
const DEFAULTS: Settings = { voiceURI: null, readingRate: 0.95, textScale: 1, noteNames: false, hum: true };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<Settings>(load);

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useSettings.setState({ [key]: value } as Pick<Settings, K>);
  try {
    localStorage.setItem(KEY, JSON.stringify(useSettings.getState()));
  } catch {
    // Settings still apply for this session.
  }
}
