// node tools/fxcheck05.mjs ORACLE.json PREFIX [SEED [M5.json]]: scene 5 (sim with history) vs the oracle frames of ret 0x10299c (export_oracle.py ... 0x10299c PREFIX).
// Greedy: frame by frame, tries start tick = n_end - d (d<16) and physics tick = start + e (e<2), saved tick = physics + l (l<2), keeps the sim state of the best match.
import { readFileSync } from 'node:fs';
import { dac } from '../web/fx/fade.js';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
const [jf, prefix, seed = '1'] = process.argv.slice(2), M = await import('../web/fx/fx05.js'); await M.init();
const o = JSON.parse(readFileSync(jf)), idx = readFileSync(prefix + '.idx.bin'), pal = readFileSync(prefix + '.pal.bin');
const fr = o.frames.filter(f => f[0] === 0x10299c), fb = new Uint8Array(64000), p = new Uint8Array(768);
const diff = (i) => { const ref = idx.subarray(i * 64000, i * 64000 + 64000); let c = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) c++; return c; };
// M5.json = steps per frame (the original's elapsed-tick count), derived from the particle table dumped from the emulator (scratch dump5.py): the model "v += (target-p)>>9, p += v, m times per frame" is exact for every frame.
const m5 = process.argv[5] ? JSON.parse(readFileSync(process.argv[5])).m : null;
let bad = 0, badDac = 0, worst = 0, first = [], hist = {};
M.reset(0, +seed); const st0 = M.save(); let prev;
fr.forEach((f, i) => {
  let best = 1e9, bs = null, bk = null;
  for (let d = 0; d < 16 && best; d++) {
    const n = f[1] - d;
    if (i === 0) { for (let m = 0; m < 16 && best; m++) { M.restore(st0); M.reset(n - m, +seed); M.frame(n, n, fb); const c = diff(i); if (c < best) { best = c; bs = M.save(); bk = [d, m]; } } }
    else if (m5) { const [P, V, , sd] = prev; M.restore([P, V, n - m5[i - 1], sd]); M.frame(n, n, fb); const c = diff(i); if (c < best) { best = c; bs = M.save(); bk = [d]; } }
    else for (let e = 0; e < 2 && best; e++) { M.restore(prev); M.frame(n, n + e, fb); const c = diff(i); if (c < best) { best = c; bs = M.save(); bk = [d, e]; } }
  }
  prev = bs;
  hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 8) first.push([i, f[1], bk, best]); }
  dac(M.palette(), f[4], p); for (let k = 0; k < 768; k++) if ((p[k] >> 2) !== pal[i * 768 + k]) { badDac++; break; }
});
console.log('frames', fr.length, 'inexact', bad, 'worst', worst, 'dac mismatches', badDac, JSON.stringify(hist)); console.log('first', JSON.stringify(first));
