/**
 * 战术决策选卡规则（用户 2026-11-10 15:31 给的规矩）：
 * 本局在玩维多利亚/助力 → 右1「白铁的盟誓」；否则优先队友也有增益的左1/中。
 * 跑法：node test/tactic.test.mjs（沙箱里 node --test 会 spawn EPERM）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tacticPreference, TACTIC, TACTIC_COVENANT_BOOST } from '../lib/run.js';

test('tacticPreference：有维多利亚就先把右1排第一', () => {
  const p = tacticPreference({ covenants: ['精准', '维多利亚'] });
  assert.equal(p.order[0], 2, '右1 是白铁的盟誓');
  assert.ok(p.reason.includes('维多利亚'));
});

test('tacticPreference：助力同理', () => {
  assert.equal(tacticPreference({ covenants: ['助力'] }).order[0], 2);
});

test('tacticPreference：没有这两种盟约就走默认（左1 财富优先）', () => {
  const p = tacticPreference({ covenants: ['精准', '谢拉格', '奥术'] });
  assert.equal(p.order[0], 0, '左1「财富」+1 资金，队友也有');
  assert.equal(p.order[1], 1, '中「补给」2 次免费刷新');
});

test('tacticPreference：空盟约也不崩，返回完整三张的顺序', () => {
  const p = tacticPreference();
  assert.deepEqual([...p.order].sort(), [0, 1, 2]);
});

test('TACTIC_COVENANT_BOOST 只有维多利亚和助力', () => {
  assert.deepEqual(TACTIC_COVENANT_BOOST.slice().sort(), ['助力', '维多利亚'].sort());
  assert.equal(TACTIC.cards.length, 3);
});
