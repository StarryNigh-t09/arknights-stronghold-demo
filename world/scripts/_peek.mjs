import { peek } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
const st = peek()
console.log('PEEK ' + JSON.stringify({ state: st.state, dist: st.dist }))
try {
  const r = await senseRun(null)
  const pick = r && r.ok ? { ok: r.ok, screen: r.screen, round: r.round, money: r.money, slotsLeft: r.slotsLeft, shopExpanded: r.shopExpanded, shopBrightness: r.shopBrightness, level: r.shopLevelOcr, upgradeCost: r.upgradeCost, error: r.error } : r
  console.log('SENSE ' + JSON.stringify(pick))
} catch (e) { console.log('SENSE_ERR ' + e.message) }
