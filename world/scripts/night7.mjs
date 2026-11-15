import { seSwipe, tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

const st0 = await senseRun(1)
console.log('start slots', st0.slotsLeft, 'visibleShop', (st0.shop || []).filter((s) => !s.empty).length)

const xs = [1545, 1410]
const ys = [885, 875, 895]
for (const x of xs) {
  for (const y of ys) {
    await seSwipe(x, y, 1200, 400, { points: 22, durationMs: 600 })
    await sleep(300)
    await seSwipe(1200, 400, 1800, 400, { points: 6, durationMs: 150 })
    await sleep(900)
    const st = await senseRun(1)
    console.log('x=' + x + ' y=' + y, 'slots', st.slotsLeft)
    if (Number(st.slotsLeft) < Number(st0.slotsLeft)) { console.log('SUCCESS ' + x + ',' + y); process.exit(0) }
    await tap(758, 150)
    await sleep(400)
  }
}
console.log('all failed')
