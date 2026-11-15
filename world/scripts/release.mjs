import { sh, screenSize, evdev } from '../lib/adb.js'
function ev(t, c, v) { const b = Buffer.alloc(24); b.writeUInt16LE(t, 16); b.writeUInt16LE(c, 18); b.writeInt32LE(v, 20); return b }
function hexs(buf) { let s = ''; for (const b of buf) s += '\\x' + b.toString(16).padStart(2, '0'); return s }
await sh("printf '" + hexs(Buffer.concat([ev(3, 57, -1), ev(0, 0, 0)])) + "' > " + evdev())
console.log('released')
