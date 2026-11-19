// The 3D engine shared by the scenes (original code: re/NOTES.md "3D engine"). Integer maths with the original's rounding: every x>>k of a signed value is
// the original's truncating "sar/sbb" idiom (toward zero), products wrap like imul, divisions are idiv (toward zero).
// Pipeline: transform (0x100ae0 meshes, 0x102060 points) -> render list (64-byte entries at 0x235e58) -> radix sort 0x107a78 -> rasterizers (0x1036ff flat triangle, 0x107937 additive glow).
export const SIN = new Int32Array(4096), COS = new Int32Array(4096);
{ let a = 0; for (let i = 0; i < 4096; i++) { SIN[i] = Math.trunc(Math.sin(a) * 32768); COS[i] = Math.trunc(Math.cos(a) * 32768); a += 0.001533980788085938; } }   // step = the double 0x3f5921fb54524552
let assets;
export async function loadAssets() {
  if (!assets) {
    const d = new Uint8Array(await (await fetch(new URL('../assets/tz13_3d.bin', import.meta.url))).arrayBuffer());
    assets = { mesh4: new Int32Array(d.buffer.slice(d.byteOffset, d.byteOffset + 20768)), sprite: d.subarray(20768, 20768 + 16384) };
  }
  return assets;
}
let meshes;   // the 7 meshes of the original (pointer table 0x260de8), by index
export async function loadMeshes() {
  if (!meshes) {
    const d = new Uint8Array(await (await fetch(new URL('../assets/tz13_mesh.bin', import.meta.url))).arrayBuffer());
    meshes = [0, 0xacc0, 0xecc0, 0x11540, 0x1b580, 0x206a0, 0x260e0].map(o => new Int32Array(d.buffer.slice(d.byteOffset + o, d.byteOffset + d.length)));
  }
  return meshes;
}
const tr = (v, k) => Math.trunc(v / (1 << k));                        // x >> k toward zero (sar + sbb idiom); v is an int32
const rot = (a, b, c, d, op) => tr(op ? (Math.imul(a, b) + Math.imul(c, d)) | 0 : (Math.imul(a, b) - Math.imul(c, d)) | 0, 15);   // (a*b -/+ c*d) >> 15
const idiv = (a, b) => Math.trunc(a / b) | 0;

export const W = 320, H = 200;
export const sx = new Int32Array(4096), sy = new Int32Array(4096), sd = new Int32Array(4096);   // projected vertices (0x25ee9c, 0x25cf5c, 0x25b01c), persist between frames like the original's
export let list = [];                                                  // render list: {t, x1,y1,x2,y2,x3,y3, key, p}  (t = entry type [+0x20], p = shade/size [+0x1c])
export const resetList = () => { list = []; };

/** 0x102060: point object (types 4,5,9,14) -> render list entry. cam = {x,y,z,rx,ry,rz}, o = {x,y,z} */
export function point(cam, o, type) {
  const dx = o.x - cam.x, dy = o.y - cam.y, dz = o.z - cam.z, cz = cam.rz & 0xfff, cx = cam.rx & 0xfff, cy = cam.ry & 0xfff;
  const x1 = rot(COS[cz], dx, SIN[cz], dy, 0), y1 = rot(dx, SIN[cz], dy, COS[cz], 1);
  const y2 = rot(y1, COS[cx], dz, SIN[cx], 0), z2 = rot(y1, SIN[cx], COS[cx], dz, 1);
  const x3 = rot(x1, COS[cy], z2, SIN[cy], 0), z3 = rot(x1, SIN[cy], z2, COS[cy], 1);
  const d = tr((z3 << 12) | 0, 8);
  let px = 0, py = 0;
  if (d > 0) { px = idiv((x3 << 12) | 0, d) + 0xa0; py = idiv((y2 << 12) | 0, d) + 0x64; }
  if (d > 0 && px > 0 && px < W && py > 0 && py < H) {                  // types: 4 = 16x16 point (src*8), 9 = 16x16 point (src*2 - size), 5 / 14 = glow (size from depth >>6 / >>7)
    const k3 = (d * 3) | 0, clampSz = v => Math.max(0x10, Math.min(0xff, v));
    if (type === 4) list.push({ t: 2, x1: px, y1: py, key: k3, p: 0 });
    if (type === 9) list.push({ t: 7, x1: px, y1: py, key: k3, p: k3 > 0x40000 ? 1 + tr(k3 - 0x40000, 12) : 1 });
    if (type === 5) list.push({ t: 5, x1: px, y1: py, key: k3, p: clampSz(0x100 - tr(d, 6) + 0x20) });
    if (type === 14) list.push({ t: 5, x1: px, y1: py, key: k3, p: clampSz(0x100 - tr(d, 7) + 0x20) });
  }
}

/** 0x100ae0 for mesh object types 10 (scene 1), 6/8 (shading >>17, no bias; 7/8 also emit a point entry per visible vertex): transform the mesh and emit flat triangles. mesh = Int32Array of the mesh (header + arrays) */
export function mesh10(cam, o, mesh, type = 10) {
  const nv = mesh[0], nf = mesh[1], ar = k => mesh[k] >> 2;           // array k starts at int index mesh[k]/4 ([ecx+4k] / 4 * 4 bytes)
  const X = ar(2), Y = ar(3), Z = ar(4), A = ar(10), B = ar(11), C = ar(12), N0 = ar(13), N1 = ar(14), N2 = ar(15);
  const crz = cam.rz & 0xfff, crx = cam.rx & 0xfff, cry = cam.ry & 0xfff, ox = o.rx & 0xfff, oy = o.ry & 0xfff, oz = o.rz & 0xfff, sc = o.scale;
  const d4 = o.x - cam.x, d0 = o.y - cam.y, cc = o.z - cam.z;
  // object rotation matrix (columns), then combined with the camera rotation (z, x, y) one column at a time
  const s5c = tr(Math.imul(SIN[oz], COS[ox]), 15), s68a = tr(Math.imul(SIN[oz], SIN[ox]), 15);
  const s60 = rot(COS[oz], COS[oy], s68a, SIN[oy], 0), s58 = rot(COS[oz], SIN[oy], s68a, COS[oy], 1);
  const s50 = tr(Math.imul(COS[oz], COS[ox]), 15), s68 = tr(Math.imul(COS[oz], SIN[ox]), 15);
  const nsz = -SIN[oz];
  const s54 = tr((Math.imul(COS[oy], nsz) - Math.imul(s68, SIN[oy])) | 0, 15), s4c = tr((Math.imul(s68, COS[oy]) + Math.imul(nsz, SIN[oy])) | 0, 15);
  const s44 = -SIN[ox], s48 = tr(Math.imul(-COS[ox], SIN[oy]), 15), s40 = tr(Math.imul(COS[ox], COS[oy]), 15);
  const col = (a, b, c) => {                                           // rotate (a,b,c) by camera z, x, y -> [x, y, z]
    const x1 = rot(a, COS[crz], b, SIN[crz], 0), y1 = rot(a, SIN[crz], b, COS[crz], 1);
    const y2 = rot(y1, COS[crx], c, SIN[crx], 0), z2 = rot(y1, SIN[crx], c, COS[crx], 1);
    return [rot(x1, COS[cry], z2, SIN[cry], 0), y2, rot(x1, SIN[cry], z2, COS[cry], 1)];
  };
  const c1 = col(s60, s5c, s58), c2 = col(s54, s50, s4c), c3 = col(s48, s44, s40);   // NB s58 / s4c / s40 are the third component (z) of each column
  const sc8 = v => tr(Math.imul(v, sc), 8);
  const m = [sc8(c1[0]), sc8(c1[1]), sc8(c1[2]), sc8(c2[0]), sc8(c2[1]), sc8(c2[2]), sc8(c3[0]), sc8(c3[1]), sc8(c3[2])];
  const lz = [c1[2], c2[2], c3[2]];                                    // z row, unscaled: [0xc], [0x4c], [8]
  const t = col(d4, d0, cc), tx = (t[0] << 12) | 0, ty = (t[1] << 12) | 0, tz = (t[2] << 12) | 0;
  for (let i = 0; i < nv; i++) {
    const vx = mesh[X + i], vy = mesh[Y + i], vz = mesh[Z + i];
    const px = (Math.imul(m[0], vx) + Math.imul(m[3], vy) + Math.imul(m[6], vz)) | 0;
    const py = (Math.imul(m[1], vx) + Math.imul(m[4], vy) + Math.imul(m[7], vz)) | 0;
    const pz = (Math.imul(m[2], vx) + Math.imul(m[5], vy) + Math.imul(m[8], vz)) | 0;
    const d = tr((tz + tr(pz, 1)) | 0, 8); sd[i] = d;
    if (d > 0) { sx[i] = idiv((tx + tr(px, 1)) | 0, d) + 0xa0; sy[i] = idiv((ty + tr(py, 1)) | 0, d) + 0x64; }
    if ((type === 2 || type === 3) && d > 0 && sx[i] > 0 && sx[i] < W && sy[i] > 0 && sy[i] < H) list.push({ t: 2, x1: sx[i], y1: sy[i], key: (d * 3) | 0, p: 0 });   // 0x10161: additive 16x16 point (src*8)
    if ((type === 7 || type === 8) && d > 0 && sx[i] > 0 && sx[i] < W && sy[i] > 0 && sy[i] < H) {   // 0x10167c: additive 16x16 point, size 1 + (3d-0x40000)>>12
      const k3 = (d * 3) | 0; list.push({ t: 7, x1: sx[i], y1: sy[i], key: k3, p: k3 > 0x40000 ? 1 + tr(k3 - 0x40000, 12) : 1 });
    }
  }
  const inside = i => sx[i] >= 0 && sx[i] < W && sy[i] >= 0 && sy[i] < H;
  const flat = type === 1 || type === 3, shaded = type === 6 || type === 8 || (type >= 10 && type <= 13);   // face loops 0x10179e (flat, no depth cue) / 0x101b90
  for (let j = 0; j < nf && (flat || shaded); j++) {
    const a = mesh[A + j], b = mesh[B + j], c = mesh[C + j];
    if (sd[a] <= 0 || sd[b] <= 0 || sd[c] <= 0) continue;
    if (!(inside(a) || inside(b) || inside(c))) continue;
    if (Math.imul(sy[a] - sy[c], sx[a] - sx[b]) >= Math.imul(sx[a] - sx[c], sy[a] - sy[b])) continue;   // back face
    const dot = (Math.imul(lz[0], mesh[N0 + j]) + Math.imul(lz[1], mesh[N1 + j]) + Math.imul(lz[2], mesh[N2 + j])) | 0;
    let sh = type === 6 || type === 8 || flat ? tr(dot, 17) : tr(dot, 16) + (type === 10 || type === 11 ? 0x28 : 0);
    const key = (sd[a] + sd[b] + sd[c]) | 0;
    sh = -sh; if (shaded && key > 0x40000) sh -= tr(key - 0x40000, 12);
    sh = sh > 0xc0 ? 0xbf : sh < 0 ? 0 : sh;
    list.push({ t: 1, x1: sx[a], y1: sy[a], x2: sx[b], y2: sy[b], x3: sx[c], y3: sy[c], key, p: sh });
  }
}

/** 0x107a78: stable radix sort of the keys (unsigned, ascending), then reversed: far (large key) first, equal keys in reverse entry order */
export function order() {
  const n = list.length, idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((p, q) => ((list[q].key >>> 0) - (list[p].key >>> 0)) || (q - p));
  return idx;
}

/** 0x1036ff -> 0x103154 (all vertices inside) / 0x103471 (clipped): flat triangle into buf (320x200 bytes) */
export function tri(buf, e) {
  const xs = [e.x1, e.x2, e.x3], ys = [e.y1, e.y2, e.y3], shade = e.p & 0xff;
  const fast = xs.every(x => x >= 2 && x < 320) && ys.every(y => y > 0 && y < 200);
  let b = 0, m = ys[0]; if (!(m < ys[1])) { m = ys[1]; b = 1; } if (!(m < ys[2])) b = 2;
  let d = 0, mx = ys[0]; if (!(mx > ys[1])) { mx = ys[1]; d = 1; } if (!(mx > ys[2])) d = 2;
  const md = 3 - b - d, xt = xs[b], yt = ys[b], xm = xs[md], ym = ys[md], xb = xs[d], yb = ys[d];
  if (yb === yt) return;
  const dv = (a, c) => idiv((a << 16) | 0, c || 1);
  const c = dv(xm - xt, ym - yt), p = dv(xb - xt, yb - yt), ed = -p, s = dv(xm - xb, yb - ym);
  const diff = ed < s ? ed - s : s - ed;
  const A1 = c >= p ? c : p, B1 = c >= p ? p - c : c - p, A2 = c >= p ? s : ed;
  const run = (base, y0, x0, lines, dy, A, B) => {                      // lines of spans; ebx = -(width) in 16.16, edi = right edge offset in 16.16
    let ebx = -65536, edi = 0, y = y0;
    for (let l = 0; l < lines; l++, y += dy) {
      const r = edi >> 16, w = ebx >> 16;
      if (fast) for (let k = w; k < 0; k++) buf[base + r + k] = shade;
      else if (dy > 0 && y > 199) return;                                // phase 1 stops below the screen, phase 2 above it
      else if (dy < 0 && y < 0) return;
      else if (y >= 0 && y <= 199) { const right = r + x0; if (right >= 0) for (let k = w; k < 0; k++) { const x = right + k; if (x > 319) break; if (x >= 0) buf[y * 320 + x] = shade; } }
      base += dy * 320; edi = (edi + A) | 0; ebx = (ebx + B) | 0;
    }
  };
  if (ym !== yt) run(yt * 320 + xt, yt, xt, ym - yt, 1, A1, B1);
  if (yb !== ym) run(yb * 320 + xb, yb, xb, yb - ym + 1, -1, A2, diff);
}

/** 0x1077dc: 16x16 box at (x-8,y-8), sprite sampled every 8th texel: dst = min(max(src*2 - size, 0) + dst, 0xbf) (0x107889 does the same with src*8) */
export function spot(buf, e, sprite, mul = 2) {
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const x = e.x1 - 8 + i, y = e.y1 - 8 + j; if (x < 0 || x > 319 || y < 0 || y > 199) continue;
    const v = Math.max(0, sprite[j * 1024 + i * 8] * mul - e.p) + buf[y * 320 + x]; buf[y * 320 + x] = v < 0xc0 ? v : 0xbf;
  }
}

/** 0x107937: 128x128 additive sprite scaled to size x size, centred on (x,y): dst = min(src*4 + dst, 0xbf) (0x1037dc sprite) */
export function glow(buf, e, sprite) {
  const size = e.p, x0 = e.x1 - (size >> 1), y0 = e.y1 - (size >> 1), step = idiv(0x800000, size);
  for (let y = y0, acc = 0; y < y0 + size; y++, acc += step) {
    if (y < 0 || y > 199) continue;
    const row = (acc >> 16) << 7;
    for (let x = x0, bx = 0; x < x0 + size; x++, bx += step) {
      if (x < 0 || x > 319) continue;
      const v = sprite[row + (bx >> 16)] * 4 + buf[y * 320 + x];
      buf[y * 320 + x] = v < 0xc0 ? v : 0xbf;
    }
  }
}

export function draw(buf, a) {
  for (const i of order()) { const e = list[i]; if (e.t === 1) tri(buf, e); else if (e.t === 5) glow(buf, e, a.sprite); else if (e.t === 7) spot(buf, e, a.sprite, 2); else if (e.t === 2) spot(buf, e, a.sprite, 8); }
}
