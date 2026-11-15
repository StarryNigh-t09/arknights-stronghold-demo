import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(980, 430)
await sleep(1600)
console.log('tapped cell to confirm placement')
