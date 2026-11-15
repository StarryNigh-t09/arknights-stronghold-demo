// 2026-11-12：deck.py 的返回 → 甲板 chip 列表。
// 用例来自真机痕迹 trace-2026-11-12T09-41-02/step-020.png（萨尔贡沙漠图，木台被压暗）：
//   木台锚点认到了战场上方那条栅栏（y 632..719），bench 一行都没有，
//   旧代码据此 return chips: [] → 「整备区站着 6 个人却报 0 张」，第 5、6 回合整回合没布阵。
import { pickChipsFromDeckJson } from '../lib/run.js'

let pass = 0, fail = 0
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')) } }

// 真机帧：rail.ok 但 bench 空；rows 有两行（甲板 5 张 @y783、战场 2 张 @y642）
const realFrame = {
  rows: [
    [[914, 783], [1063, 783], [1212, 783], [1361, 783], [1511, 783]].map(([x, y]) => ({ x, y, w: 37, h: 37 })),
    [[1198, 642], [1340, 642]].map(([x, y]) => ({ x, y, w: 37, h: 37 })),
  ],
  best: [[914, 783], [1063, 783], [1212, 783], [1361, 783], [1511, 783]].map(([x, y]) => ({ x, y })),
  rail: { ok: true, top: 632, bottom: 719, mean: 1211 },
  bench: [],
  railFallback: false,
}
const r1 = pickChipsFromDeckJson(realFrame, { minPressY: 840 })
ok('锚点认空时退回行规则，不再报 0 张', r1.chips.length === 5, 'got ' + r1.chips.length)
ok('选中更靠下的那行（甲板 y783，不是战场 y642）', r1.chips.length ? Math.round(r1.chips[0].y) > 800 : false, JSON.stringify(r1.chips[0]))
ok('按压点在木台上（y≈882）', r1.chips.length ? Math.abs(r1.chips[0].y - 882) <= 3 : false, JSON.stringify(r1.chips[0]))

// 锚点正常：bench 有真行 → 直接用 bench，别退回行规则
const benchFrame = {
  rows: [
    [[914, 783], [1063, 783], [1212, 783]].map(([x, y]) => ({ x, y })),
    [[1198, 642], [1340, 642]].map(([x, y]) => ({ x, y })),
  ],
  best: [],
  rail: { ok: true, top: 860, bottom: 977, mean: 1500 },
  bench: [[[914, 783], [1063, 783], [1212, 783]].map(([x, y]) => ({ x, y }))],
  railFallback: false,
}
const r2 = pickChipsFromDeckJson(benchFrame, { minPressY: 840 })
ok('锚点正常时用 bench', r2.chips.length === 3, 'got ' + r2.chips.length)
ok('bench 分支标记 railOk', r2.railOk === true)
ok('bench 分支不算低可信', r2.lowConfidence === false)

// 甲板真的空：rows 只有战场那行，按压点进不了木台带 → 0 张且 lowConfidence
const emptyFrame = { rows: [[[1198, 642], [1340, 642]].map(([x, y]) => ({ x, y }))], best: [], rail: { ok: false }, bench: [], railFallback: true }
const r3 = pickChipsFromDeckJson(emptyFrame, { minPressY: 840 })
ok('真空甲板读成 0 张', r3.chips.length === 0, 'got ' + r3.chips.length)
ok('真空甲板标低可信', r3.lowConfidence === true)

console.log('deck-pick: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)