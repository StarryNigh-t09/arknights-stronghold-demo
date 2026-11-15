import { seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const t0 = Date.now()
await seDrag(1540, 862, 1140, 450, { steps: 12, gapMs: 60 })
console.log('drag ms', Date.now() - t0)
await sleep(900)
