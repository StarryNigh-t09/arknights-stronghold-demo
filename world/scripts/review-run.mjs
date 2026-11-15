// review-run.mjs —— 每局自动复盘（2026-11-15 08:3x，用户 m10875/m10989 批准的第 2 项）
//
// 为什么要它：一局打完只往 data/runs.jsonl 写一行，哪回合掉血、哪回合空着名额没上人、
// 多少钱花在刷新上、哪几家拖了 6 次还没拎起来，全靠人去翻 steps.jsonl。真人死一局就学会了，
// 这套机器人不会。所以每局结束先让「错误」变成一份能读的报告，再谈改参数。
//
// 用法：
//   node scripts/review-run.mjs                 # 复盘最近的 trace-night-*
//   node scripts/review-run.mjs <traceDir>     # 指定 trace 目录
//   node scripts/review-run.mjs <traceDir> --print   # 只打摘要不写文件
//
// 数据来源（都只读）：
//   <trace>/steps.jsonl  —— 每行 {n, at, action}，动作日志真源
//   world/_perf.log      —— 每回合休整期耗时（UTC 时间戳，本地 +8）
//
// 不做的事：不猜 HP（steps 里没有逐回合 HP），不改任何游戏状态。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const WORLD = join(HERE, '..')
const ROOT = join(WORLD, '..')

const REST_TARGET_S = 70 // 用户定的目标：休整期 70s 内

function argOf(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

function latestTrace() {
  const cands = readdirSync(ROOT)
    .filter((d) => d.startsWith('trace-night-'))
    .map((d) => ({ d, st: statSync(join(ROOT, d)).mtimeMs }))
    .sort((a, b) => b.st - a.st)
  return cands.length ? join(ROOT, cands[0].d) : null
}

// steps.jsonl 里出现过的「回合」只有两种标记：
//   开战前（第N回合，布置完，按准备就绪前）
//   第N回合打完：wz_rest
// 其余买卡/布阵日志都落在标记之前，所以按标记切段、段归到后一个标记的回合。
function parseRounds(acts) {
  const rounds = []
  let cur = { round: null, deploy: null, buys: [], swaps: [], fails: [], panels: 0, misses: 0, doubted: 0, bar: null, goal: false, lines: [] }
  const push = () => {
    if (cur.round != null && (cur.deploy || cur.buys.length || cur.swaps.length || cur.lines.length)) rounds.push(cur)
    cur = { round: null, deploy: null, buys: [], swaps: [], fails: [], panels: 0, misses: 0, doubted: 0, bar: null, goal: false, lines: [] }
  }
  for (const a of acts) {
    const s = String(a || '').trim()
    let m
    if ((m = s.match(/^开战前（第(\d+)回合/)) || (m = s.match(/^第(\d+)回合打完/))) {
      // 标记落在动作之后：先把这一段按「标记的回合号」收下
      cur.round = Number(m[1])
      push()
      continue
    }
    if ((m = s.match(/^布阵：上场 (\d+) 个，整备区剩 (\d+|\?)/))) {
      const left = s.match(/整备区剩 (\d+) 张/) ? Number(s.match(/整备区剩 (\d+) 张/)[1]) : null
      const slots = s.match(/剩余名额 (\d+|\?)/) ? s.match(/剩余名额 (\d+|\?)/)[1] : '?'
      cur.deploy = { up: Number(m[1]), benchLeft: left, slots }
      continue
    }
    if ((m = s.match(/^买卡 → (buy|upgrade|refresh|stop|freeze|sell)[：:]/))) {
      cur.buys.push({ verb: m[1], text: s.slice(0, 160) })
      continue
    }
    if (/^撤回 /.test(s)) {
      cur.swaps.push({ ok: !/没成/.test(s), text: s.slice(0, 140) })
      if (/没成/.test(s)) cur.fails.push(s.slice(0, 120))
      continue
    }
    if (/拎不起来|拖不上去的格|连续 \d+ 格/.test(s)) cur.misses++
    if (/数字不可信|不可信/.test(s)) cur.doubted++
    if (/面板挡着/.test(s)) cur.panels++
    if ((m = s.match(/^顶栏盟约（实测/))) cur.bar = s.slice(0, 160)
    if (/★ 验收项达到/.test(s)) cur.goal = true
    if (cur.round != null || cur.deploy) cur.lines.push(s)
  }
  push()
  return rounds.filter((r) => r.deploy || r.buys.length)
}

// REST 用时来自 _perf.log（首尾时间窗内），格式：
//   2026-11-14T23:33:38.625Z REST round 6 用时 216.2s（Lv3，上场 2）
function parseRest(traceDir, firstAt, lastAt) {
  const p = join(WORLD, '_perf.log')
  const out = new Map()
  if (!existsSync(p)) return out
  const from = Date.parse(firstAt) - 60_000
  const to = Date.parse(lastAt) + 60_000
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^(\S+) REST round (\d+) 用时 ([\d.]+)s（Lv(\d+)，上场 (\d+)）/)
    if (!m) continue
    const t = Date.parse(m[1])
    if (!(t >= from && t <= to)) continue
    out.set(Number(m[2]), { sec: Number(m[3]), level: Number(m[4]), up: Number(m[5]) })
  }
  return out
}

const traceArg = argOf('--trace') || process.argv[2]
const traceDir = traceArg && !traceArg.startsWith('--') ? traceArg : latestTrace()
if (!traceDir || !existsSync(join(traceDir, 'steps.jsonl'))) {
  console.error('复盘失败：找不到 steps.jsonl（' + String(traceDir) + '）')
  process.exit(2)
}
const raw = readFileSync(join(traceDir, 'steps.jsonl'), 'utf8').trim().split('\n')
const steps = raw.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const acts = steps.map((x) => x.action)
const rounds = parseRounds(acts)
const rest = parseRest(traceDir, steps[0] && steps[0].at, steps[steps.length - 1] && steps[steps.length - 1].at)

// ── 统计 ──
const rows = rounds.map((r) => {
  const rr = r.round != null ? rest.get(r.round) : null
  const buy = r.buys.filter((b) => b.verb === 'buy').length
  const up = r.buys.filter((b) => b.verb === 'upgrade').length
  const ref = r.buys.filter((b) => b.verb === 'refresh').length
  const stop = r.buys.filter((b) => b.verb === 'stop' || b.verb === 'freeze').length
  const slots = r.deploy && /^\d+$/.test(String(r.deploy.slots)) ? Number(r.deploy.slots) : null
  const left = r.deploy ? r.deploy.benchLeft : null
  const up2 = r.deploy ? r.deploy.up : null
  const flags = []
  if (up2 === 0 && left > 0) flags.push(slots === 0 ? '满员未换人（整备区 ' + left + ' 张）' : '0 上场但整备区有牌')
  if (slots != null && up2 != null && left === 0 && slots - up2 >= 2) flags.push('名额空 ' + (slots - up2) + ' 个')
  if (rr && rr.sec > REST_TARGET_S) flags.push('REST 超时 +' + Math.round(rr.sec - REST_TARGET_S) + 's')
  if (r.fails.length) flags.push('撤回失败 ' + r.fails.length)
  if (r.doubted) flags.push('读数不可信 ' + r.doubted)
  if (r.goal) flags.push('★3盟约叠层')
  // ★ 别再用 up 当两个意思：up=上场人数，lvUp=升级次数（旧版同名键把上场数覆盖成 0，报告假报「0 上场」）
  return { round: r.round, rest: rr ? rr.sec : null, up: up2, left, slots, buy, lvUp: up, ref, stop, swapOk: r.swaps.filter((s) => s.ok).length, swapNo: r.swaps.filter((s) => !s.ok).length, misses: r.misses, panels: r.panels, bar: r.bar, flags }
})

// 同一回合可能被拆成两段（中途收手重来、或日志里出现两个「第N回合」标记）→ 按回合号合并，
// 铁律是「宁可少说也别把同一回合数成两回」。
const merged = []
for (const r of rows) {
  const prev = merged.find((x) => x.round === r.round)
  if (!prev) { merged.push({ ...r }); continue }
  if (r.up != null && prev.up == null) { prev.up = r.up; prev.left = r.left; prev.slots = r.slots }
  if ((r.rest || 0) > (prev.rest || 0)) prev.rest = r.rest
  prev.buy = Math.max(prev.buy, r.buy); prev.up = prev.up; prev.ref = Math.max(prev.ref, r.ref)
  prev.lvUp = Math.max(prev.lvUp || 0, r.lvUp || 0)
  prev.swapOk = Math.max(prev.swapOk, r.swapOk); prev.swapNo = Math.max(prev.swapNo, r.swapNo)
  prev.misses = Math.max(prev.misses, r.misses)
  for (const f of r.flags) if (!prev.flags.includes(f)) prev.flags.push(f)
}
rows.length = 0
rows.push(...merged)

const totalRounds = rows.length
const sumRest = rows.reduce((a, r) => a + (r.rest || 0), 0)
const nRest = rows.filter((r) => r.rest).length
const slow = rows.filter((r) => r.rest && r.rest > REST_TARGET_S)
const zeroDeploy = rows.filter((r) => r.up === 0 && r.left > 0)
const buyTotal = rows.reduce((a, r) => a + r.buy, 0)
const refTotal = rows.reduce((a, r) => a + r.ref, 0)
const upTotal = rows.reduce((a, r) => a + r.lvUp, 0)
const swapOk = rows.reduce((a, r) => a + r.swapOk, 0)
const swapNo = rows.reduce((a, r) => a + r.swapNo, 0)
const goalRow = rows.find((r) => /★3盟约叠层/.test(r.flags.join()))

// ── 报告 ──
const L = []
L.push('# 复盘 ' + basename(traceDir))
L.push('')
L.push('- 回合数：' + totalRounds + '｜平均 REST：' + (nRest ? (sumRest / nRest).toFixed(1) : '?') + 's（目标 ' + REST_TARGET_S + 's，超时 ' + slow.length + '/' + nRest + ' 回合）')
L.push('- 买卡：' + buyTotal + ' 张｜刷新：' + refTotal + ' 次｜升级：' + upTotal + ' 次｜换人：成功 ' + swapOk + ' / 失败 ' + swapNo)
L.push('- 0 上场（整备区还有牌）的回合：' + (zeroDeploy.length ? zeroDeploy.map((r) => 'R' + r.round).join('、') : '没有'))
L.push('- 三个盟约叠层达标：' + (goalRow ? '第 ' + goalRow.round + ' 回合命中 ★' : '本局没命中'))
L.push('')
L.push('| 回合 | REST(s) | 上场 | 整备区剩 | 剩余名额 | 买 | 升 | 刷 | 换人 | 问题 |')
L.push('|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  L.push('| ' + [r.round, r.rest == null ? '?' : r.rest.toFixed(0), r.up == null ? '?' : r.up, r.left == null ? '?' : r.left, r.slots == null ? '?' : r.slots, r.buy, r.lvUp, r.ref, r.swapOk + '/' + r.swapNo, r.flags.join('；')].join(' | ') + ' |')
}
L.push('')
L.push('## 这局的问题（按严重度）')
const probs = []
if (zeroDeploy.length) probs.push('- **有整备区却 0 上场**：' + zeroDeploy.map((r) => 'R' + r.round + '（整备区 ' + r.left + ' 张）').join('、') + ' → 名额/站位/拖拽三选一，看 steps 里这几回合的「拎不起来」与「名额」两行')
if (slow.length) probs.push('- **REST 超 ' + REST_TARGET_S + 's**：' + slow.map((r) => 'R' + r.round + ' ' + r.rest.toFixed(0) + 's').join('、') + ' → 商店开合与认人最贵，先砍整备区重扫次数')
if (refTotal >= 6) probs.push('- **刷新花得多**：' + refTotal + ' 次（每次 1~2 块）→ 空名额 ≥2 时应该直接买最便宜的，不该刷')
const wasteful = rows.filter((r) => r.slots != null && r.up != null && r.left === 0 && r.slots - r.up >= 2)
if (wasteful.length) probs.push('- **名额白白空着**：' + wasteful.map((r) => 'R' + r.round + ' 空 ' + (r.slots - r.up)).join('、') + ' → 有牌就换人/撤回再上，没牌就该更早买')
if (swapNo) probs.push('- **换人失败 ' + swapNo + ' 次** → 看撤回判据（原格 sd / 面板遮挡）')
if (!probs.length) probs.push('- 本局没抓到结构性问题（不代表打得对，可能只是日志没覆盖）')
L.push(probs.join('\n'))
L.push('')
L.push('## 下一步建议')
L.push('- 先修「0 上场」与「名额空着」，这两条直接决定能不能凑出第三个盟约。')
L.push('- REST 先从「每回合只扫一次甲板 + 商店只开一次」砍，别动决策。')
L.push('- 每局复盘文件名固定 review-<trace 名>.md，跑完自动生成，明天按日期翻。')

const md = L.join('\n')
const outPath = join(WORLD, 'docs', 'review-' + basename(traceDir) + '.md')
const summary = '[REVIEW] 回合 ' + totalRounds + '｜平均 REST ' + (nRest ? (sumRest / nRest).toFixed(1) : '?') + 's｜0 上场 ' + zeroDeploy.length + ' 回合｜刷新 ' + refTotal + ' 次｜换人 ' + swapOk + '/' + swapNo + '｜' + (goalRow ? '3 盟约达标 R' + goalRow.round : '未达标')
if (!process.argv.includes('--print')) {
  writeFileSync(outPath, md)
  console.log(summary)
  console.log('  → ' + outPath)
} else {
  console.log(summary)
  console.log(md)
}
