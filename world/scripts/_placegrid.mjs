import { scanDeckChips, placeDeckUnit } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'

const s0 = await senseRun()
console.log('before slots', s0.slotsLeft, 'screen', s0.screen)
const { chips } = await scanDeckChips()
console.log('chips', chips.length)

const cand = [[1150,560],[1150,450],[860,560],[1010,560],[1240,560],[690,560],[800,560],[470,560]]
let tries = 0, placed = 0
for (const t of cand) {
  if (tries >= 8 || placed >= 2) break
  const before = Number((await senseRun()).slotsLeft)
  if (!Number.isFinite(before) || before <= 0) { console.log('no slots'); break }
  tries++
  await placeDeckUnit({ x: t[0], y: t[1], to: [t[0], t[1]], facing: 'right' })
  const after = Number((await senseRun()).slotsLeft)
  console.log('try', t.join(','), before + '->' + after)
  if (after < before) placed++
}
console.log('done placed', placed, 'tries', tries)