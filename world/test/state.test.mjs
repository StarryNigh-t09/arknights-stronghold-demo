import assert from 'node:assert/strict'
import { emptyRoster, addUnit, updateUnit, listUnits, removeUnit, sellCandidate } from '../lib/roster.js'
import { emptyBoard, place, remove, cellOf, idAt, freeCells } from '../lib/board.js'

// roster：编号递增、不重号
const r = emptyRoster()
const a = addUnit(r, { name: '褐果', tier: 1 })
const b = addUnit(r, { name: '褐果', tier: 1 })
assert.equal(a.id, 'op-1')
assert.equal(b.id, 'op-2')
assert.equal(listUnits(r).length, 2)
assert.equal(updateUnit(r, 'op-1', { level: 2 }).level, 2)
assert.equal(removeUnit(r, 'op-2'), true)
assert.equal(listUnits(r).length, 1)

// 卖卡：阶最低且没装备的优先
const r2 = emptyRoster()
addUnit(r2, { name: 'A', tier: 2 })
addUnit(r2, { name: 'B', tier: 1 })
const withEq = addUnit(r2, { name: 'C', tier: 1, equip: ['头盔'] })
assert.equal(sellCandidate(r2).name, 'B')          // 1 阶、无装备
assert.equal(sellCandidate(r2, { keep: ['op-2'] }).name, 'C') // B 被保，C 是 1 阶
assert.equal(sellCandidate(r2, { maxTier: 1, keep: ['op-2', 'op-3'] }), null)
assert.equal(sellCandidate(r2, { maxTier: 0 }), null)
assert.ok(withEq)

// board：一格一人、编号唯一
const bd = emptyBoard()
place(bd, 'op-1', [0, 0])
place(bd, 'op-2', [1, 0])
assert.equal(idAt(bd, 0, 0), 'op-1')
assert.deepEqual(cellOf(bd, 'op-2'), [1, 0])
// 同一编号换格：旧格要释放
place(bd, 'op-1', [2, 0])
assert.equal(idAt(bd, 0, 0), null)
assert.deepEqual(cellOf(bd, 'op-1'), [2, 0])
// 同一格换人：旧编号被踢
place(bd, 'op-3', [2, 0])
assert.equal(idAt(bd, 2, 0), 'op-3')
assert.equal(cellOf(bd, 'op-1'), null)
assert.equal(remove(bd, 'op-3'), '2,0')
assert.deepEqual(freeCells(bd, [[2, 0], [3, 0]]), [[2, 0], [3, 0]])

console.log('state.test.mjs: 全部通过')
