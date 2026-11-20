// node ntick.mjs SCENE(07|03) TAG NLO NHI STEP SHOTS(comma)  -> best n per shot (NCC). scenes 3/7 are pure functions of n.
import { readFileSync } from 'node:fs';
const W='/home/gautier/SynologyDrive/code/current/demoports/frs_tz13/web/';
globalThis.fetch = async u => ({ arrayBuffer: async () => readFileSync(new URL(u, 'file://'+W+'fx/')) });
const [sc, tag, lo, hi, st, sl] = process.argv.slice(2);
const M = await import(W+`fx/fx${sc}.js`); await M.init(); const pal=M.palette();
const lum = readFileSync(`${tag}/lum.bin`), fb=new Uint8Array(64000);
const L = new Float64Array(256); for (let i=0;i<256;i++) L[i]=.3*pal[3*i]+.59*pal[3*i+1]+.11*pal[3*i+2];
const ncc=(i)=>{ let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0; const o=i*64000;
 for(let k=2000;k<62000;k+=5){const x=lum[o+k],y=L[fb[k]];sa+=x;sb+=y;saa+=x*x;sbb+=y*y;sab+=x*y;n++;}
 const c=sab-sa*sb/n,v=Math.sqrt((saa-sa*sa/n)*(sbb-sb*sb/n)); return v?c/v:0; };
for (const i of sl.split(',').map(Number)) {
  let best=[-2,0];
  for (let n=+lo;n<=+hi;n+=+st){ M.frame(n,fb); const c=ncc(i); if(c>best[0])best=[c,n]; }
  for (let n=best[1]-+st;n<=best[1]+ +st;n++){ M.frame(n,fb); const c=ncc(i); if(c>best[0])best=[c,n]; }
  console.log(tag,i,'n',best[1],'ncc',best[0].toFixed(3));
}
