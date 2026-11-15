import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBarStacks } from '../lib/covenants.js';

// 2026-11-15 04:2x：用户验收标准「凑出 3 个盟约并且叠层」只有游戏顶栏能作证。
// covnames.py 的 OCR 会把层数一起吐出来（数字在名字上方几像素），这里锁住配对规则。

function row(text, x, y, w = 50, h = 30) {
  return { text, box: [x, y, w, h] };
}

test('层数在名字上方 → 配得上', () => {
  const rows = [
    row('坚守', 544, 168, 50, 32),
    row('5', 561, 146, 16, 21),
    row('不屈', 663, 168, 50, 32),
    row('5', 678, 146, 19, 21),
    row('谢拉格', 894, 169, 68, 30),
  ];
  const bar = parseBarStacks(rows);
  assert.deepEqual(bar.map((b) => [b.name, b.stacks]), [['坚守', 5], ['不屈', 5], ['谢拉格', null]]);
});

test('数字在名字下方 → 不配（不能把血量/费用当层数）', () => {
  const rows = [row('精准', 785, 171, 48, 28), row('2', 800, 205, 16, 16)];
  assert.deepEqual(parseBarStacks(rows), [{ name: '精准', stacks: null }]);
});

test('数字横向差太远 → 不配', () => {
  const rows = [row('炎', 300, 170, 30, 30), row('3', 600, 148, 16, 20)];
  assert.deepEqual(parseBarStacks(rows), [{ name: '炎', stacks: null }]);
});

test('不是盟约名的文字不进来', () => {
  const rows = [row('休整', 100, 170), row('9', 110, 146, 16, 20)];
  assert.deepEqual(parseBarStacks(rows), []);
});

test('真实一帧（2026-11-15 04:16 look-0416.png）的 OCR 形状', () => {
  const rows = [
    row('坚守', 544, 168, 50, 32), row('5', 561.5, 151.5, 16.5, 16.5),
    row('不屈', 663.5, 168, 50.5, 32), row('5', 678.5, 146.5, 19, 21.5),
    row('精准', 785, 171.5, 48.5, 28.5),
    row('谢拉格', 894.5, 169.5, 68, 30.5),
    row('远见', 998, 170, 44, 28),
    row('奥术', 1100, 170, 44, 28),
    row('叙拉古', 1200, 170, 63, 28), row('4', 1215, 147, 16, 20),
  ];
  const bar = parseBarStacks(rows);
  const live = bar.filter((b) => Number(b.stacks) > 0).map((b) => b.name);
  assert.deepEqual(live, ['坚守', '不屈', '叙拉古']);
});

test('drive.js 会把顶栏实测层数写进 steps 与 data/covenant-bar.jsonl', () => {
  const src = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8');
  assert.ok(src.includes('顶栏盟约（实测，名字/层数）'), '缺顶栏实测日志');
  assert.ok(src.includes('★ 验收项达到'), '缺验收项达标日志');
  assert.ok(src.includes("new URL('../data/covenant-bar.jsonl'"), '缺落盘路径');
  assert.ok(src.includes('covGoalMet = true'), '缺 covGoalMet 标记');
});

// 2026-11-15 05:0x：调用方一开局就给足 3 个核心盟约时 covStale=false，整局不读画面 →
// 「顶栏盟约（实测，名字/层数）」永远不出现（trace 20-56-25 实测）。每局至少读一次。
test('顶栏层数每局至少读一次画面', () => {
  const src = readFileSync(new URL('../lib/drive.js', import.meta.url), 'utf8')
  assert.match(src, /opts\.__barReadOnce !== true/, 'covShouldRead 必须带上「本局还没读过」这个条件')
  assert.match(src, /opts\.__barReadOnce = true/, '读成功后打标记，别每回合都烧 OCR')
})
