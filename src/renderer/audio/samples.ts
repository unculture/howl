import * as Tone from 'tone';
import manifest from './samples.json';
import type { Zone } from '../music/zones';

export type InstrumentName = keyof typeof manifest.instruments;
export type HitName = keyof typeof manifest.hits;
export interface HitTake { file: string; gain: number; }

export const instruments = manifest.instruments as Record<InstrumentName, Zone[]>;
export const hits = manifest.hits as Record<HitName, HitTake[]>;

const buffers = new Map<string, AudioBuffer>();
export const bufferFor = (file: string): AudioBuffer | undefined => buffers.get(file);

export const rawContext = (): AudioContext => Tone.getContext().rawContext as unknown as AudioContext;

async function loadOne(file: string): Promise<void> {
  const response = await fetch(new URL(`samples/${file}`, document.baseURI));
  buffers.set(file, await rawContext().decodeAudioData(await response.arrayBuffer()));
}

let failed = 0;
let loaded = false;

/** Decoding runs off the main thread, so this never gets in the way of a tap. */
export const samplesReady: Promise<void> = (async () => {
  const queue = [
    ...Object.values(instruments).flat().map((zone) => zone.file),
    ...Object.values(hits).flat().map((take) => take.file)
  ];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      await loadOne(file).catch((err) => {
        failed++;
        console.error('Could not load sound', file, err);
      });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  loaded = true;
})();

export const samplesState = () => ({ loaded, failed, count: buffers.size });
