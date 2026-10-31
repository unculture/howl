import { create } from 'zustand';

export type Tab = 'words' | 'tune';
export type Screen = 'home' | 'song';

export interface Toast { id: number; text: string; undo?: boolean; }

interface UiState {
  screen: Screen;
  tab: Tab;
  selectedLineId: string | null;
  tuneLineId: string | null;
  settingsOpen: boolean;
  toast: Toast | null;
}

export const useUi = create<UiState>(() => ({
  screen: 'home', tab: 'words', selectedLineId: null, tuneLineId: null, settingsOpen: false, toast: null
}));

let toastTimer: number | undefined;
let toastId = 0;

export function showToast(text: string, undo = false): void {
  window.clearTimeout(toastTimer);
  useUi.setState({ toast: { id: ++toastId, text, undo } });
  toastTimer = window.setTimeout(() => useUi.setState({ toast: null }), 3000);
}

export function hideToast(): void {
  window.clearTimeout(toastTimer);
  useUi.setState({ toast: null });
}
