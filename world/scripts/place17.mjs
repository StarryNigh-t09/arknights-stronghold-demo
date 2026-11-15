import { sh, screenSize, evdev } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
const send = (parts) => sh("printf '" + hexs(Buffer.concat(parts)) + "' > " + evdev())
// 先退出当前拾取态
await send([ev(3, 57, -1), ev(0, 0, 0)])
await sleep(250)
const [sx, sy] = px(1540, 862)
const [tx, ty] = px(1200, 397)
const steps = 12, gap = 60
const at = (t) => [ev(3, 53, Math.round(sx + (tx - sx) * t)), ev(3, 54, Math.round(sy + (ty - sy) * t)), ev(0, 0, 0)]
// 第一块：按下 + 两步（和 seDrag 完全一致）
await send([ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, sx), ev(3, 54, sy), ev(0, 0, 0)])
await send(at(1 / steps))
await send(at(2 / steps))
for (let k = 3; k <= steps; k++) {
  await sleep(gap)
  await send(at(k / steps))
}
// 到位后朝右拖选朝向（手指不抬）
const [dx, dy] = at(1)
const fx = dx + 140
for (let k = 1; k <= 3; k++) {
  await sleep(gap)
  await send([ev(3, 53, Math.round(dx + (fx - dx) * (k / 3))), ev(3, 54, dy), ev(0, 0, 0)])
}
await sleep(120)
await send([ev(3, 57, -1), ev(0, 0, 0)])
console.log('one gesture: move + facing + release')
await sleep(1000)
