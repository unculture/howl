// Downloads Whisper base.en (quantised) into resources/models. Build machines only; never at runtime.
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'onnx-community/whisper-base.en';
const base = `https://huggingface.co/${repo}/resolve/main`;
const dest = join(root, 'resources/models/whisper-base.en');
const files = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
];

for (const file of files) {
  const out = join(dest, file);
  if (existsSync(out) && statSync(out).size > 0) {
    console.log(`have ${file}`);
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  console.log(`fetching ${file}`);
  const res = await fetch(`${base}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${out}.part`));
  renameSync(`${out}.part`, out);
}
console.log('Model ready in resources/models');
