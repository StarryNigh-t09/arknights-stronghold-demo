import { scanDeckChips, sellDeckUnit } from '../lib/run.js'
import { screenshot } from '../lib/adb.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const HERE = './world'

const b = await scanDeckChips()
console.log('BEFORE ok=', b.ok, 'chips=', JSON.stringify((b.chips || []).map(c => ({ x: c.x, y: c.y }))))
writeFileSync(join(HERE, '.tmp', 'sell-before.png'), screenshot())
const chips = b.chips || []
if (!chips.length) { console.log('甲板没有可卖的牌'); process.exit(0) }
const target = chips[chips.length - 1]
console.log('SELL at', target.x, target.y)
const r = await sellDeckUnit([target.x, target.y])
console.log('sell result', JSON.stringify(r))
await new Promise(res => setTimeout(res, 1200))
writeFileSync(join(HERE, '.tmp', 'sell-after.png'), screenshot())
const a = await scanDeckChips()
console.log('AFTER ok=', a.ok, 'chips=', JSON.stringify((a.chips || []).map(c => ({ x: c.x, y: c.y }))))
