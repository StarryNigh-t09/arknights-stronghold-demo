import { autoRest } from '../lib/drive.js'
import { peek, playRound } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'

const stamp = Date.now()
const log = []
const save = (name) => { try { writeFileSync(`shots/${name}.png`, screenshot()) } catch (e) { log.push('截图失败 ' + e.message) } }

const st = peek()
log.push('开局界面：' + st.state + ' dist=' + Number(st.dist).toFixed(3))
save('live4-before')
if (st.state !== 'wz_rest') { console.log(JSON.stringify({ ok: false, log }, null, 1)); process.exit(0) }

const r = await autoRest({ centerLevel: 1, totalRounds: 9, maxSteps: 4 })
log.push(...(r.steps || []))
log.push('收尾界面：' + JSON.stringify(r.last && { screen: r.last.screen, round: r.last.round, money: r.last.money, hp: r.last.hp, upgradeCost: r.last.upgradeCost, centerLevel: r.centerLevel }))
log.push('自数中心等级：' + r.centerLevel)
save('live4-after')
console.log(JSON.stringify({ ok: r.ok, log }, null, 1))
