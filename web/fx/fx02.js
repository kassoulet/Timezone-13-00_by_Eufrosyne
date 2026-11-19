// Scene 2: polar "tunnel" background (texture DAT image 11 scrolled, depth from the height map image 8) + a 240-vertex mesh (type 8: flat faces + additive 16x16 points)
// + full-screen overlay (DAT image 3) + three text strips. Original: 0x107e10(12,0), background 0x107bc8, tables 0x107ce0.
// Exact for a given pair of ticks: the background and the first object read n at the start of the frame, the mesh position/rotation come from the n read at the end of the previous frame.
import { load, mem } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { SIN, loadAssets, loadMeshes, mesh10, resetList, draw } from './engine3d.js';
const tr = (v, k) => Math.trunc(v / (1 << k)), ORD = 64 * 6 * 2.5 / 144;
const buf = new Uint8Array(64000), work = new Uint8Array(256 * 200), D = new Uint8Array(64000), A = new Uint8Array(64000), T = new Int32Array(0x7c * 256);
let tex, hmap, ov, strips, pal, A3, M;
export async function init() {
  const d = await load(); tex = mem(d, 0x3a0090); hmap = mem(d, 0x3c0090); ov = mem(d, 0x357510); strips = [0x386310, 0x39cc10, 0x389790].map(a => mem(d, a));
  pal = new Uint8Array(768); pal.set(mem(d, 0x357090).subarray(0, 0x240)); pal.set(mem(d, 0x356c10).subarray(0, 0xc0), 0x240);
  A3 = await loadAssets(); M = (await loadMeshes())[1];
  const k256 = 40.7436654315 / 256;  // the original multiplies by the truncated constant 40.7436654315 (differs from 256/2pi on exact multiples of 32 for negative angles)                                                  // tables of 0x107ce0: int(sqrt(x^2+y^2)), int(atan2(y,x)*256/2pi) (bytes), (al*32)/(k+1)-10 clamped
  for (let y = -100, i = 0; y < 100; y++) for (let x = -160; x < 160; x++, i++) { D[i] = Math.trunc(Math.sqrt(x * x + y * y)); A[i] = Math.trunc(Math.atan2(y, x) * 256 * k256); }
  for (let k = 0; k < 0x7c; k++) for (let a = 0; a < 256; a++) T[k * 256 + a] = Math.max(0, Math.trunc(a * 32 / (k + 1)) - 10);
}
function background(n) {                                                          // 0x107bc8
  work.fill(0);
  for (let x = 0; x < 256; x++) {
    let row = 199;
    for (let k = 0; k <= 0x60 && row >= 0; k++) {
      const j = ((n + k) & 0xff) + x * 256, t = T[k * 256 + hmap[j]];
      if (t < row) do { work[row * 256 + x] = tex[j]; row--; } while (row >= 0 && row > t);
    }
  }
  const sh = SIN[(8 * n) & 0xfff] >> 9;
  for (let i = 0; i < 64000; i++) buf[i] = work[(D[i] << 8) | ((A[i] + sh) & 0xff)];
}
/** nBg = tick at the start of the frame, nObj = tick read at the end of the previous frame (null = first frame: mesh at rest), order/row = S3M position for the text strips */
export function frame(nBg, nObj, order, row, fb) {
  background(nBg); resetList();
  const n = nObj ?? 0, o = nObj === null ? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 256 }
    : { x: tr(SIN[(6 * n) & 0xfff], 6), y: tr(SIN[(5 * n) & 0xfff], 6), z: tr(SIN[(9 * n) & 0xfff], 6), rx: 6 * n, ry: 7 * n, rz: 5 * n, scale: 256 };
  mesh10({ x: -500, y: 0, z: -2000, rx: 0, ry: 0, rz: 0 }, o, M, 8); draw(buf, A3);
  for (let i = 0; i < 64000; i++) if (ov[i]) buf[i] = ov[i] + 0xc0;
  const on = [order === 8 && row > 0x20 || order === 9 && row < 0x20, order === 9 && row > 0x20 || order === 10 && row < 0x20, order === 10 && row > 0x20 || order === 11 && row < 0x20];
  on.forEach((b, s) => { if (b) for (let i = 0; i < 0x3480; i++) if (strips[s][i] !== 0xff) buf[i] = strips[s][i] + 0xc0; });
  fb.set(buf);
}
export function render(t, ctx) {
  const n = Math.floor(7 + TICK * t), L = Math.floor(t / ORD), ROWS = 6 * 2.5 / 144;
  frame(n, n - 6, L, Math.floor((t - L * ORD) / ROWS), ctx.fb); dac(pal, level(1, t), ctx.pal);
}
export const palette = () => pal;
