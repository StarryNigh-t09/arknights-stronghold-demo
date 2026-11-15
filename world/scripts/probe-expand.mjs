import { tap, screenshot } from '../lib/adb.js'
import { readState } from '../lib/ocr.js'
import { writeFileSync } from 'node:fs'

const pts = [[1785, 1012], [1740, 1005], [1700, 990], [1810, 990], [1763, 953]]
const out = []
for (let i = 0; i < pts.length; i++) {
  const [x, y] = pts[i]
  tap(x, y)
  await new Promise((r) => setTimeout(r, 1400))
  const png = 'shots/exp' + i + '.png'
  writeFileSync(png, screenshot())
  let n = -1
  try {
    const st = await readState(png, { level: 2 })
    n = (st.shop || []).filter((x) => x && !x.empty).length
    out.push({ pt: [x, y], shopCards: n, screen: st.screen, vision: st.vision, money: st.money })
  } catch (e) {
    out.push({ pt: [x, y], error: String(e.message) })
  }
  if (n > 0) break
}
console.log(JSON.stringify(out, null, 1))
