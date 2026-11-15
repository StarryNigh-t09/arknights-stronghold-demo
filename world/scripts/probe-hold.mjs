import { scanDeckChips, scanFreeTiles, peek, sleep } from '../lib/run.js'
import { placeBatch } from '../lib/act.js'
import { deployTilesRanked } from '../lib/gamemap.js'
import { writeFileSync } from 'node:fs'

/**
 * 起手时长扫描（用户 m02704 第 4 条：600ms 太久，要多试试尽量缩短）。
 *
 * 做法：在同一回合的休整期里，从甲板最左那张牌起手，按住 hold 毫秒再拖到一个可站格，
 * 松手后数甲板 —— 少一张就是这个 hold 能拎起来。从短往长试，第一个成功的就是最小可行值。
 *
 * 只在一个休整期里跑，最多试 6 个时长；中途界面变了（弹出详情/进战斗）立刻停。
 * 用法：node scripts/probe-hold.mjs [输出文件]
 */
const holds = String(process.env.COOP_HOLDS || '90,120,150,200,300,600')
  .split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x >= 60)
const out = process.argv[2] || ('_hold-probe-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')

let cells = []
try {
  const ft = await scanFreeTiles()
  if (ft.ok && ft.tiles.length) cells = ft.tiles.slice()
  console.log('绿格', cells.length, ft.error || '')
} catch (e) { console.log('绿格扫描失败', e.message) }
const mapTiles = deployTilesRanked()
if (!cells.length) cells = mapTiles.slice()
const pool = cells.concat(mapTiles)

const results = []
for (const hold of holds) {
  const sc = await scanDeckChips()
  const n0 = sc.chips.length
  if (!n0) { results.push({ hold, ok: false, why: '甲板没有牌' }); break }
  const from = sc.chips[0]
  const cell = pool.shift()
  if (!cell) { results.push({ hold, ok: false, why: '候选格用完' }); break }
  const st0 = await peek()
  const t0 = Date.now()
  await placeBatch([{ from: [from.x, from.y], to: cell, facing: 'right', holdStartMs: hold }])
  await sleep(300)
  const sc2 = await scanDeckChips()
  const n1 = sc2.chips.length
  const st1 = await peek()
  const ok = n1 < n0
  const rec = { hold, ok, ms: Date.now() - t0, from: [from.x, from.y], to: cell, before: n0, after: n1, screen0: st0.state, screen1: st1.state }
  results.push(rec)
  console.log(JSON.stringify(rec))
  if (ok) break
  if (st1.state !== 'wz_rest' && st1.state !== 'wz_prep') {
    results.push({ hold, ok: false, why: '界面变成 ' + st1.state + '，停' })
    break
  }
}
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), holds, results }, null, 2))
console.log('写了', out)
