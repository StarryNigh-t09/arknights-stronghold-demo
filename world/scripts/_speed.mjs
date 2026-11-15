import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { screenshot } from '../lib/adb.js'
import { probeState, readState } from '../lib/ocr.js'

const dir = mkdtempSync(join(tmpdir(), 'coop-spd-'))
const p = join(dir, 's.png')
writeFileSync(p, screenshot())
let t = Date.now()
const pr = await probeState(p)
console.log('probe', Date.now() - t, 'ms', JSON.stringify(pr))
t = Date.now()
const st = await readState(p, { level: 1, expect: 'rest' })
console.log('state', Date.now() - t, 'ms', JSON.stringify({ ok: st.ok, screen: st.screen, round: st.round, money: st.money, level: st.shopLevel, slots: st.slotsLeft, cards: (st.shop || []).filter((c) => c && !c.empty).map((c) => c.name + '/' + c.price), expanded: st.shopExpanded }))
rmSync(dir, { recursive: true, force: true })
