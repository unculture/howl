import { create } from 'zustand';

export type DictationStatus = 'loading' | 'ready' | 'listening' | 'finishing' | 'nomic';

interface DictationState {
  status: DictationStatus;
  level: number;
  speaking: boolean;
  pending: number;
  micDeniedByOs: boolean;
}

export const useDictation = create<DictationState>(() => ({
  status: 'loading', level: 0, speaking: false, pending: 0, micDeniedByOs: false
}));

export interface DictationOptions {
  onLine: (text: string) => void;
  single?: boolean;
}

export function preloadDictation(): void {}
export async function startDictation(_options: DictationOptions): Promise<void> {}
export async function stopDictation(): Promise<void> {}
export function applyHerCasing(text: string, existing: string[]): string {
  return existing.length > 0 && existing.every((line) => line === line.toLowerCase())
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}
