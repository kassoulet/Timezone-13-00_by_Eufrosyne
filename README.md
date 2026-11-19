# TZ13 - Time Zone +13:00 (Euphrosyne, Juhla IVb 1997) - web port, work in progress

Original: `TZ1300.EXE` (DOS, PMODE/W, MIDAS), `TZ1300.DAT`, `AUMAX.S3M`, `PILIPS.S3M`; left untouched. Port: `web/` (ES modules, no build). Run: `cd web && python3 -m http.server 8000`.
Shown 4:3 (original is 320x200 on a 4:3 screen). Player has pause, seek, scene buttons; music via libopenmpt, AUMAX then PILIPS (module swapped at 3:48).
Reverse-engineering log: `re/NOTES.md`.

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

Exactness is per tick value: the checkers search, for each oracle frame, the tick(s) the original read (the oracle only records the tick at the end of the frame). Scenes 4, 5, 6, 8 depend on frame history (landscape position, simulation, rand state, noise); the player replays them from the scene start on a fixed grid of 2 timer ticks per frame (the original's frame rate is machine dependent, so this cadence is an assumption, and with it the exact landscape position / particle positions the player shows). The rand seed (1, with 960 calls consumed by scene 5 before the ending) is verified by the exact ending. Checkers: `tools/fxcheck02.mjs`, `fxcheck3d.mjs` (3, 7), `fxcheck46.mjs` (4, 6), `fxcheck05.mjs` (with `re/m5.json`, the original's steps per frame read from its particle table by `re/dump5.py`), `fxcheck08.mjs`.

## Bit-exact vs approximated
- Exact: logo pixels (all 1727 frames of a Unicorn run of the original) and the palette given the fade level the original had (`node tools/fxcheck00.mjs ORACLE.json PREFIX`).
- Approximated: the fade/flash level over time (`web/fx/fade.js` reimplements the original's timer state machine; 2186/2194 recorded levels within 1 tick). The original animates on a 70.39 Hz timer tick, not on the music; the port uses nominal music time, so tick phase is a fit (offset 7 ticks).
- Scene 1 (`web/fx/fx01.js` + the shared 3D engine `web/fx/engine3d.js`: mesh transform, render list, radix sort, flat-triangle and additive-glow rasterizers, overlay, blur): all 402 oracle frames (0..53 s) identical, 0 differing pixels, and the DAC identical (`node tools/fxcheck01.mjs ORACLE.json PREFIX`). Exactness is per tick value n: the original draws as fast as it can (~12 fps in the harness) and reads the timer tick n at the start of the frame (and again for the overlay), the oracle only records n at the end, so the check searches the n (and the order read by the overlay test) that reproduces each frame; every frame found one. The sin/cos tables built with `Math.sin/cos` equal the original's integer tables (`node tools/checksin.mjs`).
- Approximated for scene 1: the music time -> n mapping used by the player (same tick fit as the fade, offset 7); the original's frame rate is machine speed dependent, the port draws on the display's refresh with n from the music time. Static data (tunnel mesh, glow sprite) is extracted from the EXE by `re/mk_assets3d.py` into `web/assets/tz13_3d.bin`.
- Scene boundaries are the exact (order,row) the original waits for, converted to seconds assuming a constant S3M tempo (it is constant).
