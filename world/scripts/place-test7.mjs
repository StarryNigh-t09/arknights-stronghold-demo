import { mouseDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await mouseDrag(1545, 818, 563, 480, { holdMs: 180, steps: 28, stepMs: 30 })
await sleep(1600)
console.log('drag from reflowed position done')
