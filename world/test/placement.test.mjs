import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotate, coveredCells, scoreAt, bestPlacement, pathSetOf, pxToGrid, gridToPx, planDeploy, orderUnits, deployRankOf, allyWeightOf, TILE_STEP, GRID } from '../lib/placement.js'

test('rotate: 四个方向', () => {
  assert.deepEqual(rotate(1, 0, 'right'), [1, 0])
  assert.deepEqual(rotate(1, 0, 'down'), [0, 1])
  assert.deepEqual(rotate(1, 0, 'left'), [-1, 0])
  assert.deepEqual(rotate(1, 0, 'up'), [0, -1])
})

test('coveredCells: 含自身格', () => {
  const s = coveredCells(5, 5, [[1, 0]], 'right')
  assert.ok(s.has('5,5'))
  assert.ok(s.has('6,5'))
  assert.equal(s.size, 2)
})

test('coveredCells: 朝左时正前方是 gx-1', () => {
  const s = coveredCells(5, 5, [[1, 0]], 'left')
  assert.ok(s.has('4,5'))
})

test('scoreAt: 罩住路线的比罩不住的高', () => {
  const path = pathSetOf({ path: [{ gx: 6, gy: 5 }] })
  const on = scoreAt({ tile: { gx: 5, gy: 5, kind: 'ground' }, cls: '狙击', range: [[1, 0]], dir: 'right', pathSet: path })
  const off = scoreAt({ tile: { gx: 5, gy: 5, kind: 'ground' }, cls: '狙击', range: [[1, 0]], dir: 'left', pathSet: path })
  assert.ok(on > off)
})

test('scoreAt: 医疗罩住友军加分', () => {
  const path = pathSetOf({ path: [] })
  const base0 = scoreAt({ tile: { gx: 0, gy: 0, kind: 'high' }, cls: '医疗', range: [[1, 0]], dir: 'right', pathSet: path })
  const withAlly = scoreAt({ tile: { gx: 0, gy: 0, kind: 'high' }, cls: '医疗', range: [[1, 0]], dir: 'right', pathSet: path, allies: [{ gx: 1, gy: 0 }] })
  assert.ok(withAlly > base0)
})

test('scoreAt: blocked 格返回 -Infinity', () => {
  const s = scoreAt({ tile: { gx: 0, gy: 0, kind: 'blocked' }, cls: '近卫', range: [[1, 0]], dir: 'right', pathSet: new Set() })
  assert.equal(s, -Infinity)
})

test('bestPlacement: 挑到能罩住路线的那格和朝向', () => {
  const map = { cols: 5, rows: 3, path: [{ gx: 3, gy: 1 }], redDoor: { gx: 4, gy: 1 } }
  const tiles = [
    { gx: 0, gy: 0, kind: 'ground' },
    { gx: 2, gy: 1, kind: 'ground' },
  ]
  const r = bestPlacement({ tiles, cls: '近卫', range: [[1, 0]], pathSet: pathSetOf(map), map })
  assert.equal(r.tile.gx, 2)
  assert.equal(r.dir, 'right')
})

test('bestPlacement: 空候选返回 null', () => {
  assert.equal(bestPlacement({ tiles: [], cls: '近卫', range: [[1, 0]], pathSet: new Set() }), null)
})
test('pxToGrid / gridToPx：互为逆运算', () => {
  assert.deepEqual(pxToGrid([GRID.x0, GRID.y0]), { gx: 0, gy: 0 })
  assert.deepEqual(pxToGrid([GRID.x0 + 3 * GRID.stepX, GRID.y0 + 2 * GRID.stepY]), { gx: 3, gy: 2 })
  assert.deepEqual(gridToPx(3, 2), [GRID.x0 + 3 * GRID.stepX, GRID.y0 + 2 * GRID.stepY])
})

test('planDeploy：狙击挑能罩住路线的格子，别人不抢同一格', () => {
  const tiles = [[GRID.x0, GRID.y0], [GRID.x0 + GRID.stepX, GRID.y0], [GRID.x0 + 2 * GRID.stepX, GRID.y0]]
  const map = { path: [{ gx: 2, gy: 0 }, { gx: 3, gy: 0 }] }
  const plan = planDeploy({ units: [{ name: '灰喉', cls: '狙击', range: [[1, 0], [2, 0]] }, { name: '卡达', cls: '术师', range: [[1, 0]] }], tiles, map })
  assert.equal(plan.length, 2)
  assert.notDeepEqual(plan[0].tile, plan[1].tile)
  // 狙击要罩住 (2,0)(3,0) 只能站 (1,0) 朝右
  assert.deepEqual(plan[0].grid, { gx: 1, gy: 0 })
  assert.equal(plan[0].facing, 'right')
})

test('planDeploy：closed 里的格子不会被选', () => {
  const tiles = [[GRID.x0, GRID.y0], [GRID.x0 + GRID.stepX, GRID.y0]]
  const plan = planDeploy({ units: [{ name: 'x', cls: '近卫', range: [[0, 0]] }], tiles, closed: [GRID.x0 + ',' + GRID.y0] })
  assert.deepEqual(plan[0].tile, [GRID.x0 + GRID.stepX, GRID.y0])
})

test('planDeploy：空输入返回空数组', () => {
  assert.deepEqual(planDeploy({}), [])
})
test('deployRankOf：脆皮先上、重装最后', () => {
  assert.ok(deployRankOf('医疗') < deployRankOf('狙击'))
  assert.ok(deployRankOf('狙击') < deployRankOf('近卫'))
  assert.ok(deployRankOf('近卫') < deployRankOf('重装'))
  assert.equal(deployRankOf('不存在的职业'), 5)
})

test('orderUnits：重装排到最后、医疗排最前，且不改原数组', () => {
  const input = [
    { name: '折桅', cls: '重装' },
    { name: '灰喉', cls: '狙击' },
    { name: '白面鸮', cls: '医疗' },
  ]
  const out = orderUnits(input)
  assert.deepEqual(out.map((u) => u.name), ['白面鸮', '灰喉', '折桅'])
  assert.deepEqual(input.map((u) => u.name), ['折桅', '灰喉', '白面鸮'])
})

test('allyWeightOf：重装比普通职业更值钱', () => {
  assert.equal(allyWeightOf('重装'), 2.0)
  assert.equal(allyWeightOf('近卫'), 1.3)
  assert.equal(allyWeightOf('狙击'), 1.0)
  assert.equal(allyWeightOf(''), 1.0)
})

test('scoreAt：医疗罩住重装 ≥ 罩住狙击（同格数）', () => {
  const base = { cls: '医疗', range: [[0, 0], [1, 0]], dir: 'right', pathSet: new Set(), map: {} }
  const tile = { gx: 5, gy: 5, kind: 'ground' }
  const onTank = scoreAt({ ...base, tile, allies: [{ gx: 5, gy: 5, cls: '重装' }] })
  const onSniper = scoreAt({ ...base, tile, allies: [{ gx: 5, gy: 5, cls: '狙击' }] })
  assert.ok(onTank > onSniper)
})

test('planDeploy：第二个人能吃到第一个人的友军加成', () => {
  const tiles = [[GRID.x0, GRID.y0], [GRID.x0 + GRID.stepX, GRID.y0], [GRID.x0 + 2 * GRID.stepX, GRID.y0]]
  const plan = planDeploy({
    units: [{ name: '折桅', cls: '重装', range: [[0, 0]] }, { name: '白面鸮', cls: '医疗', range: [[0, 0], [1, 0]] }],
    tiles,
  })
  assert.equal(plan.length, 2)
  // 医疗应当挑能罩住重装的那格
  const tankG = plan[0].grid
  const medic = plan[1].grid
  const dist = Math.abs(tankG.gx - medic.gx) + Math.abs(tankG.gy - medic.gy)
  assert.ok(dist <= 1, '医疗应贴着重装，实测距离 ' + dist)
})

test('planDeploy：结果与入参逐项对齐，不重排（重排只影响拖的顺序）', () => {
  const tiles = [[GRID.x0, GRID.y0], [GRID.x0 + GRID.stepX, GRID.y0], [GRID.x0 + 2 * GRID.stepX, GRID.y0]]
  const plan = planDeploy({
    units: [{ name: '折桅', cls: '重装', range: [[0, 0]] }, { name: '灰喉', cls: '狙击', range: [[1, 0]] }],
    tiles,
  })
  assert.equal(plan[0].name, '折桅')
  assert.equal(plan[1].name, '灰喉')
  assert.equal(plan[0].deployRank, deployRankOf('重装'))
})
