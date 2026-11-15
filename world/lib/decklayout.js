import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 每张地图的「甲板按压点」缓存（用户 m07403：每张地图甲板都做一下适配，整体识别速度会快得多）。
 *
 * 为什么能缓存：甲板是固定 10 格，牌从左往右排；同一张地图 + 同一个商店开合状态，
 * 按压点的 y 和格距是不变的，只有张数在变。所以第一次扫一次记住，之后按
 * 「张数 + 格距」直接算，省掉每回合 1.5~2.5s 的 scanDeckChips，也绕开它
 * 「扫不到/木台被遮住/两排混排」这些失败模式。
 *
 * 落盘格式：
 *   { "wz-01": { "collapsed": { "3": { "y": 675, "pitch": 148, "xs": [1264,1413,1562] },
 *                              "6": { ... } },
 *                "expanded":  { ... } } }
 */

const HERE = dirname(fileURLToPath(import.meta.url))
// 2026-11-13 18:5x：测试会把 __test-map 之类写进生产缓存文件里（实测 data/deck-layout.json 里
// 混进 __test-map/__test-map2/__test-map3 三个键）。允许用环境变量指到临时文件，测试自己设。
const CACHE_PATH = process.env.COOP_DECK_LAYOUT || join(HERE, '..', 'data', 'deck-layout.json')

function readCache() {
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) || {} } catch { return {} }
}

function writeCache(obj) {
  try {
    const dir = dirname(CACHE_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 1))
  } catch { /* 缓存写不进去不影响主流程 */ }
}

export function deckStateKey(shopOpen) {
  return shopOpen === true ? 'expanded' : 'collapsed'
}

export function pitchOf(xs = []) {
  const s = xs.slice().sort((a, b) => a - b)
  if (s.length < 2) return 148
  const d = []
  for (let i = 1; i < s.length; i++) d.push(s[i] - s[i - 1])
  d.sort((a, b) => a - b)
  const med = d[Math.floor(d.length / 2)]
  return med >= 60 && med <= 260 ? med : 148
}

/** 把一次真实扫描结果记下来（同 y 的一排才记，两排混在一起的不算）。 */
export function rememberDeck(mapId, shopOpen, chips = []) {
  if (!mapId) return false
  const good = (chips || []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y))
  if (!good.length) return false
  const byY = new Map()
  for (const c of good) {
    const k = Math.round(c.y / 30) * 30
    if (!byY.has(k)) byY.set(k, [])
    byY.get(k).push(c)
  }
  let best = []
  for (const arr of byY.values()) if (arr.length > best.length) best = arr
  if (best.length < 1) return false
  const xs = best.map((c) => Math.round(c.x)).sort((a, b) => a - b)
  const y = Math.round(best.reduce((s, c) => s + c.y, 0) / best.length)
  const cache = readCache()
  if (!cache[mapId]) cache[mapId] = {}
  const key = deckStateKey(shopOpen)
  if (!cache[mapId][key]) cache[mapId][key] = {}
  cache[mapId][key][String(xs.length)] = { y, pitch: pitchOf(xs), xs }
  writeCache(cache)
  return true
}

/**
 * 按缓存算出 count 张牌该按哪儿。返回 null 表示缓存不够用，调用方应该真的扫一次。
 * 张数正好命中就用记下来的 xs；否则用最近张数那份的格距、从最右往左推。
 */
export function planDeckChips(mapId, shopOpen, count) {
  if (!mapId) return null
  const n = Math.max(1, Math.round(Number(count) || 0))
  const cache = readCache()
  const bucket = cache && cache[mapId] && cache[mapId][deckStateKey(shopOpen)]
  if (!bucket) return null
  const keys = Object.keys(bucket).map(Number).filter((k) => k > 0)
  if (!keys.length) return null
  if (bucket[String(n)]) {
    const e = bucket[String(n)]
    return e.xs.map((x) => ({ x, y: e.y, guess: true }))
  }
  // 取张数最接近的那份当模板
  keys.sort((a, b) => Math.abs(a - n) - Math.abs(b - n))
  const base = bucket[String(keys[0])]
  if (!base || !base.xs || !base.xs.length) return null
  const pitch = base.pitch || pitchOf(base.xs)
  const right = base.xs[base.xs.length - 1]
  const xs = []
  for (let i = 0; i < n; i++) xs.push(Math.round(right - pitch * (n - 1 - i)))
  xs.sort((a, b) => a - b)
  return xs.map((x) => ({ x, y: base.y, guess: true }))
}

export function describeDeckLayout(mapId) {
  const cache = readCache()
  const b = cache && cache[mapId]
  if (!b) return '（还没有甲板缓存）'
  const parts = []
  for (const k of Object.keys(b)) {
    const counts = Object.keys(b[k]).map(Number).sort((a, c) => a - c)
    const last = b[k][String(counts[counts.length - 1])] || {}
    parts.push(k + '：y=' + last.y + ' 格距=' + (last.pitch || '?') + ' 有 ' + counts.join('/') + ' 张的记录')
  }
  return parts.join('；')
}
