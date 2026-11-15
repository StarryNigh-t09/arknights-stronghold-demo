import { tap, mouseDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(1755, 948)          // 收起商店
await sleep(1300)
await mouseDrag(1395, 705, 563, 480, { holdMs: 180, steps: 28, stepMs: 30 })
await sleep(1500)
console.log('collapse then drag 褐果 done')
