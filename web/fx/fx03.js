// Scene 3: two meshes (type 3: flat faces + additive points, 660 vertices, scale 2048; type 2: points only, 130 vertices, pulsing scale) with a swinging camera, 4-tap blur. Original: 0x1029b0(16,0).
// A pure function of the timer tick n (read once at the start of the frame); exact for a given n (tools/fxcheck3d.mjs 03 0x102b7b ...).
import { load, images } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { SIN, loadAssets, loadMeshes, mesh10, resetList, draw } from './engine3d.js';
let pal, A, M;
const buf = new Uint8Array(64000), tr = (v, k) => Math.trunc(v / (1 << k));
export async function init() { pal = images(await load())[12].pal; A = await loadAssets(); M = await loadMeshes(); }
/** n = timer tick; draws the 320x200 index image into fb (rows 16..183 only) */
export function frame(n, fb) {
  const s = (m, k) => tr(SIN[m & 0xfff], k);
  const cam = { x: -1024, y: s(4 * n, 4) - 0x1800, z: 0, rx: s(13 * n + 0x800, 9), ry: s(16 * n + 0x800, 8) + 0x400, rz: s(11 * n + 0x800, 8) - 0x300 };
  buf.fill(0); resetList();
  mesh10(cam, { x: 0, y: 0, z: 0, rx: 0, ry: 2 * n, rz: 0, scale: 2048 }, M[0], 3);
  mesh10(cam, { x: 0, y: 0, z: 0, rx: 4 * n, ry: 5 * n, rz: 3 * n, scale: s(32 * n, 7) + 0x300 }, M[2], 2);
  draw(buf, A);
  fb.fill(0);
  for (let i = 0x1400; i < 0xe600; i++) fb[i] = (buf[i - 1] + buf[i + 1] + buf[i - 320] + buf[i + 320]) >> 2;
}
export function render(t, ctx) { frame(Math.floor(7 + TICK * t), ctx.fb); dac(pal, level(1, t), ctx.pal); }
export const palette = () => pal;
