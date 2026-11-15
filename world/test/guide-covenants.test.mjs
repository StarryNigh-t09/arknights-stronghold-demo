import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGuideRank, coreGroupScore, chooseCoreGroup, guideCovenantWeight, guideWeightMap, guideTargets } from '../lib/guideplan.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RUN = readFileSync(join(HERE, '..', 'lib', 'run.js'), 'utf8');
const DRIVE = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');
const COV = readFileSync(join(HERE, '..', 'lib', 'covenantplan.js'), 'utf8');

test('攻略频次表就是文档那张表（160 篇统计）', () => {
  const g = loadGuideRank();
  assert.equal(g.big[0].name, '莱塔尼亚');
  assert.equal(g.big[0].count, 40);
  assert.equal(g.big[1].name, '伊比利亚');
  assert.equal(g.small[0].name, '绝技');
  assert.equal(g.small[0].count, 143);
  assert.ok(g.source.includes('guide-skland-2026-11-13'), '没有记录数据来源');
});

test('核心盟约按攻略热度选组：伊比利亚(37) 压过 谢拉格(15)', () => {
  const r = chooseCoreGroup(['叙拉古', '乌萨斯', '伊比利亚'], ['谢拉格']);
  assert.equal(r.group, 'A');
  assert.equal(r.left.name, '伊比利亚');
});

test('右组有更热门的大盟约就切过去', () => {
  const r = chooseCoreGroup(['叙拉古', '萨尔贡'], ['莱塔尼亚', '炎']);
  assert.equal(r.group, 'B');
  assert.equal(r.right.name, '莱塔尼亚');
});

test('两组都认不出来时保持 A 组（左边是游戏默认选中）', () => {
  const r = chooseCoreGroup([], []);
  assert.equal(r.group, 'A');
});

test('攻略热度权重：热门盟约更重、冷门更轻、未知不加权', () => {
  assert.ok(guideCovenantWeight('莱塔尼亚') > guideCovenantWeight('叙拉古'));
  assert.ok(guideCovenantWeight('绝技') > guideCovenantWeight('远见'));
  assert.equal(guideCovenantWeight('不存在的盟约'), 1);
  const m = guideWeightMap();
  assert.ok(m['伊比利亚'] > 1 && m['伊比利亚'] <= 1.5);
});

test('目标盟约顺序：核心按攻略榜单排，再接小盟约', () => {
  const t = guideTargets(['叙拉古', '伊比利亚']);
  assert.equal(t[0], '伊比利亚');
  assert.equal(t[1], '叙拉古');
  assert.ok(t.includes('绝技') && t.includes('精准'), '小盟约没接上');
});

test('接线：run.js 选组、drive.js 落优先序、covenantplan 乘权重', () => {
  assert.ok(RUN.includes('chooseCoreGroup('), 'run.js 没接攻略选组');
  assert.ok(RUN.includes('按攻略选核心盟约：'), 'run.js 没记录选组依据');
  assert.ok(RUN.includes("gp.group === 'B' && right.length"), '右组切换还缺空数组保护');
  assert.ok(DRIVE.includes('攻略盟约优先序（'), 'drive.js 没记录攻略优先序');
  assert.ok(DRIVE.includes('opts.guideWeight = guideWeightMap(g)'), 'drive.js 没生成攻略权重');
  assert.ok(DRIVE.includes('guideWeight: opts.guideWeight || null'), 'covenantCtx 没传攻略权重');
  assert.ok(COV.includes('ctx.guideWeight'), 'covenantplan 没读攻略权重');
});
