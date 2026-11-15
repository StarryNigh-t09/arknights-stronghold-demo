/**
 * 目标阵容清单（用户 2026-11-10 15:46：开局列清单，照着买）
 * 跑法：node test/wants.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { wantScore, buildWantList, wantGaps, pickFromShop } from '../lib/wants.js';

const pool = [
  { name: '灰喉', tier: 3, covenants: ['精准'], cls: '狙击' },
  { name: '拜松', tier: 2, covenants: ['坚守'], cls: '重装' },
  { name: '星源', tier: 4, covenants: ['助力'], cls: '术师' },
  { name: '流明', tier: 5, covenants: ['调和'], cls: '医疗' },
  { name: '深靛', tier: 1, covenants: ['精准', '奥术'], cls: '术师' },
];

test('wantScore：叠层比阶数重要（3阶叠两盟约 > 4阶不叠）', () => {
  const a = wantScore(pool[4], { activeCovenants: ['精准', '奥术'] }); // 1阶 + 2*2.5 = 6
  const b = wantScore(pool[2], { activeCovenants: ['精准'] });        // 4阶 + 0 = 4
  assert.ok(a.score > b.score, '1阶双盟约 6 > 4阶单挂 4');
});

test('buildWantList：按职业配额先补齐，再按分数补满', () => {
  const list = buildWantList({ pool, activeCovenants: ['精准'], quota: { 医疗: 1 }, limit: 3 });
  assert.equal(list.length, 3);
  assert.ok(list.some((x) => x.cls === '医疗'), '医疗配额必须占一个位置');
  assert.equal(new Set(list.map((x) => x.name)).size, 3, '不能重复');
});

test('buildWantList：limit 生效，且清单里每条都有理由', () => {
  const list = buildWantList({ pool, activeCovenants: [], limit: 2 });
  assert.equal(list.length, 2);
  for (const it of list) assert.ok(it.why && it.why.length, it.name + ' 缺 why');
});

test('buildWantList：maxTier 把关（前期只列便宜卡）', () => {
  const list = buildWantList({ pool, activeCovenants: [], limit: 8, maxTier: 2 });
  assert.ok(list.length > 0, '应该还有卡');
  for (const it of list) assert.ok(it.tier <= 2, it.name + ' 阶数 ' + it.tier + ' 超了 maxTier');
});

test('wantGaps：场上有的算已有，缺口归零', () => {
  const list = buildWantList({ pool, activeCovenants: [], limit: 3 });
  const gaps = wantGaps({ wantList: list, owned: {}, onBoard: [list[0].name] });
  assert.ok(!gaps.some((g) => g.name === list[0].name), '已在场上就不该再算缺口');
  assert.equal(gaps.length, list.length - 1);
});

test('pickFromShop：按清单顺序挑，买不起就跳过找下一个', () => {
  const list = buildWantList({ pool, activeCovenants: [], limit: 3 });
  const shop = list.map((x, i) => ({ name: x.name, cost: i === 0 ? 9 : 2 }));
  const hit = pickFromShop({ shop, gaps: wantGaps({ wantList: list }), money: 3 });
  assert.ok(hit, '应该挑到一张');
  assert.equal(hit.name, list[1].name, '第一张 9 费买不起，取第二张');
});

test('pickFromShop：店里没有清单上的卡就返回 null（交给兜底打分）', () => {
  const list = buildWantList({ pool, activeCovenants: [], limit: 2 });
  const hit = pickFromShop({ shop: [{ name: '路人甲', cost: 1 }], gaps: wantGaps({ wantList: list }), money: 9 });
  assert.equal(hit, null);
});
