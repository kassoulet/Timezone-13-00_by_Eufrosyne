// node tools/fxcheck3d.mjs NN RET ORACLE.json PREFIX : scenes whose frame is a pure function of one tick n (frame(n, fb) of web/fx/fxNN.js) vs the oracle frames of return address RET
// (PREFIX.idx.bin / .pal.bin from tools/export_oracle.py ORACLE.npz ORACLE.json RET PREFIX). The oracle records n at the END of the frame; up to 24 earlier values are tried.
import { readFileSync } from 'node:fs';
import { dac } from '../web/fx/fade.js';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
const [nn, ret, jf, prefix] = process.argv.slice(2), M = await import(`../web/fx/fx${nn}.js`); await M.init();
const o = JSON.parse(readFileSync(jf)), idx = readFileSync(prefix + '.idx.bin'), pal = readFileSync(prefix + '.pal.bin');
const fr = o.frames.filter(f => f[0] === +ret), fb = new Uint8Array(64000), p = new Uint8Array(768), hist = {};
let bad = 0, badDac = 0, worst = 0, first = [];
fr.forEach((f, i) => {
  const ref = idx.subarray(i * 64000, i * 64000 + 64000); let best = 1e9, bk = -1;
  for (let d = 0; d < 24 && best; d++) { M.frame(f[1] - d, fb); let c = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) c++; if (c < best) { best = c; bk = d; } }
  hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 8) first.push([i, f[1], f[2], f[3], bk, best]); }
  dac(M.palette(), f[4], p); for (let k = 0; k < 768; k++) if ((p[k] >> 2) !== pal[i * 768 + k]) { badDac++; break; }
});
console.log('frames', fr.length, 'inexact', bad, 'worst px diff', worst, 'dac mismatches', badDac, 'n offsets used', JSON.stringify(hist)); console.log('first inexact [i,n,order,row,offset,diff]', JSON.stringify(first));
