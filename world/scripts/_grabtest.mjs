import { writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { screenshot, adbPath, currentDevice } from '../lib/adb.js'
import { toRaw } from '../lib/touch.js'
const adb = adbPath(), serial = currentDevice()
const [rx, ry] = toRaw(1267, 684)
const [mx, my] = toRaw(1150, 750)
const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 600', 'm 0 ' + mx + ' ' + my + ' 50', 'c', 'w 2500', 'u 0', 'c', 'w 200']
const f = './world/.tmp/gt.txt'
writeFileSync(f, lines.join('\n') + '\n', 'utf8')
spawnSync(adb, ['-s', serial, 'push', f, '/sdcard/_gt.txt'], { stdio: 'ignore', windowsHide: true, timeout: 30000 })
const ch = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_gt.txt'], { stdio: 'ignore', windowsHide: true })
await new Promise(r => setTimeout(r, 1600))
const png = screenshot()
writeFileSync('../_grab1.png', png)
await new Promise(r => { ch.on('exit', r); setTimeout(r, 6000) })
console.log('shot bytes', png.length)