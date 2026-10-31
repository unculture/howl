import * as Tone from 'tone';
import { padLatencies } from '../features/tune/Pads';

declare global {
  interface Window {
    __howlProbe: () => { state: string; base: number; output: number; peak: number; padMs: number };
  }
}

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
    const padMs = padLatencies.length ? Math.max(...padLatencies) : 0;
    return {
      state: raw.state,
      base: raw.baseLatency,
      output: raw.outputLatency,
      peak: data.reduce((max, v) => Math.max(max, Math.abs(v)), 0),
      padMs
    };
  };
}
