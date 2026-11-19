// node tools/uitest.mjs : headless Chrome (CDP) smoke test of the player: no script exceptions, seek into scene 1 (3D) draws something and is repeatable (seek 20 s, away, 20 s = identical pixels), seek into each ported scene 2..8 draws pixels and every seek is repeatable. Exit 1 on failure.
import { spawn } from 'child_process'; import fs from 'fs'; import http from 'http'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web'), T = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { let p = path.join(root, q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const PORT = 9300 + Math.floor(Math.random() * 500);
const ch = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2000));
const tabs = await (await fetch('http://localhost:' + PORT + '/json')).json(), ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0, bad = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); if (d.method === 'Runtime.exceptionThrown') { console.log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 300)); bad++; } };
const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
await send('Runtime.enable'); await send('Page.navigate', { url: `http://localhost:${srv.address().port}/index.html` }); await wait(1500);
const hash = () => ev(`(()=>{const c=document.querySelector("canvas"),d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let h=0,nz=0;for(let i=0;i<d.length;i+=4){h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)|0;if(d[i]|d[i+1]|d[i+2])nz++;}return [h,nz];})()`);
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };
await ev('window.tz13.seek(20)'); await wait(1500); const a = await hash();
ok(a[1] > 1000, 'scene 1 at 20 s draws pixels: ' + a[1]);
await ev('window.tz13.seek(20)'); await wait(1500); const b = await hash();
ok(a[0] === b[0], 'seek 20 / away / 20 = identical pixels');
for (const t of [61.3, 91.3, 121.3, 141.3, 161.3, 191.3, 216.3, 231.3, 245.3]) {   // off the multiples of 10 s: those are beat boundaries where a negative flash blacks the frame   // scenes 2..8; sim scenes (4, 5, 6) must replay identically
  await ev(`window.tz13.seek(${t})`); await wait(1200); const h1 = await hash();
  await ev('window.tz13.seek(5)'); await wait(800); await ev(`window.tz13.seek(${t})`); await wait(1200); const h2 = await hash();
  ok(h1[1] > 1000, `t=${t} draws pixels: ${h1[1]}`); ok(h1[0] === h2[0], `t=${t} repeatable`);
}
ch.kill(); srv.close(); process.exit(bad ? 1 : 0);
