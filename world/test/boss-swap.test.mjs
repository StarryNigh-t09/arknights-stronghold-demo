// 2026-11-14 18:2x：BOSS 回合名额早就是 0（场上满 10 人），bossplan 的目标站位以前只打日志、一次没执行。
// 这条锁住「BOSS 回合走 bossSwapOnce（场上互换，不花名额）」，别又退回只打日志。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8')

test('BOSS 回合收尾走 bossSwapOnce，而不是普通 swapBoardOnce', () => {
  assert.match(SRC, /async function bossSwapOnce/)
  assert.match(SRC, /if \(boss\) \{/)
  assert.match(SRC, /BOSS 站位：\' \+ bw\.msg/)
  assert.match(SRC, /bossLayoutFor\(names, map\)/)
  assert.match(SRC, /planBossSwaps\(list, bl, \{ bench: names \}\)/)
})

test('BOSS 换位不碰名额/账本数量，只改 px', () => {
  const i = SRC.indexOf('async function bossSwapOnce')
  const j = SRC.indexOf('export async function autoRest', i)
  const body = SRC.slice(i, j)
  assert.equal(/remaining\s*-=/.test(body), false, 'BOSS 换位不该减名额')
  assert.equal(/deck\.push\(/.test(body), false, 'BOSS 换位不该往整备区加牌')
  assert.match(body, /me\.px = \[sw\.px\[0\], sw\.px\[1\]\]/)
})
