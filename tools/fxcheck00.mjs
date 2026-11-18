// node tools/fxcheck00.mjs ORACLE.json PREFIX : scene 0 pixels + DAC vs the oracle frames (PREFIX.idx.bin / .pal.bin, tools/export_oracle.py ... 0x1097dd PREFIX)
import { readFileSync } from 'node:fs';
import { images } from '../web/fx/dat.js';
import { frame, init } from '../web/fx/fx00.js';
globalThis.fetch = async () => ({ arrayBuffer: async () => readFileSync(new URL('../web/assets/TZ1300.DAT', import.meta.url)) });
await init();
const o = JSON.parse(readFileSync(process.argv[2])), idx = readFileSync(process.argv[3] + '.idx.bin'), pal = readFileSync(process.argv[3] + '.pal.bin');
const fr = o.frames.filter(f => f[0] === 0x1097dd), ctx = { fb: new Uint8Array(64000), pal: new Uint8Array(768) };
let bp = 0, bd = 0;
fr.forEach((f, i) => {
  frame(f[4], ctx);
  for (let k = 0; k < 64000; k++) if (ctx.fb[k] !== idx[i * 64000 + k]) { bp++; break; }
  for (let k = 0; k < 768; k++) if ((ctx.pal[k] >> 2) !== pal[i * 768 + k]) { bd++; break; }   // port keeps 8-bit expanded DAC: v<<2|v>>4
});
console.log('frames', fr.length, 'frames with differing pixels', bp, 'frames with differing DAC', bd);
