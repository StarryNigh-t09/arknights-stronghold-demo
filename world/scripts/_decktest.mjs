
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ADB = 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe'
const DEV = 'emulator-5556'
const ROOT = "."
const OUT = '..\\_decktest'
mkdirSync(OUT, { recursive: true })
const pts = [{"id":"E1","x":821,"y":775},{"id":"E2","x":963,"y":775},{"id":"E3","x":1104,"y":775},{"id":"E4","x":1246,"y":775},{"id":"E5","x":1388,"y":775},{"id":"U1","x":217,"y":911},{"id":"U2","x":366,"y":912},{"id":"U3","x":514,"y":913},{"id":"U4","x":662,"y":914},{"id":"U5","x":810,"y":915},{"id":"U6","x":958,"y":916},{"id":"U7","x":1106,"y":917},{"id":"U8","x":1255,"y":918},{"id":"U9","x":1403,"y":919},{"id":"U10","x":1551,"y":921}]
const toRaw = (x, y) => [Math.round(1079 - y), Math.round(x)]

async function shot(name) {
  const file = join(OUT, name + '.png')
  const r = spawnSync(ADB, ['-s', DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 40 * 1024 * 1024 })
  writeFileSync(file, r.stdout)
  return file
}

const results = []
for (const p of pts) {
  const [rx, ry] = toRaw(p.x, p.y)
  const cmds = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w 400', 'w 2600', 'm 0 ' + (rx + 2) + ' ' + ry + ' 50', 'c', 'w 100', 'u 0', 'c', 'w 200']
  const file = join(ROOT, '.tmp', 'mt-test.txt')
  writeFileSync(file, cmds.join('\n') + '\n', 'utf8')
  spawnSync(ADB, ['-s', DEV, 'push', file, '/sdcard/_mt_test.txt'], { stdio: 'ignore' })
  const child = spawn(ADB, ['-s', DEV, 'shell', '/data/local/tmp/minitouch -f /sdcard/_mt_test.txt'], { stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 1200))
  await shot(p.id + '-hold')
  await new Promise(r => child.on('close', r))
  await new Promise(r => setTimeout(r, 300))
  results.push(p.id)
  console.log('done', p.id, p.x, p.y)
}
const after = await shot('after-all')
console.log('FINISHED', results.length)
