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
// The original reads these slices of TZ1300.DAT into fixed memory at start (0x109070, re/NOTES.md): memory address -> [file offset, length].
const MEM = { 0x304110: [0x20, 0x300], 0x313e10: [0x320, 0xfa00], 0x304410: [0x10040, 0xfa00], 0x386310: [0x1fd60, 0x3480], 0x39cc10: [0x231e0, 0x3480], 0x389790: [0x26660, 0x3480],
  0x357510: [0x2fa80, 0xfa00], 0x356c10: [0x2f780, 0xc0], 0x366f10: [0x3f7a0, 0xfa00], 0x356cd0: [0x3f4a0, 0xc0], 0x376910: [0x4f4c0, 0xfa00], 0x356d90: [0x4f1c0, 0xc0],
  0x323810: [0x5f1e0, 0xfa00], 0x347210: [0x6ef00, 0xfa00], 0x346c10: [0x6ec00, 0x300], 0x3c0090: [0x7ec20, 0x10000], 0x3b0090: [0x8ef40, 0x10000], 0x3572d0: [0x8ec40, 0x240],
  0x38cc10: [0x9f260, 0x10000], 0x356e50: [0x9ef60, 0x240], 0x3a0090: [0xaf580, 0x10000], 0x357090: [0xaf280, 0x240], 0x346f10: [0xbf5a0, 0x300] };
export const mem = (d, addr) => { const [o, n] = MEM[addr]; return d.subarray(o, o + n); };
