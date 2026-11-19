// node tools/fxcheck02.mjs ORACLE.json PREFIX : scene 2 pixels vs oracle frames (PREFIX.idx.bin / .pal.bin from tools/export_oracle.py ORACLE.npz ORACLE.json 0x1080e9 PREFIX).
// The oracle records n at the END of the frame; the frame read n (background, overlay-free) at its start and the mesh state from the end of the PREVIOUS frame (previous record's n): both are searched.
import { readFileSync } from 'node:fs';
import { frame, init, palette } from '../web/fx/fx02.js';
import { dac } from '../web/fx/fade.js';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
await init();
const o = JSON.parse(readFileSync(process.argv[2])), idx = readFileSync(process.argv[3] + '.idx.bin'), pal = readFileSync(process.argv[3] + '.pal.bin');
const fr = o.frames.filter(f => f[0] === 0x1080e9), fb = new Uint8Array(64000), p = new Uint8Array(768), hist = {};
let bad = 0, badDac = 0, worst = 0, first = [];
const cnt = (ref) => { let c = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) c++; return c; };
fr.forEach((f, i) => {
  const ref = idx.subarray(i * 64000, i * 64000 + 64000), prev = i ? fr[i - 1][1] : null;
  let best = 1e9, bk = '';
  for (let d = 0; d < 20 && best; d++) for (let e = 0; e < 3 && best; e++) for (let q = 0; q < 2 && best; q++) {   // q = 1: the strips read (order,row) before the end-of-frame poll -> the previous record's position      // bg tick = f.n - d ; mesh tick = previous record n + e (the end-of-frame read happens a little before the poll)
    const pos = q && i ? fr[i - 1] : f; frame(f[1] - d, prev === null ? null : prev - e, pos[2], pos[3], fb); const c = cnt(ref); if (c < best) { best = c; bk = d + ',' + e; }
  }
  hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 8) first.push([i, f[1], f[2], f[3], bk, best]); }
  dac(palette(), f[4], p); for (let k = 0; k < 768; k++) if ((p[k] >> 2) !== pal[i * 768 + k]) { badDac++; break; }
});
console.log('frames', fr.length, 'inexact', bad, 'worst px diff', worst, 'dac mismatches', badDac, 'offsets', JSON.stringify(hist)); console.log('first inexact [i,n,order,row,offset,diff]', JSON.stringify(first));
