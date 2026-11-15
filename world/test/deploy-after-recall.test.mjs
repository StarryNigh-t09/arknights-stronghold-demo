import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DRIVE = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');

test('撤回再部署后：按名字清账本、按间距补按压点、标记本回合撤过人', () => {
  // trace-night-2026-11-14T16-04-21 第 12 回合实测：撤回 真理 后同一段又「撤回重复的 真理」，
  // 布阵又拿撤回前的坐标/少一个按压点去拖 → 「试 964,350 没拎起来」→ 整回合 0 上场、白扔 1 个名额。
  assert.ok(DRIVE.includes('撤回后按名字清账本：'), '撤回成功后没按名字清占格账本');
  assert.ok(DRIVE.includes('按中位间距 '), '按压点比账本少时没有按间距往左补');
  assert.ok(DRIVE.includes('recalledThisRound: recallSwapCount > 0'), '没有把「本回合撤过人」传给布阵');
  assert.ok(DRIVE.includes('opts.recalledThisRound === true && opts.chips && opts.chips.length'), '撤过人还沿用调用方的旧坐标');
});

test('名额只剩 1 也主动撤回换人（用户 m08866 高阶干员不上台）', () => {
  assert.ok(DRIVE.includes('if (remaining === 1 && opts.recall !== false'), '名额 1 没有换人入口');
  assert.ok(DRIVE.includes('名额只有 1 也换了人：'), '名额 1 换人没有日志');
  assert.ok(DRIVE.includes('remaining = Math.max(2, remaining)'), '换完没把名额还给布阵');
});

test('撤回没成 / 连格拎不起来时要先关掉干员详情面板（面板开着拖拽全被判单击）', () => {
  const SRC = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');
  // 2026-11-15 02:4x：helper 原来定义在 autoRest 的撤回闭包里，deployFromDeck 调用时
  // `ReferenceError: dismissPanelIfOpen is not defined`（trace 17-19-54 CRASH）→ 已提到模块级、显式接 opts。
  assert.ok(SRC.includes('const dismissPanelIfOpen = async (opts, why) =>'), '没有关面板的 helper（或没提到模块级）');
  assert.ok(SRC.indexOf('const dismissPanelIfOpen = async (opts, why) =>') < SRC.indexOf('async function deployFromDeck'), 'helper 必须在 deployFromDeck 之前定义，否则又是不在作用域');
  assert.ok(SRC.includes("st === 'wz_buydetail' || st === 'wz_buy' || st === 'wz_shopdetail'"), '没判详情面板状态');
  assert.ok(SRC.includes('tap(965, 240)'), '关面板的取消点不是 (965,240)');
  assert.ok(SRC.includes("await dismissPanelIfOpen(opts, '撤回没成')"), '撤回失败后没关面板');
  assert.ok(SRC.includes("await dismissPanelIfOpen(opts, '连续拎不起来')"), '连续拎不起来后没关面板');
});