import { seSwipe } from '../lib/adb.js'
import { sleep } from '../lib/run.js'

const fromX = Number(process.argv[2] || 1565)
const fromY = Number(process.argv[3] || 860)
const toX = Number(process.argv[4] || 1200)
const toY = Number(process.argv[5] || 397)
const dir = process.argv[6] || 'right'

const dist = Math.hypot(toX - fromX, toY - fromY)
await seSwipe(fromX, fromY, toX, toY, {
  points: Math.max(16, Math.round(dist / 45)),
  durationMs: Math.max(300, (dist / 1000) * 400),
})
await sleep(250)
const VEC = { right: [600, 0], left: [-600, 0], up: [0, -600], down: [0, 600] }
const [dx, dy] = VEC[dir] || VEC.right
await seSwipe(toX, toY, toX + dx, toY + dy, { points: 6, durationMs: 150 })
await sleep(500)
console.log('done')
