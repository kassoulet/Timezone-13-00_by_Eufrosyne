// Scene 7: tunnel mesh 6 (type 12: flat faces shaded >>16, no bias) + 64 additive glow particles + 4-tap blur - the scene 1 engine with other speeds. Original: 0x102e90(34,16).
// A pure function of the timer tick n (read once at the start of the frame); exact for a given n (tools/fxcheck3d.mjs 07 0x1030ec ...).
import { load, images } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { SIN, loadAssets, loadMeshes, point, mesh10, resetList, draw } from './engine3d.js';
let pal, A, M;
const buf = new Uint8Array(64000), tr = (v, k) => Math.trunc(v / (1 << k));
export async function init() { pal = images(await load())[12].pal; A = await loadAssets(); M = await loadMeshes(); }
export function frame(n, fb) {
  const s = (m, k) => tr(SIN[m & 0xfff], k), d = m => Math.trunc(SIN[m & 0xfff] / 0xc0);
  const cam = { x: d(9 * n), y: -((48 * n) & 0x1fff), z: d(6 * n), rx: s(11 * n, 7) - 0x400, ry: d(7 * n), rz: d(9 * n) };
  buf.fill(0); resetList();
  mesh10(cam, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1024 }, M[6], 12);
  for (let k = 0, a = 14 * n, b = 11 * n, c = 9 * n; k < 64; k++, a += 0x543, b += 0x210f, c += 0xa56)
    point(cam, { x: s(a, 7), y: s(b, 5) + cam.y - 1000, z: s(c, 7) }, 5);
  draw(buf, A);
  fb.fill(0);
  for (let i = 0x1400; i < 0xe600; i++) fb[i] = (buf[i - 1] + buf[i + 1] + buf[i - 320] + buf[i + 320]) >> 2;
}
export function render(t, ctx) { frame(Math.floor(7 + TICK * t), ctx.fb); dac(pal, level(1, t), ctx.pal); }
export const palette = () => pal;
