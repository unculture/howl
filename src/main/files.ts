import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { watch, mkdirSync } from 'node:fs';
import { copyFile, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SaveRequest, SongSummary } from '../shared/api';
import { SongFileError, packSong, unpackSong } from '../shared/howlFile';
import type { Song } from '../shared/song';
import { safeFileName } from '../shared/fileName';

const EXT = '.howl';
const songsDir = () => process.env['HOWL_SONGS_DIR'] ?? join(app.getPath('documents'), 'howl');
const paths = new Map<string, string>(); // song id → file

function ensureDir(): string {
  const dir = songsDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function freePath(name: string, except?: string): Promise<string> {
  const dir = ensureDir();
  const base = safeFileName(name);
  for (let n = 1; ; n++) {
    const candidate = join(dir, `${base}${n === 1 ? '' : ` ${n}`}${EXT}`);
    if (candidate === except) return candidate;
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
}

async function listSongs(): Promise<SongSummary[]> {
  const dir = ensureDir();
  const names = (await readdir(dir)).filter((name) => name.endsWith(EXT));
  const songs: SongSummary[] = [];
  for (const name of names) {
    const file = join(dir, name);
    try {
      const song = await unpackSong(await readFile(file));
      paths.set(song.id, file);
      songs.push({
        id: song.id,
        name: song.name,
        mood: song.mood,
        lineCount: song.lines.length,
        hasTune: song.lines.some((line) => (line.tune?.notes.length ?? 0) > 0),
        updatedAt: song.updatedAt
      });
    } catch {
      // A corrupt or newer file stays on disk untouched; it just isn't listed.
    }
  }
  return songs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeSong({ song, midi }: SaveRequest): Promise<void> {
  const current = paths.get(song.id);
  // Rename the file along with the song. An unchanged name keeps its existing file.
  const wantedBase = safeFileName(song.name);
  const currentBase = current ? basename(current, EXT) : null;
  const matches = currentBase !== null && (currentBase === wantedBase || new RegExp(`^${escapeRegExp(wantedBase)} \\d+$`).test(currentBase));
  const target = current && matches ? current : await freePath(song.name, current);

  let previous: Uint8Array | undefined;
  if (current) {
    try {
      previous = await readFile(current);
    } catch {
      previous = undefined;
    }
  }
  const bytes = await packSong(song, new Uint8Array(midi), previous);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, bytes);
  if (previous && current) {
    await copyFile(current, `${target}.bak`);
    if (current !== target) {
      await rm(current, { force: true });
      await rm(`${current}.bak`, { force: true });
    }
  }
  await rename(tmp, target);
  paths.set(song.id, target);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One write at a time, so a slow disk can't interleave saves.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

async function loadSong(id: string): Promise<Song> {
  let file = paths.get(id);
  if (!file) {
    await listSongs();
    file = paths.get(id);
  }
  if (!file) throw new SongFileError('Missing');
  return unpackSong(await readFile(file));
}

async function importSong(window: BrowserWindow): Promise<{ id?: string; failed?: boolean }> {
  const picked = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'howl song', extensions: ['howl'] }]
  });
  const source = picked.filePaths[0];
  if (picked.canceled || !source) return {};
  try {
    const bytes = await readFile(source);
    const song = await unpackSong(bytes);
    await listSongs();
    if (paths.has(song.id) && paths.get(song.id) === source) return { id: song.id };
    if (paths.has(song.id)) {
      // A copy of a song already here: keep both, as separate songs.
      song.id = randomUUID();
      const target = await freePath(song.name);
      const midi = await (await import('jszip')).default.loadAsync(bytes).then((zip) => zip.file('tune.mid')?.async('uint8array'));
      await writeFile(target, await packSong(song, midi ?? new Uint8Array(), bytes));
      paths.set(song.id, target);
      return { id: song.id };
    }
    const target = await freePath(basename(source, EXT));
    await copyFile(source, target);
    paths.set(song.id, target);
    return { id: song.id };
  } catch {
    return { failed: true };
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('files:list', () => listSongs());
  ipcMain.handle('files:load', (_event, id: string) => loadSong(id));
  ipcMain.handle('files:save', (_event, request: SaveRequest) => enqueue(() => writeSong(request)));
  ipcMain.handle('files:delete', async (_event, id: string) => {
    const file = paths.get(id);
    if (!file) return;
    await enqueue(async () => {
      await shell.trashItem(file);
      await rm(`${file}.bak`, { force: true });
      paths.delete(id);
    });
  });
  ipcMain.handle('files:showFile', (_event, id: string) => {
    const file = paths.get(id);
    if (file) shell.showItemInFolder(file);
  });
  ipcMain.handle('files:showFolder', () => shell.openPath(ensureDir()));
  ipcMain.handle('files:folder', () => ensureDir());
  ipcMain.handle('files:import', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? importSong(window) : {};
  });
}

export function watchSongs(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined;
  try {
    const watcher = watch(ensureDir(), () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!window.isDestroyed()) window.webContents.send('files:changed');
      }, 300);
    });
    window.on('closed', () => watcher.close());
  } catch {
    // Without a watcher the list still refreshes when Home opens.
  }
}
