// Scene 6: the scene-4 landscape painter rotated 90 degrees (terrain.js paint6, texture DAT 0x9f260, height map = image 8) + overlay (DAT 0x3f7a0), no 3D object, no blur. Original: 0x108530(30,0), painter 0x108ec1.
// NOT a pure function of the tick: the camera (B, C) integrates sin/cos of a tick-driven heading once per FRAME (see fx04.js).
import { load, mem } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { paint6 } from './terrain.js';
import { FX } from '../timetable.js';
import { SIN, COS } from './engine3d.js';
const tr = (v, k) => Math.trunc(v / (1 << k));
const buf = new Uint8Array(64000);
let tex, hmap, ov, pal, st;
export async function init() {
  const d = await load(); tex = mem(d, 0x38cc10); hmap = mem(d, 0x3c0090); ov = mem(d, 0x366f10);
  pal = new Uint8Array(768); pal.set(mem(d, 0x356e50).subarray(0, 0x240)); pal.set(mem(d, 0x356cd0).subarray(0, 0xc0), 0x240);
}
export const reset = () => { st = { esi: 0, B: 0, C: 0 }; };
reset();
export const save = () => ({ ...st });
export const restore = s => { st = { ...s }; };
/** end of a frame: heading and camera integration from the tick n */
export function update(n) {
  const s = k => SIN[k & 0xfff];
  const e = (((tr(s(2 * n), 6) + tr(s(5 * n), 8) + 0x280) % 0x500) + 0x500) % 0x500, a = Math.trunc((e << 12) / 0x500);
  st.esi = e; st.B = (st.B - SIN[a]) | 0; st.C = (st.C + COS[a]) | 0;
}
export function draw6(fb) {
  buf.fill(0); paint6(buf, tex, hmap, st.esi, st.B, st.C);
  for (let i = 0; i < 64000; i++) if (ov[i]) buf[i] = ov[i] + 0xc0;
  fb.set(buf);
}
const K = 1, f0 = Math.floor(Math.floor(7 + TICK * FX[6].t0) / K);   // ticks per frame in the player (the DOS frame rate is machine dependent); replayed from the scene start
let last = -1;
export function render(t, ctx) {
  const f = Math.floor(Math.floor(7 + TICK * t) / K);
  if (last < 0 || f < last) { reset(); last = f0; }
  for (; last < f; last++) update(last * K);
  draw6(ctx.fb); dac(pal, level(1, t), ctx.pal);
}
export const palette = () => pal;
