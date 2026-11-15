import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceTargets } from '../lib/placement.js'

// 2026-11-12 用户 m02251 第 3 条：换人＝把新干员拖到原干员所在格，落位照样滑方向。
// 这里只测「已占格怎么变成候选格」这段纯逻辑（真机验证要用户放行后才做）。

test('replaceTargets：已占格按前排（y 小）先、再按 x 排', () => {
  const s = new Set(['1196,353', '830,340', '1342,552'])
  assert.deepEqual(replaceTargets(s), [[830, 340], [1196, 353], [1342, 552]])
})

test('replaceTargets：limit 生效（一回合只换 1~2 个，别整场推平）', () => {
  const s = new Set(['1,5', '2,5', '3,5', '4,5'])
  assert.equal(replaceTargets(s, { limit: 2 }).length, 2)
})

test('replaceTargets：空集合/坏键不抛错', () => {
  assert.deepEqual(replaceTargets(new Set()), [])
  assert.deepEqual(replaceTargets(null), [])
  assert.deepEqual(replaceTargets(new Set(['坏键'])), [])
})

test('replaceTargets：px 原样返回（不换算格心，placeFast 用像素）', () => {
  assert.deepEqual(replaceTargets(new Set(['964,350'])), [[964, 350]])
})
