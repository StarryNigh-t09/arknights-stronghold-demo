import { tapAt, prepModalVisible, peek, sleep } from '../lib/run.js'
import { writeFileSync } from 'node:fs'
const p = await peek()
console.log('state', p.state)
for (let i = 0; i < 3; i++) {
  await tapAt([78, 62], 1200, '返回')
  await sleep(900)
  if (await prepModalVisible()) {
    await tapAt([1394, 742], 1500, '确认离开')
    await sleep(1200)
  }
  const q = await peek()
  console.log('after back', i, q.state)
  if (q.state !== 'wz_rest') break
}
const s = await peek()
console.log('final', s.state)