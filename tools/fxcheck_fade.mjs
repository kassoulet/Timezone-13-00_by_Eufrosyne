// node tools/fxcheck_fade.mjs ORACLE.json [N0] : compares web/fx/fade.js level(1,t) with the fade level recorded by the original's timer callback.
// In the harness (no sound card) the S3M is stepped by the PIT, which MIDAS assumes to run at 70 Hz (real 70.39): music runs K = 1.0048 x too fast,
// so the harness tick n maps to nominal music time t = (n-N0)/TICK*K (with a sound card the music is sample-timed at nominal speed).
import { readFileSync } from 'node:fs';
import { level, TICK } from '../web/fx/fade.js';
const o = JSON.parse(readFileSync(process.argv[2])), N0 = +(process.argv[3] ?? 7), K = 1.0048;
const hist = {};
for (const [n, , , lv] of o.timer) { const d = level(1, (n - N0) / TICK * K) - lv; const k = Math.abs(d) <= 4 ? 'within 4 (1 tick)' : Math.abs(d) <= 16 ? 'within 16' : 'worse'; hist[k] = (hist[k] ?? 0) + 1; }
console.log('timer records', o.timer.length, hist);
