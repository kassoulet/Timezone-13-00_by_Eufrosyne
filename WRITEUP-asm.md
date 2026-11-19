# Time Zone +13:00 (Eufrosyne, 1997) - asm snippets worth reading

All addresses are linear addresses of obj1 (code) as loaded by `re/le.py` at `0x100000` (data object at `0x200000`). `TZ1300.EXE` is an MZ stub + PMODE/W 1.32 + an **uncompressed** LE image, so no unpacking is needed.
Listings are `objdump -D -b binary -mi386 -M intel --adjust-vma=0x100000` of `re/obj1.bin` (`re/dis.sh`) started at the first address of each excerpt (the instruction bytes are dropped, `;` comments are mine).
Every excerpt was re-checked mechanically against a fresh disassembly of the binary by a script (`tools/check_writeup_asm.py`) that compares the address and instruction text of every listing line (see the end of the file); the JavaScript is the port in `web/fx/`.
The code is a mix of **Watcom C** (the glue, the scene drivers, the compiler idioms that show up everywhere) and **hand-written asm** (rasterisers, painters, sort) that is full of **self-modifying code**: the code object is writable, and several loops live next to
the variables they patch (`0x1030fc..0x1037d8` are variables *inside the code object*; the 128x128 glow sprite sits right behind them at `0x1037dc`).

---

## 1. Signed `x >> k` that rounds toward zero in four instructions (`0x1020eb`)

Every fixed-point product of the engine is shifted back down with the same four instructions (hundreds of copies; here the first rotation of the point transform, `0x102060`):

```
1020e3: mov edx,DWORD PTR [esp+0x24]
1020e7: sub edx,eax
1020e9: mov eax,edx
1020eb: sar edx,0x1f           ; edx = 0 or -1 (sign mask)
1020ee: shl edx,0xf            ; edx = 0 or 0xffff8000, and CF = 1 exactly when edx was -1
1020f1: sbb eax,edx            ; eax - edx - CF = eax + 0x7fff for negative eax, eax for positive
1020f3: sar eax,0xf            ; arithmetic shift of the biased value = truncation toward zero
```

`sar` alone rounds toward minus infinity; C's `/ 32768` rounds toward zero, which is what the compiler must produce. A bias of `2^k - 1` for negative values fixes it, and the usual way is a branch or `cdq; and; add`. Here the `shl` of the
sign mask is used for *both* jobs: its result is the bias half (`0xffff8000`) and its **carry-out** (bit 17 of `-1` shifted out) is the missing `+1` that `sbb` subtracts, so `eax - 0xffff8000 - 1 = eax + 0x7fff`. Branch-free, no `and`.
This is a Watcom idiom (it is in every `>> k` of the C code, e.g. `shl edx,0x7`, `0x9` in the scene 5 physics), but it explains why a port **must not use `>>` on signed values**: the port's helper is

```js
const tr = (v, k) => Math.trunc(v / (1 << k));        // web/fx/engine3d.js: x >> k toward zero
```

The projection that follows uses the same idiom for the depth (`(z << 12) / 256`), then one `idiv` per axis:

```
1021c9: shl eax,0xc
1021cc: mov edx,eax
1021ce: sar edx,0x1f
1021d1: shl edx,0x8
1021d4: sbb eax,edx
1021d6: sar eax,0x8            ; depth d = (z << 12) >> 8, truncating
1021d9: mov ebx,eax
1021db: test eax,eax
1021dd: jle 0x102200           ; behind the camera: no projection
1021df: mov edx,esi
1021e1: shl edx,0xc
1021e4: mov eax,edx
1021e6: sar edx,0x1f
1021e9: idiv ebx               ; x << 12 / d
1021eb: mov edx,ecx
1021ed: lea esi,[eax+0xa0]     ; + 160
1021f3: shl edx,0xc
1021f6: mov eax,edx
1021f8: sar edx,0x1f
1021fb: idiv ebx
1021fd: lea ecx,[eax+0x64]     ; + 100
```

`lea reg,[reg+imm]` is used as a non-flag-touching 3-operand add for the screen centre. JS: `point()` in `engine3d.js` (`d = tr((z3 << 12) | 0, 8); px = idiv((x3 << 12) | 0, d) + 0xa0`; the `| 0` reproduces the 32-bit wrap of `shl`).

---

## 2. Triangle dispatcher: count the out-of-range vertices, pick the fast path (`0x1036ff`)

The flat-triangle entry copies the six coordinates and the shade into the variables inside the code object, then decides **once per triangle** whether any clipping is needed. Two counters, `ecx` (too small) and `edx` (too large), are bumped branch-free with
`jge/jl` over a single `inc`, for the three x values and then the three y values:

```
103739: xor ecx,ecx
10373b: xor edx,edx
10373d: mov eax,ds:0x1030fc    ; x1
103742: cmp eax,0x2
103745: jge 0x103748
103747: inc ecx                ; x1 < 2
103748: cmp eax,0x140
10374d: jl 0x103750
10374f: inc edx                ; x1 >= 320
103750: mov eax,ds:0x103100    ; x2 ... (same pattern for x2, x3, then y1..y3 against 1..199)
103776: test ecx,ecx
103778: jne 0x1037c7           ; any vertex outside: slow, per-pixel-clipped rasteriser (0x1033c3)
10377a: test edx,edx
10377c: jne 0x1037c7
```

```
1037b8: test ecx,ecx
1037ba: jne 0x1037c7
1037bc: test edx,edx
1037be: jne 0x1037c7
1037c0: call 0x103154          ; all inside: the fast path, no clip tests at all
1037c5: jmp 0x1037cc
1037c7: call 0x1033c3
```

The fast path is therefore allowed to be completely unchecked (see section 4: no bounds test in its inner loop), and the margin is chosen to make that safe: x must be in `[2, 319]` and y in `[1, 199]`, so a span can never touch the borders (the slope rounding can
overshoot a pixel). JS: `tri()` in `engine3d.js` has the same `fast` test (`xs.every(x => x >= 2 && x < 320) && ys.every(y => y > 0 && y < 200)`) and a per-pixel clipped branch.

---

## 3. The middle vertex by index arithmetic (`0x10318b`)

The rasteriser needs the three vertices ordered by y. It never sorts: it finds the **top** and the **bottom** index with two comparison chains and obtains the **middle** one as `12 - top - bottom`, because the byte offsets of the three vertices
are `0, 4, 8` (x at `0x1030fc + i*4`, y at `0x103108 + i*4`) and `0 + 4 + 8 = 12`:

```
10318b: mov ecx,0xc
103190: mov eax,ds:0x103108
103195: xor ebx,ebx            ; ebx = offset of the topmost vertex (smallest y), starts at vertex 0
103197: cmp eax,DWORD PTR ds:0x10310c
10319d: jl 0x1031a9
10319f: mov eax,ds:0x10310c
1031a4: mov ebx,0x4
1031a9: cmp eax,DWORD PTR ds:0x103110
1031af: jl 0x1031b6
1031b1: mov ebx,0x8
1031b6: mov eax,ds:0x103108
1031bb: sub ecx,ebx            ; ecx = 12 - top
1031bd: xor edx,edx            ; edx = offset of the bottommost vertex (same chain with jg)
1031bf: cmp eax,DWORD PTR ds:0x10310c
1031c5: jg 0x1031d1
1031c7: mov eax,ds:0x10310c
1031cc: mov edx,0x4
1031d1: cmp eax,DWORD PTR ds:0x103110
1031d7: jg 0x1031de
1031d9: mov edx,0x8
1031de: sub ecx,edx            ; ecx = 12 - top - bottom = the middle vertex
1031e0: mov eax,DWORD PTR [ebx+0x1030fc]
```

Six compares, no swaps, no temporary copy of three vertices. Both chains keep the earlier vertex only when it is strictly better, so ties go to the later vertex, which matters for bit-exactness. JS: `let b = 0, m = ys[0]; ... const md = 3 - b - d` in `tri()` (indices 0,1,2: `3 = 0+1+2`).

---

## 4. Triangle edges in 16.16 and a span loop with a self-modified row pointer (`0x103200..0x103355`, span `0x103156`)

**Edge slopes** are 16.16 `idiv`s of `dx << 16` by `dy`, with `dy = 0` replaced by 1 so there is no division fault and no test elsewhere:

```
103237: mov eax,ds:0x10311c
10323c: mov ebx,DWORD PTR ds:0x103128
103242: sub eax,DWORD PTR ds:0x103118
103248: sub ebx,DWORD PTR ds:0x103124
10324e: shl eax,0x10           ; dx << 16
103251: test ebx,ebx
103253: jne 0x10325a
103255: mov ebx,0x1           ; dy == 0 -> 1
10325a: cdq
10325b: idiv ebx
10325d: mov ecx,eax            ; slope top -> middle
```

The same is done for top -> bottom (`ebp`, and `edi = -ebp`) and middle -> bottom (`esi`). Then the triangle is drawn in **two phases that share one routine**. Instead of keeping a left and a right edge per scanline, the span is described by its **right end**
(`edi`, 16.16 offset from the start vertex) and its **negative width** (`ebx`, starts at `-1.0`), each updated with one addition per scanline. The patched immediates are the slopes, the row pointer and the row step (`+320` going down in phase 1, `-320` = `0xfffffec0` going up in phase 2):

```
103156: mov esi,edi
103158: mov ebp,ebx
10315a: sar esi,0x10
10315d: sar ebp,0x10           ; ebp = -width (pixels), negative
103160: add esi,0x12345678     ; the immediate (0x103162) is the current row pointer: patched below
103166: mov BYTE PTR [esi+ebp*1],al   ; al = shade
103169: inc ebp
10316a: jne 0x103166           ; the loop counter IS the pixel offset: counts up to 0, 3 instructions per pixel
10316c: add DWORD PTR ds:0x103162,0x12345678   ; row pointer += row step (immediate 0x103172, patched to +-320)
103176: add edi,0x12345678     ; right end += slope A (immediate 0x103178)
10317c: add ebx,0x12345678     ; width += slope B (immediate 0x10317e)
103182: dec DWORD PTR ds:0x103148     ; line counter lives in the code object
103188: jne 0x103156
10318a: ret
```

```
103326: mov ds:0x103148,eax    ; number of lines
10332b: mov eax,ds:0x103138
103330: mov ds:0x103178,eax    ; patch slope A
103335: mov eax,ds:0x103140
10333a: mov ds:0x10317e,eax    ; patch slope B
10333f: mov DWORD PTR ds:0x103172,0x140   ; phase 1 goes down: row step +320
103349: mov ebx,0xffff0000     ; width = -1.0 (16.16)
10334e: xor edi,edi
103350: mov eax,ds:0x103114    ; shade
103355: call 0x103156
```

Why it is nice: the inner loop has **no pointer arithmetic and no end-of-span compare** (`inc ebp / jne` is both the address increment and the termination test), the row pointer is an immediate rather than a register or memory operand, and with the two-addition edge update
a scanline costs about a dozen instructions of overhead. The price is a code object that must be writable, and the span writes go right-to-left from the right end. JS (`tri()` in `engine3d.js`): `run(base, y0, x0, lines, dy, A, B)` keeps `ebx = -65536`, `edi = 0`, writes `for (k = w; k < 0; k++) buf[base + r + k] = shade` and does `edi += A; ebx += B` per line.

---

## 5. Scaled additive glow with a two-DDA inner loop (`0x107937`)

The type-5 particles are a 128x128 sprite stretched to `size x size` (size 16..255 from the depth) and **added** to the frame. The step is `0x800000 / size` (a 16.16 step of `128 / size`, computed once per sprite), the position in the sprite is the high half of a
16.16 accumulator per axis, and the clip window is patched into the loop as immediates (the immediates at `0x1079c9`, `0x1079fd`, `0x107a4e`, `0x107a5d` are the first row, first column, end column and end row):

```
10798f: mov eax,0x800000
107994: cdq
107995: mov ebx,DWORD PTR ds:0x1037d8   ; size
10799b: idiv ebx                        ; step = 0x800000 / size (16.16 texels per pixel = 128/size)
10799d: mov ds:0x107a47,eax             ; patched into 'add ebx,imm' below
```

```
107a01: test edi,edi
107a03: jl 0x107a45             ; x < 0 -> skip the pixel (x counter edi starts at x0, patched at 0x1079fc)
107a05: cmp edi,0x13f
107a0b: jg 0x107a45             ; x > 319
107a0d: mov eax,ebx
107a0f: sar eax,0x10            ; sprite column = high half of the accumulator
107a12: add eax,0x12345678      ; + row base (patched with sprite + (row << 7) at 0x107a13, set per scanline at 0x1079f5)
107a17: mov ebp,edi
107a19: add ebp,0x12345678      ; + screen row base (patched at 0x107a1b: y*320)
107a1f: mov al,BYTE PTR [eax]   ; texel
107a21: and eax,0xff
107a26: xor edx,edx
107a28: mov dl,BYTE PTR [ebp+0x12345678]   ; frame buffer pixel (immediate = buffer base)
107a2e: shl eax,0x2             ; sprite * 4 ...
107a31: add eax,edx             ; ... + destination
107a33: cmp eax,0xc0
107a38: jl 0x107a3f
107a3a: mov eax,0xbf            ; saturate at 0xbf, not 0xff
107a3f: mov BYTE PTR [ebp+0x12345678],al
107a45: add ebx,0x12345678      ; column accumulator += step
107a4b: inc edi
107a4c: cmp edi,0x12345678      ; x end (x0 + size)
107a52: jl 0x107a01
```

The saturation value `0xbf` is not arbitrary: the colour ramp (DAT image 12) only has 192 useful entries and the upper 64 are the overlay colours of scenes 2, 4, 6 (`+0xc0`); additive blending can therefore never stray into them. With `src * 4` and
a sprite that peaks near `0x30`, many overlapping glows burn out to the top of the ramp (the white blooms of scene 1/7). All of `x0, y0, x1, y1, step, row bases` are immediates written once per sprite, so the per-pixel work is a handful of instructions
and no register holds loop-invariant addresses. JS: `glow()` in `engine3d.js` (`const v = sprite[row + (bx >> 16)] * 4 + buf[...]; buf[...] = v < 0xc0 ? v : 0xbf`).

---

## 6. 16x16 spots from the same sprite, sampled every 8th texel (`0x1077dc`, `0x107889`)

The fixed-size points (types 2/3 and 4/9) reuse the glow sprite instead of having their own bitmap: a 16x16 box reads **every 8th texel of every 8th row**, advancing the sprite pointer by 8 per pixel and by `0x380` after each row of 16
(`16 * 8 + 0x380 = 0x400` = 8 sprite rows of 128):

```
107841: xor eax,eax
107843: mov al,BYTE PTR [ebp+0x0]   ; sprite texel (ebp walks the sprite)
107846: and eax,0xff
10784b: shl eax,1                   ; x2 (0x107889: shl eax,0x3 = x8)
10784d: sub eax,DWORD PTR ds:0x1037d8   ; - size: the spot dims with distance
107853: test eax,eax
107855: jg 0x107859
107857: xor eax,eax                 ; clamp at 0
107859: xor edx,edx
10785b: mov dl,BYTE PTR [esi]
10785d: add eax,edx                 ; + destination
10785f: cmp eax,0xc0
107864: jl 0x10786b
107866: mov eax,0xbf
10786b: mov BYTE PTR [esi],al
10786d: inc ebx
10786e: inc esi
10786f: add ebp,0x8                 ; next sampled texel: 8 to the right
107872: dec ch
107874: jne 0x107829
107876: inc edi
107877: add esi,0x130               ; next screen row (320 - 16)
10787d: add ebp,0x380               ; + 7 more sprite rows (16*8 + 0x380 = 0x400)
107883: dec cl
107885: jne 0x107821
```

One 128x128 bitmap does two jobs, a big soft glow and (by decimation) a crisp small dot, and the type-7 variant gets a depth fade for free with one `sub` of the entry's size. The border test of the box (`test ebx,ebx / cmp ebx,0x13f / test edi,edi / cmp edi,0xc7`) is per pixel.
JS: `spot(buf, e, sprite, mul)` with `sprite[j * 1024 + i * 8] * mul - e.p`.

---

## 7. A 1-bit-per-pass radix sort over 32 bits, with the key address patched in (`0x107a78`)

The render list is sorted by depth key (entry offset `+0x18`) every frame. The sort works on an **array of entry offsets**, not on the 64-byte entries, and does an LSD radix sort with **radix 2**: 32 passes, each splitting the current order into a *zero* list and a *one* list by `bt eax,edx`
(`edx` = pass number). The input of the next pass is *read as the zero list followed by the one list*, which is exactly the stable order, so no merge/copy loop exists between passes (only a copy-down of the two new buckets):

```
107aa2: mov eax,0x235e58
107aa7: add eax,0x18
107aaa: mov ds:0x107acf,eax        ; patch the displacement of 'mov eax,[ebx+imm]' below with entries + 0x18
107aaf: mov ds:0x107b03,eax        ; ... and its twin in the second loop
107ab4: xor edx,edx                ; edx = bit number
107ab6: xor esi,esi                ; esi = zero bucket count
107ab8: xor ebp,ebp                ; ebp = one bucket count
107aba: mov ecx,DWORD PTR ds:0x107a6c
107ac0: test ecx,ecx
107ac2: je 0x107aee
107ac4: xor edi,edi
107ac6: mov ebx,DWORD PTR [edi*4+0x255258]   ; entry offset from list A (the previous zeros)
107acd: mov eax,DWORD PTR [ebx+0x12345678]   ; its key
107ad3: bt eax,edx
107ad6: jb 0x107ae2
107ad8: mov DWORD PTR [esi*4+0x2590d8],ebx   ; bit 0 -> zero bucket
107adf: inc esi
107ae0: jmp 0x107aea
107ae2: mov DWORD PTR [ebp*4+0x233f18],ebx   ; bit 1 -> one bucket
107ae9: inc ebp
107aea: inc edi
107aeb: dec ecx
107aec: jne 0x107ac6
```

The second loop (`0x107af8..0x107b20`) does the same for list B (the previous ones). After 32 passes the result is written **reversed** (far first) while converting offsets back to entry numbers with `sar 6`:

```
107b62: xor edi,edi
107b64: mov esi,DWORD PTR ds:0x107a74    ; total count
107b6a: shl esi,0x2
107b6d: sub esi,0x4                      ; write from the last slot downwards
107b70: mov ecx,DWORD PTR ds:0x107a6c
107b76: test ecx,ecx
107b78: je 0x107b92
107b7a: mov eax,DWORD PTR [edi+0x255258]
107b80: sar eax,0x6                      ; entry offset / 64 = entry number
107b83: mov DWORD PTR [esi+0x257198],eax
107b89: add edi,0x4
107b8c: sub esi,0x4
```

Why it is clever (and why it is fine): the whole key is sorted without knowing its range or its signedness (a sum of three depths up to a few million is just 32 bits to it), there is no 256/65536-entry counter table to clear and prefix-sum (which, for a few hundred
entries per frame, would cost more than it saves), and the pass body is just `bt` and a conditional store. Stability gives deterministic ties: **equal keys end up in reverse entry order** after the final reversal, and the port has to reproduce that to be bit-exact.
JS (`order()` in `engine3d.js`): `idx.sort((p, q) => (list[q].key >>> 0) - (list[p].key >>> 0) || (q - p))`. An engine sort is equivalent *because* the original is a stable ascending sort followed by a reversal.

---

## 8. The sine table: a C-library loop with the author's pi (`0x102570`)

```
1025e0: mov ecx,0x40e00000     ; high word of the double 32768.0
1025e5: mov eax,esi            ; eax:edx = a (double)
1025e7: mov edx,edi
1025e9: xor ebx,ebx
1025eb: call 0x10ec4b          ; Watcom runtime: sin(a) (x87 via 0x1143fd, or the software fallback 0x10ea06)
1025f0: call 0x10ee77          ; * 32768.0
1025f5: call 0x10f01c          ; double -> int, truncating
1025fa: mov ecx,0x40e00000
1025ff: mov edx,edi
102601: mov DWORD PTR [ebp+0x333210],eax    ; SIN[i]
...
10261a: mov ebx,0x54524552
10261f: mov ecx,0x3f5921fb     ; a += 0x3f5921fb54524552
102624: mov edx,edi
102626: mov DWORD PTR [ebp+0x300110],eax    ; COS[i] (the second call at 0x10260b is the cosine helper 0x10ec72)
10262c: mov eax,esi
10262e: add ebp,0x4
102631: call 0x10ecc0          ; add double
102636: mov esi,eax
102638: mov edi,edx
10263a: cmp ebp,0x4000         ; 4096 entries
```

Not an optimisation, but two details a port must copy: the values are **truncated** (not rounded) after `* 32768`, and **the step is not exactly `2*pi/4096`**: the immediate `0x3f5921fb54524552` is `0.001533980788085938 = 3.141592654 / 2048` (the author typed pi with ten digits).
The accumulated angle ends 8.2e-10 rad off the ideal after 4096 steps, which changes no entry (0 of 4096 sine and 0 of 4096 cosine values differ from a table built with `2*pi/4096`; checked), so here the constant is harmless. The table is built with `Math.sin`/`Math.cos` in `engine3d.js` and compared with the table of the emulator (`tools/checksin.mjs`, `re/mk_sincos.py`): identical.
(The helper identities - sin at `0x10ec4b`, cos at `0x10ec72` - are inferred from the constant and the table they produce, which matches `Math.sin`/`Math.cos` exactly; the helpers choose x87 or a software path at run time by the byte at `0x231961`.)

```js
for (let i = 0, a = 0; i < 4096; i++, a += 0.001533980788085938) { SIN[i] = Math.trunc(Math.sin(a) * 32768); COS[i] = Math.trunc(Math.cos(a) * 32768); }
```

The same author's-constants theme appears in the landscape table builder `0x108100` (`0x3fe973e6d970fda2` = 0.7953981635 start angle, `0x3f741b2f76a83773` = 0.004908738521875 = 3.141592654/640 step, `0x40f00000` = 65536.0) and in the `atan2` table of section 9.

---

## 9. Polar lookup with the angle wrap for free (`0x107cb4`) and the tables behind it (`0x107ce0`)

Scene 2 maps a flat 256x200 *work map* onto the screen in polar coordinates. Two 64000-byte tables, built once at start-up, give for every screen pixel the distance `D` to the centre and the angle `A` (0..255). The per-frame loop:

```
107c82: mov eax,ds:0x107bc4
107c87: shl eax,0x3
107c8a: and eax,0xfff
107c8f: mov eax,DWORD PTR [eax*4+0x333210]   ; SIN[8n]
107c96: sar eax,0x9
107c99: mov ds:0x107cb8,eax                  ; patched into 'add eax,imm' below: the twist
107c9e: mov ebp,0x337210
107ca3: mov edi,0x270804                     ; D table
107ca8: mov esi,0x260e04                     ; A table
107cad: dec ebp
107cae: dec edi
107caf: mov ecx,0xfa00
107cb4: mov al,BYTE PTR [esi]                ; angle
107cb6: inc edi
107cb7: add eax,0x12345678                   ; + twist (immediate): may carry out of al ...
107cbc: inc esi
107cbd: mov ah,BYTE PTR [edi]                ; ... the carry is thrown away: ah = distance
107cbf: inc ebp
107cc0: and eax,0xffff
107cc5: mov dl,BYTE PTR [eax+0x2a0204]       ; work[D << 8 | (A + twist) & 255]
107ccb: mov BYTE PTR [ebp+0x0],dl            ; store to the frame buffer
```

The 16-bit address is built by **byte composition**: `al` (angle plus twist, a plain 32-bit `add` whose overflow into `ah` is overwritten by the next `mov ah,...`) and `ah` (distance). Wrapping the angle modulo 256 is free because the work map is
256 wide, and a rotation/twist of the whole tunnel is one `add` with a patched immediate per frame. Three table reads and no multiply per pixel. JS (`background()` in `fx02.js`): `buf[i] = work[(D[i] << 8) | ((A[i] + sh) & 0xff)]` with `sh = SIN[8n & 0xfff] >> 9`.

Building `D` and `A` (sqrt and atan2 through the C runtime; the `D` loop squares in integer registers first):

```
107cf7: imul esi,edi           ; y*y
107d02: imul eax,ebx           ; x*x
107d06: add eax,esi
107d09: call 0x10f174          ; int -> double
107d0e: call 0x10f1c6          ; sqrt (inferred from the result, which equals trunc(sqrt(x*x+y*y)))
107d13: call 0x10f01c          ; -> int
107d18: mov BYTE PTR [ecx+0x270803],al   ; D[(y+100)*320 + x+160]
```

```
107d6b: call 0x10f245          ; atan2(y, x) (inferred; the harness prints "Domain error in atan2" at (0,0))
107d70: mov ecx,0x40700000     ; * 256.0
107d75: xor ebx,ebx
107d77: call 0x10ee77
107d7c: mov ebx,0x6dbe5bcd
107d81: mov ecx,0x3fc45f30     ; * 0.15915494307111402 (about 1/(2*pi), but not equal to it)
107d86: call 0x10ee77
107d8b: call 0x10f020          ; -> int (truncating) -> byte
107d98: mov BYTE PTR [edx+0x260e04],al   ; A[...]
```

The multiplier is `0x3fc45f306dbe5bcd` = 0.15915494307111402, about `1.3e-10` (relative) below `1/(2*pi)` = 0.15915494309189535. Truncation then differs from the exact `atan2 * 256 / (2*pi)` on **757 of the 64000 entries** (exact multiples of 32 for negative angles round the other way): a port that
uses `Math.atan2(y, x) * 256 / (2 * Math.PI)` is off on those pixels. `fx02.js` uses `40.7436654315 / 256` as the multiplier, which gives 0 differences against the original's constant (checked over all 64000 entries) and against the emulator's table.

The third table of `0x107ce0` is the **perspective limit**: `T[k][a] = max(0, a*32/(k+1) - 10)` for `k < 0x7c`, `a < 256` (one `idiv` each):

```
107dd0: mov edx,ebx
107dd2: mov eax,ebx            ; ebx = a*32
107dd4: sar edx,0x1f
107dd7: idiv edi               ; edi = k + 1
107dd9: sub eax,0xa
107ddc: test eax,eax
107dde: jge 0x107de2
107de0: xor eax,eax            ; clamp at 0
107de2: add ecx,0x4
107de5: inc esi
107de6: add ebx,0x20
107de9: mov DWORD PTR [ecx+0x280200],eax
```

---

## 10. A column painter with a running occlusion limit (`0x107bc8`)

The work map of section 9 is a landscape drawn column by column, front slices first. For each of the 256 columns `x` and each of 97 depth slices `k`, the height map byte `h` selects the limit `T[k][h]` (the row where this slice's silhouette ends); the slice's texel colours the column from the lowest row not yet painted (starting at row 199) **up** to that limit, but **only if the limit is above what is already painted**:

```
107c0e: mov ebx,DWORD PTR ds:0x107bc4        ; n (tick)
107c14: add ebx,DWORD PTR ds:0x107bc0        ; + k
107c1a: and ebx,0xff                         ; (n + k) & 255 : the map scrolls with time, one texel per slice
107c20: add ebx,edx                          ; + 256 * x (edx steps by 0x100 per column)
107c22: mov cl,BYTE PTR [ebx+0x12345678]     ; texture texel (immediate = texture base, patched at 0x107c24)
107c28: mov al,BYTE PTR [ebx+0x3c0090]       ; height map byte h
107c2e: mov ebx,DWORD PTR ds:0x107bc0        ; k
107c34: shl ebx,0xa                          ; k * 1024 = (k * 256) * 4
107c37: mov ebx,DWORD PTR [ebx+eax*4+0x280204]   ; T[k][h]
107c3e: cmp ebx,ebp                          ; ebp = lowest painted row so far (starts at 199)
107c40: jge 0x107c57                         ; limit not above it: slice hidden, skip
107c42: mov BYTE PTR [edi+0x2a0204],cl       ; paint one row of the work map
107c48: dec ebp
107c49: sub edi,0x100                        ; one row up (work map is 256 wide)
107c4f: test edi,edi
107c51: jl 0x107c66                          ; ran off the top: column done
107c53: cmp ebp,ebx
107c55: jg 0x107c42                          ; until the limit
107c57: inc DWORD PTR ds:0x107bc0
107c5d: cmp DWORD PTR ds:0x107bc0,0x60
107c64: jle 0x107c0e
```

`ebp` is the whole z-buffer of the column (one integer, the "horizon so far"), so the occlusion test is a single `cmp` and each pixel is written **at most once** per column. The scrolling is free: it is only the starting offset `(n + k) & 255` of the texture column read, and the angle axis of the screen is the 256 columns of the map, so
the map's `x` is "which direction around the tunnel". A scrolling polar landscape is thus a 256 x 97 loop plus a 64000-pixel table lookup per frame. JS: `background(n)` in `fx02.js`.

---

## 11. The landscape painter: increments patched into the code, and increments that patch each other (`0x108d78`)

Scenes 4 and 6 fly over a height map with a classic height-map ("voxel") painter. For each of 145 columns, `0x108d78` first **precomputes the 128 sample positions of the ray** into two small arrays, then paints with a loop that only does table reads. The three per-sample increments are not registers or variables:
they are the **immediates of three `add` instructions**, patched at the start of every column, and halved copies of the same numbers are the immediates of three other `add`s that **patch the first three** every 32 samples:

```
108d9c: mov eax,DWORD PTR [ecx*4+0x2ae310]
108da3: mov ds:0x108e1b,eax        ; immediate of 'add edi,imm' (0x108e19): distance step
108da8: sar eax,1
108daa: mov ds:0x108e47,eax        ; immediate of the patching 'add' (0x108e41): half the step
108daf: mov ebx,DWORD PTR ds:0x10872c
108db5: add ebx,ecx
108db7: mov eax,DWORD PTR [ebx*4+0x2aca10]
108dbe: mov ds:0x108dfb,eax        ; immediate of 'add eax,imm' (0x108dfa): u step
108dc3: sar eax,1
108dc5: mov ds:0x108e33,eax        ; ... half, for the patching 'add' (0x108e2d)
```

```
108dec: mov ch,0x4                 ; 4 groups ...
108dee: mov cl,0x20                ; ... of 32 samples
108df0: mov ebx,eax
108df2: mov edx,esi
108df4: sar ebx,0x10
108df7: sar edx,0x10
108dfa: add eax,0x12345678         ; u accumulator += patched step
108dff: mov bh,dl                  ; texture address = (v & 255) << 8 | (u & 255)
108e01: add esi,0x12345678         ; v accumulator += patched step
108e07: and ebx,0xffff
108e0d: mov edx,edi
108e0f: mov DWORD PTR ds:[ebp+0x108738],ebx     ; sample list: texture address
108e16: sar edx,0x10
108e19: add edi,0x12345678         ; distance accumulator += patched step
108e1f: mov DWORD PTR ds:[ebp+0x108a58],edx     ; sample list: distance row
108e26: add ebp,0x4
108e29: dec cl
108e2b: jne 0x108df0
108e2d: add DWORD PTR ds:0x108dfb,0x12345678    ; every 32 samples: step += half of its start value (self-modifying the self-modifying code)
108e37: add DWORD PTR ds:0x108e03,0x12345678
108e41: add DWORD PTR ds:0x108e1b,0x12345678
108e4b: dec ch
108e4d: jne 0x108dee
```

So the ray steps grow linearly in four stages (1x, 1.5x, 2x, 2.5x of the start value): the cheap approximation of perspective foreshortening, with no per-sample multiply. The texture address is **built by byte composition** again: `mov bh,dl` after a 16-bit shift of the u accumulator gives `v << 8 | u` in `bx`. Then the paint loop (scene 4: two pixels at a time, `ch = cl`):

```
108e71: mov edi,DWORD PTR ds:[ebp+0x108738]     ; texture address
108e78: mov eax,DWORD PTR ds:[ebp+0x108a58]     ; distance row
108e7f: mov cl,BYTE PTR [edi+0x2f0110]          ; texel
108e85: mov ah,BYTE PTR [edi+0x3c0090]          ; height map byte -> high byte of the division table index
108e8b: mov ch,cl                               ; duplicate the texel into the high half: 2 pixels
108e8d: mov eax,DWORD PTR [eax*4+0x2b0110]      ; screen limit = (0x640 + 0x20 * row) / c  (table built at 0x108210)
108e94: cmp eax,edx                             ; edx = current row (starts 0xc7)
108e96: jge 0x108ea8
108e98: mov WORD PTR [esi+0x337210],cx          ; two pixels in one store
108e9f: dec edx
108ea0: sub esi,0x140                           ; one row up
108ea6: jmp 0x108e94
108ea8: add ebp,0x4
```

The division table (`0x108210`) replaces a per-sample `idiv` by a lookup:

```
108220: inc ecx
108221: mov edx,ebx            ; ebx = 0x640 + 0x20 * row
108223: mov eax,ebx
108225: sar edx,0x1f
108228: idiv ecx               ; ecx = height byte + 1
10822a: add esi,0x4
10822d: inc edi
10822e: mov DWORD PTR [esi+0x2b010c],eax
```

(The table has **256 rows**, not 250: the oracle found that height map values go up to 250 and the original reads them.) The painter writes two pixels per `mov word`, the columns are 2 px wide, which is why the landscape looks chunky (the harness measures 5.5 ticks per frame for scene 4 at 50 MIPS).
Scene 6 is the same walk with the roles of rows and columns exchanged (`0x108ec1`: it stores `cl` at `[esi+0x337210]` and `[esi+0x337350]`, +0x140 = the pixel below, and steps `esi` left: two pixels *tall*, painted right to left). JS: `samples()` and `paint4()`/`paint6()` in `web/fx/terrain.js`.

---

## 12. Particle physics in the unused rotation fields (`0x1028b0`)

Scene 5's 192 points are objects of the shared object table. A point object never uses its rotation fields (+0x0c, +0x10, +0x14), so **the velocity is stored there**: position at `[ebx+0x5c..0x64]`, velocity at `[ebx+0x68..0x70]` (the same object, +0x0c further). No second array, and the update walks the table with one pointer
(`ebx += 0x20`). The spring is `v += (target - p) >> 9` using the truncating idiom of section 1 (`shl edx,0x9 / sbb / sar eax,0x9`), then `p += v`, repeated **once per timer tick elapsed since the previous frame** (the outer `dec edi / jne`):

```
1028b0: mov edx,DWORD PTR [esi+0x3c]        ; attractor x
1028b3: mov eax,DWORD PTR [ebx+0x5c]        ; point x
1028b6: sub edx,eax
1028b8: mov eax,edx
1028ba: sar edx,0x1f
1028bd: shl edx,0x9
1028c0: sbb eax,edx
1028c2: sar eax,0x9                         ; (target - p) / 512 toward zero
1028c5: add DWORD PTR [ebx+0x68],eax        ; v += ... (velocity lives in the rotation field)
...
1028f8: mov eax,DWORD PTR [ebx+0x68]
1028fb: add DWORD PTR [ebx+0x5c],eax        ; p += v
...
10290a: add ebx,0x20                        ; next object
10290d: add edx,eax
10290f: mov DWORD PTR [ebx+0x44],edx
102912: cmp ebx,ecx                         ; 192 objects (ecx = esi + 0x1800)
102914: jne 0x1028b0
102916: dec edi                             ; one pass per elapsed tick
102917: jne 0x1028a1
```

```
10288b: mov edi,DWORD PTR ds:0x231f88      ; current tick
102891: sub edi,DWORD PTR [esp+0xc]        ; - tick of the previous frame = number of steps to simulate
102895: je 0x102919
```

Two properties matter for a port: the simulation is **frame-rate independent only roughly** (it integrates per tick, so a slow frame takes several steps in a row), and the attractor is sampled **once per frame**, not per step. At `0x102919` the tick is re-read *after* the loop, so ticks that elapsed while simulating are lost.
That is why the port's scene 5 is exact given the original's per-frame step counts (`re/m5.json`) and uses an assumed cadence otherwise. JS: `step()` in `fx05.js` (`V[q] += tr(t[j] - P[q], 9); P[q] += V[q]`).

---

## 13. One palette add for fades, flashes and beats; one state machine in the timer interrupt (`0x100a00`, `0x100370`, `0x100910`)

The palette upload adds the global level to each of the three channels of each of 256 colours, clamps, drops two bits (6-bit DAC) and writes the DAC through ports `3c8`/`3c9`:

```
100a10: mov ebx,DWORD PTR [esp]       ; level
100a13: xor edx,edx
100a15: xor eax,eax
100a17: mov esi,ebx
100a19: mov dl,BYTE PTR [edi]         ; r
100a1b: mov al,BYTE PTR [edi+0x1]     ; g
100a1e: add edx,ebx                   ; r + level
100a20: add eax,ebx                   ; g + level
100a22: xor ebx,ebx
100a24: mov bl,BYTE PTR [edi+0x2]     ; b
100a27: add ebx,esi                   ; b + level
100a29: test edx,edx
100a2b: jge 0x100a2f
100a2d: xor edx,edx                   ; clamp at 0
100a2f: cmp edx,0xff
100a35: jle 0x100a3c
100a37: mov edx,0xff                  ; clamp at 255
...
100a68: sar esi,0x2                   ; 8 bit -> 6 bit DAC
100a6b: sar ecx,0x2
100a6e: mov ebx,edx
100a70: mov eax,ebp
100a72: sar ebx,0x2
100a75: inc ebp
100a76: mov dx,0x3c8
100a7a: out dx,al                     ; DAC index
100a7b: inc dx
100a7d: mov al,bl
100a7f: out dx,al                     ; r
100a80: mov al,cl
100a82: out dx,al                     ; g
100a83: mov eax,esi
100a85: out dx,al                     ; b
```

One signed level in `-256..+255`: negative = fade to black, positive = flash to white, with the same code and **no multiply**. The level is driven by a state machine in the timer callback;
each command is a few instructions:

```
100855: cmp DWORD PTR ds:0x231f70,0x0
10085c: jne 0x10086c
10085e: test edi,edi
100860: jge 0x100865
100862: add edi,0x4                   ; cmd 0: level < 0 -> +4
100865: test edi,edi
100867: jle 0x10086c
100869: sub edi,0x4                   ; level > 0 -> -4 (a flash decays to 0)
10086c: cmp DWORD PTR ds:0x231f70,0x1
100873: jne 0x100884
100875: add edi,0x2                   ; cmd 1: fade in, +2
100878: test edi,edi
10087a: jle 0x100884
10087c: xor edi,edi                   ; reached 0: level 0 ...
10087e: mov DWORD PTR ds:0x231f70,edi ; ... and cmd 0
```

```
100884: mov eax,ds:0x231f70
100889: cmp eax,0x2
10088c: jne 0x10089d
10088e: sub edi,eax                   ; cmd 2: -2 (the command number is the speed: eax = 2)
100890: cmp edi,0xffffff00
100896: jge 0x10089d
100898: mov edi,0xffffff00            ; floor -256
```

Cute detail: command 2's speed is the command number itself (`sub edi,eax`). Events are edge-triggered on the S3M position (compare against the last handled `(order,row)` with `setne/or`, 17 copies, compiler-generated):

```
1003c3: test ebx,ebx
1003c5: jne 0x1003fe
1003c7: cmp esi,0x3a                  ; order 0, row 0x3a = 58: fade in the logo
1003cc: cmp ebx,DWORD PTR ds:0x231fd4
1003d2: setne al
1003d5: mov edx,eax
1003d7: and edx,0xff
1003dd: cmp esi,ebp
1003df: setne al
1003e2: and eax,0xff
1003e7: or eax,edx                    ; (order != last order) | (row != last row)
1003e9: je 0x1003fe
1003eb: mov edi,0xffffff00            ; level = -256
1003f0: mov DWORD PTR ds:0x231f70,ecx ; cmd = 1
```

And the beat flashes: the MIDAS sync callback (`W` effect of the S3M), accepted only while the machine is idle (cmd 0):

```
100910: mov edx,DWORD PTR ds:0x231f74
100916: mov eax,DWORD PTR [esp+0x4]   ; the W parameter
10091a: cmp DWORD PTR ds:0x231f70,0x0
100921: jne 0x10094b
100923: cmp eax,0x10
100926: jne 0x10092d
100928: mov edx,0x80                  ; W10: flash +0x80
10092d: cmp eax,0x11
100930: jne 0x100937
100932: mov edx,0xffffff80            ; W11: dip -0x80
100937: cmp eax,0x12
10093a: jne 0x100941
10093c: mov edx,0x40                  ; W12: +0x40
100941: cmp eax,0x13
100944: jne 0x10094b
100946: mov edx,0xffffffc0            ; W13: -0x40
10094b: mov DWORD PTR ds:0x231f74,edx
```

The music score therefore directly programs the visuals (416 `W` events), with the fade level decaying 4 per tick back to 0. JS: `build()` in `web/fx/fade.js` (the same machine on a tick grid) and `dac()` (`min(255, max(0, pal + lv)) >> 2`).

---

## 14. Blur straight to the screen: four neighbours, one divide-by-4 (`0x1030a0`)

The post-process of scenes 1, 3, 5, 7 reads the finished 320x200 buffer and writes the blurred band **directly into video memory** (`[0x22ea44]` is the VGA window), so the blur doubles as the copy and no extra pass exists. Left, right, up, down are four displacements from one running index:

```
1030a0: xor eax,eax
1030a2: xor edx,edx
1030a4: mov al,BYTE PTR [ebx+0x33720f]   ; buf[i - 1]   (0x337210 - 1)
1030aa: mov dl,BYTE PTR [ebx+0x337211]   ; buf[i + 1]
1030b0: add edx,eax
1030b2: xor eax,eax
1030b4: mov al,BYTE PTR [ebx+0x3370d0]   ; buf[i - 320] (0x337210 - 0x140)
1030ba: add eax,edx
1030bc: xor edx,edx
1030be: mov dl,BYTE PTR [ebx+0x337350]   ; buf[i + 320]
1030c4: add edx,eax
1030c6: mov eax,edx
1030c8: sar edx,0x1f
1030cb: shl edx,0x2
1030ce: sbb eax,edx
1030d0: sar eax,0x2                      ; / 4 with the signed idiom of section 1 (the sum is never negative, the compiler cannot know)
1030d3: inc ebx
1030d4: mov dl,al
1030d6: mov eax,ds:0x22ea44
1030db: mov BYTE PTR [ebx+eax*1-0x1],dl  ; store to VGA
1030df: cmp ebx,0xe600
1030e5: jl 0x1030a0
```

The loop runs for `i` in `0x1400..0xe5ff` only, i.e. rows 16..183: the 16-row bands at top and bottom are never touched (they stay black), which is also why the blur needs no border test: the neighbour reads stay inside the buffer. Because the average of four colour indices *is* a blur only if the palette ramp is smooth, the glow/ramp palette (image 12) is monotone purple to cream.
JS: `fb[i] = (buf[i - 1] + buf[i + 1] + buf[i - 320] + buf[i + 320]) >> 2` in `fx01.js`, `fx03.js`, `fx05.js`, `fx07.js` (here `>>` is fine: the sum is non-negative).

---

## 15. Noise from a chain of accumulators, no table and no `rand()` per pixel (`0x109940`)

The ending adds grain to the cross-faded credits. Per frame, `rand()` is called three times to seed **four 32-bit accumulators**; per pixel the loop only adds registers into each other, a four-stage difference engine whose output is the low bits of the first one:

```
109940: mov cl,bl
109942: and cl,0x1f
109945: add cl,0xc
109948: add BYTE PTR [eax+0x337210],cl   ; pixel += (bx & 0x1f) + 12
10994e: lea ecx,[eax+esi*1]              ; ecx = i + si
109951: add esi,ecx                      ; si += i + si
109953: add ebx,edx                      ; bx += dx
109955: lea ecx,[edi+esi*1]              ; ecx = di + si
109958: inc eax                          ; i++
109959: add edi,0x8000                   ; di += 0x8000
10995f: sub edx,ecx                      ; dx -= di + si
109961: cmp eax,0xbe00
```

and the seeds (the three `rand()` results are `eax` after `call 0x10f09b`):

```
1098f7: call 0x10f09b                    ; rand() r1
1098fc: mov ebx,DWORD PTR ds:0x231f88    ; tick
109902: imul ebx,eax                     ; bx = n * r1
109905: imul edx,DWORD PTR ds:0x231f88,0x1333
10990f: add edx,0x28a38                  ; dx = n * 0x1333 + 0x28a38
109915: call 0x10f09b                    ; r2
10991a: add edx,eax                      ; dx += r2
10991c: call 0x10f09b                    ; r3
109921: neg eax
109923: imul esi,eax,0x7d8d              ; si = -r3 * 0x7d8d
109929: mov edi,0x1e000000
```

`bx` is driven by `dx`, `dx` by `si` and `di`, `si` by itself and the pixel index: each stage integrates the one above it, which yields a chaotic, quickly varying low byte (`bx & 0x1f`) with only adds and `lea`s and three seeds per frame (13 instructions per pixel; a `rand()` call per pixel would cost far more). It is not a good RNG
(the vertical streaks in the picture are its structure, not a design), but it is cheap. Because the seeds mix the **timer tick** with `rand()`, each frame is different. Note `add BYTE PTR [...],cl` wraps modulo 256 (no clamp): the palette of the ending is a grey ramp that tolerates it.
JS (`fx08.js`): `bx = imul(n2, r1)`, `dx = imul(n3, 0x1333) + 0x28a38 + r2`, `si = imul(-r3, 0x7d8d)`, `di = 0x1e000000`, and per pixel `buf[i] += (bx & 0x1f) + 0xc; c = i + si; si += c; bx += dx; dx -= di + si; di += 0x8000`.
The port also has to replay the exact Watcom LCG (`seed * 0x41c64e6d + 0x3039`, `(seed >> 16) & 0x7fff`): 960 calls were used by scene 5 before, so the ending's first `rand()` is call 961.

---

## How the excerpts were verified

For every code block, each line of the form `ADDR: instruction` was compared (address and instruction text with whitespace normalised, `;` comments dropped) with `objdump -D -b binary -mi386 -M intel --adjust-vma=0x100000 --start-address=ADDR` of `re/obj1.bin`
started at the first address of the block. The *interpretations* (what a helper call is, how scenes use a routine) rest on the surrounding code and on the port being bit-exact against the emulator, as stated in each section; the identity of the Watcom runtime helpers (`sin`, `cos`, `sqrt`, `atan2`) is inferred from the tables they produce.
