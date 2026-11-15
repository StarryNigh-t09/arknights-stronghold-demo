import { dragHold } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const snap = (tag) => { try { writeFileSync('../_demo6-' + tag + '.png', screenshot()) } catch (e) {} }
// 1) 甲板左起第 3 个（脚下格 770,730）→ 长按拖到 990,410（手指落点补幻影偏移 +33/+120）
const r1 = await dragHold([770, 730], [1023, 530], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('1 拖上场', JSON.stringify(r1))
await sleep(900)
// 2) 松手后再长按目标格，拖 600px 定朝向
const r2 = await dragHold([990, 410], [1590, 410], { holdStartMs: 450, holdMs: 500, steps: 8, stepMs: 45 })
console.log('2 定朝向', JSON.stringify(r2))
await sleep(2000); snap('placed')
// 3) 长按场上该格拖回甲板原位
const r3 = await dragHold([990, 410], [770, 730], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('3 拖回原位', JSON.stringify(r3))
await sleep(2000); snap('back')
