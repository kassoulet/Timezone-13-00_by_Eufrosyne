# TZ13 - Time Zone +13:00 (Euphrosyne, Juhla IVb 1997) - web port, work in progress

Original: `TZ1300.EXE` (DOS, PMODE/W, MIDAS), `TZ1300.DAT`, `AUMAX.S3M`, `PILIPS.S3M`; left untouched. Port: `web/` (ES modules, no build). Run: `cd web && python3 -m http.server 8000`.
Shown 4:3 (original is 320x200 on a 4:3 screen). Player has pause, seek, scene buttons; music via libopenmpt, AUMAX then PILIPS (module swapped at 3:48).
Reverse-engineering log: `re/NOTES.md`.

## State
| scene | state |
|---|---|
| 0 logo | ported, exact (see below) |
| 1-7, 8 (end) | NOT ported (black screen labelled "not yet ported"; the music and timeline are there) |

## Bit-exact vs approximated
- Exact: logo pixels (all 1727 frames of a Unicorn run of the original) and the palette given the fade level the original had (`node tools/fxcheck00.mjs ORACLE.json PREFIX`).
- Approximated: the fade/flash level over time (`web/fx/fade.js` reimplements the original's timer state machine; 2186/2194 recorded levels within 1 tick). The original animates on a 70.39 Hz timer tick, not on the music; the port uses nominal music time, so tick phase is a fit (offset 7 ticks).
- Scene boundaries are the exact (order,row) the original waits for, converted to seconds assuming a constant S3M tempo (it is constant).
