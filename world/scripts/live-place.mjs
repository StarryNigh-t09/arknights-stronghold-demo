import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { enterRun, POINTS, tapAt, sleep, peek } from '../lib/run.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }
const e = await enterRun({ mode: 'independent' })
console.log('ENTER', e.ok, e.state, JSON.stringify(e.log))
if (!e.ok) process.exit(2)
shot('pl0_rest')
// 1) 点甲板上的一个单位
await tapAt([1135, 630], 1500, '点甲板单位')
shot('pl1_unit_tap')
// 2) 点地图格子
await tapAt([700, 480], 1500, '点地图格')
shot('pl2_tile_tap')
// 3) 长按拖拽单位到格子
await tapAt([960, 540], 800, '空白收面板')
shot('pl3_after_blank')
const { swipe } = await import('../lib/adb.js')
swipe(1135, 630, 700, 480, 1800)
await sleep(1500)
shot('pl4_after_drag')
const st = peek()
console.log('STATE', st.state)
