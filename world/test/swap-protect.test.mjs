// 2026-11-15 03:4x：用户 m08866「凑出 3 个盟约并叠层」→ 场上已激活的盟约不许被换人拆掉。
// 真机 trace 19-10-23 第 8~9 回合：聚合 2/2✓ 刚激活，下一回合就被「低阶优先」换掉，永远只有一个亮着。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickSwap } from '../lib/covenantplan.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const fails = []
const ok = (c, m) => { if (!c) fails.push(m) }

const map = JSON.parse(readFileSync(join(ROOT, 'data', 'covenants-map.json'), 'utf8'))
const members = map.members || map
const aggOps = ((members['聚合'] && members['聚合'].operators) || []).slice(0, 2)
ok(aggOps.length === 2, '夹具要有两个【聚合】成员（拿不到就说明 covenants-map 结构变了）')

// 场上两只都是聚合成员 → 按场上算 2/2 已激活。拿一只非成员去换，必须拒绝。
const r1 = pickSwap({ board: aggOps.map((name) => ({ name })), bench: [{ name: '霍尔海雅' }], covenants: [], round: 3, slotsLeft: 0, map })
ok(r1 && r1.drop === null, '会拆掉已激活盟约的换人要被拒绝（got ' + JSON.stringify(r1 && r1.reason) + '）')
ok(r1 && /掉激活的盟约/.test(String(r1.reason)), '理由里要点名「这一下去会掉激活的盟约」')

// 只剩 1 只聚合成员时没有「已激活」可保护 → 不该被这条拦住（允许它按正常分数判断）
const r2 = pickSwap({ board: [aggOps[0], '霍尔海雅'].map((name) => ({ name })), bench: [{ name: '青枳' }], covenants: [], round: 3, slotsLeft: 0, map })
ok(!!r2, '单成员场景仍要给出结论')

const SRC = readFileSync(join(ROOT, 'lib', 'covenantplan.js'), 'utf8')
ok(SRC.includes('const protectActive'), '源码要有 protectActive')
ok(SRC.includes('const boardCounts'), '激活只按场上算（整备区不算）')
ok(SRC.includes('const protectedDrop'), '要有 protectedDrop 闸门')

if (fails.length) { fails.forEach((f) => console.log('FAIL ' + f)); process.exit(1) }
console.log('swap-protect 6/6 pass')
