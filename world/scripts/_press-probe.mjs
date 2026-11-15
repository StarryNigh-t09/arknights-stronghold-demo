import { shot, state, drag, sleep, tapRaw } from './_place-lib.mjs';
const pts = JSON.parse(process.env.PRESS);
for (const [x, y] of pts) {
  drag(x, y, 1100, 620, 600, 420);
  await sleep(350);
  const s = state(shot('press'));
  console.log(JSON.stringify({ p: [x, y], green: s.green, red: s.red, rc: s.redCenter }));
  if (s.green > 3000) { const rc = s.redCenter || [965, 240]; tapRaw(rc[0], rc[1]); await sleep(600); }
  else { tapRaw(1500, 300); await sleep(400); }
}
