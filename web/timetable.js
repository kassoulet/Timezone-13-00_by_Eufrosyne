// Scene timetable + 4:3 sizing helpers (no DOM). The demo plays AUMAX.S3M (scenes 0-7) then PILIPS.S3M (scene 8); the global timeline T is
// AUMAX seconds, then PILIPS seconds + A_END. Scene ends are the (order,row) the original's frame loops wait for (re/NOTES.md), converted with re/s3mtime.py
// (S3M speed 6 / tempo 144 never changes: 0.10417 s per row, 6.6667 s per order).
export const ROW = 6 * 2.5 / 144, ORD = 64 * ROW;
const pos = (o, r) => o * ORD + r * ROW;
export const A_END = pos(34, 16);            // scene 7 ends at AUMAX order 34 row 16 (the original then stops AUMAX and loads PILIPS)
export const DUR = A_END + pos(4, 16);       // scene 8 ends at PILIPS order 4 row 16
export const FX = [
  [0, 'eufrosyne logo'], [pos(2, 12), 'tunnel + particles'], [pos(8, 0), 'fx2 (0x107e10)'], [pos(12, 0), 'fx3 (0x1029b0)'], [pos(16, 0), 'fx4 (0x108250)'],
  [pos(20, 0), 'fx5 (0x102650)'], [pos(26, 0), 'fx6 (0x108530)'], [pos(30, 32), 'fx7 (0x102e90)'], [A_END, 'end (PILIPS)'],
].map(([t0, name], i, a) => ({ i, t0, t1: i + 1 < a.length ? a[i + 1][0] : DUR, name }));
export const fxAt = t => { let k = 0; for (const e of FX) if (t >= e.t0) k = e.i; return k; };
export const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export function displaySize(availW, availH, dpr = 1) {
  const fitW = Math.min(availW, availH * 4 / 3) * dpr, k = Math.floor(fitW / 320);
  const w = (k >= 1 ? 320 * k : fitW) / dpr;
  return { w, h: w * 3 / 4 };
}
