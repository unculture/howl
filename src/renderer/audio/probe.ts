import * as Tone from 'tone';
import { padTimings } from '../features/tune/Pads';
import { engine } from './engine';
import { useDictation } from '../speech/dictation';
import { samplesState } from './samples';

declare global {
  interface Window {
    __howlEngine: typeof engine;
    __howlProbe: () => { state: string; base: number; output: number; peak: number; queuedMs: number[]; handlerMs: number[]; lastTranscribeMs: number; position: number; now: number; running: boolean; samples: ReturnType<typeof samplesState> };
  }
}

window.__howlEngine = engine;

/** Read-only measurements for the automated checks: is sound coming out, and how fast do pads respond. */
export function installProbe(): void {
  let analyser: AnalyserNode | null = null;
  window.__howlProbe = () => {
    const raw = Tone.getContext().rawContext as AudioContext;
    if (!analyser) {
      analyser = raw.createAnalyser();
      analyser.fftSize = 2048;
      Tone.getDestination().output.connect(analyser as unknown as Tone.ToneAudioNode);
    }
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return {
      state: raw.state,
      base: raw.baseLatency,
      output: engine.outputLatency(),
      peak: data.reduce((max, v) => Math.max(max, Math.abs(v)), 0),
      queuedMs: padTimings.map((t) => t.queued),
      handlerMs: padTimings.map((t) => t.handler),
      lastTranscribeMs: useDictation.getState().lastMs,
      position: engine.position(),
      now: raw.currentTime,
      running: engine.isRunning,
      samples: samplesState()
    };
  };
}
