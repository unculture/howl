import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Everything is bundled: never fetch a model or runtime from the network.
const origin = self.location.origin;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${origin}/models/`;
env.useBrowserCache = false;
env.useFSCache = false;
const wasm = env.backends.onnx.wasm!;
wasm.wasmPaths = `${origin}/vendor/ort/`;
// Leave cores free so the beat and pads never compete with transcription.
wasm.numThreads = Math.max(1, Math.min(4, Math.floor((self.navigator.hardwareConcurrency || 2) / 2)));

export type WorkerRequest = { type: 'init' } | { type: 'transcribe'; id: number; audio: Float32Array };
export type WorkerResponse =
  | { type: 'ready'; ms: number; threads: number }
  | { type: 'failed'; error: string }
  | { type: 'text'; id: number; text: string; ms: number };

const post = (message: WorkerResponse) => self.postMessage(message);
let recogniser: AutomaticSpeechRecognitionPipeline | null = null;

async function load(): Promise<void> {
  const started = performance.now();
  try {
    const made = await pipeline('automatic-speech-recognition', 'whisper-base.en', {
      device: 'wasm',
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }
    });
    recogniser = made as unknown as AutomaticSpeechRecognitionPipeline;
    await recogniser(new Float32Array(16000)); // Warm up so her first line isn't the slow one.
    post({ type: 'ready', ms: performance.now() - started, threads: Number(wasm.numThreads) });
  } catch (err) {
    post({ type: 'failed', error: String(err) });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    await load();
    return;
  }
  const started = performance.now();
  let text = '';
  try {
    const result = await recogniser!(message.audio, { chunk_length_s: 30, stride_length_s: 5 });
    text = (Array.isArray(result) ? result[0] : result).text;
  } catch (err) {
    console.error('Transcription failed', err);
  }
  post({ type: 'text', id: message.id, text, ms: performance.now() - started });
};
