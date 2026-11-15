import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickSwap } from '../lib/covenantplan.js';
import { BENCH_STOP_BUY } from '../lib/restplan.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const COV = readFileSync(join(HERE, '..', 'lib', 'covenantplan.js'), 'utf8');

test('后期换人不再只认阶数真升级：同阶/大增益也放行（2026-11-14 22:1x 用户 m08251）', () => {
  // 来由：R8 起 lateRound 只认 tierUp，整备区 1~2 阶、场上 2~4 阶 → 一次都换不动，
  // 整备区卡在 6 张 → 不买卡 → 连续 0 上场到死（上一局第 12 回合）。
  assert.ok(COV.includes('const sameTierGain'), '缺同阶换人判定');
  assert.ok(COV.includes('const bigGain = margin >= 4'), '缺大增益换人判定');
  assert.ok(COV.includes('const margin = !!(add && drop) ? addScore - keepScore : -99'), '没有统一的增益差');
  assert.ok(COV.includes('tierUp || sameTierGain || bigGain'), '换人闸门没并进新规则');
});

test('高阶换低阶本来就放行（真名回归）', () => {
  const r = pickSwap({ bench: [{ name: '灵知' }], board: [{ name: '哈洛德' }], round: 10 });
  assert.ok(r && r.drop, '4 阶换 2 阶都应该放行，实际：' + (r && r.reason));
  assert.equal(r.drop.name, '哈洛德');
});

test('整备区停买线 6 → 8（6 张就停买会把三合一/换人全卡死）', () => {
  assert.equal(BENCH_STOP_BUY, 10);
  const SRC = readFileSync(join(HERE, '..', 'lib', 'restplan.js'), 'utf8');
  assert.ok(SRC.includes('export const BENCH_STOP_BUY = 10'), '停买线没改成 10');
  assert.ok(SRC.includes('export const BENCH_CAP = 10'), '上限应保持 10');
});

test('同一回合不许把同一个「要上的人」规划两次（免得白撤场上的人）', async () => {
  const { planRecallSwap } = await import('../lib/covenantplan.js');
  const bench = [{ name: '角峰' }, { name: '初雪' }];
  const board = [{ name: '哈洛德', px: [715, 444], tier: 2 }, { name: '泡泡', px: [1086, 447], tier: 2 }];
  const first = planRecallSwap({ bench, board, covenants: ['维多利亚'], round: 6 });
  assert.ok(first && first.drop, '第一次应该能换：' + (first && first.reason));
  const addName = first.add && first.add.name;
  assert.ok(addName, '第一次换人应该有要上的人');
  // 换完之后再规划一次，必须避开刚规划过的那个人；两个都想上过就返回「不换」。
  const second = planRecallSwap({ bench, board, covenants: ['维多利亚'], round: 6, avoidAdd: [addName] });
  assert.ok(!second.add || second.add.name !== addName, '第二次又上同一个人：' + (second.add && second.add.name));
  const all = ['角峰', '初雪'];
  const third = planRecallSwap({ bench, board, covenants: ['维多利亚'], round: 6, avoidAdd: all });
  assert.equal(third.drop, null, '都规划过了还在找人来撤');
  assert.match(String(third.reason), /规划过/)
});
test('换上来就能激活一个盟约时，即使分数不划算也要换（用户 m08866 要 3 个盟约）', async () => {
  const { pickSwap, covenantCounts } = await import('../lib/covenantplan.js');
  const board = [{ name: '哈洛德', px: [715, 444] }, { name: '初雪', px: [1086, 447] }];
  const before = covenantCounts(['哈洛德', '初雪']).find((c) => c.name === '谢拉格');
  assert.equal(before && before.count, 2, '夹具前提：场上谢拉格应该正好 2 个');
  const r = pickSwap({ bench: [{ name: '雪猎' }], board, covenants: ['维多利亚', '谢拉格', '叙拉古'], round: 9 });
  assert.ok(r && r.drop, '补上就是 3/3，不该卡在「换人不划算」：' + (r && r.reason));
  assert.equal(r.add.name, '雪猎');
  const SRC = readFileSync(join(HERE, '..', 'lib', 'covenantplan.js'), 'utf8');
  assert.ok(SRC.includes('completesActivation'), 'pickSwap 少了「补激活放行」那条判据');
  assert.ok(/tierUp \|\| sameTierGain \|\| bigGain \|\| completesActivation/.test(SRC), '放行条件没接上 completesActivation');
});