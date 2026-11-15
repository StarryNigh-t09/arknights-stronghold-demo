import { mouseDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
mouseDrag(1372, 645, 563, 480, { holdMs: 200, steps: 26, stepMs: 32 })
console.log('tried blue cell 563,480')
await sleep(1500)
