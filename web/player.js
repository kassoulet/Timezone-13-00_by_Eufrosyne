// player.js - 320x200 indexed canvas shown 4:3, music via libopenmpt (chiptune3), pause + seek, scene jump. Adapted from x14.
// Audio: global time t = AUMAX seconds (t < A_END), then PILIPS seconds + A_END; the module is swapped when t crosses A_END.
// FX module API (web/fx/fxNN.js): init() / render(t, ctx), ctx = {fb: Uint8Array(64000) indices, pal: Uint8Array(768) RGB 0..255, t}. Missing module = scene not ported yet.
import { FX, DUR, A_END, fxAt, fmt, displaySize } from './timetable.js';
const $ = id => document.getElementById(id);
const cvs = $('c'), g = cvs.getContext('2d'), img = g.createImageData(320, 200), px = new Uint32Array(img.data.buffer);
const ctx = { fb: new Uint8Array(64000), pal: new Uint8Array(768), t: 0 };
const mods = [], loading = [];
let playing = false, started = false, tBase = 0, wall0 = 0, cp = null, ac = null, drag = false, bufs = [], modIdx = -1;
const now = () => performance.now() / 1000;
const cur = () => playing ? Math.min(DUR, tBase + (now() - wall0)) : tBase;
const load = i => loading[i] ??= import(`./fx/fx${String(i).padStart(2, '0')}.js`).then(async m => { await m.init(); mods[i] = m; }, () => { mods[i] = null; });
function draw(t) {
  const i = fxAt(t), m = mods[i];
  if (m === undefined) load(i).then(() => { if (fxAt(cur()) === i) draw(cur()); });
  $('ph').textContent = m === null ? `${FX[i].name}: not yet ported` : '';
  if (!m) { px.fill(0xff000000); g.putImageData(img, 0, 0); return; }
  ctx.t = t; m.render(t, ctx);
  const p = ctx.pal;
  for (let k = 0; k < 64000; k++) { const j = ctx.fb[k] * 3; px[k] = 0xff000000 | p[j + 2] << 16 | p[j + 1] << 8 | p[j]; }
  g.putImageData(img, 0, 0);
}
const which = t => t < A_END ? 0 : 1, local = t => t < A_END ? t : t - A_END;
async function setMusic(t) {   // (re)load the module for t if needed, position it, keep the paused state
  const k = which(t);
  if (k !== modIdx) { modIdx = k; bufs[k] ??= await (await fetch(k ? 'assets/PILIPS.S3M' : 'assets/AUMAX.S3M')).arrayBuffer(); cp.play(bufs[k].slice(0)); if (!playing) cp.pause(); }
  cp.setPos(local(t));
}
async function initAudio() {
  const { ChiptuneJsPlayer } = await import('./vendor/chiptune3.js');
  ac = new AudioContext(); cp = new ChiptuneJsPlayer({ context: ac, repeatCount: 0, interpolationFilter: 8 });
  cp.gain.connect(ac.destination);
  await new Promise(r => cp.onInitialized(r));
  cp.onProgress(m => { const t = modIdx ? A_END + m.pos : m.pos; if (playing && Math.abs(t - cur()) > 0.25) { tBase = t; wall0 = now(); } });
  cp.onEnded(() => { if (modIdx && cur() > DUR - 1.5) {   // ignore the 'ended' of the module being replaced by cp.play() at the AUMAX -> PILIPS swap
     playing = false; tBase = DUR; sync(); } });
  await setMusic(tBase);
}
function layout() {
  const fs = !!document.fullscreenElement, { w, h } = displaySize(fs ? innerWidth : innerWidth * .96, fs ? innerHeight : innerHeight - 220, devicePixelRatio);
  $('stage').style.width = w + 'px'; $('stage').style.height = h + 'px';
}
addEventListener('resize', layout); document.addEventListener('fullscreenchange', layout); layout();
const sync = () => { $('pp').textContent = playing ? 'Pause' : 'Play'; };
async function play() {
  if (!started) { started = true; $('go').remove(); await initAudio().catch(console.error); }
  if (tBase >= DUR - 0.05) await seek(0);
  playing = true; wall0 = now(); if (cp) { cp.unpause(); ac.resume(); } sync();
}
function pause() { if (!playing) return; tBase = cur(); playing = false; cp && cp.pause(); sync(); }
async function seek(t) { t = Math.max(0, Math.min(DUR - 0.01, t)); tBase = t; wall0 = now(); draw(t); if (cp) await setMusic(t); }
const toggle = () => playing ? pause() : play();
$('pp').onclick = toggle; $('go').onclick = () => play();
$('b10').onclick = () => seek(cur() - 10); $('f10').onclick = () => seek(cur() + 10);
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
const sk = $('seek'); sk.max = Math.round(DUR * 10); sk.oninput = () => { drag = true; seek(sk.value / 10); }; sk.onchange = () => { drag = false; };
$('fxl').append(...FX.map(e => { const b = document.createElement('button'); b.textContent = `${e.i} ${e.name}`; b.title = fmt(e.t0); b.onclick = () => seek(e.t0 + 0.01); return b; }));
addEventListener('keydown', e => {
  const k = e.key, big = e.shiftKey ? 10 : 5;
  if (e.target === sk && (k === 'ArrowLeft' || k === 'ArrowRight')) e.preventDefault();
  if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'ArrowLeft') seek(cur() - big); else if (k === 'ArrowRight') seek(cur() + big);
  else if (k === 'ArrowUp') seek(FX[Math.max(0, fxAt(cur()) - 1)].t0 + 0.01);
  else if (k === 'ArrowDown') seek(FX[Math.min(FX.length - 1, fxAt(cur()) + 1)].t0 + 0.01);
  else if (k === 'f' || k === 'F') $('fs').click(); else if (k === 'm' || k === 'M') cp && cp.setVol(cp.gain.gain.value ? 0 : 1);
});
function loop() {
  const t = cur(), i = fxAt(t);
  if (playing && which(t) !== modIdx && cp) setMusic(t);   // crossed A_END: swap module
  if (!drag) sk.value = Math.round(t * 10);
  $('tm').textContent = fmt(t) + ' / ' + fmt(DUR);
  [...$('fxl').children].forEach((b, j) => b.classList.toggle('on', j === i));
  if (playing) draw(t);
  requestAnimationFrame(loop);
}
$('go').textContent = 'Click or press Space to start (sound on)'; window.tz13 = { seek, play, pause, cur, mod: () => modIdx, playing: () => playing };
draw(0); loop();
