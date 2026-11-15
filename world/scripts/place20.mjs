import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await seSwipe(1282, 735, 1200, 285, { points: 22, durationMs: 600 })
await sleep(600)
console.log('item -> unit done')
