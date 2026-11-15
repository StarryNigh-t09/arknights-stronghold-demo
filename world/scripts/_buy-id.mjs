import { autoRest } from '../lib/drive.js'
import { scanDeckChips, tapAt, sleep, POINTS } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))

const r = await autoRest({ maxSteps: 2, boardCount: 0, deck: [], centerLevel: 1, owned: {}, totalRounds: 12 })
console.log('autoRest=' + JSON.stringify({ ok: r.ok, steps: r.steps }))

await sleep(1200)
const { chips } = await scanDeckChips()
console.log('chips=' + JSON.stringify(chips.map(c => ({ n: c.n, x: Math.round(c.x), y: Math.round(c.y) }))))
if (!chips.length) process.exit(0)
const c = chips[0]
await tapAt([Math.round(c.x) + 52, Math.round(c.y) + 99], 1000, '按一下甲板干员')
const png = join(HERE, '..', '.tmp', 'detail.png')
const small = join(HERE, '..', '.tmp', 'detail-small.png')
writeFileSync(png, screenshot())
spawnSync('python', [join(HERE, '_crop.py'), png, small], { stdio: 'ignore' })
const out = small + '.json'
spawnSync('python', [join(HERE, '..', 'sidecar', 'names_ocr.py'), out, small], { stdio: 'ignore' })
const fs = await import('node:fs')
try {
  const obj = JSON.parse(fs.readFileSync(out, 'utf8'))
  console.log('OCR=' + JSON.stringify((Object.values(obj)[0] || []).map(l => l.text)))
} catch (e) { console.log('OCR失败 ' + e.message) }
