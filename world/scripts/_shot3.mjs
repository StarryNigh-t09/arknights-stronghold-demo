import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
writeFileSync('../_deck.png', screenshot())
console.log('ok')
