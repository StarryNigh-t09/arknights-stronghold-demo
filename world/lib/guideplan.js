/**
 * 攻略优先序：把 docs/guide-skland-2026-11-13.md 的盟约频次表搬成可执行的数据。
 *
 * 来由（用户 m08805 原话「照着别人的攻略流程走，不要自己凑盟约了」）：
 * 以前核心盟约按「两组里合规盟约哪个多」选（run.js），买卡目标又是从休整期顶栏反推的，
 * 等于我自己在挑。攻略原文的两句结论才是依据：
 *   大盟约 莱塔尼亚 40 > 伊比利亚 37 > 卡西米尔 31 > 乌萨斯 28 > 维多利亚 22 > 炎 21 > 阿戈尔 17 > 谢拉格 15 > 萨尔贡 13 > 叙拉古 12
 *   小盟约 绝技 143 > 精准 130 > 灵巧 114 > 聚合 106 ≈ 奥术 106 > 远见 70
 * 数据本身在 data/guide-covenant-rank.json，改表不用改代码。
 *
 * @module coopanion/guideplan
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RANK_PATH = join(HERE, '..', 'data', 'guide-covenant-rank.json')

let cached = null

/** 读攻略频次表；同一路径只解析一次。 */
export function loadGuideRank(path = RANK_PATH) {
  if (cached && path === RANK_PATH) return cached
  const j = JSON.parse(readFileSync(path, 'utf8'))
  const big = (j.big || []).map((x) => ({ name: String(x.name), count: Number(x.count) || 0 }))
  const small = (j.small || []).map((x) => ({ name: String(x.name), count: Number(x.count) || 0 }))
  const out = {
    source: String(j.source || ''),
    big,
    small,
    bigRank: new Map(big.map((x, i) => [x.name, i])),
    smallRank: new Map(small.map((x, i) => [x.name, i])),
  }
  if (path === RANK_PATH) cached = out
  return out
}

/** 一组盟约里最热门的那一个（攻略榜单上名次最靠前）。 */
export function coreGroupScore(names, g = loadGuideRank()) {
  let best = null
  for (const raw of names || []) {
    const name = String(raw || '').trim()
    if (!name) continue
    const idx = g.bigRank.has(name) ? g.bigRank.get(name) : 999
    const count = idx === 999 ? 0 : g.big[idx].count
    if (!best || idx < best.idx) best = { name, idx, count }
  }
  return best || { name: '', idx: 999, count: 0 }
}

/**
 * 1/3 页左右两组核心盟约，按攻略热度选一组。
 * 平手取 A（左边是游戏默认选中的那组），右组整组认不出来也取 A。
 */
export function chooseCoreGroup(left, right, g = loadGuideRank()) {
  const L = coreGroupScore(left, g)
  const R = coreGroupScore(right, g)
  // 2026-11-15 07:1x（用户 m10907「三个盟约中至少要有一个是大盟约，像乌萨斯/谢拉格这种有 6 人的」）：
  // 只比「哪边更热」不够 —— 一组里可能只有 3 人小盟约，凑到 3 人就到顶，叠不起来。
  // 先看这组有没有攻略大盟约（6 人盟约），有的一边优先；两边都有再比热度。
  const bigCount = (names) => (names || []).map((x) => String(x || '').trim()).filter((x) => g.bigRank.has(x)).length
  const bl = bigCount(left)
  const br = bigCount(right)
  const group = (bl > 0 || br > 0) ? (br > bl ? 'B' : (bl > br ? 'A' : (R.idx < L.idx ? 'B' : 'A'))) : (R.idx < L.idx ? 'B' : 'A')
  const name = (x) => (x.name ? x.name : '无')
  const reason = '攻略大盟约热度（左含大盟约 ' + bl + ' 个／右 ' + br + ' 个）：左最佳 ' + name(L) + ' ' + L.count + ' 篇／右最佳 ' + name(R) + ' ' + R.count +
    ' 篇 → 选 ' + group + ' 组'
  return { group, left: L, right: R, reason }
}

/** 攻略热度 → 买卡权重（1.0 ~ 1.5）。大盟约 40 篇 = 1.40，小盟约 143 篇 = 1.48。 */
export function guideCovenantWeight(name, g = loadGuideRank()) {
  const k = String(name || '').trim()
  const b = g.big.find((x) => x.name === k)
  if (b) return 1 + Math.min(0.5, b.count / 100)
  const s = g.small.find((x) => x.name === k)
  if (s) return 1 + Math.min(0.5, s.count / 300)
  return 1
}

/** 盟约名 → 权重表，直接喂给 covenantplan 的打分。 */
export function guideWeightMap(g = loadGuideRank()) {
  const m = {}
  for (const b of g.big) m[b.name] = guideCovenantWeight(b.name, g)
  for (const s of g.small) m[s.name] = guideCovenantWeight(s.name, g)
  return m
}

/** 本局目标盟约：先核心（按攻略热度排），再接小盟约（按攻略热度排）。 */
export function guideTargets(cores, g = loadGuideRank()) {
  const out = []
  for (const raw of cores || []) {
    const k = String(raw || '').trim()
    if (k && !out.includes(k)) out.push(k)
  }
  const rankOf = (n) => (g.bigRank.has(n) ? g.bigRank.get(n) : 999)
  out.sort((a, b) => rankOf(a) - rankOf(b))
  for (const s of g.small) if (!out.includes(s.name)) out.push(s.name)
  return out
}
