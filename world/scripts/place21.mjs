import { seSwipe, screenshot } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

const from = [1233, 770]
const to = [780, 525]
console.log('drag equip', from, '->', to)
await seSwipe(from[0], from[1], to[0], to[1], { points: 20, durationMs: 500 })
await sleep(800)
const p = await screenshot('shots/eq1.png')
console.log('shot', p)
