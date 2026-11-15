/**
 * 盟约读取（用户 m02381：实测要带上决策层）。
 * 跑法：node test/covenant.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCovenantNames, knownCovenantNames } from '../lib/covenants.js';

test('名单接进来了：大盟约 + 小盟约都在，且按长度降序', () => {
  const k = knownCovenantNames();
  assert.ok(k.length >= 20, '名单只有 ' + k.length + ' 条');
  for (const n of ['乌萨斯', '聚合', '精准', '奥术']) assert.ok(k.includes(n), '缺 ' + n);
  for (let i = 1; i < k.length; i++) assert.ok(k[i - 1].length >= k[i].length, '没按长度降序');
});

test('干净文本：直接给名字就认出来', () => {
  const got = parseCovenantNames(['聚合', '坚守', '不屈']);
  assert.deepEqual(got, ['聚合', '坚守', '不屈']);
});

test('带层数/噪声：名字和数字挤在一行也认', () => {
  const got = parseCovenantNames(['聚合 4', '坚守:', '不屈 1', '奥术·0']);
  assert.deepEqual(got, ['聚合', '坚守', '不屈', '奥术']);
});

test('粘连文本：多个名字粘成一串，按最长优先全认出', () => {
  const got = parseCovenantNames(['聚合4坚守1不屈1助力0']);
  assert.deepEqual(got.slice().sort(), ['不屈', '助力', '坚守', '聚合'].sort());
});

test('单字盟约只认整串，别把「炎魔」算成「炎」', () => {
  assert.deepEqual(parseCovenantNames(['炎']), ['炎']);
  assert.deepEqual(parseCovenantNames(['炎魔']), []);
  assert.deepEqual(parseCovenantNames(['炎', '炎魔']), ['炎']);
});

test('去重 + 上限：同名词出现多次只留一份，超 limit 截断', () => {
  assert.deepEqual(parseCovenantNames(['聚合', '聚合', '聚合4']), ['聚合']);
  const many = ['乌萨斯', '伊比利亚', '卡西米尔', '叙拉古', '维多利亚', '莱塔尼亚', '萨尔贡', '谢拉格', '阿戈尔', '精准'];
  const got = parseCovenantNames(many, knownCovenantNames(), { limit: 4 });
  assert.equal(got.length, 4);
});

test('空输入/坏输入不炸', () => {
  assert.deepEqual(parseCovenantNames([]), []);
  assert.deepEqual(parseCovenantNames(null), []);
  assert.deepEqual(parseCovenantNames([null, undefined, '', '   ']), []);
  assert.deepEqual(parseCovenantNames(['今天天气不错']), []);
});
