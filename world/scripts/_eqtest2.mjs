import { scanDeckChips } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
const p = '../_now2.png'
writeFileSync(p, screenshot())
const c = await scanDeckChips()
console.log('chips:', JSON.stringify(c.chips))
