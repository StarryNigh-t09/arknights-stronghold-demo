/**
 * try-buy.mjs — 只跑「休整期买卡」这一段，不打这一回合。
 * 用法：node scripts/try-buy.mjs [已上场数] [equip|noequip]
 * 目的：真机上验证 m00211 的买卡顺序（升级 → 买 → 刷新 → 冻结）和折叠纪律。
 */
import { autoRest } from '../lib/drive.js'
import { peek } from '../lib/run.js'

const board0 = Math.max(0, Number(process.argv[2]) || 0)
const equip = process.argv[3] !== 'noequip'
console.log('开始 当前=' + JSON.stringify(peek().state) + ' board0=' + board0 + ' equip=' + equip)
const t0 = Date.now()
const r = await autoRest({ maxSteps: 1, equip, deploy: false, wantAuto: true, boardCount: board0 })
console.log('耗时 ' + Math.round((Date.now() - t0) / 1000) + 's')
for (const l of r.steps || []) console.log(l)
console.log('ok=' + r.ok + ' level=' + r.centerLevel + ' deckLeft=' + (r.deckLeft || []).length + (r.error ? ' error=' + r.error : ''))
