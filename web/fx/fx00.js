// Scene 0: the eufrosyne logo (DAT image 7), copied to VGA every frame; only the palette changes (global fade/flash, fade.js).
// Original: 0x109760(2,12). Exact against the Unicorn run: pixels in all 1727 frames, DAC in all 1727 frames given the original's fade level (tools/fxcheck00.mjs).
import { load, images } from './dat.js';
import { level, dac } from './fade.js';
let img;
export async function init() { img = images(await load())[7]; }
export function frame(lv, ctx) { ctx.fb.set(img.pix); dac(img.pal, lv, ctx.pal); }
export function render(t, ctx) { frame(level(1, t), ctx); }
