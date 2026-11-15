import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(1700, 250)
await sleep(1000)
console.log('closed panel')
