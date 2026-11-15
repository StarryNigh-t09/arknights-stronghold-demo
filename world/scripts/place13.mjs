import { sh, screenSize, evdev } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
const [sx, sy] = px(1540, 862)
const [tx, ty] = px(1200, 397)
// 先取消当前拾取态
await sh("printf '" + hexs(Buffer.concat([ev(3, 57, -1), ev(0, 0, 0)])) + "' > " + evdev())
await sleep(400)
// 起手：按下
let parts = [ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, sx), ev(3, 54, sy), ev(0, 0, 0)]
await sh("printf '" + hexs(Buffer.concat(parts)) + "' > " + evdev())
await sleep(180)
// 中段：分 3 块移动
for (let k = 1; k <= 3; k++) {
  const p = []
  for (let i = 1; i <= 4; i++) {
    const f = (k - 1) * 4 + i
    const t = f / 12
    p.push(ev(3, 53, Math.round(sx + (tx - sx) * t)), ev(3, 54, Math.round(sy + (ty - sy) * t)), ev(0, 0, 0))
  }
  await sh("printf '" + hexs(Buffer.concat(p)) + "' > " + evdev())
  await sleep(60)
}
// 悬停 250ms 再单独抬手
await sleep(250)
await sh("printf '" + hexs(Buffer.concat([ev(3, 57, -1), ev(0, 0, 0)])) + "' > " + evdev())
console.log('slow drag with separated UP done')
await sleep(900)
