import { createTouch } from '../lib/touch.js'
const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe'
const t = createTouch({ adb: ADB, serial: '127.0.0.1:16416', abi: 'x86_64', log: console.log })
console.log('ensure', t.ensure())
const from = JSON.parse(process.argv[2] || '[1520,900]')
const to = JSON.parse(process.argv[3] || '[1000,700]')
const r = t.swipe(from[0], from[1], to[0], to[1])
console.log('swipe', r.ok, (r.log || '').split('\n').slice(-3).join(' | '))
