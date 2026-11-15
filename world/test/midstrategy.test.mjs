// 2026-11-15 10:0x：中途「2/3 选择策略」页会让整局停手（trace 01-41-45 第 13 回合打完读到 wz_strategy）。
// 这个文件锁住「waitFor 认得这一页 + 点第一张 + 确认」这条链路。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8')
const RUN = readFileSync(new URL('../lib/run.js', import.meta.url), 'utf8')

test('三处等待列表都带上 wz_strategy', () => {
  const hits = SRC.match(/waitFor\(\['wz_rest', 'wz_prep', 'wz_settle', 'wz_tactic', 'wz_strategy'\]/g) || []
  assert.equal(hits.length, 3, '三处（战斗后 / autoRun 主循环 / 回合间）都要带')
})

test('中途选策略的 helper 存在且用的是开局同一套坐标', () => {
  assert.ok(SRC.includes('const pickStrategyMidRun = async (opts, why) => {'))
  const i = SRC.indexOf('const pickStrategyMidRun')
  const seg = SRC.slice(i, i + 700)
  assert.match(seg, /tapAt\(POINTS\.strategyCard0/)
  assert.match(seg, /tapAt\(POINTS\.setupReady/)
  // 坐标真源在 run.js 的 POINTS
  assert.match(RUN, /strategyCard0: \[575, 360\]/)
  assert.match(RUN, /setupReady: \[1655, 982\]/)
})

test('三处都真的调用了 helper（否则只是把状态名加进列表）', () => {
  const calls = SRC.match(/pickStrategyMidRun\(opts, '/g) || []
  assert.equal(calls.length, 3)
  assert.ok(SRC.includes("pickStrategyMidRun(opts, '进休整期前')"))
  assert.ok(SRC.includes("pickStrategyMidRun(opts, '战斗后')"))
  assert.ok(SRC.includes("pickStrategyMidRun(opts, '回合间')"))
})

test('选完还要再等一次休整期，不能直接判失败', () => {
  const i = SRC.indexOf("pickStrategyMidRun(opts, '进休整期前')")
  const seg = SRC.slice(i, i + 500)
  assert.match(seg, /w = await waitFor\(\['wz_rest', 'wz_prep', 'wz_settle'\]/)
})
