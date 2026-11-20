# TZ13 - Time Zone +13:00 (Euphrosyne, Juhla IVb 1997) - web port, work in progress

Original: `TZ1300.EXE` (DOS, PMODE/W, MIDAS), `TZ1300.DAT`, `AUMAX.S3M`, `PILIPS.S3M`; left untouched. Port: `web/` (ES modules, no build). Run: `cd web && python3 -m http.server 8000`.
Shown 4:3 (original is 320x200 on a 4:3 screen). Player has pause, seek, scene buttons; music via libopenmpt, AUMAX then PILIPS (module swapped at 3:48).
Reverse-engineering log: `re/NOTES.md`.
Write-ups: [`WRITEUP-effects.md`](WRITEUP-effects.md) (timeline, fade state machine, shared 3D engine, each scene, the art, exact vs approximated) and [`WRITEUP-asm.md`](WRITEUP-asm.md) (15 sections of verified asm: rasterisers, radix sort, tables, painters, physics, fades, noise; `tools/check_writeup_asm.py` re-checks the listings); figures in `figures/` (`tools/make_figures.mjs` + `tools/make_figures.py`).

## State
| scene | state |
|---|---|
| 0 logo | ported, exact (see below) |
| 1 tunnel + particles | ported, exact for the tick n the original used (see below) |
| 2 landscape tunnel + mesh | ported, exact (311/311 oracle frames) |
| 3 two meshes + points | ported, exact (241/241 oracle frames) |
| 4 landscape + mesh | ported, exact for the state the original had (341/341 oracle frames) |
| 5 particle swarm | ported, exact (440/440 oracle frames) given the original's per-frame step count; the player's step cadence is an assumption |
| 6 landscape (rotated) | ported, exact (914/914 oracle frames) |
| 7 tunnel + glows | ported, exact (268/268 oracle frames) |
| 8 ending | ported, exact (726/726 oracle frames) |

Exactness is per tick value: the checkers search, for each oracle frame, the tick(s) the original read (the oracle only records the tick at the end of the frame). Scenes 4, 5, 6, 8 depend on frame history (landscape position, simulation, rand state, noise); the player replays them from the scene start on a fixed grid of K timer ticks per frame (the original's frame rate is machine dependent, so the cadence is an assumption, and with it the exact landscape position / particle positions the player shows; see Cadence). The rand seed (1, with 960 calls consumed by scene 5 before the ending) is verified by the exact ending. Checkers: `tools/fxcheck02.mjs`, `fxcheck3d.mjs` (3, 7), `fxcheck46.mjs` (4, 6), `fxcheck05.mjs` (with `re/m5.json`, the original's steps per frame read from its particle table by `re/dump5.py`), `fxcheck08.mjs`.

## Bit-exact vs approximated
- Exact: logo pixels (all 1727 frames of a Unicorn run of the original) and the palette given the fade level the original had (`node tools/fxcheck00.mjs ORACLE.json PREFIX`).
- Approximated: the fade/flash level over time (`web/fx/fade.js` reimplements the original's timer state machine). Checked over the whole run with the earlier tick table (15994 AUMAX + 1991 PILIPS timer records): 11157 + 1603 exact, 4577 + 262 within 1 tick (4 DAC units), 260 + 126 worse (flash edges off by a tick, and the first ~60 ticks of the ending). `node tools/fxcheck_fade.mjs ORACLE.json [N0]` now builds the fade table at the harness' 70 ticks per music second (the player uses 70.086); the full-run oracle is no longer on disk, so only the first 31 s (2194 AUMAX records) were re-checked: N0 8.75 gives 1607 exact / 587 within 1 tick / 0 worse, N0 9.25 gives 2177 / 0 / 17 (the N0 and PILIPS offsets above were fitted with the old table and are not re-fitted over the whole run). The only fitted constants are the W-flash lead (0.5 tick before the row boundary) and the tick phase. The original animates on a timer tick, not on the music. That tick is locked to the vertical retrace (MIDAS `tmrSyncScreen`, see `re/NOTES.md` 'Tick source'): the demo sets mode 13h once (BIOS int 10h, never reprograms the CRTC or the clock select), so on a standard VGA / DOSBox every scene ticks at 25.175 MHz / (800 x 449) = 70.086 Hz. The port uses nominal music time with n = 7 + 70.086 t (`TICK` in `web/fx/fade.js`; the offset is arbitrary: it is the load time on a real machine). This replaces the earlier 70.39, which was an artefact of the Unicorn harness (its PIT model kept a stale low byte of the reload value: 0x4295 became 0x4237 = 16951). The 70.086 is the standard-timing assumption, not measured on a real card (a card with other timings would shift it by its own vsync ratio); the tick-to-music offset and the 70.086 stay approximations.
- Harness clock (matters only when comparing with the oracle): with no sound card MIDAS steps the S3M once per timer tick assuming exactly 70 Hz, so harness tick n = 70 t + 8.75 (AUMAX; 5.25 for PILIPS) per nominal music second (in the harness `tmrSyncScreen` fails because its fake PIT/retrace are not a clean 70 Hz signal, so MIDAS falls back to its 70.00 Hz default; the harness' own virtual clock then ticks at 70.39 Hz, which only makes its music look 0.56% fast against virtual time; an earlier fit said 1.0048, from the first 32 s only). Scene starts implied by (order,row) vs the oracle's tick at the first record of that row (all 8 boundaries): within 1 tick (<= 0.9) of the linear fit, so the scene boundaries and the fade machine agree.
- Scene 1 (`web/fx/fx01.js` + the shared 3D engine `web/fx/engine3d.js`: mesh transform, render list, radix sort, flat-triangle and additive-glow rasterizers, overlay, blur): all 402 oracle frames (0..53 s) identical, 0 differing pixels, and the DAC identical (`node tools/fxcheck01.mjs ORACLE.json PREFIX`). Exactness is per tick value n: the original draws as fast as it can (~12 fps in the harness) and reads the timer tick n at the start of the frame (and again for the overlay), the oracle only records n at the end, so the check searches the n (and the order read by the overlay test) that reproduces each frame; every frame found one. The sin/cos tables built with `Math.sin/cos` equal the original's integer tables (`node tools/checksin.mjs`).
- Approximated for scene 1: the music time -> n mapping used by the player (same tick fit as the fade, offset 7); the original's frame rate is machine speed dependent, the port draws on the display's refresh with n from the music time. Static data (tunnel mesh, glow sprite) is extracted from the EXE by `re/mk_assets3d.py` into `web/assets/tz13_3d.bin`.
- Scene boundaries are the exact (order,row) the original waits for, converted to seconds assuming a constant S3M tempo (it is constant).

## Cadence of scenes 4, 5, 6 and the ending (assumption)
Oracle (`re/m5.json` for scene 5, the frame records of the Unicorn run for the rest): ticks per frame in the harness, which charges 20 ns per instruction (~50 MIPS, roughly a Pentium-75 class on this code) and ran at 70.4 ticks per virtual second everywhere (harness artefact, see above; the real tick is the 70.086 Hz vsync).

| scene | harness ticks/frame (mean, min..max) | harness fps | player K |
|---|---|---|---|
| 4 landscape + mesh | 5.5 (3..7) | 12.9 | 2 |
| 5 swarm | 6.4 (5..9) | 11.1 | 2 |
| 6 landscape rotated | 2.3 (2..3) | 30.7 | 1 |
| ending | 2.7 (2..3) | 25.7 | 1 |

The 1997 target was a Pentium (133-200) and the author tuned the per-frame steps for it. Evidence: the camera step of scene 4 is 2*sin per frame but 1*sin in scene 6, and the harness frame costs are in ratio 5.5 : 2.3 (about 2.4), i.e. both flights have about the same speed per second at the author's frame rates. Taking a machine about 2.5x faster than the harness gives about 2.2 ticks/frame for scene 4, 2.5 for scene 5, 0.9 for scene 6 and 1.1 for the ending, hence K = 2, 2, 1, 1 (scene 5 integrates per elapsed tick, so its K only changes the attractor sampling; 2 keeps it at 35 fps). The harness cadence itself would show a scene 6 flight 2.3x slower than K=1. Seeking stays repeatable: state is replayed from the scene start (K fixed), the uitest checks it.

Cross-check with the real EXE (DOSBox-X, headless, timed screenshots): attempted, inconclusive. The EXE runs and draws, but with several instances in parallel the emulated time drifted from wall time (fixed cycles slower than real time, differently per setting), so screenshot times gave no tick reference, and the screenshot-to-port matcher was not validated. The cadence K and the tick-to-music offset remain assumptions; details and a retry plan in `re/NOTES.md` (scripts in `re/dbx/`).

## Write-ups on the site

`../tools/mkwriteups.sh . web` regenerates `web/writeups/` from `WRITEUP-*.md`.
