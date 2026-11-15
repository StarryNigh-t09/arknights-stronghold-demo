// snapshot.js —— 一次截图出一个「结构化状态快照」（2026-11-15 08:5x，用户 m10989 批准的第 1 项）
//
// 为什么要有它：现在感知是散的 —— 状态头读一次、甲板扫一次、占格算一次、盟约 OCR 一次，
// 各自带自己的截图和容错，谁失败谁静默退回旧值，于是「账本和真实棋盘对不上」成了常态
// （真机踩过：盟约账恒 0~2、名额读成 2 但已满、撤回判成功其实人还在）。
//
// 本模块只做三件事：
//   1. snapshotNow()：把已知事实汇成一个对象（能复用调用方已经读到的值，不重复 OCR）
//   2. formatSnapshot()：压成一行日志，人一眼能对比「我以为」和「实际」
//   3. boardHasUnitNear()：动作回读的地基 —— 拖完之后这个格子到底有没有人
//
// 设计原则：坏一块就标一块，不整块丢。st.ok === false 时其它字段照样返回，
// snapshot.issues 里写清哪块没读到，调用方自己决定信不信。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { screenshot } from './adb.js'
import { peek, scanDeckChips } from './run.js'
import { readState } from './ocr.js'
import { readCovenantsNow } from './covenants.js'
import { loadGameMap } from './gamemap.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const safe = async (fn, issues, tag) => {
  try { return await fn() } catch (e) { issues.push(tag + '：' + (e && e.message ? e.message : String(e))); return null }
}

// 占格检测放在 drive.js（它要合并账本、剔误报格）。这里用动态 import，
// 避免 snapshot ←→ drive 的静态循环。
const detectBoard = async (png, map) => {
  const m = await import('./drive.js')
  return m.detectOccupiedTiles(png, map)
}

/**
 * @param {object} opts
 *   st        调用方已经读到的状态头（有就不重复 OCR）
 *   png       调用方已经截好的图（Buffer）
 *   pngPath   已经落盘的截图路径
 *   deckChips 调用方已经扫到的甲板 chips
 *   boardCells 调用方已经算好的占格
 *   cov       调用方已经读到的盟约（readCovenants 的返回值）
 *   skipOcr/skipDeck/skipBoard/skipCov  关掉某块（省时间）
 */
export async function snapshotNow(opts = {}) {
  const t0 = Date.now()
  const issues = []
  const map = opts.map || (opts.skipBoard ? null : loadGameMap())
  let png = opts.png || null
  let pngPath = opts.pngPath || null

  // 需要图的几块共用同一张截图：只截一次，别让每块各截一张（那是现在最贵的一笔开销）
  const needPng = !opts.skipOcr || !opts.skipBoard
  if (needPng && !png && !pngPath) {
    png = await safe(async () => screenshot(), issues, '截图')
    if (png) {
      pngPath = join(HERE, '..', '.tmp', 'snap-' + Date.now() + '.png')
      try { writeFileSync(pngPath, png) } catch (e) { issues.push('截图落盘：' + e.message); pngPath = null }
    }
  }
  if (!png && pngPath) png = await safe(async () => (await import('node:fs')).readFileSync(pngPath), issues, '读回截图')

  const screen = await safe(async () => peek(), issues, '界面')
  const st = opts.st || (!opts.skipOcr && pngPath ? await safe(() => readState(pngPath, { timeoutMs: 90000 }), issues, '状态头') : null)
  const deck = opts.deckChips || (opts.skipDeck ? null : await safe(() => scanDeckChips(), issues, '甲板'))
  const board = opts.boardCells || (opts.skipBoard || !png ? null : await safe(() => detectBoard(png, map), issues, '占格'))
  const cov = opts.cov || (opts.skipCov ? null : await safe(() => readCovenantsNow(), issues, '盟约'))

  const bench = deck && Array.isArray(deck.chips)
    ? deck.chips.slice().sort((a, b) => a.x - b.x).map((c) => ({ x: c.x, y: c.y, name: c.name || null }))
    : null
  // detectOccupiedTiles 返回 {ok, tiles:[{x,y,sd}], detail}，不是裸数组 —— 两种都接。
  const rawTiles = Array.isArray(board) ? board : (board && Array.isArray(board.tiles) ? board.tiles : null)
  const boardList = rawTiles
    ? rawTiles.map((t) => ({ px: Array.isArray(t.px) ? t.px : [Number(t.x), Number(t.y)], sd: t.sd == null ? null : Number(t.sd) }))
    : null

  return {
    at: new Date().toISOString(),
    screen: screen ? { state: screen.state, dist: screen.dist } : null,
    round: st && Number.isFinite(Number(st.round)) ? Number(st.round) : null,
    hp: st && Number.isFinite(Number(st.hp)) ? Number(st.hp) : null,
    money: st && Number.isFinite(Number(st.money)) ? Number(st.money) : null,
    slots: st && Number.isFinite(Number(st.slots)) ? Number(st.slots) : null,
    level: st && Number.isFinite(Number(st.level)) ? Number(st.level) : null,
    stOk: !!(st && st.ok !== false),
    bench,
    benchOk: !!(deck && deck.ok !== false),
    board: boardList,
    boardOk: !!(Array.isArray(boardList) && (!board || board.ok !== false)),
    covenants: cov && cov.names ? { names: cov.names, bar: Array.isArray(cov.bar) ? cov.bar : [] } : null,
    pngPath,
    issues,
    ms: Date.now() - t0,
  }
}

/** 压成一行，日志里直接打。读不到的字段写 ?，不编。 */
export function formatSnapshot(s) {
  if (!s) return '快照：没有'
  const cov = s.covenants && Array.isArray(s.covenants.bar)
    ? s.covenants.bar.filter((b) => b && b.name).map((b) => b.name + (b.stacks == null ? '?' : b.stacks)).join(' ')
    : ''
  const named = Array.isArray(s.board) ? s.board.length : null
  return [
    'R' + (s.round == null ? '?' : s.round),
    s.screen && s.screen.state ? s.screen.state : '?',
    'HP ' + (s.hp == null ? '?' : s.hp),
    '钱 ' + (s.money == null ? '?' : s.money),
    '名额 ' + (s.slots == null ? '?' : s.slots),
    'Lv' + (s.level == null ? '?' : s.level),
    '占格 ' + (named == null ? '?' : named),
    '整备区 ' + (s.bench == null ? '?' : s.bench.length) + ' 张',
    cov ? '盟约 ' + cov : '盟约 ?',
    s.issues && s.issues.length ? '（没读到：' + s.issues.join('；') + '）' : '',
  ].join('｜')
}

/** 动作回读的地基：这个坐标附近有没有站着人（用来判「拖上去了 / 撤回来了」） */
export function boardHasUnitNear(board, px, tol = 45) {
  if (!Array.isArray(board) || !Array.isArray(px)) return false
  return board.some((t) => {
    const p = Array.isArray(t) ? t : ((t && t.px) || (t && t.x != null ? [t.x, t.y] : null))
    if (!p) return false
    return Math.abs(Number(p[0]) - Number(px[0])) <= tol && Math.abs(Number(p[1]) - Number(px[1])) <= tol
  })
}

export default { snapshotNow, formatSnapshot, boardHasUnitNear }
