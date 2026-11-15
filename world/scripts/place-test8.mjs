import { dragDrop } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
await dragDrop(1545, 818, 563, 480, 1500)
await sleep(1600)
console.log('touch draganddrop attempt with collapsed shop')
