#!/usr/bin/env node
/**
 * 发布包体检（world 版）—— 不跑 npm，按 package.json 的 files 算「装进别人机器后有什么」。
 *
 * 重点在 data/：lib/knowledge.js 的五份社区 JSON 只从这儿读，少一份装完
 * economy()/covenantStrength() 就是空的（2026-11-10 的发布包就是这么丢的）。
 * data/ 底下还堆着 166MB 录屏和 33MB 截图，所以 files 写的是 data/*.json，这里断言：
 *   1. 五份 JSON 都在包里
 *   2. data 只含 JSON，合计 < 1MB（别哪天又把 flv 带回来）
 *   3. files 写的路径都在盘上，包里没有 >2MB 的文件
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const IGNORE = new Set(['node_modules', '.git', 'shots', '__pycache__'])
const REQUIRED_DATA = ['covenants', 'economy', 'runflow', 'guides', 'live']
const DATA_BUDGET = 1024 * 1024

function walk(p, out = []) {
  const st = statSync(p)
  if (st.isFile()) { out.push({ path: p, bytes: st.size }); return out }
  for (const name of readdirSync(p)) if (!IGNORE.has(name)) walk(join(p, name), out)
  return out
}

/** files 支持 data/*.json 这种单层通配（npm 语义），这里按同一规则展开 */
function expand(entry) {
  const abs = join(ROOT, entry)
  if (!entry.includes('*')) return existsSync(abs) ? walk(abs) : null
  const slash = entry.lastIndexOf('/')
  const dir = entry.slice(0, slash) || '.'
  const suffix = entry.slice(entry.indexOf('*') + 1)
  if (!existsSync(join(ROOT, dir))) return null
  return readdirSync(join(ROOT, dir))
    .filter((n) => n.endsWith(suffix))
    .flatMap((n) => walk(join(ROOT, dir, n)))
}

const missing = []
const files = []
for (const entry of pkg.files || []) {
  const got = expand(entry)
  if (!got || !got.length) { missing.push(entry); continue }
  files.push(...got)
}
// files 之外 npm 还会自动带上这几个
for (const auto of ['package.json', 'README.md', 'LICENSE']) {
  const abs = join(ROOT, auto)
  if (existsSync(abs)) files.push({ path: abs, bytes: statSync(abs).size })
}

const seen = new Set()
const unique = files.filter((f) => (seen.has(f.path) ? false : seen.add(f.path)))
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')
const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const dataFiles = unique.filter((f) => rel(f.path).startsWith('data/'))
const dataBytes = dataFiles.reduce((n, f) => n + f.bytes, 0)

console.log('包内文件 ' + unique.length + ' 个，合计 ' + kb(unique.reduce((n, f) => n + f.bytes, 0)))
for (const entry of pkg.files || []) {
  const prefix = entry.split('*')[0]
  const sub = unique.filter((f) => rel(f.path).startsWith(prefix))
  console.log('  ' + entry.padEnd(16) + String(sub.length).padStart(3) + ' 个  ' + kb(sub.reduce((n, f) => n + f.bytes, 0)))
}

let bad = 0
if (missing.length) { bad++; console.log('✖ files 里写了但盘上没有：' + missing.join('、')) }
for (const name of REQUIRED_DATA) {
  if (!unique.some((f) => rel(f.path) === 'data/' + name + '.json')) {
    bad++
    console.log('✖ 包里缺 data/' + name + '.json —— 装完知识库是空的')
  }
}
const stray = dataFiles.filter((f) => !f.path.endsWith('.json'))
if (stray.length) { bad++; console.log('✖ data 里混进了非 JSON：' + stray.map((f) => rel(f.path)).slice(0, 5).join('、')) }
if (dataBytes >= DATA_BUDGET) { bad++; console.log('✖ data 合计 ' + kb(dataBytes) + '，超过 1 MB 上限') }
console.log('data 合计 ' + dataFiles.length + ' 个文件 ' + kb(dataBytes) + '（上限 ' + kb(DATA_BUDGET) + '）')

const fat = unique.filter((f) => f.bytes > 2 * 1024 * 1024)
if (fat.length) { bad++; console.log('✖ 有超大文件混进包里：' + fat.map((f) => rel(f.path) + ' ' + kb(f.bytes)).join('、')) }

if (!bad) console.log('✔ 打包体检通过：五份 JSON 都在，data ' + kb(dataBytes))
process.exit(bad ? 1 : 0)
