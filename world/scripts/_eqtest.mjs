import { equipDeck } from '../lib/drive.js'
import { findDeckEquip } from '../lib/run.js'
const steps = []
const eq = await findDeckEquip()
console.log('扫描:', JSON.stringify({ ok: eq.ok, kb: eq.kb, items: (eq.items || []).map((i) => ({ n: i.name, s: i.score, x: i.x, y: i.y, placed: i.placed })) }))
const n = await equipDeck({ steps, maxItems: 3 })
for (const s of steps) console.log(s)
console.log('装了', n, '件')
