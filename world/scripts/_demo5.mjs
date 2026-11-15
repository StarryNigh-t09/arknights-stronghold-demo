import { dragHold } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const snap = (tag) => { try { writeFileSync('../_demo5-' + tag + '.png', screenshot()) } catch (e) {} }

// 甲板左起第 3 个干员（按点 770,660）→ 原来试图放的位置 (990,410)，手指需带幻影偏移 (+33,+120)
const r1 = await dragHold([770, 660], [1023, 530], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('放上场:', JSON.stringify(r1))
await sleep(2500); snap('1-placed')

// 再把它从 (990,410) 拖回原位 (770,660)
const r2 = await dragHold([990, 410], [770, 660], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('放回原位:', JSON.stringify(r2))
await sleep(2500); snap('2-back')
