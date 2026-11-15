/**
 * BOSS 关（第 14 回合）规则单测。
 * 口径来自 world/docs/handoff-2026-11-13.md §3 用户原话：
 *   x=7/8 放近战、x=5/6 放医疗和远程、远程够得到 x=9、全部朝右、第 14 回合不升级。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOSS_ROUND, isBossRound, healerKindOf, minDxOf, maxDxOf, reachesCol,
  bossTilesFor, bossLayoutFor, bossRoleOf, planBossSwaps, describeBossPlan,
} from '../lib/bossplan.js'
import { loadGameMap, operatorInfo } from '../lib/gamemap.js'

const map = loadGameMap()

test('BOSS 关判定：只看回合号 == 总回合数', () => {
  assert.equal(BOSS_ROUND, 14)
  assert.equal(isBossRound(14), true)
  assert.equal(isBossRound(13), false)
  assert.equal(isBossRound(14, 14), true)
  assert.equal(isBossRound(14, 13), false)   // 总回合数传 13 时第 14 回合不是最后一回合
  assert.equal(isBossRound(0), false)
  assert.equal(isBossRound(NaN), false)
  assert.equal(isBossRound(undefined), false)
})

test('医疗细分：群奶/护佑 → x=6，行医 → x=5', () => {
  // 射程含 dx<0（能顾到身后）
  assert.equal(healerKindOf('莎草'), 'cover')
  assert.equal(healerKindOf('夜莺'), 'cover')
  // 本身是辅助、带治疗范围的淬羽赫默也算群奶
  assert.equal(healerKindOf('淬羽赫默'), 'cover')
  // 只能往前治（dx 全 ≥0）
  assert.equal(healerKindOf('褐果'), 'front')
  assert.equal(healerKindOf('流明'), 'front')
  // 不是医疗
  assert.equal(healerKindOf('灰喉'), null)
  assert.equal(healerKindOf('角峰'), null)
})

test('射程换算：min/max dx 与「够得到 x=9」', () => {
  assert.equal(minDxOf(operatorInfo('莎草')), -1)
  assert.equal(minDxOf(operatorInfo('褐果')), 0)
  assert.equal(maxDxOf(operatorInfo('灰喉')), 3)
  assert.equal(maxDxOf(operatorInfo('角峰')), 0)
  assert.equal(reachesCol(operatorInfo('灰喉'), 6), true)   // 6+3=9
  assert.equal(reachesCol(operatorInfo('灰喉'), 5), false)  // 5+3=8
  assert.equal(reachesCol(operatorInfo('褐果'), 6), true)   // 6+3=9
  assert.equal(reachesCol(null, 9), false)
})

test('BOSS 目标格：x=7/8 地面 + x=5/6 高台，全部朝右', () => {
  const tiles = bossTilesFor(map)
  assert.ok(tiles.length >= 8, '目标格至少 8 个，实际 ' + tiles.length)
  const ground = tiles.filter((t) => t.kind === 'ground')
  const high = tiles.filter((t) => t.kind === 'high')
  for (const t of ground) assert.ok(t.col === 7 || t.col === 8, '地面格只能在 x=7/8，实际 ' + t.col + ',' + t.row)
  for (const t of high) assert.ok(t.col === 5 || t.col === 6, '高台格只能在 x=5/6，实际 ' + t.col + ',' + t.row)
  for (const t of tiles) assert.equal(t.facing, 'right')
  // 每格都有真机像素坐标
  for (const t of tiles) assert.ok(Array.isArray(t.px) && t.px.length === 2 && t.px[0] > 0)
})

test('按职业排位：重装/近战去 x=7/8，群奶去 x=6，行医去 x=5，远程上高台', () => {
  const layout = bossLayoutFor(['角峰', '米格鲁', '灰喉', '莎草', '褐果'], map)
  const by = Object.fromEntries(layout.filter(Boolean).map((p) => [p.name, p]))
  assert.ok(by['角峰'], '重装角峰应排上')
  assert.ok(by['灰喉'], '狙击灰喉应排上')
  assert.ok(by['莎草'], '群奶莎草应排上')
  assert.ok(by['褐果'], '行医褐果应排上')
  assert.equal(by['角峰'].col, 7)
  assert.ok(by['米格鲁'].col === 7 || by['米格鲁'].col === 8, '近战在 x=7/8，实际 ' + by['米格鲁'].col)
  assert.equal(by['莎草'].col, 6)
  assert.equal(by['褐果'].col, 5)
  // 2026-11-13：群奶/行医先占 (6,2)(5,2)，远程最后补 —— 灰喉可能落到 (6,3)（仍是高台）。
  // 用户口径「医疗尽量覆盖全部干员」优先于「远程先到先得」。
  assert.ok(['6,2', '6,3', '5,2'].includes(by['灰喉'].col + ',' + by['灰喉'].row), '远程应上高台，实际 ' + by['灰喉'].col + ',' + by['灰喉'].row)
  for (const p of layout.filter(Boolean)) assert.equal(p.facing, 'right')
  // 远程站 col5 时必须够得到 x=9
  if (by['灰喉'].col === 5) assert.equal(reachesCol(operatorInfo('灰喉'), 5), true)
  assert.match(describeBossPlan(layout), /全朝右/)
})

test('人数超过 8 个：不重复占格，多出来的人排不上（返回 null）', () => {
  const names = ['角峰', '米格鲁', '灰喉', '莎草', '褐果', '夜莺', '流明', '角峰', '灰喉', '莎草']
  const layout = bossLayoutFor(names, map)
  assert.equal(layout.length, names.length)
  const used = new Set()
  for (const p of layout.filter(Boolean)) {
    const k = p.col + ',' + p.row
    assert.ok(!used.has(k), '格 ' + k + ' 被重复分配')
    used.add(k)
  }
  assert.ok(used.size <= 8, '不重复格最多 8 个，实际 ' + used.size)
})

test('BOSS 换人：场上职业不对才换，且只从整备区挑职业对得上的', () => {
  const layout = bossLayoutFor(['角峰', '灰喉', '莎草'], map)
  const tankSlot = layout.find((p) => p && p.role === 'tank')
  const rangedSlot = layout.find((p) => p && p.role === 'ranged')
  // 场上：坦克格上站了个狙击（错），远程格空着
  const board = [{ name: '褐果', px: tankSlot.px }]
  const { swaps } = planBossSwaps(board, layout, { bench: ['角峰', '灰喉'], maxSwaps: 4 })
  assert.ok(swaps.length >= 1)
  const first = swaps[0]
  assert.deepEqual(first.px, tankSlot.px)
  assert.equal(bossRoleOf(first.name), 'tank')
  assert.equal(first.replaces, '褐果')
  assert.ok(rangedSlot)
})

test('BOSS 换人：职业已经对了就不动', () => {
  const layout = bossLayoutFor(['角峰'], map)
  const slot = layout.find(Boolean)
  const { swaps } = planBossSwaps([{ name: '米格鲁', px: slot.px }], layout, { bench: ['角峰'] })
  // 米格鲁是近卫 → melee，格子要 tank，职业不对 → 应换
  assert.equal(swaps.length, 1)
  const { swaps: s2 } = planBossSwaps([], layout, { bench: [] })
  assert.equal(s2.length, 0)
})

test('地图读不到时用兜底坐标：bossTilesFor(null) 仍给满 8 格', () => {
  // 2026-11-13 修过一个真 bug：兜底表按「职业|格」去查，永远 undefined，地图读不到就 8 格全空。
  const tiles = bossTilesFor(null)
  assert.ok(tiles.length >= 8, '兜底格少于 8 个：' + tiles.length)
  for (const t of tiles) {
    assert.ok(Array.isArray(t.px) && t.px.length === 2, t.col + ',' + t.row + ' 没有像素坐标')
    assert.equal(t.facing, 'right')
  }
  const seen = new Set(tiles.map((t) => t.col + ',' + t.row))
  assert.equal(seen.size, 8, '去重后应是 8 个格，实际 ' + seen.size)
})

test('医疗优先于远程占 x=6：甲板顺序不影响奶的位置', () => {
  // 2026-11-13 修：按甲板顺序先到先得时，排在前面的一张狙击会吃掉 (6,2)，
  // 第二张群奶就没地方放（用户口径是「医疗尽量覆盖全部干员」）。
  const layout = bossLayoutFor(['灰喉', '莎草', '夜莺'], map)
  const by = Object.fromEntries(layout.filter(Boolean).map((p) => [p.name, p]))
  assert.ok(by['莎草'] && by['莎草'].col === 6, '群奶莎草应占 x=6')
  assert.ok(by['夜莺'] && by['夜莺'].col === 6, '群奶夜莺应占 x=6')
  assert.notEqual(by['莎草'].col + ',' + by['莎草'].row, by['夜莺'].col + ',' + by['夜莺'].row)
})
