import { seSwipe, sePress, tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

const base = 6
const tries = [
  [1540, 862], [1535, 870], [1550, 880], [1520, 890], [1560, 860],
]
for (const [x, y] of tries) {
  await seSwipe(x, y, 1200, 397, { points: 22, durationMs: 600 }, { holdMs: 260 })
  await sleep(320)
  await seSwipe(1200, 397, 1800, 397, { points: 6, durationMs: 150 })
  await sleep(900)
  const st = await senseRun(1)
  console.log(x + ',' + y, 'slots', st.slotsLeft, 'screen', st.screen)
  if (Number(st.slotsLeft) < base) { console.log('SUCCESS ' + x + ',' + y); process.exit(0) }
  await tap(758, 150)   // 万一进了拾取态，点取消
  await sleep(400)
}
console.log('all failed')
