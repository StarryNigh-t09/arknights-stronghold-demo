import test from 'node:test'
import assert from 'node:assert/strict'
import { swapPlan, zoneOf, describeSwapPlan } from '../lib/swapplan.js'

// 地图按 wz-01 的口径缩小一份：重装在右（高 col），近战在中，远程在高台。
const MAP = {
  deployOrder: {
    melee: [[845, 348], [964, 350], [1081, 351]],
    ranged: [[1086, 447], [1207, 448]],
    tank: [[1311, 354], [1196, 353]],
    healer: [[1207, 448]],
  },
  cells: [],
}

const roleOf = (name) => ({ 角峰: 'tank', 泡泡: 'tank', 拉普兰德: 'melee', 灰喉: 'ranged', 莎草: 'healer' }[name] || 'melee')

test('站位都对 → 不用换', () => {
  const slots = [
    { name: '角峰', px: [1311, 354] },
    { name: '拉普兰德', px: [845, 348] },
    { name: '灰喉', px: [1086, 447] },
  ]
  assert.deepEqual(swapPlan(slots, MAP, { roleOf }), [])
})

test('重装站到近战格、自己的格空着 → 挪过去', () => {
  const slots = [
    { name: '角峰', px: [845, 348] },
    { name: '拉普兰德', px: [964, 350] },
  ]
  const p = swapPlan(slots, MAP, { roleOf })
  assert.equal(p.length, 1)
  assert.equal(p[0].kind, 'move')
  assert.equal(p[0].name, '角峰')
  assert.deepEqual(p[0].to, [1311, 354])
})

test('重装和近战站反了 → 互换', () => {
  const slots = [
    { name: '角峰', px: [845, 348] },      // 重装站在近战格
    { name: '拉普兰德', px: [1311, 354] }, // 近战站在重装格
  ]
  const p = swapPlan(slots, MAP, { roleOf })
  assert.equal(p.length, 1)
  assert.equal(p[0].kind, 'swap')
  assert.equal(p[0].name, '角峰')
  assert.equal(p[0].withName, '拉普兰德')
})

test('远程挤到近战格、近战已经站对 → 不硬换', () => {
  const slots = [
    { name: '灰喉', px: [845, 348] },
    { name: '拉普兰德', px: [964, 350] },   // 近战在近战格，是对的
    { name: '泡泡', px: [1311, 354] },      // 重装在自己格
  ]
  const p = swapPlan(slots, MAP, { roleOf })
  // 灰喉的目标格 1086,447 / 1207,448 都空着 → 只该有一步 move
  assert.equal(p.length, 1)
  assert.equal(p[0].kind, 'move')
  assert.equal(p[0].name, '灰喉')
})

test('只有一个人 → 不算', () => {
  assert.deepEqual(swapPlan([{ name: '角峰', px: [845, 348] }], MAP, { roleOf }), [])
})

test('max=1 只给一条计划', () => {
  const slots = [
    { name: '角峰', px: [845, 348] },
    { name: '灰喉', px: [964, 350] },
    { name: '泡泡', px: [1081, 351] },
  ]
  assert.equal(swapPlan(slots, MAP, { roleOf, max: 1 }).length, 1)
})

test('zoneOf 拿地图给的格；医疗没给就按远程', () => {
  assert.deepEqual(zoneOf(MAP, 'tank'), [[1311, 354], [1196, 353]])
  assert.deepEqual(zoneOf({ deployOrder: { ranged: [[1, 2]] } }, 'healer'), [[1, 2]])
})

test('日志摘要', () => {
  assert.match(describeSwapPlan([]), /不用换/)
  assert.match(describeSwapPlan([{ kind: 'swap', name: 'A', from: [1, 2], to: [3, 4], withName: 'B' }]), /A\(1,2\).*B\(3,4\)/)
})
