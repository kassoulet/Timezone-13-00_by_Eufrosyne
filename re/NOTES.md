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
Scene 1 initial object table at 0x20270c (count 65; read statics from obj2.bin). Has a post blur and an overlay (image at 0x323810, rows 64-136, sin-modulated brightness) after order 3. A bit-exact port needs the polygon rasterizers.

## Verification status
Scene 0: pixels identical to DAT image 7 in all 1727 oracle frames; DAC equals dac(pal, level) in all of them (tools/fxcheck00.mjs) given the original's own fade level.
Fade model: 2186 of 2194 timer-record levels within 1 tick (4 DAC units) with n = 7 + TICK*t and a 1.0048 drift factor for the harness music clock (tools/fxcheck_fade.mjs ORACLE.json 7).
