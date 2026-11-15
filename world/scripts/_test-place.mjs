import { shot, state, deckBadges, drag, swipe, sleep } from './_place-lib.mjs';
const px = Number(process.env.PX), py = Number(process.env.PY), tx = Number(process.env.TX), ty = Number(process.env.TY);
const hold = Number(process.env.HOLD || 600);
const b0 = deckBadges(shot('t2-deck'));
const t0 = Date.now();
drag(px, py, tx, ty, hold, 420);
const tg = Date.now() - t0;
await sleep(300);
const s1 = state(shot('t2-a'));
if (!(s1.green > 3000)) { console.log('NO_PENDING', JSON.stringify(s1)); process.exit(0); }
swipe(tx, ty - 50, tx, ty - 200, 400);
await sleep(650);
const b = shot('t2-b');
const s2 = state(b);
const b1 = deckBadges(b);
console.log(JSON.stringify({ from: [px, py], to: [tx, ty], hold, tGesture: tg, tAll: Date.now() - t0, pending: s1.green, after: s2.green, deck0: b0.length, deck1: b1.length, ok: b1.length < b0.length }));
