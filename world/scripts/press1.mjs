import { sePress } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await sePress(1600, 850)
await sleep(900)
console.log('pressed unit')
