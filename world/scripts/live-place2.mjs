import { screenshot, swipe, tap } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { tapAt, sleep, peek } from '../lib/run.js'
const shot = (n) => { writeFileSync('shots/' + n + '.png', screenshot()); console.log('shot', n) }

console.log('STATE', peek().state)
// 买两张折桎（各 2 费，钱 4）
await tapAt([974, 905], 1200, '选折桎1')
await tapAt([974, 905], 1500, '确认买折桎1')
shot('pl5_buy1')
await tapAt([1213, 905], 1200, '选折桎2')
await tapAt([1213, 905], 1500, '确认买折桎2')
shot('pl6_buy2')
// 拖到蓝框格子
swipe(1000, 700, 520, 430, 1800)
await sleep(1200)
shot('pl7_drag_blue')
