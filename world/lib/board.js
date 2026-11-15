/**
 * board.js — 棋盘格子 ↔ 干员编号（用户 m05078：一切判定按格子来）。
 *
 * 格子用地图网格坐标 [gx,gy]（wz-01 的 anchor/step 见 data/maps/wz-01.json），
 * 不用像素：像素会随镜头平移变，网格不会。
 *
 * 纯内存 + 可落盘（world/data/board-state.json），不碰设备。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, '..', 'data', 'board-state.json')

export const key = (gx, gy) => gx + ',' + gy

export function emptyBoard() {
  return { cells: {} }
}

export function loadBoard(path = FILE) {
  try {
    if (!existsSync(path)) return emptyBoard()
    const o = JSON.parse(readFileSync(path, 'utf8'))
    return { cells: o && o.cells && typeof o.cells === 'object' ? o.cells : {} }
  } catch {
    return emptyBoard()
  }
}

export function saveBoard(b, path = FILE) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(b, null, 2))
  return path
}

/** 放一个干员：一个编号只占一格；同一格被占就先把旧编号踢掉（换人）。 */
export function place(b, id, cell) {
  if (!id || !Array.isArray(cell) || cell.length !== 2) return null
  for (const [k, v] of Object.entries(b.cells)) if (v === id) delete b.cells[k]
  const k = key(cell[0], cell[1])
  b.cells[k] = id
  return k
}

export function remove(b, id) {
  let hit = null
  for (const [k, v] of Object.entries(b.cells)) if (v === id) { delete b.cells[k]; hit = k }
  return hit
}

export function cellOf(b, id) {
  for (const [k, v] of Object.entries(b.cells)) {
    if (v === id) {
      const p = k.split(',').map(Number)
      return [p[0], p[1]]
    }
  }
  return null
}

export function idAt(b, gx, gy) {
  return b.cells[key(gx, gy)] || null
}

export function occupied(b) {
  return Object.keys(b.cells).map((k) => k.split(',').map(Number))
}

export function freeCells(b, cells = []) {
  return cells.filter((c) => !idAt(b, c[0], c[1]))
}
