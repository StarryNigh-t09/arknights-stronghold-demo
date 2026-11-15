import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DRIVE = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');
const MAP = readFileSync(join(HERE, '..', 'data', 'maps', 'wz-01.json'), 'utf8');
const GAMEMAP = readFileSync(join(HERE, '..', 'lib', 'gamemap.js'), 'utf8');
import { planTilesForNames, loadGameMap } from '../lib/gamemap.js';

test('布阵兜底也守职业纪律：远程/医疗只许上高台（2026-11-14 第 5 回合真机）', () => {
  // 来由：卡涅利安（术师）计划落 (6,2)，第一格「拎不起来」被标死后，兜底「就近挑空位」
  // 把她扔到 (7,2)/(7,1) 敌人通道格。用户 m06708「把灰喉放这么前面」说的就是这种。
  assert.ok(DRIVE.includes('const roleSafePool = (item, arr) => {'), '缺 roleSafePool 实现');
  assert.ok(DRIVE.includes("if (rk !== 'ranged' && rk !== 'healer') return arr"), 'roleSafePool 没按职业放行');
  const used = DRIVE.match(/pickCell\(item, poolFor\(item, roleSafePool\(item, (tiles|baseTiles)\)\)\)/g) || [];
  assert.ok(used.length >= 3, '兜底的三处 pickCell 都要过 roleSafePool，实际 ' + used.length + ' 处');
});

test('roleSafePool 认的是地图里 walk=true 的通道格', () => {
  assert.ok(DRIVE.includes('.filter((c) => c && c.walk && Array.isArray(c.px))'), 'walk 通道格集合没建出来');
  assert.ok(DRIVE.includes('const walkPxKeys = new Set('), '缺 walkPxKeys');
});

test('升级后金币读数兜底：probe 读成 0 要复核一次整屏 OCR（2026-11-14 第 3 回合）', () => {
  assert.ok(DRIVE.includes('升级后金币复核：probe 读成 0 → 整屏 OCR 读成 '), '缺金币复核日志');
  assert.ok(DRIVE.includes('let moneyAfter = after.money'), '缺 moneyAfter 变量');
});

test('认人闸门不再只认 benchLeft：甲板上有牌就认（2026-11-14 全牌无名 → 远程前排）', () => {
  assert.ok(DRIVE.includes("(benchLeft > 0 || unknownN > 0 || (Array.isArray(sc.chips) && sc.chips.length > 0))"), '认人闸门没放宽');
});

test('连续拎不起来要当场重读名额（2026-11-14 第 8 回合白烧 62s）', () => {
  // 撤回换来的名额是一次性的：上完 1 个名额又归零，可 opts.slotsLeft 还是回合开头的读数，
  // 于是剩下的牌各试 3~4 格全拎不起来，还把好格标死写进 map-issues。
  assert.ok(DRIVE.includes('连续 2 格拎不起来 → 重读名额：'), '缺重读名额日志');
  assert.ok(/if \(noPendingTiles === 2\) \{/.test(DRIVE), '缺 noPendingTiles === 2 的重读闸门');
  assert.ok(DRIVE.includes('opts.slotsLeft = fs2'), '重读结果没写回 opts.slotsLeft');
});

test('开局不许拿商店卡当整备区种账（2026-11-14 19:48 新局：种了 6 条假账 → 第 1 回合只买 2 张）', () => {
  // 来由：trace-night-2026-11-14T11-48-11 —— 新开一局开局商店是展开的，scanDeckChips 数到 5~6 张商品卡，
  // 直接 deck = Array.from({length:n}) 种下 6 条空名假账 → 整备区 6/10 撞 BENCH_STOP_BUY → 「买 拜松 → 卖 拜松」空转。
  assert.ok(DRIVE.includes('const reliable = !!(sc && sc.ok && sc.chips && !sc.lowConfidence && !shopOn)'), '种账前没查置信/商店态');
  assert.ok(DRIVE.includes('const shopOn = (() => { try { return SHOP_OPEN_NOW === true || shopIsOpen(peek()) } catch { return true } })()'), '缺 shopOn 判定（读不到就当商店展开，不种账）');
  assert.ok(DRIVE.includes('const n = reliable ? sc.chips.length : 0'), 'n 还没受 reliable 约束');
});

test('升级后钱两次都读成 0 时按账算（2026-11-14 21:0x 第 3 回合：钱 7→0 白丢 4 块）', () => {
  // 来由：.tmp/verify-fix6.log —— 升级前 7 块、升级费 3，probe 与整屏 OCR 都读成 0（动画盖住金币），
  // 于是整回合「钱已花光 → 不冻结」，4 块没花出去。两次都 0 时按「升级前 − 升级费」估算，并记明是估算。
  assert.ok(DRIVE.includes('升级后钱两次都读成 0 → 按账算 '), '缺按账算兜底日志');
  assert.ok(DRIVE.includes('moneyAfter = Math.max(0, Number(before.money) - paid)'), '没按升级费算余额');
  assert.ok(/const paid = Number\(costBefore\)/.test(DRIVE), '没取升级费 costBefore');
});

test('远程/医疗站位按用户规矩：x=5、6 高台优先，2 列只作溢出；高台占满就不上（2026-11-14 21:3x 用户 m08045）', () => {
  // 来由：wz-01.json 的 ranged 原来把最左的 (2,2)(2,3)(2,1) 排在最前，真机 trace-night-2026-11-14T13-03-54 里
  // 空弦/初雪/旅骨/灵知 全被塞到 2 列（地图最左、打不到从右边来的敌人），还有 初雪→(7,1) 1311,354(远程)(就近)
  // 落到敌人通道格。用户 m08045「你的干员又是乱摆的」说的就是这个。
  // 用户原规则：重装 x=7、8；近战居中；医疗/远程 x=5、6 高台；远程射程要够到 x=9；全部朝右。
  assert.ok(MAP.includes('"userRule"'), '地图里没有把用户站位规矩写下来');
  const ranged = JSON.parse(MAP).deployOrder.ranged;
  assert.deepEqual(ranged.map((t) => t[0] + ',' + t[1]), ['5,2', '6,3', '6,2'], 'ranged 只该用 5/6 列高台（2 列打不到 x=9，m10907 不许再排进去）');
  const healer = JSON.parse(MAP).deployOrder.healer;
  assert.ok(healer[0][0] >= 5 && healer[1][0] >= 5, 'healer 前两格应该是 5/6 列高台');
  // 代码侧：远程/医疗不再放宽到 walk 格；放不下就跳过（不许丢进通道）
  assert.ok(GAMEMAP.includes("for (const pass of (strict ? [true] : [true, false])) {"), '远程/医疗还在走放宽那一遍');
  assert.ok(GAMEMAP.includes('if (strict) return { cell: null, pattern, fixed: false, roleKey }'), 'strict 角色没返回 null');
  assert.ok(GAMEMAP.includes("if (roleKey === 'ranged' || roleKey === 'healer') continue"), '队列遇到空高台没有跳过');
});

test('按当前地图排位：狙击/医疗落在 5/6 列高台，重装落在 7 列（真机回归）', () => {
  const out = planTilesForNames(['夜莺', '空弦', '初雪', '角峰', '伺夜'], loadGameMap(), []);
  const byName = Object.fromEntries(out.map((o) => [o.name, o.col + ',' + o.row]));
  assert.equal(byName['夜莺'], '6,2', '医疗没站到 6 列高台');
  assert.equal(byName['空弦'], '5,2', '狙击没站到 5 列高台');
  assert.equal(byName['初雪'], '6,3', '辅助没站到 6 列高台');
  assert.equal(byName['角峰'], '7,1', '重装没站到 7 列前排');
});

test('棋盘占格误报：木板/木箱格不当占格（2026-11-14 21:5x trace 13-43-52 第 2 回合）', () => {
  // 来由：场上只站 2 人，boardocc 报 5 个占格；(5,2) 1086,447 是旧木板、(4,1) 964,350 是木箱。
  // 误剔掉 5 列高台 → 远程退到最左 2 列、打不到从右边来的敌人（用户 m08045）。
  const ignored = JSON.parse(MAP).boardoccIgnorePx;
  assert.deepEqual(ignored, [[1086, 447], [964, 350]], '地图里没有记录这两个误报点');
  assert.ok(DRIVE.includes('棋盘实测剔掉已知误报格 '), '缺误报剔除日志');
  assert.ok(DRIVE.includes('const isIgnored = (t) => ignorePx.some'), '没有按地图忽略表过滤');
  assert.ok(DRIVE.includes('if (isIgnored(t) && !ledgerHas(t)) { skipped++; continue }'), '过滤时没保留账本里明确记着的占格');
});

test('近战/重装兜底不许落到高台（用户 m08045 站位规矩）', () => {
  assert.ok(DRIVE.includes("if (rk === 'tank' || rk === 'melee') {"), '近战/重装没做通道格过滤');
  assert.ok(DRIVE.includes("const fy = arr.filter((t) => t && walkPxKeys.has(t[0] + ',' + t[1]))"), '通道格过滤没接 walkPxKeys');
});
