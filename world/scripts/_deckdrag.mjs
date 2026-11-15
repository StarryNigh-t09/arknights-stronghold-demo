
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
const ADB = 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe'
const DEV = 'emulator-5556'
const OUT = '..\\_deckprobe'
mkdirSync(OUT, { recursive: true })
const toRaw = (x, y) => [Math.round(1079 - y), Math.round(x)]
const shot = (n) => { const r = spawnSync(ADB, ['-s', DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 40e6 }); writeFileSync(OUT + '\\' + n + '.png', r.stdout) }
const F = '.\\.tmp\\mt-d.txt'
function run(lines, waitMs) {
  writeFileSync(F, lines.join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', F, '/sdcard/_mt_d.txt'], { stdio: 'ignore' })
  spawnSync(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_d.txt'], { stdio: 'ignore' })
  return new Promise(r => setTimeout(r, waitMs))
}
const from = toRaw(217, 911)   // U1 陨星
const to = toRaw(1196, 353)    // C7 r1 空格
const lines = ['d 0 ' + from[0] + ' ' + from[1] + ' 50', 'w 80']
const N = 12
for (let i = 1; i <= N; i++) {
  const x = Math.round(from[0] + (to[0] - from[0]) * i / N)
  const y = Math.round(from[1] + (to[1] - from[1]) * i / N)
  lines.push('m 0 ' + x + ' ' + y, 'w 16')
}
lines.push('w 250', 'u 0', 'w 200')
await run(lines, 1200)
shot('drag1-after')
console.log('DRAG DONE')
