import { sh, screenSize, evdev } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
const [sx, sy] = px(1540, 862)
const [tx, ty] = px(1200, 397)
await sh("printf '" + hexs(Buffer.concat([ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, sx), ev(3, 54, sy), ev(0, 0, 0)])) + "' > " + evdev())
await sleep(250)
for (let k = 1; k <= 6; k++) {
  const t = k / 6
  const p = [ev(3, 53, Math.round(sx + (tx - sx) * t)), ev(3, 54, Math.round(sy + (ty - sy) * t)), ev(0, 0, 0)]
  await sh("printf '" + hexs(Buffer.concat(p)) + "' > " + evdev())
  await sleep(50)
}
await sleep(350)
await sh("printf '" + hexs(Buffer.concat([ev(3, 57, -1), ev(0, 0, 0)])) + "' > " + evdev())
console.log('done')
await sleep(1000)
