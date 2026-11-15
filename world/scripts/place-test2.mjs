import { mouseDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
mouseDrag(1372, 645, 980, 430, { holdMs: 200, steps: 28, stepMs: 35 })
console.log('tried 980,430')
await sleep(1500)
