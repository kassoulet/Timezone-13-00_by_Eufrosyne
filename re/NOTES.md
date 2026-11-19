# TZ13 (Time Zone +13:00, Euphrosyne, Juhla IVb 1997) - reverse-engineering notes

## Files
TZ1300.EXE = MZ stub + PMODE/W 1.32 (at 0x55) + an UNCOMPRESSED LE at file offset 0x2cf8 (no unpacking needed; `le.py` parses it, copied from ../markku/re).
Watcom C + MIDAS Sound System 0.5.0. obj1 = code (0x1e2a0 bytes at 0x100000), obj2 = data/bss (0x1d1810 at 0x200000, stack at its top), entry obj1+0xe6d0.
`re/obj1.bin`, `re/obj2.bin` = relocated objects, `re/dis.sh` (`dis START STOP`) disassembles obj1.

## Harness (Unicorn)
`re/emucore.py`, `vga.py`, `harness.py` (from ../markku, adapted): virtual clock (20 ns/insn, 1 us/port access). PMODE/W specifics: int 21h ax=2502/2504 (get/set PM vector, CL = irq vector: timer IRQ8, kbd IRQ9),
ah=07/08 getch. The MIDAS menu is answered with keys (Down x12, Enter = "No Sound"). `python3 harness.py OUTDIR T0 T1 STEP` (NOT with -I, imports siblings; env CKPT/CKN = checkpoints). ~10 s host per demo second.
`re/oracle.py OUT.npz TMAX` hooks the position poll 0x100340 and records meta + the 320x200 indexed CRT image + the 768-byte DAC per frame (ret 0x10039c = from the timer callback, 0x1097dd = logo frame, 0x102e7b = scene 1 frame; the filter constant inside oracle.py wrongly says 0x100397, tools/export_oracle.py splits by ret instead).
`tools/export_oracle.py` -> JSON (+ raw frames of one scene). Oracle 0..32 s exists only in the scratchpad (regenerate: ~6 min).
Known harness quirk: no sound card => MIDAS assumes a 70 Hz tick, the music runs ~0.5% fast vs nominal. A harmless "Domain error in atan2" is printed at start.

## Program structure
main 0x100010: loads AUMAX.S3M, plays it with MIDAS, installs timer callbacks (0x100370 timer, 0x100900 VR palette upload, 0x100910 sync), then calls effects in sequence.
Each effect f(endOrder, endRow, ...) loops until the S3M position (order [0x231f84], row [0x231f7c], polled by 0x100340) reaches the end. Effects draw straight to 0xA0000 (mode 13h) via [0x22ea44].
Animation = function of the timer tick n = [0x231f88] (PIT reload 16951 => 70.39 Hz) and of the music position.

| # | function | ends at | time | content |
|---|---|---|---|---|
| 0 | 0x109760(2,12) | AUMAX (2,12) | 14.58 s | logo (DAT image 7) |
| 1 | 0x102b90(8,0) | order 8 | 53.3 s | 3D tunnel + additive glow particles + "time zone +13:00" overlay |
| 2 | 0x107e10(12,0) | order 12 | 80 s | not analysed |
| 3 | 0x1029b0(16,0) | order 16 | 106.7 s | not analysed |
| 4 | 0x108250(20,0) | order 20 | 133.3 s | not analysed |
| 5 | 0x102650(26,0) | order 26 | 173.3 s | not analysed |
| 6 | 0x108530(30,32) | (30,32) | 203.3 s | not analysed |
| 7 | 0x102e90(34,16) | (34,16) | 228.33 s | not analysed |
| 8 | 0x1097f0(4,16) | PILIPS (4,16) | +28.33 s | ending; AUMAX stopped, PILIPS loaded |

AUMAX: speed 6 / tempo 144 constant, 0.10417 s/row, 6.667 s/order, 233.33 s. PILIPS 33.33 s. Total ~256.7 s. `re/s3mtime.py` = timeline; the S3M references patterns that do not exist (treated as 64 empty rows).

## Timer callback 0x100370 (fade state machine)
Each tick: n++, poll position, run fade on cmd [0x231f70] and level edi [0x231f74] (-256..0). Palette upload 0x100a00: DAC = clamp(pal[i]+level,0,255)>>2.
cmd 0 = decay 4/tick to 0; 1 = +2 (then 0 above 0); 2 = -2; 3 = -8; 4 = -1; 5 = +1; floor -256.
Events by (order,row), module 1: (0,58) in; (1,58) c2; (2,12) in; (7,40) c2; (8,0) c0; (11,58) c3; (12,0) in; (15,58) c3; (16,0) in; (19,58) c3; (20,0) in; (25,40) c2; (26,0) c0+reset; (30,26) c3; (30,32) in; (33,32) c4.
Module 2: (0,0) in; (3,0) c4. The 416 S3M `W` commands in AUMAX (info 0x10-0x14) call 0x100910, which sets level to +-0x80/+-0x40 when cmd==0 (beat flashes). Ported in web/fx/fade.js (+ web/fx/sync.js from re/mk_sync.py).

## TZ1300.DAT
13 concatenated "mhwanh" images: 32-byte big-endian header (version 4, w, h, 256), 768-byte palette (8-bit, used >>2 for the DAC), w*h indices.
Images 0-7: 320x200 (64800 bytes); 8-11: 256x256; 12: 1x1 (palette only; scene 1 uses it). Image 7 = the logo. Parser: web/fx/dat.js.

## 3D engine (scenes share it) - for the next step
sin/cos tables 4096 x int32 at 0x333210 / 0x300110, built by 0x102570 as int(sin(a)*32768) (truncated), a += double 0x3f5921fb54524552 per entry. Verified exact in Python (check JS Math.sin for ulp differences).
Objects: 32 bytes (x,y,z at +0,4,8; size +0x1c; type byte +0x1e), dispatch table 0x102440. Renderer 0x1024a0(count, camera, objs): per-type transforms 0x102060 (point types 4,9,5,14), 0x100ae0 (meshes, type 10 = tunnel).
Render list: 64-byte entries at 0x235e58, radix sort 0x107a78 (32 passes, key +0x18, descending depth). Sprite blitters: 0x107937 = 128x128 additive glow (self-modifying code from 0x1037dc; dst = min(src*4+dst, 0xbf)), others 0x1036ff, 0x107889, 0x1077dc.
Scene 1 initial object table at 0x20270c (count 65; obj0 = type 10 tunnel, mesh 4 = 0x21edb8, scale 1024; obj1..64 set to type 5 = glow particles by the scene). **Ported exactly: web/fx/fx01.js + engine3d.js.**

## Verification status
Scene 0: pixels identical to DAT image 7 in all 1727 oracle frames; DAC equals dac(pal, level) in all of them (tools/fxcheck00.mjs) given the original's own fade level.
Fade model: 2186 of 2194 timer-record levels within 1 tick (4 DAC units) with n = 7 + TICK*t and a 1.0048 drift factor for the harness music clock (tools/fxcheck_fade.mjs ORACLE.json 7).

## Scene 1 (0x102b90) as ported - the details that matter
Per frame, n = [0x231f88] read once at the start: camera x=sin[5n]/128, y=-((n<<5)&0x1fff), z=sin[3n]/128, rot x=sin[9n]/0xc0-0x400, y=sin[4n]/0xc0, z=sin[7n]/0xc0 (all truncating, tables indexed &0xfff); particle k (k=0..63): x=sin[(11n+0x543k)]/128, y=sin[(9n+0x210fk)]/32 + camY - 1000, z=sin[(6n+0xa56k)]/128.
Buffer 0x337210 (320x200) cleared; mesh 0x100ae0 -> entries; points 0x102060 -> entries; radix sort (stable, key unsigned ascending, then REVERSED: far first, ties = higher entry first); rasterize; if order>3: overlay (DAT image 6, rows 64..136, v = max(img - d, 0) + buf, clamp 0xbf, d = sin[((n>>1)+0x500)&0xfff]/128 + 0xd0, n re-read at that point); blur out[i] = (b[i-1]+b[i+1]+b[i-320]+b[i+320])>>2 for i in 0x1400..0xe5ff (rows 16..183, the rest of the screen stays 0). Palette = DAT image 12's, through the fade.
Tunnel mesh (0x100ae0, type 10): header int32 [nv, nf, off...] with arrays /4: x(2) y(3) z(4) face a(10) b(11) c(12) face normal nx(13) ny(14) nz(15). Matrix = object rot (z, x, y composition, 3 columns) then camera z, x, y per column, scaled by obj scale >>8; vertex = column combination; depth = (acc/2 + camZ<<12)>>8; screen = (acc/2 + cam<<12)/depth + (160,100). Faces need depth>0 for all 3, one vertex on screen, back-face (ya-yc)(xa-xb) < (xa-xc)(ya-yb); shade = -((camera-z row . normal)>>16 + 0x28) - (sumdepth-0x40000)/4096 if over, clamped 0..0xbf; key = sum of depths.
Flat triangle 0x1036ff: vertices sorted by y (ties go to the later vertex), 16.16 edge slopes via idiv (dy 0 -> 1), two phases (top->mid exclusive of mid row, bottom->mid inclusive of the mid row going up), span = [right+(ebx>>16), right) with right = x0 + (edi>>16); fast path (0x103154) when all x in [2,319] and y in [1,199], else per-pixel clip (0x103471). Glow 0x107937: 128x128 sprite at 0x1037dc scaled to size (entry +0x1c = clamp(0x100 - z/64 + 0x20, 0x10, 0xff)), step = 0x800000/size, dst = min(src*4+dst, 0xbf).
Tables: sin/cos are Math.sin/cos exact (tools/checksin.mjs, re/mk_sincos.py).

## DAT slices and meshes (all scenes)
The original reads slices of TZ1300.DAT (absolute file offsets) into fixed memory at start (0x109070); the table is `MEM` in web/fx/dat.js (all compared equal to the memory dump). The 7 meshes (pointer table 0x260de8, obj2 0x203838..0x22e9b8) are extracted by re/mk_assets3d.py into web/assets/tz13_mesh.bin.
Object table layout (scenes 2-7): count, camera {x,y,z,rx,ry,rz} at +4..+0x18, objects of 32 bytes from +0x1c (x,y,z,rx,ry,rz,scale,mesh byte +0x1c,type byte +0x1e). Types 4,5,9,14 = points (0x102060), the rest meshes (0x100ae0).
Mesh types in engine3d.js `mesh10(.., type)`: 1/3 flat faces (>>17, no depth cue); 6/8 >>17 with depth cue; 10/11 >>16 +0x28 with depth cue; 12/13 >>16 with depth cue; shade is negated and clamped 0..0xbf. Types 2/3 emit an entry type 2 per visible vertex (16x16 additive point, src*8), 7/8 an entry type 7 (src*2 - size, size = 1 + (3d-0x40000)>>12). Point objects: 4 -> entry 2, 9 -> entry 7, 5 / 14 -> glow with size clamp(0x100 - d>>6 (or >>7 for 14) + 0x20, 0x10, 0xff).

## Scene 2 (0x107e10) - ported, exact (web/fx/fx02.js)
Tables of 0x107ce0: D = trunc(sqrt(x^2+y^2)); A = trunc(atan2(y,x) * 256 * 0.1591549431) is WRONG on exact multiples of 32 for negative angles: the original multiplies by the truncated constant 40.7436654315 (0 differences against the emulator table); T[k][a] = max(0, a*32/(k+1) - 10).
Background 0x107bc8: 256x200 work map; per column x, k = 0..0x60: j = ((n+k)&255) + 256x, t = T[k][heightmap[j]], rows from the bottom up to t are filled with texture[j]; the screen is work[D<<8 | (A + sin[8n]>>9)&255]. The object (mesh 1, type 8, scale 256, camera (-500,0,-2000)) uses the tick read at the END of the previous frame (rot 6n,7n,5n; pos sin[6n]/64, sin[5n]/64, sin[9n]/64); first frame: at rest. Then overlay (DAT image 3, +0xc0) and text strips by (order,row).

## Scenes 3 and 7 (pure functions of n)
Scene 3 (0x1029b0): camera x=-1024, y=(sin[4n]>>4)-0x1800, z=0, rx=sin[13n+0x800]>>9, ry=(sin[16n+0x800]>>8)+0x400, rz=(sin[11n+0x800]>>8)-0x300; mesh 0 (type 3, scale 2048, ry=2n) and mesh 2 (type 2, rot 4n,5n,3n, scale (sin[32n]>>7)+0x300); blur rows 16..183.
Scene 7 (0x102e90): camera as scene 1 with sin/0xc0; mesh 6 type 12 scale 1024; 64 type-5 glows like scene 1 (x=sin[14n+0x543k]>>7, y=(sin[11n+0x210fk]>>5)+camY-1000, z=sin[9n+0xa56k]>>7); blur.

## Scene 5 (0x102650): simulation with history
192 type-4 points (obj 2..193), obj1 = type-14 glow attractor at (cos[7n]>>6, sin[23n]>>7, sin[7n]>>6), obj0 = mesh 3 type 3 scale 320; camera (-cos[4n-0x400]>>5, 0, sin[4n-0x400]>>5, rot sin[3n]>>7, 4n+sin[5n]>>7, sin[7n]>>7).
Start positions from 5 rand() per point (Watcom LCG seed*0x41c64e6d+0x3039, (seed>>16)&0x7fff): x = cos[r1&0xfff]/((r2>>10)+0x30), y = (r3>>5)-0x200, z = sin[r4&0xfff]/((r5>>10)+0x30). Velocities 0. Per elapsed tick (n_now - n_saved, attractor sampled once per frame): v += (target-p)>>9 (truncating), p += v.

## Scenes 4 and 6 (0x108250, 0x108530): landscape painters
Self-modifying painters 0x108d78 / 0x108ec1 are ported in web/fx/terrain.js (comments there). Tables from 0x108100: sin/cos(0.7953981635 - i*0.004908738521875)*65536 truncated (0 differences vs memory), division table (0x640+0x20r)/c. Per FRAME (not per tick): heading e = (sin[4n]>>7 + sin[7n]>>8 + 0x280) mod 0x500 (scene 6: sin[2n]>>6 + sin[5n]>>8), B -= 2*sin[e*4096/0x500], C += 2*cos[..] (scene 6: without the factor 2); the painter of the next frame gets (e, B, C). Scene 4 also draws mesh 5 (type 8, scale 192, camera (400,-500,-1500,256,0,0), rot (sin[13n]>>7, 7n, sin[9n]>>7), pos (sin[6n]>>6, sin[5n]>>7, sin[9n]/0x60), updated after the render) and the overlay.

## Ending (0x1097f0)
out[i] = max(0, img1[i]/2 - e) + max(0, img0[i]/2 - (0x80-e)) (bytes) for i in 0x3c00..0xbdff, e = (sin[2n+0x100]>>9) + 0x40, n = ticks since the ending started; then noise: 3 rand() per frame (bx = n*r1, dx = n*0x1333+0x28a38+r2, si = -r3*0x7d8d, di = 0x1e000000; buf[i] += (bx&0x1f)+0xc; then si += i+si, bx += dx, dx -= di+si, di += 0x8000).

## Verification status
Exact against the Unicorn oracle (0 differing pixels, DAC equal where checked): scene 2 311/311 (strips read the (order,row) a record earlier in rare frames), scene 3 241/241, scene 4 341/341, scene 6 914/914, scene 7 268/268, ending 726/726. Scene 5: 440/440 exact when fed the original's steps-per-frame (re/m5.json, from re/dump5.py which dumps the object table 0x200e54 at every frame end; every consecutive pair of tables is reproduced exactly by v += (target-p)/512, p += v repeated m times, m = 5..9, target = the table's own attractor). The greedy tick search of fxcheck05 without m5.json fails after 38 frames only because the step count (ticks elapsed between two reads of the timer) is ambiguous visually.
Bugs found by the oracle: (1) scene 7: mesh 6's normal-z array runs past the end of the mesh (the original reads the 0x80 bytes after it at 0x22e9b8; web/assets/tz13_mesh.bin now includes them); (2) scenes 4/6: the division table has 256 rows (height map values go up to 250), not 250; (3) ending: the tick is read three times per frame (blend 0x109872, noise 0x1098fc and 0x109905; ticks pass while the blend runs), fx08 frame(n, f, fb, n2, n3).
Checkers: fxcheck3d.mjs 07 0x1030ec ..., fxcheck46.mjs 04 0x10851d / 06 0x10870e, fxcheck08.mjs (f8 = ending frames; scene 4 = f4, scene 6 = f6 in the scratch naming).
