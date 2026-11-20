// node tools/fxcheck_fade.mjs ORACLE.json [N0] : compares web/fx/fade.js level(mod,t) with the fade level recorded by the original's timer callback, for the whole run
// (AUMAX records, then PILIPS records where the tick counter restarts). In the harness (no sound card) MIDAS steps the S3M once per timer tick assuming exactly 70 Hz
// (tmrSyncScreen fails in the harness, MIDAS falls back to 70.00 Hz; the harness' own PIT model then runs 70.39 virtual Hz, an artefact), so the harness maps tick n to nominal music time t = (n-N0)/70
// and the check builds the fade table at 70 ticks per music second. The player uses fade.js TICK (70.086, the vsync of mode 13h).
// Best offsets found: N0 = 8.75 (AUMAX), 5.25 (PILIPS).
import { readFileSync } from 'node:fs';
import { level } from '../web/fx/fade.js';
const o = JSON.parse(readFileSync(process.argv[2])), N0 = +(process.argv[3] ?? 8.75);
let cut = 0; while (cut + 1 < o.timer.length && o.timer[cut + 1][0] > o.timer[cut][0]) cut++;
for (const [mod, S, off] of [[1, o.timer.slice(0, cut + 1), N0], [2, o.timer.slice(cut + 1), N0 - 3.5]]) {
  if (!S.length) continue;
  const h = { exact: 0, within1tick: 0, worse: 0 };
  for (const [n, , , lv] of S) { const d = Math.abs(level(mod, (n - off) / 70, 70) - lv); h[d === 0 ? 'exact' : d <= 4 ? 'within1tick' : 'worse']++; }
  console.log('module', mod, 'records', S.length, JSON.stringify(h));
}
