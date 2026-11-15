import { sh, screenSize, evdev } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
function send(parts) { return sh("printf '" + hexs(Buffer.concat(parts)) + "' > " + evdev(), { timeoutMs: 20000 }) }

// 1) 按下再松开 = 进入拾取态
function tapEv(x, y) {
  const [a, b] = px(x, y)
  return [ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, a), ev(3, 54, b), ev(0, 0, 0), ev(3, 57, -1), ev(0, 0, 0)]
}
// 2) 朝方向拖
function dragEv(x1, y1, x2, y2, n = 6) {
  const [a, b] = px(x1, y1), [c, d] = px(x2, y2)
  const parts = [ev(3, 47, 0), ev(3, 57, 2), ev(3, 53, a), ev(3, 54, b), ev(0, 0, 0)]
  for (let i = 1; i <= n; i++) parts.push(ev(3, 53, Math.round(a + (c - a) * i / n)), ev(3, 54, Math.round(b + (d - b) * i / n)), ev(0, 0, 0))
  parts.push(ev(3, 57, -1), ev(0, 0, 0))
  return parts
}
await send(tapEv(825, 593))
await sleep(500)
await send(dragEv(825, 593, 825 + 130, 593, 6))
await sleep(1000)
console.log('binary facing done')
