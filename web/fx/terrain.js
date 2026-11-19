// The texture-mapped "landscape" painters of scenes 4 (0x108d78) and 6 (0x108ec1) with their tables (built by 0x108100 at start-up).
// Both are self-modifying x86: per column L (2 px wide in scene 4, 2 px tall in scene 6) 128 samples are walked; the three increments (patched immediates) are
// cos[2L], sin[esi+2L], cos[esi+2L] (65536*sin/cos of 0.7953981635 - i*2pi/1280, truncated, i < 1600) and grow by half their value every 32 samples.
// Each sample gives a texture address (16 bits: u from the B accumulator, v from the C accumulator) and a distance row; the height map (image 8) picks a division table
// entry (0x640 + 0x20*row) / c that is the screen limit up to which the column is painted with the sample's texel (painting goes from the bottom / from the right).
const S = new Int32Array(1600), C = new Int32Array(1600), T4 = new Int32Array(256 * 256), U = new Int32Array(128), R = new Int32Array(128);
for (let i = 0, x = 0.7953981635; i < 1600; i++, x -= 0.004908738521875) { S[i] = Math.trunc(Math.sin(x) * 65536); C[i] = Math.trunc(Math.cos(x) * 65536); }
for (let r = 0; r < 256; r++) for (let c = 1; c <= 256; c++) T4[r * 256 + c - 1] = Math.trunc((0x640 + 0x20 * r) / c);
function samples(L, esi, B, Cc) {
  const v1 = C[2 * L], v2 = S[esi + 2 * L], v3 = C[esi + 2 * L];
  let a = B, s = Cc, e = 0, i1 = v1, i2 = v2, i3 = v3;
  for (let q = 0; q < 128; q++) {
    if (q && !(q & 31)) { i1 += v1 >> 1; i2 += v2 >> 1; i3 += v3 >> 1; }
    U[q] = ((a >> 16) & 0xff) | ((s >> 16) & 0xff) << 8; R[q] = e >> 16;
    a = (a + i2) | 0; s = (s + i3) | 0; e = (e + i1) | 0;
  }
}
/** scene 4: buf (320x200, zeroed by the caller) */
export function paint4(buf, tex, hmap, esi, B, Cc) {
  for (let L = 0x91; L >= 1; L--) {
    samples(L, esi, B, Cc);
    let y = 199, p = 199 * 320 + 2 * L - 2;
    for (let q = 0; q < 128; q++) {
      const u = U[q], c = tex[u], h = T4[(R[q] & ~0xff00) | hmap[u] << 8];
      while (h < y) { buf[p] = c; buf[p + 1] = c; y--; p -= 320; }
    }
  }
}
/** scene 6: same walk, painted right to left in two-pixel-tall bands */
export function paint6(buf, tex, hmap, esi, B, Cc) {
  for (let L = 0x63; L >= 1; L--) {
    samples(L, esi, B, Cc);
    let y = 0xb7, p = L * 640 + 0x13f;
    for (let q = 0; q < 128; q++) {
      const u = U[q], c = tex[u], h = T4[(R[q] & ~0xff00) | hmap[u] << 8] - L - 0x28;
      while (h < y) { buf[p] = c; buf[p + 320] = c; y--; p--; }
    }
  }
}
