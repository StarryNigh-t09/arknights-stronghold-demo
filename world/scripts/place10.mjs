import { seDrag } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const t0 = Date.now()
await seDrag(1545, 810, 1140, 450, { steps: 8, gapMs: 45 })
console.log('chunked place drag ms', Date.now() - t0)
await sleep(1100)
