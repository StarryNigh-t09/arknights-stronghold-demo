/**
 * roster.js — 干员名册（op-N 编号）。
 *
 * 为什么要编号：甲板上同时有好几个同名干员（比如两个褐果），靠名字区分不了；
 * 用户 m05078 要求「所有判定按格子来」，所以给每个上场/入队的干员一个稳定编号，
 * 编号 ↔ 格子 由 board.js 管，编号 ↔ 阶/级/盟约 由这里管。
 *
 * 纯内存 + 可落盘（world/data/roster.json），不碰设备。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, '..', 'data', 'roster.json')

export function emptyRoster() {
  return { seq: 0, units: {} }
}

export function loadRoster(path = FILE) {
  try {
    if (!existsSync(path)) return emptyRoster()
    const o = JSON.parse(readFileSync(path, 'utf8'))
    if (!o || typeof o !== 'object') return emptyRoster()
    return { seq: Number(o.seq) || 0, units: o.units && typeof o.units === 'object' ? o.units : {} }
  } catch {
    return emptyRoster()
  }
}

export function saveRoster(r, path = FILE) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(r, null, 2))
  return path
}

/** 派生字段一律显式给：name 可能认不出来（纯图像识人还没做），tier/level 可能读不到。 */
export function addUnit(r, info = {}) {
  r.seq = (Number(r.seq) || 0) + 1
  const id = 'op-' + r.seq
  r.units[id] = {
    id,
    name: info.name || '',
    cls: info.cls || '',
    tier: Number(info.tier) || 0,
    level: Number(info.level) || 0,
    covenants: Array.isArray(info.covenants) ? info.covenants.slice() : [],
    equip: Array.isArray(info.equip) ? info.equip.slice() : [],
    cell: null,
    at: info.at || new Date().toISOString(),
  }
  return r.units[id]
}

export function unit(r, id) {
  return (r.units && r.units[id]) || null
}

export function listUnits(r) {
  return Object.values(r.units || {})
}

export function updateUnit(r, id, patch = {}) {
  const u = unit(r, id)
  if (!u) return null
  Object.assign(u, patch)
  return u
}

export function removeUnit(r, id) {
  if (!r.units || !r.units[id]) return false
  delete r.units[id]
  return true
}

/**
 * 卖卡时挑谁（用户 m04440：低阶过渡完都可以卖，装了装备也能卖，装备会回甲板）。
 * 排序：阶最低优先 → 身上装备少的优先（装备回来还要再挂一次，少折腾）→ 编号小的优先。
 */
export function sellCandidate(r, { maxTier = 3, keep = [] } = {}) {
  const cands = listUnits(r).filter((u) => !keep.includes(u.id) && (Number(u.tier) || 9) <= maxTier)
  cands.sort(
    (a, b) =>
      (Number(a.tier) || 9) - (Number(b.tier) || 9) ||
      (a.equip || []).length - (b.equip || []).length ||
      a.id.localeCompare(b.id)
  )
  return cands[0] || null
}
