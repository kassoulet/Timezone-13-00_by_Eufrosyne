// node match.mjs SCENE(04|06) TAG I0 I1 A0 A1 PLIST   : fit (a,P): n_shot = a + 70.39*twall ; frames at n_i = n0 + round(P*i)
import { readFileSync } from 'node:fs';
const W='/home/gautier/SynologyDrive/code/current/demoports/frs_tz13/web/';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u, 'file://'+W+'fx/')), json: async()=>JSON.parse(readFileSync(new URL(u,'file://'+W+'fx/'))) });
const [sc, tag, i0, i1, a0, a1, pl] = process.argv.slice(2);
const M = await import(W+`fx/fx${sc}.js`); await M.init();
const { FX } = await import(W+'timetable.js');
const draw = M[`draw${+sc}`], pal = M.palette();
const lum = readFileSync(`${tag}/lum.bin`), times = readFileSync(`${tag}/times.txt`,'utf8').trim().split('\n').map(l=>+l.split(' ')[1]);
const Ps = pl.split(',').map(Number), TICK=70.39, n0 = Math.round(70*FX[+sc].t0+8.75);
const shots=[]; for (let i=+i0;i<+i1;i++) shots.push(i);
const L = new Float64Array(256); for (let i=0;i<256;i++) L[i]=.3*pal[3*i]+.59*pal[3*i+1]+.11*pal[3*i+2];
const fb=new Uint8Array(64000);
const ncc=(i)=>{ let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0; const o=i*64000;
 for(let k=2000;k<62000;k+=7){const x=lum[o+k],y=L[fb[k]];sa+=x;sb+=y;saa+=x*x;sbb+=y*y;sab+=x*y;n++;}
 const c=sab-sa*sb/n,v=Math.sqrt((saa-sa*sa/n)*(sbb-sb*sb/n)); return v?c/v:0; };
// per P: pre-simulate states lazily by frame index
const res=[];
for (const P of Ps) {
  // cache of frames score keyed by (frame index, shot)
  const sim=[]; M.reset(); sim.push(M.save()); // state before frame 0 = after 0 updates
  const state=(F)=>{ while(sim.length<=F){ const i=sim.length-1; M.restore(sim[i]); M.update(n0+Math.round(P*i)); sim.push(M.save()); } return sim[F]; };
  for (let a=+a0;a<=+a1;a+=1) {
    let tot=0, cnt=0;
    for (const i of shots) { const ns=a+TICK*times[i]; if(ns<n0) continue; const F=Math.floor((ns-n0)/P); M.restore(state(F)); draw(fb); tot+=ncc(i); cnt++; }
    res.push([tot/cnt,P,a]);
  }
}
res.sort((x,y)=>y[0]-x[0]); console.log(res.slice(0,12).map(r=>r.map(v=>+v.toFixed(3)).join(' ')).join('\n'));
