import { seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const t0 = Date.now()
await seDrag(1080, 735, 825, 555, { steps: 10, holdMs: 60, stepMs: 0 })
console.log('fast drag ms', Date.now() - t0)
await sleep(1200)
