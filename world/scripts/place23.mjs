import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

const cases = [
  { name: '锤子→烈夏', from: [1092, 750], to: [780, 525] },
]
for (const c of cases) {
  await seSwipe(c.from[0], c.from[1], c.to[0], c.to[1], { points: 24, durationMs: 600 })
  await sleep(1200)
}
console.log('done')
