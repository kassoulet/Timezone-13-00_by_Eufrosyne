// Scene 5: 192 glow-less additive points (type 4) pulled toward a moving attractor (type-14 glow), mesh 3 (type 3) in the middle, orbiting camera, 4-tap blur. Original: 0x102650(26,0).
// NOT a pure function of the tick: positions/velocities integrate (vel += (target-pos)>>9, pos += vel) once per elapsed tick, with the attractor sampled once per frame,
// and the start positions come from rand() (Watcom LCG, seed 1 assumed). The sim is advanced forward and restarted from the scene start when seeking backwards.
import { load, images } from './dat.js';
import { level, dac, TICK } from './fade.js';
import { FX } from '../timetable.js';
import { SIN, COS, loadAssets, loadMeshes, point, mesh10, resetList, draw } from './engine3d.js';
let pal, A, M;
const buf = new Uint8Array(64000), tr = (v, k) => Math.trunc(v / (1 << k)), N = 192;
const P = new Int32Array(N * 3), V = new Int32Array(N * 3);
let seed, simN = -1;
const rand = () => { seed = (Math.imul(seed, 0x41c64e6d) + 0x3039) >>> 0; return (seed >>> 16) & 0x7fff; };
export async function init() { pal = images(await load())[12].pal; A = await loadAssets(); M = await loadMeshes(); }
const s = n => SIN[n & 0xfff], c = n => COS[n & 0xfff];
/** 0x102650 prologue: random start positions, zero velocities. n0 = tick at the scene start */
export function reset(n0, seed0 = 1) {
  seed = seed0; V.fill(0);
  for (let k = 0; k < N; k++) {
    const a = rand() & 0xfff, e = tr(rand(), 10) + 0x30;
    P[k * 3] = Math.trunc(COS[a] / e);
    P[k * 3 + 1] = tr(rand(), 5) - 0x200;
    const b = rand() & 0xfff, f = tr(rand(), 10) + 0x30;
    P[k * 3 + 2] = Math.trunc(SIN[b] / f);
  }
  simN = n0;
}
const target = n => [tr(c(7 * n), 6), tr(s(23 * n), 7), tr(s(7 * n), 6)];
/** advance the sim to tick nPhys with the attractor sampled at tick n (the original re-reads the tick after computing the target) */
function step(n, nPhys, nSave = nPhys) {
  const t = target(n);
  for (let i = simN; i < nPhys; i++) for (let k = 0; k < N; k++) for (let j = 0; j < 3; j++) { const q = k * 3 + j; V[q] += tr(t[j] - P[q], 9); P[q] += V[q]; }
  simN = Math.max(simN, nSave);   // the original re-reads the tick AFTER the loop (0x102919): ticks that passed during it are lost
}
/** n = tick at the start of the frame, nPhys = tick read after the target was computed (>= n); draws the 320x200 index image into fb (rows 16..183 only) */
export function frame(n, nPhys, fb, nSave = nPhys) {
  step(n, nPhys, nSave);
  const a = 4 * n - 0x400, cam = { x: tr(-c(a), 5), y: 0, z: tr(s(a), 5), rx: tr(s(3 * n), 7), ry: 4 * n + tr(s(5 * n), 7), rz: tr(s(7 * n), 7) };
  buf.fill(0); resetList();
  mesh10(cam, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 320 }, M[3], 3);
  const t = target(n);
  point(cam, { x: t[0], y: t[1], z: t[2] }, 14);
  for (let k = 0; k < N; k++) point(cam, { x: P[k * 3], y: P[k * 3 + 1], z: P[k * 3 + 2] }, 4);
  draw(buf, A);
  fb.fill(0);
  for (let i = 0x1400; i < 0xe600; i++) fb[i] = (buf[i - 1] + buf[i + 1] + buf[i - 320] + buf[i + 320]) >> 2;
}
const K = 2, g0 = Math.floor(Math.floor(7 + TICK * FX[5].t0) / K) * K;   // frames every K ticks from the scene start (the DOS frame rate is machine dependent); replayed on seeks
export function render(t, ctx) {
  const g = Math.floor(Math.floor(7 + TICK * t) / K) * K;
  if (simN < 0 || g < simN) reset(g0);
  while (simN + K <= g) step(simN + K, simN + K);
  frame(g, g, ctx.fb); dac(pal, level(1, t), ctx.pal);
}
export const palette = () => pal;
export const save = () => [P.slice(), V.slice(), simN, seed];                                   // for tools/fxcheck05.mjs
export const restore = ([p, v, n, sd]) => { P.set(p); V.set(v); simN = n; seed = sd; };
