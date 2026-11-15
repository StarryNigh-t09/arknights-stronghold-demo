import { sh, screenSize, evdev } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
const [sx, sy] = px(1540, 862)
const [tx, ty] = px(1200, 397)
const send = (parts) => sh("printf '" + hexs(Buffer.concat(parts)) + "' > " + evdev())
await send([ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, sx), ev(3, 54, sy), ev(0, 0, 0)])
await sleep(200)
for (let k = 1; k <= 5; k++) {
  const t = k / 5
  await send([ev(3, 53, Math.round(sx + (tx - sx) * t)), ev(3, 54, Math.round(sy + (ty - sy) * t)), ev(0, 0, 0)])
  await sleep(45)
}
await sleep(120)
// 第二段：朝右拖 130 选朝向
const fx = tx + 130
for (let k = 1; k <= 3; k++) {
  const t = k / 3
  await send([ev(3, 53, Math.round(tx + (fx - tx) * t)), ev(0, 0, 0)])
  await sleep(45)
}
await sleep(80)
await send([ev(3, 57, -1), ev(0, 0, 0)])
console.log('pick + facing + release done')
await sleep(1000)
