/**
 * 装备按属性分（用户 m00999 硬规则）：攻击给输出、防御/生命给重装、同类取阶数最高。
 * 跑法：node test/equiporder.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEquip, planEquipAssignments, describeEquipPlan, MAX_EQUIP_PER_UNIT } from '../lib/equiporder.js';

const u = (name, roleGroup, x) => ({ name, roleGroup, chip: { x, y: 883 } });
const it = (name, tier, effect, extra = {}) => ({ name, tier, effect, chip: { x: 800, y: 775 }, ...extra });

test('分类：攻击件', () => {
  assert.equal(classifyEquip('攻击力+15%'), 'attack');
  assert.equal(classifyEquip('攻击力+20%；若携带者是地面干员则攻击时有10%概率使目标战栗2秒'), 'attack');
  assert.equal(classifyEquip('技力自然回复速度+0.15/秒'), 'attack');
});

test('分类：防御/生命件', () => {
  assert.equal(classifyEquip('防御力+20%'), 'defense');
  assert.equal(classifyEquip('生命上限+15%，使携带者更不容易受到攻击且阻挡数-1'), 'defense');
  assert.equal(classifyEquip('携带者无法被治疗，每秒回复75点生命值'), 'defense');
});

test('分类：消耗品与未识别', () => {
  assert.equal(classifyEquip('装备时销毁，并获得1资金'), 'utility');
  assert.equal(classifyEquip('装备时销毁，并使携带者所属盟约层数+3（无需激活盟约）'), 'utility');
  assert.equal(classifyEquip(''), 'unknown');
  assert.equal(classifyEquip('再部署时间-30%，生命上限-30%'), 'defense');
});

test('源石溶剂：先认攻击，不能因为写了生命值就归防御', () => {
  assert.equal(classifyEquip('携带者每秒流失60点生命值，攻击力+40%'), 'attack');
});

test('攻击件给远程输出，不给重装', () => {
  const res = planEquipAssignments(
    [it('维式重锤', 1, '攻击力+15%')],
    [u('拜松', 2, 964), u('灰喉', 1, 1081)]
  );
  assert.equal(res.plan.length, 1);
  assert.equal(res.plan[0].unit.name, '灰喉');
  assert.match(res.plan[0].reason, /攻击/);
});

test('防御件给近战承伤，不给狙击', () => {
  const res = planEquipAssignments(
    [it('坚守盾牌', 1, '防御力+20%')],
    [u('拜松', 2, 964), u('灰喉', 1, 1081)]
  );
  assert.equal(res.plan.length, 1);
  assert.equal(res.plan[0].unit.name, '拜松');
});

test('同类取阶数最高：高阶先分，再分低阶', () => {
  const res = planEquipAssignments(
    [it('维式重锤Ⅰ', 1, '攻击力+15%'), it('战栗维式重锤', 2, '攻击力+20%')],
    [u('灰喉', 1, 1081), u('初雪', 1, 1200)]
  );
  assert.equal(res.plan.length, 2);
  assert.equal(res.plan[0].item.name, '战栗维式重锤');
  assert.equal(res.plan[0].unit.name, '灰喉');
  assert.equal(res.plan[1].item.name, '维式重锤Ⅰ');
  assert.equal(res.plan[1].unit.name, '初雪');
});

test('每人最多两件，第三件没人可给就挂住', () => {
  const items = [it('a', 3, '攻击力+10%'), it('b', 2, '攻击力+10%'), it('c', 1, '攻击力+10%')];
  const res = planEquipAssignments(items, [u('灰喉', 1, 1081)]);
  assert.equal(MAX_EQUIP_PER_UNIT, 2);
  assert.equal(res.plan.length, 2);
  assert.equal(res.held.length, 1);
  assert.equal(res.held[0].item.name, 'c');
});

test('没有对应职业：不硬塞，记一条挂住', () => {
  const res = planEquipAssignments([it('坚守盾牌', 1, '防御力+20%')], [u('灰喉', 1, 1081)]);
  assert.equal(res.plan.length, 0);
  assert.equal(res.held.length, 1);
  assert.match(res.held[0].reason, /没有可用/);
});

test('消耗品不搬', () => {
  const res = planEquipAssignments([it('盟约之币', 1, '装备时销毁，并获得1资金')], [u('灰喉', 1, 1081)]);
  assert.equal(res.plan.length, 0);
  assert.match(res.held[0].reason, /消耗品/);
});

test('已经挂在目标身上：不重复拖', () => {
  const unit = u('灰喉', 1, 1081);
  const item = it('维式重锤', 1, '攻击力+15%', { chip: unit.chip, placed: true });
  const res = planEquipAssignments([item], [unit]);
  assert.equal(res.plan.length, 0);
  assert.match(res.held[0].reason, /已经挂在/);
});

test('空输入不炸', () => {
  assert.deepEqual(planEquipAssignments([], []), { plan: [], held: [] });
  assert.equal(planEquipAssignments([], [u('灰喉', 1, 1)]).plan.length, 0);
  const onlyUnits = planEquipAssignments([it('维式重锤', 1, '攻击力+15%')], []);
  assert.equal(onlyUnits.plan.length, 0);
  assert.match(onlyUnits.held[0].reason, /没有干员/);
});

test('日志摘要：攻击/防御/不动都能读出来', () => {
  const res = planEquipAssignments(
    [it('维式重锤', 1, '攻击力+15%'), it('盟约之币', 1, '装备时销毁，并获得1资金')],
    [u('灰喉', 1, 1081)]
  );
  const s = describeEquipPlan(res);
  assert.match(s, /灰喉/);
  assert.match(s, /不动：/);
});
