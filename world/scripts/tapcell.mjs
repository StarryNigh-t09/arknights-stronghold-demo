import { sePress } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await sePress(1200, 397, { holdMs: 60 })
await sleep(900)
