/**
 * 跑 world/test 下所有 *.test.mjs 与 *.mjs 测试（一次一个进程，互相不污染）。
 * package.json 的 test 只串了 8 个；这个脚本跑全量，报告 BAD 列表。
 * 用法：node scripts/test-all.mjs [关键字]
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const testDir = join(here, '..', 'test')
const filter = process.argv[2] || ''
const skip = new Set(['manual-drive.mjs'])
const files = readdirSync(testDir)
  .filter((f) => f.endsWith('.mjs') && !skip.has(f) && (!filter || f.includes(filter)))
  .sort()

// 这台机的 python 只装在 C:/Python314，PIL 在 PYTHONPATH 里（cwd 必须是工作区根）——
// 不注入的话 level-read / vision 会 ModuleNotFoundError: No module named 'PIL'，看着像代码坏了。
const env = {
  ...process.env,
  PYTHONPATH: process.env.PYTHONPATH || '../~/Python/Python314/site-packages',
  COOP_OCR_PYTHON: process.env.COOP_OCR_PYTHON || 'C:/Python314/python.exe',
  COOPANION_PYTHON: process.env.COOPANION_PYTHON || 'C:/Python314/python.exe',
}

const bad = []
const t0 = Date.now()
for (const f of files) {
  const r = spawnSync(process.execPath, [join(testDir, f)], { encoding: 'utf8', timeout: 180_000, env })
  const out = (r.stdout || '') + (r.stderr || '')
  const pass = r.status === 0 && !/\bFAIL\b|not ok|AssertionError/.test(out)
  if (!pass) bad.push({ file: f, status: r.status, tail: out.split('\n').slice(-6).join(' | ') })
  console.log((pass ? 'ok   ' : 'BAD  ') + f + '  ' + ((out.match(/\d+\s*pass|\d+\s*ok/gi) || [''])[0]))
}
console.log('\n' + files.length + ' 个测试文件，' + (files.length - bad.length) + ' 通过，' + bad.length + ' 失败，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
for (const b of bad) console.log('BAD ' + b.file + ' status=' + b.status + ' :: ' + b.tail)
process.exit(bad.length ? 1 : 0)
