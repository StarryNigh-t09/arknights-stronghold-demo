import { dragHold } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const snap = (tag) => { try { writeFileSync('../_demo7-' + tag + '.png', screenshot()) } catch (e) {} }
const r0 = await dragHold([900, 290], [830, 730], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('0 先收回甲板', JSON.stringify(r0)); await sleep(1500); snap('0-recall')
const r1 = await dragHold([830, 730], [1023, 530], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('1 放上场', JSON.stringify(r1)); await sleep(900)
const r2 = await dragHold([990, 410], [1590, 410], { holdStartMs: 450, holdMs: 500, steps: 8, stepMs: 45 })
console.log('2 定朝向', JSON.stringify(r2)); await sleep(1500); snap('2-placed')
const r3 = await dragHold([990, 410], [830, 730], { holdStartMs: 450, holdMs: 800, steps: 12, stepMs: 45 })
console.log('3 拖回原位', JSON.stringify(r3)); await sleep(1500); snap('3-back')
