import { sePress } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await sePress(758, 150, { holdMs: 60 })
await sleep(700)
