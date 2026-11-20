// Global fade/flash level ([0x231f74], "edi" of the timer callback 0x100370) as a function of music time.
// The original runs this state machine once per PIT tick (TICK Hz); it polls the S3M (order,row) and fires the events below once per row;
// W (MIDAS sync) commands flash the level by +-0x80/+-0x40 while no fade is active. Palette uploaded each tick: DAC = clamp(pal + level, 0..255) >> 2.
import { SYNC } from './sync.js';
export const SYNC_LEAD = 0.5;                           // ticks: the original's W-flash lands ~0.5 tick before the row boundary the events use (fit vs the oracle, 98.4% of 15994 timer records within 1 tick vs 96.1% with 0)
export const TICK = 70.086;                              // ticks/s: MIDAS tmrSyncScreen locks the tick to the vsync of mode 13h (25.175 MHz/(800*449) = 70.086 Hz); the harness' 70.39 is an artefact of its PIT model (re/NOTES.md 'Tick source')
const ROW = 6 * 2.5 / 144, ORD = 64 * ROW;
const E1 = {  // AUMAX: 'order,row' -> [cmd, resetToBlack]   cmd 0 hold/decay +-4, 1 in +2 (then 0), 2 out -2, 3 out -8, 4 out -1, 5 in +1
  '0,58': [1, 1], '1,58': [2, 0], '2,12': [1, 1], '7,40': [2, 0], '8,0': [0, 0], '11,58': [3, 0], '12,0': [1, 1], '15,58': [3, 0], '16,0': [1, 1], '19,58': [3, 0],
  '20,0': [1, 1], '25,40': [2, 0], '26,0': [0, 1], '30,26': [3, 0], '30,32': [1, 1], '33,32': [4, 0] };
const E2 = { '0,0': [1, 1], '3,0': [4, 0] };            // PILIPS
function build(E, dur, sync, edi0, cmd0, TICK) {
  const n = Math.ceil(dur * TICK) + 1, out = new Int16Array(n);
  const sy = sync.map(([o, r, i]) => [o * ORD + r * ROW, i]).sort((a, b) => a[0] - b[0]); let si = 0;
  let cmd = cmd0, edi = edi0, last = '';   // both effects start black (edi -256) as set by the first scene's init
  for (let k = 0; k < n; k++) {
    const t = k / TICK, o = Math.floor(t / ORD), r = Math.floor((t - o * ORD) / ROW), key = o + ',' + r;
    if (E[key] && key !== last) { const [c, rst] = E[key]; if (rst) edi = -256; cmd = c; last = key; }
    while (si < sy.length && sy[si][0] <= t + SYNC_LEAD / TICK) { const i = sy[si++][1]; if (cmd === 0) edi = i === 16 ? 128 : i === 17 ? -128 : i === 18 ? 64 : i === 19 ? -64 : edi; }
    if (cmd === 0) { if (edi < 0) edi += 4; if (edi > 0) edi -= 4; }
    if (cmd === 1) { edi += 2; if (edi > 0) { edi = 0; cmd = 0; } }
    if (cmd === 2) edi = Math.max(-256, edi - 2);
    if (cmd === 3) edi = Math.max(-256, edi - 8);
    if (cmd === 4) edi = Math.max(-256, edi - 1);
    if (cmd === 5) { edi++; if (edi > 0) { edi = 0; cmd = 0; } }
    out[k] = edi;
  }
  return out;
}
const FC = new Map();
/** fade level at module time t (module 1 = AUMAX, 2 = PILIPS); tick = ticks per music second (the oracle harness runs at exactly 70) */
export function level(mod, t, TICK_ = TICK) {
  let c = FC.get(TICK_); if (!c) FC.set(TICK_, c = [build(E1, 240, SYNC, -256, 2, TICK_), build(E2, 40, [], -256, 1, TICK_)]);
  const F = c[mod - 1], k = Math.max(0, Math.min(F.length - 1, Math.floor(t * TICK_)));
  return F[k];
}
/** 768-byte 8-bit RGB palette shown for source palette pal (8-bit values as stored in memory) and fade level */
export function dac(pal, lv, out = new Uint8Array(768)) {
  for (let i = 0; i < 768; i++) { const v = Math.min(255, Math.max(0, pal[i] + lv)) >> 2; out[i] = v << 2 | v >> 4; }
  return out;
}
