// Copies the WASM and VAD runtime files into the renderer's public folder so nothing is fetched from a CDN.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'src/renderer/public/vendor');
const copies = [
  ['onnxruntime-web/dist', 'vad', ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']],
  ['@ricky0123/vad-web/dist', 'vad', ['silero_vad_v5.onnx', 'silero_vad_legacy.onnx', 'vad.worklet.bundle.min.js']],
  ['@huggingface/transformers/dist', 'ort', ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']]
];
for (const [from, to, names] of copies) {
  mkdirSync(join(out, to), { recursive: true });
  for (const name of names) {
    const src = join(nm, from, name);
    if (!existsSync(src)) throw new Error(`Missing runtime asset: ${src}`);
    copyFileSync(src, join(out, to, name));
  }
}
console.log('Runtime assets copied');
