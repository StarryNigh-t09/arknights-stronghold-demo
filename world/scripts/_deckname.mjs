import { scanDeckChips, tapAt, sleep, POINTS } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
// 先展开商店面板，甲板上的干员才会露出来
await tapAt(POINTS.shopExpand, 1600, '展开面板')
await sleep(800)
const { chips } = await scanDeckChips()
console.log('chips=' + JSON.stringify(chips.map(c => ({ n: c.n, x: Math.round(c.x), y: Math.round(c.y) }))))
if (!chips.length) process.exit(0)
const c = chips[0]
const png = join(HERE, '..', '.tmp', 'detail-' + Date.now() + '.png')
const small = join(HERE, '..', '.tmp', 'detail-small.png')
writeFileSync(png, screenshot())
// 轻按（不拖）应该进选中态并弹左侧详情
await tapAt([Math.round(c.x) + 52, Math.round(c.y) + 99], 900, '按一下甲板干员')
writeFileSync(png, screenshot())
spawnSync('python', [join(HERE, '_crop.py'), png, small], { stdio: 'ignore' })
const out = small + '.json'
spawnSync('python', [join(HERE, '..', 'sidecar', 'names_ocr.py'), out, small], { stdio: 'ignore' })
const fs = await import('node:fs')
try {
  const obj = JSON.parse(fs.readFileSync(out, 'utf8'))
  const lines = Object.values(obj)[0] || []
  console.log('OCR=' + JSON.stringify(lines.map(l => l.text)))
} catch (e) { console.log('OCR失败 ' + e.message) }
