/**
 * demo-place.mjs — 只演示「从甲板拖一个干员上场」，不开战、不点准备就绪。
 *
 * 用法：node world/scripts/demo-place.mjs [outDir] [holdMs] [arriveMs]
 * 产物：outDir/before-<ts>.png、after-<ts>.png、demo.json（落点、格差、甲板张数变化）。
 * 判据：落点格的像素差 >= 8（run.js diffCell 同一口径）；甲板张数应 -1。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { peek, scanDeckChips, sleep, diffCell, POINTS } from '../lib/run.js'
import { placeBatch } from '../lib/act.js'
import { screenshot } from '../lib/adb.js'
import { deployTiles } from '../lib/gamemap.js'

const outDir = resolve(process.argv[2] || '../demo-place')
const holdMs = Number(process.argv[3] || 600)
const ts = new Date().toISOString().replace(/[:.]/g, '-')
mkdirSync(outDir, { recursive: true })

const log = []
const say = (s) => { log.push(s); console.log(s) }

const st = await peek()
say('state=' + st.state)
if (st.state !== 'wz_rest') {
  say('不在休整期（' + st.state + '），不拖。')
  process.exit(3)
}

const scan0 = await scanDeckChips({ minPressY: 840 })
const chips0 = scan0.chips || []
say('甲板 ' + chips0.length + ' 张' + (chips0.length ? '：' + chips0.map((c) => c.x + ',' + c.y).join(' / ') : ''))
if (!chips0.length) { say('甲板空的，没有牌可拖。'); process.exit(4) }

const chip = chips0[0]
let from = { x: chip.x, y: chip.y }
if (from.y > 900) from = { x: from.x, y: 890 }

const tiles = deployTiles().map((t) => t.px)
say('候选格 ' + tiles.length + ' 个，依次试')

let result = null
for (let i = 0; i < Math.min(3, tiles.length); i++) {
  const to = tiles[i]
  const before = join(outDir, 'before-' + ts + '-t' + i + '.png')
  const after = join(outDir, 'after-' + ts + '-t' + i + '.png')
  writeFileSync(before, Buffer.from(screenshot()))
  const t0 = Date.now()
  const r = await placeBatch([{ from: [from.x, from.y], to, facing: 'right', holdStartMs: holdMs }])
  await sleep(1800)
  writeFileSync(after, Buffer.from(screenshot()))
  const d = await diffCell(before, after, to[0], to[1], 55)
  const scan1 = await scanDeckChips({ minPressY: 840 })
  const left = (scan1.chips || []).length
  say('试 ' + to.join(',') + '：diff=' + d + '，甲板 ' + chips0.length + '→' + left + '，' + (Date.now() - t0) + 'ms，ok=' + r.ok)
  result = { from, to, diff: d, chipsBefore: chips0.length, chipsAfter: left, placeOk: r.ok, before, after, ms: Date.now() - t0 }
  if (d >= 8 || left < chips0.length) { say('落位成功。'); break }
}

writeFileSync(join(outDir, 'demo.json'), JSON.stringify({ st, chips0, result, log, holdMs }, null, 2), 'utf8')
say('demo.json → ' + join(outDir, 'demo.json'))
