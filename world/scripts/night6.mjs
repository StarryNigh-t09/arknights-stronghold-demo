import { seSwipe, tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

// 先把商店折起来（点右上角同位置的收起/展开 toggle 不行就用键盘返回）
const st0 = await senseRun(1)
console.log('start slots', st0.slotsLeft, 'shop', (st0.shop || []).filter((s) => !s.empty).length)

for (const y of [850, 862, 880, 900, 920]) {
  await seSwipe(1575, y, 1200, 400, { points: 22, durationMs: 600 })
  await sleep(300)
  await seSwipe(1200, 400, 1800, 400, { points: 6, durationMs: 150 })
  await sleep(900)
  const st = await senseRun(1)
  console.log('y=' + y, 'slots', st.slotsLeft, 'screen', st.screen)
  if (Number(st.slotsLeft) < Number(st0.slotsLeft)) { console.log('SUCCESS at y=' + y); break }
  // 没成功可能进了拾取态，点左上取消
  await tap(758, 150)
  await sleep(400)
}
