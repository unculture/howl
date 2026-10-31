// Draws the placeholder app icon (aurora crescent on night) as a PNG, with no image dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const S = 512;
const night = [7, 9, 13];
const aurora = [255, 91, 168];
const raw = Buffer.alloc((S * 4 + 1) * S);
const cover = (x, y) => {
  let hits = 0;
  for (const dx of [0.25, 0.75]) for (const dy of [0.25, 0.75]) {
    const px = x + dx, py = y + dy;
    if (Math.hypot(px - 256, py - 256) < 150 && Math.hypot(px - 316, py - 216) > 125) hits++;
  }
  return hits / 4;
};
for (let y = 0; y < S; y++) {
  const row = y * (S * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < S; x++) {
    const a = cover(x, y);
    for (let c = 0; c < 3; c++) raw[row + 1 + x * 4 + c] = Math.round(night[c] * (1 - a) + aurora[c] * a);
    raw[row + 1 + x * 4 + 3] = 255;
  }
}
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync('resources/icons/icon.png', Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]));
