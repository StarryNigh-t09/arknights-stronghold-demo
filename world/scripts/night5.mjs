import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

console.log('before: r1')
await seSwipe(1575, 870, 1200, 400, { points: 22, durationMs: 600 })
await sleep(300)
await seSwipe(1200, 400, 1800, 400, { points: 6, durationMs: 150 })
await sleep(800)
console.log('done')
