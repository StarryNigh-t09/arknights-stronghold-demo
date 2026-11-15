import { tap, screenshot, sePress } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'

const base = screenshot()
writeFileSync('shots/pb-base.png', base)
const pts = [
  { pt: [1785, 1012], how: 'tap' },
  { pt: [1785, 1012], how: 'press' },
  { pt: [1700, 1005], how: 'tap' },
  { pt: [1860, 1030], how: 'tap' },
  { pt: [1790, 990], how: 'tap' },
]
const out = []
for (let i = 0; i < pts.length; i++) {
  const { pt, how } = pts[i]
  if (how === 'press') await sePress(pt[0], pt[1], { holdMs: 300 })
  else tap(pt[0], pt[1])
  await new Promise((r) => setTimeout(r, 1500))
  const f = 'shots/pb-' + i + '.png'
  writeFileSync(f, screenshot())
  out.push({ i, pt, how, file: f })
}
console.log(JSON.stringify(out, null, 1))
