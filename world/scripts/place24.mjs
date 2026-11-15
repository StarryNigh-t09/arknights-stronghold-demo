import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

// 起手点放到木台面上（脚底格子），不是精灵身上
const from = [1092, 860]
const to = [712, 440]
const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
const durationMs = Math.max(300, (dist / 1000) * 400)
const points = Math.max(18, Math.round(dist / 40))
console.log('drag', from, '->', to, { dist: Math.round(dist), durationMs, points })
await seSwipe(from[0], from[1], to[0], to[1], { points, durationMs })
await sleep(900)
console.log('done')
