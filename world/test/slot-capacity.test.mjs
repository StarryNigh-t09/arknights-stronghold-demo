import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const drive = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8')

// 2026-11-15 04:4x：名额 OCR 在「场上已满」时读成 1~2 → 每回合拿假额度试 6~10 格白烧 60~120s，
// 而且永远走不到「名额 0 → 撤回换人」。这里用容量口径（上限 = 5 + 调度中心等级）收紧名额。
test('名额按容量口径收紧：公式与日志都在', () => {
  assert.match(drive, /const lvCap = 5 \+ lvNow/)
  assert.match(drive, /名额按容量口径收紧：读作 /)
  assert.match(drive, /occN >= lvCap/, '只在占格顶到容量附近才收紧，避免误撤好人')
  assert.match(drive, /remaining == null \|\| Number\(remaining\) <= 2/, 'OCR 读 0 或 >2 都不动')
})

test('收紧发生在撤回换人之前（不然永远走不到换人）', () => {
  const capAt = drive.indexOf('名额按容量口径收紧')
  const recallAt = drive.indexOf('const rp = planRecallSwap(')
  assert.ok(capAt > 0 && recallAt > 0)
  assert.ok(capAt < recallAt, '容量收紧必须在「名额 0 → 撤回再部署」之前')
})
