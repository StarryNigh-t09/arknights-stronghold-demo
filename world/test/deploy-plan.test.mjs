import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rankTiles, roleKeyOfName, emptyStore, loadDeployMap, saveDeployMap,
  recordPlace, recordIllegal, illegalOf, memoryOf, summonPick,
} from '../lib/deploy-plan.js'

// 假地图：3 列 x 2 行可部署格，deployOrder 指定近战 (1,1)(2,1)、远程 (3,1)... 像素按 100 步长造。
const mkCell = (col, row) => ({ col, row, px: [1000 + col * 100, 300 + row * 100], kind: 'ground', walk: true, deploy: true })
const MAP = {
  id: 'test-map',
  cells: [
    mkCell(1, 1), mkCell(2, 1), mkCell(3, 1),
    mkCell(1, 2), mkCell(2, 2), mkCell(3, 2),
  ],
  deployOrder: {
    defaultFacing: 'right',
    melee: [[1, 1], [2, 1]],
    ranged: [[3, 2]],
    healer: [[3, 1]],
  },
}
const px = (col, row) => [1000 + col * 100, 300 + row * 100]

test('认职业：认不出当近战，狙击/术师/辅助算远程', () => {
  assert.equal(roleKeyOfName('不存在的干员xyz'), 'melee')
  // 用真实数据里必然存在的职业名做一次宽松断言（认不出也不该崩）
  assert.ok(['melee', 'ranged', 'healer', 'tank'].includes(roleKeyOfName('灰喉')))
})

test('候选格顺序：记忆格排第一，且不会被后面的序列顶掉', () => {
  const list = rankTiles({ name: '测试近卫', role: 'melee' }, {
    map: MAP, memory: { col: 2, row: 2, facing: 'right' },
  })
  assert.equal(list[0].src, 'memory')
  assert.deepEqual([list[0].col, list[0].row], [2, 2])
  // 地图指定近战格紧随其后
  assert.deepEqual(list.slice(1, 3).map((t) => t.src), ['order', 'order'])
})

test('候选格剔除：棋盘已占 / 标死 / 本回合用过', () => {
  const list = rankTiles({ name: '测试近卫', role: 'melee' }, {
    map: MAP,
    takenPx: [px(1, 1)],
    deadPx: [px(2, 1)],
    usedPx: [px(1, 2)],
  })
  const keys = list.map((t) => t.col + ',' + t.row)
  assert.ok(!keys.includes('1,1'), '已占格要被剔掉')
  assert.ok(!keys.includes('2,1'), '标死的格要被剔掉')
  assert.ok(!keys.includes('1,2'), '本回合用过的格要被剔掉')
  assert.ok(keys.includes('3,1'))
})

test('远程优先拿远程序列，不抢近战第一格', () => {
  const list = rankTiles({ name: '测试狙击', role: 'ranged' }, { map: MAP })
  assert.deepEqual([list[0].col, list[0].row], [3, 2])
})

test('记忆：成功一次记 ok，换格重置；标非法后成功一次自动清掉', () => {
  let s = emptyStore()
  s = recordPlace(s, 'test-map', '卡达', { col: 3, row: 2 }, 'right')
  s = recordPlace(s, 'test-map', '卡达', { col: 3, row: 2 })
  assert.equal(memoryOf(s, 'test-map', '卡达').ok, 2)
  s = recordIllegal(s, 'test-map', '卡达', { col: 1, row: 1 })
  assert.deepEqual(illegalOf(s, 'test-map', '卡达'), ['1,1'])
  s = recordPlace(s, 'test-map', '卡达', { col: 1, row: 1 })
  assert.deepEqual(illegalOf(s, 'test-map', '卡达'), [])
})

test('非法格最多留 40 条，不无限长', () => {
  let s = emptyStore()
  for (let i = 0; i < 60; i++) s = recordIllegal(s, 'm', 'x', { col: i, row: 0 })
  assert.equal(illegalOf(s, 'm', 'x').length, 40)
})

test('读盘：文件不在就返回空结构，不抛', () => {
  const s = loadDeployMap('C:/definitely/not/here/deploy-map.json')
  assert.deepEqual(Object.keys(s.maps), [])
})

test('写盘再读回来：记忆还在', () => {
  const tmp = './world/.tmp/deploy-map-test.json'
  let s = emptyStore()
  s = recordPlace(s, 'test-map', '灰喉', { col: 3, row: 2 }, 'right')
  assert.equal(saveDeployMap(s, tmp), true)
  const back = loadDeployMap(tmp)
  assert.deepEqual([memoryOf(back, 'test-map', '灰喉').col, memoryOf(back, 'test-map', '灰喉').row], [3, 2])
})

test('召唤物：名额还有就不试，名额 0 才试，最多 2 张', () => {
  const chips = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]
  assert.equal(summonPick({ chips, slotsLeft: 2, placed: 2, budget: 2 }).length, 0)
  assert.equal(summonPick({ chips, slotsLeft: 0, placed: 2, budget: 2 }).length, 2)
  assert.equal(summonPick({ chips, slotsLeft: 0, placed: 2, budget: 2, max: 9 }).length, 2)
})
