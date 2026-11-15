import { sh } from '../lib/adb.js'
import { sleep } from '../lib/run.js'
const press = (x, y) => sh('input mouse motionevent MOVE ' + x + ' ' + y + '; sleep 0.15; input mouse motionevent DOWN ' + x + ' ' + y + '; sleep 0.12; input mouse motionevent UP ' + x + ' ' + y, { timeoutMs: 20000 })
await press(1147, 600)   // 甲板上的装备 源石溶剂
await sleep(900)
await press(810, 285)    // 场上干员
await sleep(1200)
console.log('equip attempt done')
