import { autoRest } from '../lib/drive.js'
import { peek, playRound } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'

const level = Number(process.argv[2] || 1)
const log = []
const save = (n) => { try { writeFileSync('shots/' + n + '.png', screenshot()) } catch (e) { log.push('截图失败 ' + e.message) } }
const st = peek()
log.push('界面 ' + st.state + ' dist=' + Number(st.dist).toFixed(3))
if (st.state !== 'wz_rest') { console.log(JSON.stringify({ ok: false, log })); process.exit(0) }
save('live5-before')
const r = await autoRest({ centerLevel: level, totalRounds: 9, maxSteps: 5 })
log.push(...(r.steps || []))
if (r.last) log.push('结尾 回合' + r.last.round + ' 钱' + r.last.money + ' 生命' + r.last.hp + ' 中心Lv' + r.centerLevel + ' 卡' + (r.last.shop || []).filter(x => x && !x.empty).map(x => x.name + '/' + x.tier + '/' + x.price).join(','))
if (!r.ok) log.push('autoRest 失败: ' + r.error)
save('live5-after')
console.log(JSON.stringify({ ok: r.ok, log }, null, 1))
