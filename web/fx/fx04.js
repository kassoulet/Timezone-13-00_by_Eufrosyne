// Scene 4: texture-mapped landscape/tunnel "voxel" background (texture DAT 0x8ef40, height map = image 8) + mesh 5 (type 8) + overlay (DAT 0x4f4c0). Original: 0x108250(20,0), background 0x108d78, tables 0x108100.
// Background painter and tables: terrain.js.
// NOT a pure function of the tick: the camera (B, C) integrates 2*sin/2*cos of a tick-driven heading once per FRAME, so it depends on the frame cadence; state is advanced with update(n).
import { load, mem } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { paint4 } from './terrain.js';
import { FX } from '../timetable.js';
import { SIN, COS, loadAssets, loadMeshes, mesh10, resetList, draw } from './engine3d.js';
const tr = (v, k) => Math.trunc(v / (1 << k));
const buf = new Uint8Array(64000);
let tex, hmap, ov, pal, A3, M;
export async function init() {
  const d = await load(); tex = mem(d, 0x3b0090); hmap = mem(d, 0x3c0090); ov = mem(d, 0x376910);
  pal = new Uint8Array(768); pal.set(mem(d, 0x3572d0).subarray(0, 0x240)); pal.set(mem(d, 0x356d90).subarray(0, 0xc0), 0x240);
  A3 = await loadAssets(); M = await loadMeshes();
}
let st = {};   // esi (heading index of the previous frame), camera accumulators B/C, tick of the last object update (null = first frame)
export const reset = () => { st = { esi: 0, B: 0, C: 0, n: null }; };
reset();
export const save = () => ({ ...st });
export const restore = s => { st = { ...s }; };
/** the end of a frame: object animation, heading and camera integration from the tick n */
export function update(n) {
  const s = k => SIN[k & 0xfff];
  st.n = n;
  let e = tr(s(4 * n), 7) + tr(s(7 * n), 8) + 0x280;
  e = ((e % 0x500) + 0x500) % 0x500;
  const a = Math.trunc((e << 12) / 0x500);
  st.esi = e; st.B = (st.B - 2 * SIN[a]) | 0; st.C = (st.C + 2 * COS[a]) | 0;
}
export function draw4(fb) {
  buf.fill(0); paint4(buf, tex, hmap, st.esi, st.B, st.C); resetList();
  const n = st.n ?? 0, s = k => SIN[k & 0xfff];
  const o = st.n === null ? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 192 }
    : { x: tr(s(6 * n), 6), y: tr(s(5 * n), 7), z: Math.trunc(s(9 * n) / 0x60), rx: tr(s(13 * n), 7), ry: 7 * n, rz: tr(s(9 * n), 7), scale: 192 };
  mesh10({ x: 400, y: -500, z: -1500, rx: 256, ry: 0, rz: 0 }, o, M[5], 8); draw(buf, A3);
  for (let i = 0; i < 64000; i++) if (ov[i]) buf[i] = ov[i] + 0xc0;
  fb.set(buf);
}
// player: one frame per K ticks counted from the scene start (the DOS frame rate is machine dependent, see README); the state is replayed from the scene start, so seeking is repeatable
const K = 2, f0 = Math.floor(Math.floor(7 + TICK * FX[4].t0) / K);
let last = -1;
export function render(t, ctx) {
  const f = Math.floor(Math.floor(7 + TICK * t) / K);
  if (last < 0 || f < last) { reset(); last = f0; }
  for (; last < f; last++) update(last * K);   // frame f shows the state after the updates that ended frames f0..f-1
  draw4(ctx.fb); dac(pal, level(1, t), ctx.pal);
}
export const palette = () => pal;
