import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
writeFileSync('../_now5.png', screenshot())
console.log('ok')
