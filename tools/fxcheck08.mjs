// node tools/fxcheck08.mjs ORACLE.json PREFIX : ending (ret 0x10998e) vs oracle frames; frame index f = rand state (3 calls per frame after scene 5's 960), n = tick read at the frame start (search d < 24 before the recorded end tick).
import { readFileSync } from 'node:fs';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
const [jf, prefix] = process.argv.slice(2), M = await import('../web/fx/fx08.js'); await M.init();
const o = JSON.parse(readFileSync(jf)), idx = readFileSync(prefix + '.idx.bin');
const fr = o.frames.filter(f => f[0] === 0x10998e), fb = new Uint8Array(64000);
let bad = 0, worst = 0, first = [], hist = {};
fr.forEach((f, i) => {
  const ref = idx.subarray(i * 64000, i * 64000 + 64000); let best = 1e9, bk;
  for (let d = 0; d < 24 && best; d++) for (let a = 0; a < 3 && best; a++) for (let b = 0; b < 3 && best; b++) { M.frame(f[1] - d, i, fb, f[1] - d + a, f[1] - d + a + b); let c = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) c++; if (c < best) { best = c; bk = [d, a, b]; } }
  hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 6) first.push([i, f[1], bk, best]); }
});
console.log('frames', fr.length, 'inexact', bad, 'worst', worst, JSON.stringify(hist)); console.log('first', JSON.stringify(first));
