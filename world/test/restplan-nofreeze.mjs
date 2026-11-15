import { planRestStep, BENCH_CAP } from '../lib/restplan.js'

const base = {
  level: 3, targetLevel: 3, upgradeCost: 2,
  bench: 3, equipCount: 0, refreshUsed: 0, freeRefresh: 0,
  round: 6, bought: [], canRefresh: true,
  units: [], equips: [],
}
let fail = 0
const check = (label, ctx, mustNotBe) => {
  const r = planRestStep({ ...base, ...ctx })
  const ok = r.action !== mustNotBe
  if (!ok) fail++
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + ' -> ' + r.action + ' | ' + r.reason)
}

// 1) 整排全烂（3 张 I 阶，没一张是想要的，钱 5），不许冻结
check('全烂 + 钱 5 + 能刷新', {
  money: 5,
  units: [{ name: '甲', tier: 'I', cost: 2 }, { name: '乙', tier: 'I', cost: 2 }, { name: '丙', tier: 'I', cost: 2 }],
}, 'freeze')

// 2) 整排全烂 + 钱 1（买不起任何一张），不许冻结
check('全烂 + 钱 1 + 能刷新', {
  money: 1,
  units: [{ name: '甲', tier: 'I', cost: 2 }, { name: '乙', tier: 'I', cost: 2 }],
}, 'freeze')

// 3) 全烂 + 钱 0，不许冻结（只能 stop）
check('全烂 + 钱 0', {
  money: 0,
  units: [{ name: '甲', tier: 'I', cost: 2 }],
}, 'freeze')

// 4) 全烂 + 刷新按钮灰了，不许冻结（只能 stop）
check('全烂 + 刷新按钮不可用', {
  money: 3, canRefresh: false,
  units: [{ name: '甲', tier: 'I', cost: 2 }],
}, 'freeze')

// 5) 反向：店里有想要的但买不起 → 必须冻结（m00211 原话）
check('想要但买不起 -> 应冻结', {
  money: 1,
  units: [{ name: '甲', tier: 'III', cost: 3, want: true }],
}, '__never__')

console.log(fail === 0 ? 'ALL PASS' : 'FAILED ' + fail)
process.exit(fail === 0 ? 0 : 1)
