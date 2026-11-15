import { tap } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await tap(1760, 1002)   // 「<< 展开」
await sleep(1200)
console.log('expanded shop')
