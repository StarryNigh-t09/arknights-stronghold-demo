import { tap } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
await tap(1155, 660, 400)
await new Promise(r => setTimeout(r, 1200))
writeFileSync('../_collapsed.png', screenshot())
console.log('collapsed-shot')
