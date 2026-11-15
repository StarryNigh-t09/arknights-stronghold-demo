
import { screenshot } from '../lib/adb.js'
import { peek } from '../lib/run.js'
import { writeFileSync } from 'node:fs'
writeFileSync('..\\_live.png', screenshot())
const p = await peek()
console.log('PEEK', JSON.stringify(p.state))
console.log('RAW', JSON.stringify(p).slice(0, 600))
