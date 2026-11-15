// snapshot 的纯逻辑测试（2026-11-15 09:1x）
// 只测两件不碰 adb 的事：一行日志怎么压、动作回读怎么判「这格有人」。
// 真实截图那条链由真机跑（不在这里造假帧：假帧过了也不代表真机能读对）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSnapshot, boardHasUnitNear } from '../lib/snapshot.js'

test('formatSnapshot：字段齐时压成一行，能一眼读出局面', () => {
  const line = formatSnapshot({
    round: 7, screen: { state: 'wz_rest' }, hp: 21, money: 9, slots: 1, level: 4,
    board: [{ px: [715, 444] }, { px: [1086, 447] }],
    bench: [{ name: '灰喉' }, { name: null }],
    covenants: { names: ['精准'], bar: [{ name: '精准', stacks: 16 }, { name: '坚守', stacks: null }] },
    issues: [],
  })
  assert.match(line, /^R7｜wz_rest/)
  assert.match(line, /HP 21/)
  assert.match(line, /钱 9/)
  assert.match(line, /名额 1/)
  assert.match(line, /Lv4/)
  assert.match(line, /占格 2/)
  assert.match(line, /整备区 2 张/)
  assert.match(line, /盟约 精准16 坚守\?/)
  assert.doesNotMatch(line, /没读到/)
})

test('formatSnapshot：读不到的写 ?，绝不编数字', () => {
  const line = formatSnapshot({ round: null, screen: null, hp: null, money: null, slots: null, level: null, board: null, bench: null, covenants: null, issues: ['状态头：超时'] })
  assert.match(line, /^R\?/)
  assert.match(line, /HP \?/)
  assert.match(line, /整备区 \? 张/)
  assert.match(line, /没读到：状态头：超时/)
})

test('formatSnapshot：null 快照也不炸', () => {
  assert.equal(formatSnapshot(null), '快照：没有')
})

test('boardHasUnitNear：45px 内算有，超了算没有（撤回/部署回读的地基）', () => {
  const board = [{ px: [715, 444] }, { px: [1086, 447] }]
  assert.equal(boardHasUnitNear(board, [720, 450]), true)
  assert.equal(boardHasUnitNear(board, [715, 444], 5), true)
  assert.equal(boardHasUnitNear(board, [760, 500]), false)
  assert.equal(boardHasUnitNear(board, [715, 444], 0), true)
  assert.equal(boardHasUnitNear(null, [1, 2]), false)
  assert.equal(boardHasUnitNear([{ x: 715, y: 444 }], [715, 444]), true)
})

test('drive.js 每回合打一行快照（源码锁：别哪天被顺手删掉）', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8')
  assert.ok(src.includes("'  快照：' + formatSnapshot({"), '每回合快照那行被删了')
  assert.ok(src.includes("await import('./snapshot.js')"), '快照模块改成静态 import 会和 drive 循环依赖')
  assert.ok(src.includes('if (i === 0) {'), '快照要每回合只打一次')
})
