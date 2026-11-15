import { sh, screenSize, evdev } from '../lib/adb.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
const size = screenSize()
const px = (x, y) => [size.h - Math.round((y / 1080) * size.h), Math.round((x / 1920) * size.w)]
const [a, b] = px(1565, 800)
const parts = [ev(3, 47, 0), ev(3, 57, 1), ev(3, 53, a), ev(3, 54, b), ev(0, 0, 0)]
for (let i = 1; i <= 4; i++) parts.push(ev(3, 53, a + i * 4), ev(3, 54, b - i * 6), ev(0, 0, 0))
await sh("printf '" + hexs(Buffer.concat(parts)) + "' > " + evdev())
console.log('finger down, no release')
