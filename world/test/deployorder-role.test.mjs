/**
 * 站位分职业（用户 m03497 2026-11-14 新口径，替掉 m02614/m02616/m04641 的旧数据）：
 *   「斥罪是重装应该放在前面的你却放在了对面不会走的地方，灰喉是远程你却放在了前方。」
 *   重装 → 敌人通道的前排格 (7,1)（第二条通道 row4 的 (8,4)），最多 2 个；
 *   近卫/先锋 → 通道 col 6→3 依次（(6,1)(5,1)(4,1)(3,1)）+ row4 的 (7,4)(3,4)；
 *   狙击/术师/辅助 → 后排高台 (2,2)(2,3)(2,1)，再退 (5,2)(6,3)(6,2)；
 *   医疗 → (6,2)(5,2)(2,2)，离前排盾最近的那几格高台。
 * 参考 MAA 作业惯例：Deploy 动作带 location + direction，方向朝敌方来路；盾站阻挡格、远程退后排。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roleKeyOfClass, tilesForRole, tilesForClass, orderOf, MAX_TANK, roleOfGroup, describeOrder } from '../lib/deployorder.js'
import { planTilesForNames, loadGameMap } from '../lib/gamemap.js'

const map = loadGameMap()

test('职业名 → 序列键', () => {
  assert.equal(roleKeyOfClass('重装'), 'tank')
  assert.equal(roleKeyOfClass('近卫'), 'melee')
  assert.equal(roleKeyOfClass('狙击'), 'ranged')
  assert.equal(roleKeyOfClass('医疗'), 'healer')
  assert.equal(roleKeyOfClass('先锋'), 'melee')
  assert.equal(roleKeyOfClass(''), null)
  assert.equal(roleKeyOfClass('查无此职业'), null)
  // 老接口还在（按 roleGroup 的粗分组）
  assert.equal(roleOfGroup(2), 'melee')
})

test('地图给了重装格（允许和近战序列共用通道格，重装优先占）', () => {
  const o = orderOf(map)
  assert.equal(o.tank.length >= 2, true)
  // 2026-11-13 07:5x（m04641）：重装要站敌人必经的通道格，通道就那几个，跟近战共用是故意的；
  // 「互不重叠」是旧口径（重装被赶到敌人不走的右上角），已废弃。
  assert.match(describeOrder(map), /重装/)
})

test('重装首选格 = 通道最前排（敌人从右侧红门进来）', () => {
  const o = orderOf(map)
  assert.deepEqual([o.tank[0].col, o.tank[0].row], [7, 1], '重装首选应是通道最前排 (7,1)')
  assert.ok(o.tank[0].col > o.melee[0].col, '重装首选格应比近战首选格靠右（更靠前排）')
  assert.equal(o.tank.length, 2, '重装只给 2 个前排格（用户 m02614：重装 1~2 个够）')
})

test('按人排位：重装站通道右段、狙击上高台不顶前排', () => {
  const plan = planTilesForNames(['角峰', '灰喉'], map)
  assert.equal(plan.length, 2)
  const tank = plan.find((p) => p.name === '角峰')
  const sniper = plan.find((p) => p.name === '灰喉')
  assert.ok(tank && sniper)
  assert.ok(tank.col >= 5 && tank.row === 1, '重装角峰应落在右半通道（col≥5,row1），实际 ' + tank.col + ',' + tank.row)
  // m03497：「灰喉是远程你却放在了前方」→ 远程退后排高台（列号小 = 靠后），不跟坦克抢前排
  assert.equal(sniper.row, 2, '狙击应站在 row2 高台，实际 ' + sniper.col + ',' + sniper.row)
  assert.ok(sniper.col <= 5, '狙击应站在后排高台，实际 ' + sniper.col + ',' + sniper.row)
  assert.ok(sniper.col < tank.col, '狙击应比重装靠后，实际 狙击 col' + sniper.col + ' vs 重装 col' + tank.col)
})

test('重装超过 MAX_TANK 个 → 其余按近战序列放', () => {
  const tanks = ['角峰', '泡泡', '塞雷娅']
  assert.equal(MAX_TANK, 2)
  const plan = planTilesForNames(tanks, map)
  assert.equal(plan.length, 3)
  // 前排格只有 (7,1)(8,4) 两个：前两个重装占掉，第三个退到近战序列（通道 col≤6）
  const front = plan.filter((p) => (p.col === 7 && p.row === 1) || (p.col === 8 && p.row === 4))
  assert.equal(front.length, MAX_TANK, '站前排的重装最多 ' + MAX_TANK + ' 个，实际 ' + front.length)
  const third = plan.find((p) => !front.includes(p))
  assert.ok(third && third.col <= 6, '第三个重装应退到近战序列（col≤6），实际 ' + (third && third.col))
})

test('没有重装格的老图退回近战序列', () => {
  const fakeMap = { cells: [{ col: 1, row: 1, deploy: true, px: [100, 100] }], deployOrder: { melee: [[1, 1]] } }
  const seq = tilesForClass(fakeMap, '重装')
  assert.ok(Array.isArray(seq))
  assert.equal(seq.length, 1)
})
