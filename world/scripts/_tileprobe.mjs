import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { screenshot } from '../lib/adb.js'
import { scanDeckChips, placeDeckUnit } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, '..', '.tmp')
mkdirSync(TMP, { recursive: true })

const py = `
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
x, y = int(sys.argv[2]), int(sys.argv[3])
sub = a[y-45:y+45, x-45:x+45]
print(round(float((sub.mean(axis=2) < 60).mean()), 3))
`
const pyFile = join(TMP, 'darkfrac.py')
writeFileSync(pyFile, py)

function darkAt(png, x, y) {
  const out = join(TMP, 'dark.txt')
  const fd = join(TMP, 'dark-out.txt')
  const r = spawnSync('python', [pyFile, png, String(x), String(y)], { encoding: 'utf8', windowsHide: true })
  return Number((r.stdout || '0').trim())
}

const s0 = await senseRun()
console.log('slots', s0.slotsLeft, 'deck chips', (await scanDeckChips()).chips.length)
const cand = [[880, 560], [1200, 560], [690, 450], [1010, 450]]
for (const t of cand) {
  const before = Number((await senseRun()).slotsLeft)
  if (!(before > 0)) { console.log('no slots'); break }
  const c0 = (await scanDeckChips()).chips[0]
  if (!c0) break
  const r = await placeDeckUnit({ x: c0.x, y: c0.y, to: t, facing: 'right' })
  const p = join(TMP, 'chk.png')
  writeFileSync(p, screenshot())
  const d = darkAt(p, t[0], t[1])
  console.log('try', t.join(','), 'dark=' + d, 'ok=' + r.ok)
  if (d > 0.15) { console.log('PLACED', t.join(',')); break }
}
