import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { screenshot, adbPath, currentDevice } from '../lib/adb.js'
import { toRaw } from '../lib/touch.js'
import { sleep, scanDeckChips } from '../lib/run.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, '..', '.tmp')
mkdirSync(TMP, { recursive: true })
const { chips } = await scanDeckChips()
console.log('chips', chips.map((c) => c.x + ',' + c.y).join(' | '))
if (!chips.length) process.exit(0)
const c = chips[chips.length - 1]
const [rx, ry] = toRaw(c.x, c.y)
const [tx, ty] = toRaw(300, 950)          // 往左下（水面/岩石）拖，最后在非法格松手＝取消
const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 450']
const N = 6
for (let i = 1; i <= N; i++) {
  const x = Math.round(rx + (tx - rx) * i / N)
  const y = Math.round(ry + (ty - ry) * i / N)
  lines.push('m 0 ' + x + ' ' + y + ' 50', 'c', 'w 45')
}
lines.push('w 3500', 'u 0', 'c', 'w 200')
const f = join(TMP, 'grab2.txt')
writeFileSync(f, lines.join('\n') + '\n')
await new Promise((r) => spawn(adbPath(), ['-s', currentDevice(), 'push', f, '/sdcard/_grab2.txt'], { stdio: 'ignore', windowsHide: true }).on('exit', r))
const q = spawn(adbPath(), ['-s', currentDevice(), 'shell', '/data/local/tmp/minitouch -f /sdcard/_grab2.txt'], { stdio: 'ignore', windowsHide: true })
await sleep(2100)
const buf = screenshot()
writeFileSync(join(TMP, 'grabbed.png'), buf)
console.log('saved grabbed.png', buf.length)
await new Promise((r) => q.on('exit', r))
await sleep(500)
