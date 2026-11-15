// 布阵计划纯函数：给「哪张牌站哪格」和「召唤物补位」一个可测的脑子。
//
// 2026-11-14 08:5x 用户 m02396：
//   「三合一的优先级很高……提高放干员的精准性，避免重试。扫甲板开始的时候扫一次，然后等布阵结束之后
//     再扫一次确认，如果有召唤物就摆上，这个不占用部署名额。」
// 所以这里只做三件事：
//   ① 按职业 + 地图 deployOrder + 棋盘实测占格，排出每个干员的候选格（记忆格优先，少盲试）；
//   ② 记住「谁上过哪格」「哪张牌在哪格上过不去」，下一回合直接用；
//   ③ 收尾时挑出「可能是召唤物」的牌（名额 0 时还能拖动的那些）。
//
// 本模块只读一次数据盘，不 import adb/游戏相关模块，方便单测。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { operatorInfo } from './gamemap.js'
import { roleKeyOfClass, tilesForRole, orderRemaining, roleAcceptsCell } from './deployorder.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAP_PATH = join(HERE, '..', 'data', 'deploy-map.json')
const MAX_OPS_PER_MAP = 200
/** 记忆格与棋盘格的容差（像素）。棋盘格中心是实测点，记忆格存的是同一套坐标，45 够用。 */
export const MEM_TOL = 45

/** 干员名 → deployOrder 的序列键（tank / healer / ranged / melee）。认不出职业当近战。 */
export function roleKeyOfName(name = '') {
  const info = operatorInfo(name)
  const k = info ? roleKeyOfClass(info.class) : null
  return k || 'melee'
}

/** 空存储结构。 */
export function emptyStore() {
  return { version: 1, at: 0, maps: {} }
}

function normStore(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const maps = s.maps && typeof s.maps === 'object' && !Array.isArray(s.maps) ? s.maps : {}
  return { version: 1, at: Number(s.at) || 0, maps }
}

/** 读 data/deploy-map.json；文件不在/坏了都返回空结构，不抛。 */
export function loadDeployMap(path = MAP_PATH) {
  try {
    if (!existsSync(path)) return emptyStore()
    return normStore(JSON.parse(readFileSync(path, 'utf8')))
  } catch { return emptyStore() }
}

function mapBucket(store, mapId) {
  const id = String(mapId || 'default')
  if (!store.maps[id] || typeof store.maps[id] !== 'object') store.maps[id] = { ops: {}, bad: {} }
  const b = store.maps[id]
  if (!b.ops || typeof b.ops !== 'object') b.ops = {}
  if (!b.bad || typeof b.bad !== 'object') b.bad = {}
  return b
}

/** 写盘（只保留最近 MAX_OPS_PER_MAP 条，按 at 新的留）。 */
export function saveDeployMap(store, path = MAP_PATH) {
  try {
    const s = normStore(store)
    s.at = Date.now()
    for (const id of Object.keys(s.maps)) {
      const b = s.maps[id]
      const ops = Object.entries(b.ops || {}).sort((a, c) => (Number(c[1].at) || 0) - (Number(a[1].at) || 0))
      b.ops = Object.fromEntries(ops.slice(0, MAX_OPS_PER_MAP))
    }
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(s, null, 1))
    return true
  } catch { return false }
}

/** 这张图里该干员上次上过的格；没有就 null。 */
export function memoryOf(store, mapId, name) {
  if (!store || !name) return null
  const b = store.maps && store.maps[String(mapId || 'default')]
  const rec = b && b.ops && b.ops[String(name)]
  if (!rec || !Number.isFinite(Number(rec.col)) || !Number.isFinite(Number(rec.row))) return null
  return { col: Number(rec.col), row: Number(rec.row), facing: rec.facing || null, ok: Number(rec.ok) || 0 }
}

/** 记一次成功落位（同一格累计 ok，换格则重置）。 */
export function recordPlace(store, mapId, name, cell, facing = null) {
  const s = normStore(store)
  if (!name || !cell) return s
  const col = Number(cell.col)
  const row = Number(cell.row)
  if (!Number.isFinite(col) || !Number.isFinite(row)) return s
  const b = mapBucket(s, mapId)
  const prev = b.ops[String(name)]
  const same = prev && Number(prev.col) === col && Number(prev.row) === row
  b.ops[String(name)] = { col, row, facing: facing || (prev && prev.facing) || null, ok: same ? (Number(prev.ok) || 0) + 1 : 1, at: Date.now() }
  // 上过一次就说明这格对它是合法的：从 bad 里删掉
  const bad = b.bad[String(name)]
  if (Array.isArray(bad)) {
    const key = col + ',' + row
    b.bad[String(name)] = bad.filter((k) => String(k) !== key)
    if (!b.bad[String(name)].length) delete b.bad[String(name)]
  }
  return s
}

/** 记一次「这张牌在这格上不去」（只对这张牌非法，不影响别人）。 */
export function recordIllegal(store, mapId, name, cell) {
  const s = normStore(store)
  if (!name || !cell) return s
  const key = (Array.isArray(cell) ? cell.join(',') : cell.col + ',' + cell.row)
  if (!/^-?\d+,-?\d+$/.test(String(key))) return s
  const b = mapBucket(s, mapId)
  const list = Array.isArray(b.bad[String(name)]) ? b.bad[String(name)] : []
  if (!list.includes(String(key))) list.push(String(key))
  b.bad[String(name)] = list.slice(-40)
  return s
}

/** 这张牌自己标过的非法格（'col,row' 数组）。 */
export function illegalOf(store, mapId, name) {
  const b = store && store.maps && store.maps[String(mapId || 'default')]
  const list = b && b.bad && b.bad[String(name)]
  return Array.isArray(list) ? list.map(String) : []
}

/** 像素点归一（'x,y' / [x,y] / {px:[x,y]} 都能吃）。 */
function pxOf(v) {
  if (!v) return null
  if (Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]))) return [Number(v[0]), Number(v[1])]
  if (typeof v === 'string' && v.includes(',')) {
    const [a, b] = v.split(',')
    const x = Number(a), y = Number(b)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  }
  if (Array.isArray(v.px)) return pxOf(v.px)
  return null
}

function pxList(list) {
  return (Array.isArray(list) ? list : []).map(pxOf).filter(Boolean)
}

function nearAny(px, pts, tol = MEM_TOL) {
  if (!px || !pts.length) return false
  for (const p of pts) if (Math.hypot(px[0] - p[0], px[1] - p[1]) <= tol) return true
  return false
}

/**
 * 给一张牌排候选格（去重、已剔除已占/非法/本回合已用）。
 *
 * card: { name, role? }（role 可以是 tank/healer/ranged/melee，不传就按名字查）
 * opts: {
 *   map,                     // data/maps/<id>.json
 *   takenPx: [],             // 棋盘实测已占格（像素）
 *   deadPx: [],              // DEAD_TILES（像素键/数组）
 *   usedPx: [],              // 本回合已经用掉的格
 *   memory: {col,row,facing} // 上次成功的格
 * }
 * 返回 [{ col, row, px:[x,y], facing, src }]，src = memory / order / rest。
 */
export function rankTiles(card = {}, opts = {}) {
  const map = opts.map
  if (!map || !Array.isArray(map.cells) || !map.cells.length) return []
  const name = String(card.name || '')
  const role = card.role || roleKeyOfName(name)
  const strictOk = (c) => roleAcceptsCell(role, c)
  const taken = pxList(opts.takenPx)
  const dead = pxList(opts.deadPx)
  const used = pxList(opts.usedPx)
  const cellOf = new Map()
  for (const c of map.cells) if (c && c.deploy) cellOf.set(c.col + ',' + c.row, c)
  const out = []
  const seen = new Set()
  const push = (t, src) => {
    if (!t) return
    const key = t.col + ',' + t.row
    if (seen.has(key)) return
    const c = cellOf.get(key)
    if (!c || !Array.isArray(c.px)) return
    if (nearAny(c.px, taken) || nearAny(c.px, dead) || nearAny(c.px, used)) return
    seen.add(key)
    out.push({ col: Number(c.col), row: Number(c.row), px: c.px.slice(0, 2), facing: t.facing || null, src })
  }
  // ① 记忆格：上次这张牌站成功的地方（换阵容也能少试一格）
  const mem = opts.memory
  if (mem && Number.isFinite(Number(mem.col)) && Number.isFinite(Number(mem.row))) {
    push({ col: Number(mem.col), row: Number(mem.row), facing: mem.facing || null }, 'memory')
  }
  // ② 地图指定序列（重装/近战/远程/医疗）
  const seq = tilesForRole(map, role)
  for (const t of Array.isArray(seq) ? seq : []) push(t, 'order')
  // ③ 其余可部署格：离指定格最近的先
  const skip = new Set(out.map((t) => t.col + ',' + t.row))
  for (const t of orderRemaining(map, skip)) push(t, 'rest')
  return out
}

/**
 * 收尾时挑「可能是召唤物」的牌。
 * 召唤物不占部署名额：名额 0 时普通干员拖不动（连待确认态都不出现），召唤物还能拖。
 * 所以只有「名额已经确定是 0」或者「该上的都上完了」才值得试，且最多 2 张。
 */
export function summonPick({ chips = [], slotsLeft = null, placed = 0, budget = Infinity, max = 2 } = {}) {
  const list = (Array.isArray(chips) ? chips : []).filter((c) => c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)))
  if (!list.length) return []
  const left = slotsLeft == null ? null : Number(slotsLeft)
  // 只在「名额确定是 0」时才试：名额还有的话，剩下的只可能是上不去的普通干员，
  // 下一回合正常布阵会处理，这时候硬拖只是白烧休息期（每格约 5.8s）。
  const quotaZero = Number.isFinite(left) && left <= 0
  if (!quotaZero) return []
  return list.slice(0, Math.max(1, Math.min(Number(max) || 2, 2)))
}
