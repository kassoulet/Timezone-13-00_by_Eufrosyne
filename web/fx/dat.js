// TZ1300.DAT = back-to-back MHWANH images: 'mhwanh', u16be version(4), u16be w, u16be h, u16be 256 colours, ... 32-byte header, 768-byte RGB palette (8-bit values, used as is),
// then w*h 8-bit pixels. 13 images: 8 x 320x200, 4 x 256x256, one 1x1 (palette only).
let dat;
export async function load() {
  dat ??= new Uint8Array(await (await fetch(new URL('../assets/TZ1300.DAT', import.meta.url))).arrayBuffer());
  return dat;
}
export function images(d) {
  const out = []; let p = 0;
  while (p + 32 <= d.length && String.fromCharCode(...d.subarray(p, p + 6)) === 'mhwanh') {
    const w = d[p + 8] << 8 | d[p + 9], h = d[p + 10] << 8 | d[p + 11];
    out.push({ w, h, pal: d.subarray(p + 32, p + 800), pix: d.subarray(p + 800, p + 800 + w * h) }); p += 800 + w * h;
  }
  return out;
}
