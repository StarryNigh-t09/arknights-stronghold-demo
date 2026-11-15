// 2026-11-14 用户 m05970「撤回并部署」：名额满时的换人只能走「撤回一个 → 再正常部署」。
// 这条锁防止以后有人把「把甲板牌拖到已占格」那条真机全灭的老路又填回来。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8')

test('名额 0 分支里有撤回再部署：planRecallSwap + recallViaBench 接到一起', () => {
  assert.match(SRC, /planRecallSwap\(\{/)
  assert.match(SRC, /const recallViaBench = async/)
  assert.ok((SRC.match(/recallViaBench\(/g) || []).length >= 2, '两处调用：重复干员 + 盟约换人')
  assert.match(SRC, /名额 0 → 撤回/)
})

test('撤回失败就收手，不再退回「拖已占格」', () => {
  assert.equal(/replaceTurn\s*=\s*true/.test(SRC), false, 'replaceTurn = true 已删')
  assert.equal(/replace:\s*replaceTurn/.test(SRC), false, 'deployFromDeck 不再传 replace')
  assert.match(SRC, /撤回也没成 → 本回合收手/)
})

test('整备区满 10 张时先卖一张再撤回', () => {
  assert.match(SRC, /benchLeft >= BENCH_CAP/)
  assert.match(SRC, /先卖/)
})

test('撤回成功后账本/占格一起同步（否则名字和甲板错位）', () => {
  assert.match(SRC, /opts\.boardSlots\.splice\(bi, 1\)/)
  assert.match(SRC, /deck\.push\(\{ index: deckSeq\+\+, name: victimName/)
})

test('一回合最多撤 3 次（2026-11-15 用户 m08866：台下高阶牌一直上不去）', () => {
  assert.match(SRC, /recallSwapCount >= maxRecalls/)
  assert.match(SRC, /recallSwapCount \+= 1/)
  assert.match(SRC, /opts\.maxRecallsPerRound/)
  assert.equal(/recallSwappedThisRound/.test(SRC), false, '一次性布尔已换成计数器')
})

test('没有占格时先现读一帧棋盘，再挑该撤谁', () => {
  assert.match(SRC, /detectOccupiedTiles\(screenshot\(\), loadGameMap\(\)\)/)
  assert.match(SRC, /棋盘实测：站着人的格/)
  assert.match(SRC, /opts\.occupiedPx\.add\(kNow\)/)
})

test('撤回成功判据是「原格没干员」，不是甲板张数（2026-11-14 18:0x 真机：甲板 9→7 误判失败）', () => {
  assert.match(SRC, /unitStillOnTile/)
  assert.match(SRC, /原格已空/)
  assert.match(SRC, /原格还站着人/)
  // 张数只在棋盘读不出来时兜底
  assert.match(SRC, /ok = b0 >= 0 \? b1 > b0 : true/)
})

test('卖卡腾格子之后要复核张数，没少就换候选（卖 220,882 拖了个寂寞）', () => {
  assert.match(SRC, /卖完必须复核张数/)
  assert.match(SRC, /没成（甲板 ' \+ n0 \+ '→' \+ n1 \+ ' 张）→ 换下一个候选/)
})

// 2026-11-15 04:2x：撤回判据再加一道 sd 闸（真机「撤回 1081,351 没成（原格还站着人）」其实是木板纹理）。
test('撤回判据：原格 sd<80 的纹理不算站着人', () => {
  const src = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8');
  assert.ok(src.includes('const detail = Array.isArray(occ.detail) ? occ.detail : []'), '缺 detail 取用');
  assert.ok(src.includes('if (near && Number(near.sd) < 80) return false'), '缺 sd<80 闸');
  // 闸必须在「按 tiles 判占格」之前，否则等于没加
  const iGuard = src.indexOf('if (near && Number(near.sd) < 80) return false');
  const iTiles = src.indexOf('return occ.tiles.some((t) => !isIgnored(t)', iGuard);
  assert.ok(iGuard > 0 && iTiles > iGuard, '闸的位置不对');
});
