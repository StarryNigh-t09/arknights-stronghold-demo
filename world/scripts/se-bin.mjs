import { sh, screenSize, evdev } from '../lib/adb.js'

function ev(type, code, value) {
  const b = Buffer.alloc(24)
  b.writeUInt16LE(type, 16)
  b.writeUInt16LE(code, 18)
  b.writeInt32LE(value, 20)
  return b
}
function gesture(pts, { syn = true } = {}) {
  const parts = [ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, pts[0][0]), ev(3, 54, pts[0][1]), ev(0, 0, 0)]
  for (const [x, y] of pts.slice(1)) { parts.push(ev(3, 53, x), ev(3, 54, y), ev(0, 0, 0)) }
  parts.push(ev(3, 57, -1), ev(0, 0, 0))
  return Buffer.concat(parts)
}
function toHexStr(buf) {
  let s = ''
  for (const byte of buf) s += '\\x' + byte.toString(16).padStart(2, '0')
  return s
}
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]

const pts = []
const [x1, y1] = [1080, 735], [x2, y2] = [825, 555]
const [a, b] = px(x1, y1), [c, d] = px(x2, y2)
const N = 5
for (let i = 0; i <= N; i++) pts.push([Math.round(a + (c - a) * i / N), Math.round(b + (d - b) * i / N)])
const buf = gesture(pts, {})
const cmd = "printf '" + toHexStr(buf) + "' > " + evdev()
const t0 = Date.now()
console.log(await sh(cmd, { timeoutMs: 20000 }))
console.log('binary drag ms', Date.now() - t0, 'bytes', buf.length)
