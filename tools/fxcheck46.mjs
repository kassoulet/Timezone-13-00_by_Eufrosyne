// node tools/fxcheck46.mjs 04|06 RET ORACLE.json PREFIX : landscape scenes (state = heading/camera accumulators) vs oracle frames of return address RET.
// Frame i is drawn with the state after update(n_{i-1}) of the previous frame; the oracle records n at the END of the frame, so n_{i-1} = end tick - d is searched (greedy, d < 24).
import { readFileSync } from 'node:fs';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u)) });
const [nn, ret, jf, prefix] = process.argv.slice(2), M = await import(`../web/fx/fx${nn}.js`); await M.init();
const draw = M[`draw${+nn}`];
const o = JSON.parse(readFileSync(jf)), idx = readFileSync(prefix + '.idx.bin');
const fr = o.frames.filter(f => f[0] === +ret), fb = new Uint8Array(64000);
const diff = i => { const ref = idx.subarray(i * 64000, i * 64000 + 64000); let c = 0; for (let k = 0; k < 64000; k++) if (fb[k] !== ref[k]) c++; return c; };
let bad = 0, worst = 0, first = [], hist = {}; M.reset(); let prev = M.save();
fr.forEach((f, i) => {
  let best = 1e9, bs, bk = -1;
  if (i === 0) { M.restore(prev); draw(fb); best = diff(0); bs = M.save(); }
  else for (let d = 0; d < 24 && best; d++) { M.restore(prev); M.update(fr[i - 1][1] - d); draw(fb); const c = diff(i); if (c < best) { best = c; bs = M.save(); bk = d; } }
  prev = bs; hist[bk] = (hist[bk] || 0) + 1;
  if (best) { bad++; worst = Math.max(worst, best); if (first.length < 8) first.push([i, f[1], bk, best]); }
});
console.log('frames', fr.length, 'inexact', bad, 'worst', worst, JSON.stringify(hist)); console.log('first', JSON.stringify(first));
