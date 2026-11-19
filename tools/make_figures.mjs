// node tools/make_figures.mjs [OUTDIR=figures] : serves web/, drives headless Chrome (CDP) and saves a 4:3 (640x480) PNG of the port per time listed in SHOTS (names used by WRITEUP-effects.md),
// then dumps the fade level over time (fade.js) to OUTDIR/fade_level.json for tools/make_figures.py.
import { spawn } from 'child_process'; import fs from 'fs'; import http from 'http'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../web'), out = path.resolve(process.argv[2] || path.join(here, '../figures'));
const SHOTS = [['s0_logo', 8.3], ['s1_tunnel_intro', 20.3], ['s1_tunnel_title', 30.3], ['s1_tunnel_title2', 44.3], ['s2_landscape_tunnel', 65.3], ['s3_two_meshes', 95.3], ['s4_landscape_mesh', 120.3],
  ['s5_swarm_a', 140.3], ['s5_swarm_b', 165.3], ['s6_landscape_rot', 190.3], ['s7_tunnel_glows', 216.3], ['s8_ending_a', 235.3], ['s8_ending_b', 248.3]];
const T = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { let p = path.join(root, q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const PORT = 9300 + Math.floor(Math.random() * 500);
const ch = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2000));
const tabs = await (await fetch('http://localhost:' + PORT + '/json')).json(), ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
await send('Runtime.enable'); await send('Page.navigate', { url: `http://localhost:${srv.address().port}/index.html` }); await wait(1500);
fs.mkdirSync(out, { recursive: true });
for (const [name, t] of SHOTS) {
  await ev(`window.tz13.seek(${t})`); await wait(1800);
  const url = await ev(`(()=>{const c=document.querySelector("canvas"),o=document.createElement("canvas");o.width=640;o.height=480;const g=o.getContext("2d");g.imageSmoothingEnabled=false;g.drawImage(c,0,0,640,480);return o.toDataURL("image/png");})()`);
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64')); console.log(name, t);
}
ch.kill(); srv.close();
const { level } = await import(path.join(root, 'fx/fade.js'));
const A = [], P = []; for (let k = 0; k < 240 * 20; k++) A.push(level(1, k / 20)); for (let k = 0; k < 34 * 20; k++) P.push(level(2, k / 20));
fs.writeFileSync(path.join(out, 'fade_level.json'), JSON.stringify({ dt: 0.05, aumax: A, pilips: P }));
process.exit(0);
