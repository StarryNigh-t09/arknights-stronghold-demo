// 升级按钮手势实测（2026-11-12）：一次点击 vs 两次点击，看 LEVEL 数字到底变不变。
import { sleep, tapAt, POINTS } from '../lib/run.js'
import { senseRun } from '../lib/drive.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'

const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const shot = (tag) => { const b = screenshot(); const p = new URL('../.tmp/up-' + tag + '.png', import.meta.url).pathname.slice(1); writeFileSync(p, b); return p }

let st = await senseRun(1)
say('STATE', JSON.stringify({ ok: st.ok, screen: st.screen, round: st.round, money: st.money, expanded: st.shopExpanded, level: st.shopLevelOcr, cost: st.upgradeCost, upPt: st.upgradePoint, cards: (st.shop || []).length }))
if (!st.ok) process.exit(1)
if (st.shopExpanded !== true) {
  await tapAt(POINTS.shopExpand, 1300, '展开商店')
  await sleep(800)
  st = await senseRun(1)
  say('AFTER-EXPAND', JSON.stringify({ expanded: st.shopExpanded, level: st.shopLevelOcr, cost: st.upgradeCost, upPt: st.upgradePoint, money: st.money }))
}
say('SHOT-BEFORE', shot('before'))
const level0 = st.shopLevelOcr
const pt = st.upgradePoint ? [Number(st.upgradePoint.x), Number(st.upgradePoint.y)] : POINTS.upgrade
say('升级点', JSON.stringify(pt))
await tapAt(pt, 1200, '点升级')
await sleep(1200)
say('SHOT-AFTER1', shot('after1'))
let a = await senseRun(1)
say('AFTER1', JSON.stringify({ screen: a.screen, level: a.shopLevelOcr, cost: a.upgradeCost, money: a.money, cards: (a.shop || []).length }))
if (Number(a.shopLevelOcr) === Number(level0)) {
  say('LEVEL 没变 → 再点一次（旧 shopAction 的第二次 tap）')
  await tapAt(pt, 1400, '点升级2')
  await sleep(1200)
  say('SHOT-AFTER2', shot('after2'))
  a = await senseRun(1)
  say('AFTER2', JSON.stringify({ screen: a.screen, level: a.shopLevelOcr, cost: a.upgradeCost, money: a.money, cards: (a.shop || []).length }))
}
say('DONE level ' + level0 + ' -> ' + a.shopLevelOcr)
