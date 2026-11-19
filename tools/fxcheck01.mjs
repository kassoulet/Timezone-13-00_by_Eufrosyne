// node tools/fxcheck01.mjs ORACLE.json PREFIX : scene 1 pixels + DAC vs the oracle frames (PREFIX.idx.bin / .pal.bin, tools/export_oracle.py ORACLE.npz ORACLE.json 0x102e7b PREFIX)
// The oracle records the tick n at the END of the frame; the original read it at the start (and again for the overlay), so up to 23 earlier values of n are tried.
import { readFileSync } from 'node:fs';
import { frame, init, palette } from '../web/fx/fx01.js';
import { dac } from '../web/fx/fade.js';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
await init();
const o = JSON.parse(readFileSync(process.argv[2])), idx = readFileSync(process.argv[3] + '.idx.bin'), pal = readFileSync(process.argv[3] + '.pal.bin');
const fr = o.frames.filter(f => f[0] === 0x102e7b), fb = new Uint8Array(64000), p = new Uint8Array(768), hist = {};
let bad = 0, badDac = 0, worst = 0, first = [];
fr.forEach((f, i) => {
  const ref = idx.subarray(i * 64000, i * 64000 + 64000);
  let best = 1e9, bk = -1;
  for (let d = 0; d < 24; d++) {
    for (let o = 0; o < 2; o++) for (let e = 0; e <= d + 2; e++) {
      frame(f[1] - d, f[2] - o, fb, f[1] - d + e); let diff = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) diff++;
      if (diff < best) { best = diff; bk = d; } if (!diff) break;
    }
    if (!best) break;
  }
  hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 8) first.push([i, f[1], f[2], f[3], bk, best]); }
  dac(palette(), f[4], p); for (let k = 0; k < 768; k++) if ((p[k] >> 2) !== pal[i * 768 + k]) { badDac++; break; }
});
console.log('frames', fr.length, 'inexact', bad, 'worst px diff', worst, 'dac mismatches', badDac, 'n offsets used', JSON.stringify(hist)); console.log('first inexact [i,n,order,row,offset,diff]', JSON.stringify(first));
