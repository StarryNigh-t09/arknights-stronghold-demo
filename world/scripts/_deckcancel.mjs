
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const ADB = 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe'
const DEV = 'emulator-5556'
const OUT = '..\\_deckprobe'
const toRaw = (x, y) => [Math.round(1079 - y), Math.round(x)]
const shot = (n) => { const r = spawnSync(ADB, ['-s', DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 40e6 }); writeFileSync(OUT + '\\' + n + '.png', r.stdout) }
const F = '.\\.tmp\\mt-c.txt'
function tap(x, y, waitMs) {
  const a = toRaw(x, y)
  const L = ['d 0 ' + a[0] + ' ' + a[1] + ' 50', 'c', 'w 120', 'u 0', 'c', 'w 200']
  writeFileSync(F, L.join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', F, '/sdcard/_mt_c.txt'], { stdio: 'ignore' })
  spawnSync(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_c.txt'], { stdio: 'ignore' })
  return new Promise(r => setTimeout(r, waitMs))
}
await tap(875, 120, 1200)   // 点击取消
shot('cancel-after')
console.log('CANCEL DONE')
