import { screenshot } from '../lib/adb.js'
import { writeFileSync, existsSync } from 'node:fs'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dir = '../_rec'
let i = 0
const t0 = Date.now()
while (i < 1500) {
  if (existsSync(dir + '/STOP')) break
  try { writeFileSync(dir + '/' + String(i).padStart(4, '0') + '.png', screenshot()) } catch (e) {}
  i++
  await sleep(700)
}
console.log('frames', i, 'elapsed', Math.round((Date.now() - t0) / 1000) + 's')
