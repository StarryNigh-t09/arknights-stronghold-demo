
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const ADB = 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe'
const DEV = 'emulator-5556'
const OUT = '..\\_deckprobe'
const toRaw = (x, y) => [Math.round(1079 - y), Math.round(x)]
const shot = (n) => { const r = spawnSync(ADB, ['-s', DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 40e6 }); writeFileSync(OUT + '\\' + n + '.png', r.stdout) }
const F = '.\\.tmp\\mt-d.txt'
function run(lines, waitMs) {
  writeFileSync(F, lines.join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', F, '/sdcard/_mt_d.txt'], { stdio: 'ignore' })
  spawnSync(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_d.txt'], { stdio: 'ignore' })
  return new Promise(r => setTimeout(r, waitMs))
}
function dragFile(fx, fy, tx, ty) {
  const a = toRaw(fx, fy), b = toRaw(tx, ty)
  const L = ['d 0 ' + a[0] + ' ' + a[1] + ' 50', 'c', 'w 600']
  const N = 20
  for (let i = 1; i <= N; i++) {
    L.push('m 0 ' + Math.round(a[0] + (b[0] - a[0]) * i / N) + ' ' + Math.round(a[1] + (b[1] - a[1]) * i / N), 'c', 'w 25')
  }
  L.push('w 500', 'u 0', 'c', 'w 200')
  return L
}
// 试验 2：从 (217,860) 拖到 C7r1
await run(dragFile(217, 860, 1196, 353), 1500)
shot('drag2-after')
// 试验 3：从 (217,890) 拖
await run(dragFile(217, 890, 1196, 353), 1500)
shot('drag3-after')
console.log('DONE')
