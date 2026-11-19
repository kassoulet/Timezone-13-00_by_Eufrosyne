// node tools/checksin.mjs : the engine's SIN/COS tables (built with Math.sin/cos in web/fx/engine3d.js) equal the original's integer tables (re/sincos.i32, verified against the emulator by re/mk_sincos.py)
import { readFileSync } from 'node:fs';
import { SIN, COS } from '../web/fx/engine3d.js';
const ref = new Int32Array(readFileSync(new URL('../re/sincos.i32', import.meta.url)).buffer.slice(0));
let bad = 0; for (let i = 0; i < 4096; i++) { if (SIN[i] !== ref[i]) bad++; if (COS[i] !== ref[4096 + i]) bad++; }
console.log('mismatching entries:', bad, process.version); process.exit(bad ? 1 : 0);
