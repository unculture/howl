import type { Mood, Song } from './song';

export interface SongSummary {
  id: string;
  name: string;
  mood: Mood;
  lineCount: number;
  hasTune: boolean;
  updatedAt: string;
}

export interface SaveRequest {
  song: Song;
  midi: Uint8Array;
}

export interface FilesApi {
  list(): Promise<SongSummary[]>;
  load(id: string): Promise<Song>;
  save(request: SaveRequest): Promise<void>;
  delete(id: string): Promise<void>;
  showFile(id: string): Promise<void>;
  showFolder(): Promise<void>;
  folder(): Promise<string>;
  import(): Promise<{ id?: string; failed?: boolean }>;
  onChanged(listener: () => void): () => void;
}

export interface SystemApi {
  platform: string;
  version: string;
  micStatus(): Promise<string>;
  askMic(): Promise<boolean>;
  openMicSettings(): Promise<void>;
  onFlush(listener: () => Promise<void>): void;
}

export interface HowlApi {
  files: FilesApi;
  system: SystemApi;
}

declare global {
  interface Window {
    howl: HowlApi;
  }
}
