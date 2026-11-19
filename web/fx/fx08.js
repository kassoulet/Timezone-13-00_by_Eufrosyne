// Ending (PILIPS.S3M): cross-fade of two DAT images (image 0 and image 1, rows 48..191 only) swept by a sine, plus rand()-driven noise streaks. Original: 0x1097f0 (4,16).
// The blend is a pure function of the tick n counted from the start of the ending; the noise uses three rand() calls per frame (Watcom LCG, seed 1 assumed, 960 calls
// already used by scene 5's 192 particles), so it depends on the frame index f.
import { load, mem } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { SIN } from './engine3d.js';
import { A_END } from '../timetable.js';
const buf = new Uint8Array(64000), tr = (v, k) => Math.trunc(v / (1 << k));
let a, b, pal;
export async function init() { const d = await load(); a = mem(d, 0x304410); b = mem(d, 0x313e10); pal = mem(d, 0x304110); }
let seed = 1, calls = 0;
const rand = () => { seed = (Math.imul(seed, 0x41c64e6d) + 0x3039) >>> 0; calls++; return (seed >>> 16) & 0x7fff; };
const seekRand = k => { if (k < calls) { seed = 1; calls = 0; } while (calls < k) rand(); };
/** n = ticks since the start of the ending, f = frame index (0 = first frame); fills the 320x200 index image into fb */
export function frame(n, f, fb, n2 = n, n3 = n2) {   // n: tick read for the blend (0x109872); n2, n3: the ticks read later for the noise (0x1098fc, 0x109905; ticks pass while the blend runs)
  const sh = tr(SIN[(2 * n + 0x100) & 0xfff], 9), e = sh + 0x40, g = 0x80 - e;
  buf.fill(0);
  for (let i = 0x3c00; i < 0xbe00; i++) buf[i] = Math.max(0, (a[i] >> 1) - e) + Math.max(0, (b[i] >> 1) - g);
  seekRand(960 + 3 * f);
  let bx = Math.imul(n2, rand()), dx = (Math.imul(n3, 0x1333) + 0x28a38 + rand()) | 0, si = Math.imul(-rand(), 0x7d8d), di = 0x1e000000;
  for (let i = 0x3c00; i < 0xbe00; i++) {
    buf[i] += (bx & 0x1f) + 0xc;
    const c = (i + si) | 0; si = (si + c) | 0; bx = (bx + dx) | 0; dx = (dx - ((di + si) | 0)) | 0; di = (di + 0x8000) | 0;
  }
  fb.set(buf);
}
const K = 1;   // ticks per frame in the player (see README: cadence)
export function render(t, ctx) {
  const u = t - A_END, n = Math.floor(TICK * u); frame(n, Math.floor(n / K), ctx.fb); dac(pal, level(2, u), ctx.pal);
}
export const palette = () => pal;
