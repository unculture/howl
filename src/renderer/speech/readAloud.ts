import { create } from 'zustand';
import { useSettings } from '../store/settings';

interface ReadState { readingId: string | null; wordIndex: number; }
export const useReading = create<ReadState>(() => ({ readingId: null, wordIndex: -1 }));

const LOCAL_PREFERENCE = ['Libby', 'Sonia', 'Hazel', 'George'];
const MAC_PREFERENCE = ['Serena', 'Daniel', 'Kate'];

export function englishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
}

/** Spec order: Natural en-GB, then named Microsoft en-GB, then macOS voices, then any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], wanted: string | null): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-');
  return (
    english.find((voice) => voice.voiceURI === wanted) ??
    english.find((voice) => voice.name.includes('Natural') && lang(voice) === 'en-GB') ??
    english.find((voice) => lang(voice) === 'en-GB' && LOCAL_PREFERENCE.some((name) => voice.name.includes(name))) ??
    english.find((voice) => MAC_PREFERENCE.some((name) => voice.name.includes(name))) ??
    english[0]
  );
}

let estimateTimer: number | undefined;

export function stopReading(): void {
  window.clearInterval(estimateTimer);
  speechSynthesis.cancel();
  useReading.setState({ readingId: null, wordIndex: -1 });
}

function wordAt(text: string, charIndex: number): number {
  return text.slice(0, charIndex).trim() === '' ? 0 : text.slice(0, charIndex).trim().split(/\s+/).length - (/\s$/.test(text.slice(0, charIndex)) ? 0 : 1);
}

export function readAloud(text: string, id: string = text): void {
  const wasReading = useReading.getState().readingId === id;
  stopReading();
  if (wasReading || !text.trim()) return;
  const { voiceURI, readingRate } = useSettings.getState();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(speechSynthesis.getVoices(), voiceURI);
  if (voice) utterance.voice = voice;
  utterance.rate = readingRate;
  let sawBoundary = false;
  utterance.onboundary = (event) => {
    if (event.name && event.name !== 'word') return;
    sawBoundary = true;
    window.clearInterval(estimateTimer);
    useReading.setState({ wordIndex: wordAt(text, event.charIndex) });
  };
  const done = () => {
    if (useReading.getState().readingId === id) stopReading();
  };
  utterance.onend = done;
  utterance.onerror = done;
  utterance.onstart = () => {
    useReading.setState({ readingId: id, wordIndex: 0 });
    // Some voices send no word events. Estimate from the characters instead.
    window.setTimeout(() => {
      if (sawBoundary || useReading.getState().readingId !== id) return;
      const words = text.trim().split(/\s+/);
      const started = performance.now();
      const msPerChar = 75 / readingRate;
      estimateTimer = window.setInterval(() => {
        const chars = (performance.now() - started + 300) / msPerChar;
        let total = 0;
        const index = words.findIndex((word) => (total += word.length + 1) > chars);
        useReading.setState({ wordIndex: index === -1 ? words.length - 1 : index });
      }, 60);
    }, 300);
  };
  useReading.setState({ readingId: id, wordIndex: 0 });
  speechSynthesis.speak(utterance);
}
