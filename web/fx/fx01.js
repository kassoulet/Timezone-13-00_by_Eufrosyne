// Scene 1: 3D tunnel (mesh 4, flat shaded) + 64 additive glow particles + "time zone +13:00" overlay (DAT image 6, from AUMAX order 4) + 4-tap blur. Original: 0x102b90(8,0).
// Animation = pure function of the timer tick n ([0x231f88]); the frame is exact for a given n (tools/fxcheck01.mjs); which n a given music time maps to is the fade.js tick fit.
import { load, images } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { SIN, loadAssets, point, mesh10, resetList, draw } from './engine3d.js';
let img, pal, ov, A;
const buf = new Uint8Array(64000), tr = (v, k) => Math.trunc(v / (1 << k)), ORD = 64 * 6 * 2.5 / 144;
export async function init() { const im = images(await load()); pal = im[12].pal; ov = im[6].pix; A = await loadAssets(); }
/** n = timer tick, order = AUMAX order, n2 = tick when the overlay reads it again (the original re-reads [0x231f88] after the 3D part; only differs if a tick elapsed meanwhile); draws the 320x200 index image into fb (rows 16..183 only, the rest stays 0) */
export function frame(n, order, fb, n2 = n) {
  const cam = { x: tr(SIN[(5 * n) & 0xfff], 7), y: -((n << 5) & 0x1fff), z: tr(SIN[(3 * n) & 0xfff], 7),
    rx: Math.trunc(SIN[(9 * n) & 0xfff] / 0xc0) - 0x400, ry: Math.trunc(SIN[(4 * n) & 0xfff] / 0xc0), rz: Math.trunc(SIN[(7 * n) & 0xfff] / 0xc0) };
  buf.fill(0); resetList();
  mesh10(cam, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1024 }, A.mesh4);
  for (let k = 0, a = 11 * n, b = 9 * n, c = 6 * n; k < 64; k++, a += 0x543, b += 0x210f, c += 0xa56)
    point(cam, { x: tr(SIN[a & 0xfff], 7), y: tr(SIN[b & 0xfff], 5) + cam.y - 1000, z: tr(SIN[c & 0xfff], 7) }, 5);
  draw(buf, A);
  if (order > 3) {
    const d = tr(SIN[((n2 >>> 1) + 0x500) & 0xfff], 7) + 0xd0;
    for (let i = 0x5000; i < 0xaa00; i++) if (ov[i]) buf[i] = Math.min(0xbf, Math.max(0, ov[i] - d) + buf[i]);
  }
  fb.fill(0);
  for (let i = 0x1400; i < 0xe600; i++) fb[i] = (buf[i - 1] + buf[i + 1] + buf[i - 320] + buf[i + 320]) >> 2;
}
export function render(t, ctx) {
  frame(Math.floor(7 + TICK * t), Math.floor(t / ORD), ctx.fb); dac(pal, level(1, t), ctx.pal);
}
export const palette = () => pal;
