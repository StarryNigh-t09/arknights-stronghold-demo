import { tap, screenshot, sePress } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const snap = (n) => { writeFileSync('shots/tp-' + n + '.png', screenshot()) }
snap('base')
tap(1785, 1012)
await new Promise(r => setTimeout(r, 900))
snap('tap1')
await sePress(1740, 1045, { holdMs: 800 })
await new Promise(r => setTimeout(r, 900))
snap('press')
console.log('shots done')
