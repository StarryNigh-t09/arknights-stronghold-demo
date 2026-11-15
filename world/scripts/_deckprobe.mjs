
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const ADB = 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe'
const DEV = 'emulator-5556'
const OUT = '..\\_deckprobe'
mkdirSync(OUT, { recursive: true })
const pts = [['E5', 1388, 775], ['U1', 217, 911], ['U3', 514, 913], ['U6', 958, 916]]
const toRaw = (x, y) => [Math.round(1079 - y), Math.round(x)]
function shot(name) {
  const r = spawnSync(ADB, ['-s', DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024 })
  writeFileSync(join(OUT, name + '.png'), r.stdout)
}
for (const [id, x, y] of pts) {
  const [rx, ry] = toRaw(x, y)
  const file = join('.\\.tmp', 'mt-p.txt')
  writeFileSync(file, ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 180', 'u 0', 'c', 'w 200'].join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', file, '/sdcard/_mt_p.txt'], { stdio: 'ignore' })
  spawnSync(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_p.txt'], { stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 900))
  shot(id + '-after')
  console.log('probe', id)
  // 关掉可能弹出的面板：点右上空白
  const [cx, cy] = toRaw(1500, 120)
  writeFileSync(file, ['d 0 ' + cx + ' ' + cy + ' 50', 'c', 'w 120', 'u 0', 'c', 'w 200'].join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', file, '/sdcard/_mt_p.txt'], { stdio: 'ignore' })
  spawnSync(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_p.txt'], { stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 700))
  shot(id + '-closed')
}
console.log('PROBE DONE')
