import { create } from 'zustand';
import type { WorkerRequest, WorkerResponse } from '../../workers/whisper.worker';
import { cleanUtterance } from './postprocess';

export { applyHerCasing } from './postprocess';

export type DictationStatus = 'loading' | 'ready' | 'listening' | 'finishing' | 'nomic';

interface DictationState {
  status: DictationStatus;
  level: number;
  speaking: boolean;
  pending: number;
  micDeniedByOs: boolean;
  lastMs: number;
}

export const useDictation = create<DictationState>(() => ({
  status: 'loading', level: 0, speaking: false, pending: 0, micDeniedByOs: false, lastMs: 0
}));

export interface DictationOptions {
  onLine: (text: string) => void;
  single?: boolean; // One utterance, for a text field. Stops after a longer silence.
}

const LINE_PAUSE_MS = 700;
const FIELD_PAUSE_MS = 1200;
const MIN_SPEECH_MS = 250;

let worker: Worker | null = null;
let modelReady = false;

interface Session {
  options: DictationOptions;
  vad: { pause(): Promise<void>; destroy(): Promise<void>; start(): Promise<void> } | null;
  stream: MediaStream | null;
  context: AudioContext | null;
  raf: number;
  stopping: boolean;
  finished: Promise<void>;
  resolveFinished: () => void;
}

let session: Session | null = null;
let nextId = 0;
let nextToApply = 0;
const results = new Map<number, string>();

function send(message: WorkerRequest, transfer: Transferable[] = []): void {
  worker?.postMessage(message, transfer);
}

/** Load Whisper in the background. The rest of the app never waits for this. */
export function preloadDictation(): void {
  if (worker) return;
  const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 500));
  idle(() => {
    worker = new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = (event) => {
      console.error('Whisper worker error', event.message);
      useDictation.setState({ status: 'nomic' });
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        modelReady = true;
        console.info(`Whisper ready in ${Math.round(message.ms)}ms on ${message.threads} threads`);
        if (useDictation.getState().status === 'loading') useDictation.setState({ status: 'ready' });
      } else if (message.type === 'failed') {
        console.warn('Whisper could not load', message.error);
        useDictation.setState({ status: 'nomic' });
      } else {
        useDictation.setState({ lastMs: message.ms });
        results.set(message.id, message.text);
        applyInOrder();
      }
    };
    send({ type: 'init' });
  });
}

/** Lines appear in the order she said them, even if transcriptions finish out of order. */
function applyInOrder(): void {
  while (results.has(nextToApply)) {
    const text = results.get(nextToApply)!;
    results.delete(nextToApply);
    nextToApply++;
    for (const line of cleanUtterance(text)) session?.options.onLine(line);
    useDictation.setState((state) => ({ pending: Math.max(0, state.pending - 1) }));
  }
  maybeFinish();
}

function maybeFinish(): void {
  const current = session;
  if (current?.stopping && useDictation.getState().pending === 0) {
    session = null;
    useDictation.setState({ status: modelReady ? 'ready' : 'loading', level: 0, speaking: false });
    current.resolveFinished();
  }
}

function releaseMic(current: Session): void {
  cancelAnimationFrame(current.raf);
  current.stream?.getTracks().forEach((track) => track.stop());
  void current.context?.close();
  current.stream = null;
  current.context = null;
}

async function openMic(): Promise<MediaStream | null> {
  try {
    await window.howl.system.askMic();
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    console.warn('No mic', err);
    const os = await window.howl.system.micStatus();
    useDictation.setState({ status: 'nomic', micDeniedByOs: os === 'denied' || os === 'restricted' });
    return null;
  }
}

function watchLevel(current: Session, stream: MediaStream): void {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  current.context = context;
  const data = new Float32Array(analyser.fftSize);
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    useDictation.setState({ level: Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length) });
    current.raf = requestAnimationFrame(tick);
  };
  tick();
}

export async function startDictation(options: DictationOptions): Promise<void> {
  if (session || !modelReady) return;
  const stream = await openMic();
  if (!stream) return;

  let resolveFinished = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const current: Session = { options, vad: null, stream, context: null, raf: 0, stopping: false, finished, resolveFinished };
  session = current;
  nextId = 0;
  nextToApply = 0;
  results.clear();
  useDictation.setState({ status: 'listening', pending: 0, micDeniedByOs: false });
  watchLevel(current, stream);

  try {
    const { MicVAD } = await import('@ricky0123/vad-web');
    const base = new URL('vendor/vad/', document.baseURI).toString();
    current.vad = await MicVAD.new({
      model: 'v5',
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
      },
      baseAssetPath: base,
      onnxWASMBasePath: base,
      getStream: async () => stream,
      pauseStream: async () => {},
      resumeStream: async () => stream,
      redemptionMs: options.single ? FIELD_PAUSE_MS : LINE_PAUSE_MS,
      minSpeechMs: MIN_SPEECH_MS,
      preSpeechPadMs: 300,
      submitUserSpeechOnPause: true,
      onSpeechStart: () => useDictation.setState({ speaking: true }),
      onVADMisfire: () => useDictation.setState({ speaking: false }),
      onSpeechEnd: (audio: Float32Array) => {
        useDictation.setState((state) => ({ speaking: false, pending: state.pending + 1 }));
        const copy = new Float32Array(audio);
        send({ type: 'transcribe', id: nextId++, audio: copy }, [copy.buffer]);
        if (options.single) void stopDictation();
      }
    });
    if (current.stopping) return;
    await current.vad.start();
  } catch (err) {
    console.error('Listening failed', err);
    releaseMic(current);
    session = null;
    useDictation.setState({ status: 'nomic', level: 0, speaking: false });
  }
}

/** Stop listening. Resolves once everything she said has been written down. */
export async function stopDictation(): Promise<void> {
  const current = session;
  if (!current) return;
  if (!current.stopping) {
    current.stopping = true;
    useDictation.setState({ status: 'finishing', speaking: false, level: 0 });
    try {
      await current.vad?.pause(); // Sends any speech still in progress.
      await current.vad?.destroy();
    } catch (err) {
      console.warn('Stopping VAD', err);
    }
    releaseMic(current);
    maybeFinish();
  }
  await current.finished;
}
