import { sePress, seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

// 1) sePress 打一下甲板单位，看会不会弹详情（验证 sendevent 的 tap 通路）
console.log('sePress test')
await sePress(1545, 885, { holdMs: 120 })
await sleep(1500)
let st = await senseRun(1)
console.log('after sePress screen', st.screen, 'dist', st.vision)

// 2) 试更低的起手点
for (const y of [910, 930, 950, 970]) {
  await seSwipe(1545, y, 1200, 400, { points: 20, durationMs: 550 })
  await sleep(350)
  await seSwipe(1200, 400, 1800, 400, { points: 6, durationMs: 150 })
  await sleep(900)
  const s2 = await senseRun(1)
  console.log('y=' + y, 'slots', s2.slotsLeft)
  if (Number(s2.slotsLeft) < 6) { console.log('SUCCESS y=' + y); break }
}
