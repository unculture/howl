import JSZip from 'jszip';
import type { Song } from './song';

export const README_TEXT =
  'This is a howl song. Open it in howl, or unzip it: lyrics.txt has your words, tune.mid opens in any music app.\n';

export class SongFileError extends Error {}

export function lyricsText(song: Song): string {
  return song.lines.map((line) => line.text).join('\n') + (song.lines.length ? '\n' : '');
}

/** Builds a .howl file. Unknown files from the previous version are carried over. */
export async function packSong(song: Song, midi: Uint8Array, previous?: Uint8Array): Promise<Uint8Array> {
  const zip = previous ? await JSZip.loadAsync(previous) : new JSZip();
  zip.file('song.json', JSON.stringify(song, null, 2));
  zip.file('lyrics.txt', lyricsText(song));
  zip.file('tune.mid', midi);
  zip.file('README.txt', README_TEXT);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function validate(data: unknown): Song {
  const song = data as Song;
  if (!song || typeof song !== 'object' || typeof song.id !== 'string' || !Array.isArray(song.lines)) {
    throw new SongFileError('Not a song');
  }
  if (typeof song.formatVersion !== 'number' || song.formatVersion > 1) throw new SongFileError('Newer song file');
  return song;
}

export async function unpackSong(bytes: Uint8Array): Promise<Song> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new SongFileError('Not a zip');
  }
  const entry = zip.file('song.json');
  if (!entry) throw new SongFileError('No song.json');
  try {
    return validate(JSON.parse(await entry.async('string')));
  } catch (err) {
    if (err instanceof SongFileError) throw err;
    throw new SongFileError('Bad song.json');
  }
}
