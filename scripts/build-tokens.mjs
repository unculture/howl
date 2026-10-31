// Generates design/tokens.css from design/tokens.json.
// Usage: node scripts/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const t = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const lines = [];
const px = (v) => (typeof v === 'number' ? `${v}px` : v);

function walkColors(obj, prefix) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && 'value' in v) lines.push(`  --${prefix}-${kebab(k)}: ${v.value};`);
    else if (v && typeof v === 'object') walkColors(v, `${prefix}-${kebab(k)}`);
  }
}
walkColors(t.color, 'color');

for (const [k, v] of Object.entries(t.font.family)) lines.push(`  --font-${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.font.weight)) lines.push(`  --font-weight-${k}: ${v};`);
for (const [k, s] of Object.entries(t.font.style)) {
  const n = kebab(k);
  lines.push(`  --text-${n}-size: ${s.size}px;`);
  lines.push(`  --text-${n}-line: ${s.lineHeight}px;`);
  lines.push(`  --text-${n}-weight: ${s.weight};`);
}
for (const [k, v] of Object.entries(t.space)) lines.push(`  --space-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.size)) if (typeof v.value === 'number') lines.push(`  --size-${kebab(k)}: ${px(v.value)};`);
for (const [k, v] of Object.entries(t.elevation)) if (v && v.value) lines.push(`  --${kebab(k)}: ${v.value};`);
for (const [k, v] of Object.entries(t.motion.duration)) lines.push(`  --duration-${k}: ${v.value}ms;`);
for (const [k, v] of Object.entries(t.motion.easing)) lines.push(`  --ease-${kebab(k)}: ${v.value};`);
for (const [k, v] of Object.entries(t.opacity)) lines.push(`  --opacity-${kebab(k)}: ${v};`);
for (const [k, v] of Object.entries(t.z)) lines.push(`  --z-${k}: ${v};`);

// Ready-made text style classes
const classes = Object.entries(t.font.style).map(([k, s]) => {
  const n = kebab(k);
  return `.t-${n} { font-family: var(--font-${s.family}); font-size: var(--text-${n}-size); line-height: var(--text-${n}-line); font-weight: var(--text-${n}-weight);${s.italic ? ' font-style: italic;' : ''}${s.letterSpacing ? ` letter-spacing: ${s.letterSpacing};` : ''} }`;
});

const css = `/* GENERATED from design/tokens.json by scripts/build-tokens.mjs — do not edit by hand. */
/* Theme: ${t.theme} · tokens v${t.$version} */
:root {
${lines.join('\n')}
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-ambient: 0ms; }
}

${classes.join('\n')}
`;
writeFileSync(join(root, 'design/tokens.css'), css);
console.log(`Wrote design/tokens.css (${lines.length} variables)`);
