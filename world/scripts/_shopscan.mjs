import { scanDeckChips, tapAt, sleep, POINTS, peek } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const png = (n) => join(HERE, '..', '.tmp', n)

// 确保面板展开
console.log('state=' + peek().state)
await tapAt(POINTS.shopExpand, 1500, '展开面板')
await sleep(1000)
writeFileSync(png('shop1.png'), screenshot())
spawnSync('python', [join(HERE, '..', 'sidecar', 'names_ocr.py'), png('shop1.json'), png('shop1.png')], { stdio: 'ignore' })
const fs = await import('node:fs')
try {
  const obj = JSON.parse(fs.readFileSync(png('shop1.json'), 'utf8'))
  const lines = Object.values(obj)[0] || []
  console.log('SHOP_OCR=' + JSON.stringify(lines.filter(l => l.box && l.box[1] > 700).map(l => [l.text, Math.round((l.box[0]+l.box[2])/2), Math.round((l.box[1]+l.box[3])/2)])))
} catch (e) { console.log('OCR失败 ' + e.message) }
