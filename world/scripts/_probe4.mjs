import { scanFreeTiles, scanDeckChips, peek, sleep } from '../lib/run.js'
import { deployFromDeck, senseRun } from '../lib/drive.js'
import { deployTilesRanked } from '../lib/gamemap.js'

const ranked = deployTilesRanked()
let t = Date.now()
const ft = await scanFreeTiles({ cells: ranked })
const msFree = Date.now() - t
console.log('FREE', msFree + 'ms', 'mode=' + ft.mode, 'ok=' + ft.ok, JSON.stringify((ft.cells || []).slice(0, 25)))
console.log('TILES', JSON.stringify(ft.tiles))
const okMap = new Map((ft.tiles || []).map((x) => [x[0] + ',' + x[1], x]))
const greenTiles = ranked.filter((c) => okMap.has(c[0] + ',' + c[1]))
console.log('GREENTILES(ranked order)', greenTiles.length, JSON.stringify(greenTiles))

t = Date.now()
const sc = await scanDeckChips()
console.log('CHIPS', Date.now() - t, 'ms', JSON.stringify(sc.chips.map((c) => [c.x, c.y])))
const st0 = await senseRun(1, { expect: 'rest' })
console.log('SLOTS-BEFORE', st0.slotsLeft, 'money', st0.money)
t = Date.now()
const d = await deployFromDeck(new Array(sc.chips.length).fill({}), {
  facing: 'right', slotsLeft: Number(st0.slotsLeft), chips: sc.chips,
  tiles: greenTiles.length ? greenTiles : undefined, round: st0.round, shopOpen: false,
})
console.log('DEPLOY', Date.now() - t, 'ms', JSON.stringify({ placed: d.placed, attempts: d.attempts, holdStart: d.holdStart, failed: d.failedTiles }))
console.log(d.steps.join('\n'))
const st1 = await senseRun(1, { expect: 'rest' })
console.log('SLOTS-AFTER', st1.slotsLeft, 'screen', (await peek()).state)
