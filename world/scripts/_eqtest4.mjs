import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
writeFileSync('../_now4.png', screenshot())
console.log('ok')
