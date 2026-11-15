import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 2026-11-13 18:5x：这个用例以前直接写 world/data/deck-layout.json，把 __test-map 之类
// 塞进了生产缓存（实测混进 3 个键）。改成先指到临时文件，再动态 import 模块。
const TMP_CACHE = join(tmpdir(), 'coop-decklayout-test-' + process.pid + '.json')
process.env.COOP_DECK_LAYOUT = TMP_CACHE
const { pitchOf, planDeckChips, rememberDeck, deckStateKey } = await import('../lib/decklayout.js')

test('格距：等距取中位数，脏数据退回 148', () => {
  assert.equal(pitchOf([1264, 1413, 1562]), 149)
  assert.equal(pitchOf([100]), 148)
  assert.equal(pitchOf([10, 1000]), 148)
})

test('商店开合是两套不同的键', () => {
  assert.equal(deckStateKey(true), 'expanded')
  assert.equal(deckStateKey(false), 'collapsed')
  assert.equal(deckStateKey(undefined), 'collapsed')
})

test('记住一次扫描后能按张数算回同样的点', () => {
  const chips = [{ x: 1264, y: 675 }, { x: 1413, y: 675 }, { x: 1562, y: 675 }]
  rememberDeck('__test-map', false, chips)
  const got = planDeckChips('__test-map', false, 3)
  assert.ok(got && got.length === 3)
  assert.deepEqual(got.map((c) => c.x), [1264, 1413, 1562])
  assert.equal(got[0].y, 675)
  assert.equal(got[0].guess, true)
})

test('张数没记录过时按格距往左推（右对齐）', () => {
  rememberDeck('__test-map2', false, [{ x: 1264, y: 675 }, { x: 1413, y: 675 }, { x: 1562, y: 675 }])
  const got = planDeckChips('__test-map2', false, 5)
  assert.ok(got && got.length === 5)
  assert.equal(got[got.length - 1].x, 1562)
  assert.equal(got[got.length - 2].x, 1562 - 149)
  assert.equal(got[0].y, 675)
})

test('没有缓存就返回 null（调用方去真扫）', () => {
  assert.equal(planDeckChips('__no-such-map', false, 3), null)
  assert.equal(planDeckChips(null, false, 3), null)
})

test('两排混在一起时只记张数最多的那一排', () => {
  const chips = [
    { x: 369, y: 640 }, { x: 518, y: 642 },
    { x: 1264, y: 883 }, { x: 1413, y: 883 }, { x: 1562, y: 883 },
  ]
  rememberDeck('__test-map3', false, chips)
  const got = planDeckChips('__test-map3', false, 3)
  assert.deepEqual(got.map((c) => c.x), [1264, 1413, 1562])
  assert.equal(got[0].y, 883)
})
