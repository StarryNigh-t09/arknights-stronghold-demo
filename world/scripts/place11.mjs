import { seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const t0 = Date.now()
await seDrag(1565, 800, 1140, 450, { steps: 12, gapMs: 120 })
console.log('slow chunked ms', Date.now() - t0)
await sleep(1000)
