import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchDeployOrder } from '../lib/covenantplan.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DRIVE = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');
const COV = readFileSync(join(HERE, '..', 'lib', 'covenantplan.js'), 'utf8');

test('上台优先序：差 1 个激活的盟约成员排最前（用户 m08866）', () => {
  // 场上 真理/烈夏 已经在（乌萨斯 2/3），整备区里 乌啾 能凑到 3 人激活，
  // 而 奥斯塔（叙拉古 1/3）只算「有人但没到」，两者都该排在无名牌前面，乌啾更前。
  const order = benchDeployOrder(['奥斯塔', '乌啾', '', '真理'], {
    boardNames: ['真理', '烈夏'],
    covenants: ['乌萨斯', '叙拉古'],
  });
  assert.deepEqual(order.slice(0, 1), [1]);
  assert.equal(order[2], 2, '无名牌排在倒数第二（只能按池序放）');
  assert.equal(order[3], 3, '已经在场上的人才是最后（拖上去也放不了）');
});

test('上台优先序：叠层核心同条件优先', () => {
  const order = benchDeployOrder(['奥斯塔', '折桠'], { boardNames: [], covenants: ['乌萨斯'] });
  assert.equal(order[0], 1, '折桠是叠层核心，应该排前面');
});

test('上台优先序：输错名字也不会崩（空数组/全空名）', () => {
  assert.deepEqual(benchDeployOrder([], {}), []);
  assert.deepEqual(benchDeployOrder(['', ''], {}), [0, 1]);
});

test('一回合最多撤 3 次换人（4 张高阶牌躺整备区时能一次换上）', () => {
  assert.ok(DRIVE.includes('recallSwapCount >= maxRecalls'), '撤换次数上限没接');
  assert.ok(DRIVE.includes('opts.maxRecallsPerRound'), '上限不能调');
  assert.ok(DRIVE.includes('recallSwapCount += 1'), '成功撤回没有计数');
  assert.ok(!DRIVE.includes('recallSwappedThisRound'), '旧的一次性布尔还在');
  assert.ok(DRIVE.includes('guard < 9'), '循环上限没放宽（3 撤 + 3 放需要更多轮）');
});

test('布阵队列按优先序而不是甲板从左往右', () => {
  assert.ok(DRIVE.includes('benchDeployOrder('), 'drive.js 没接上台优先序');
  assert.ok(DRIVE.includes("上台优先序："), '没有记录优先序');
  // 2026-11-15 00:0x：链式 map 的第二个回调拿不到第一个回调的 k（整局 CRASH: k is not defined），
  // 现在先配对 { k, c } 再映射，这里锁新写法。
  assert.ok(DRIVE.includes('deployOrder.map((k) => ({ k, c: chips0[k] }))'), '队列还是按甲板顺序');
  assert.ok(COV.includes('export function benchDeployOrder'), 'covenantplan 没导出 benchDeployOrder');
});

test('小盟约补一个就激活时，抢得过叠层核心和高阶（用户 m08866 要 3 个盟约）', () => {
  // 场上 初雪（协防干员 1/2），整备区 夜莺（聚合/协防干员）补上就激活；
  // 雪猎 是谢拉格核心 + 叠层 + 3 阶，但谢拉格才 0/3。以前 w 被压到 0.12 → 补激活只有 0.7 分，
  // 抢不过叠层(1.2)+阶数(2.4)，夜莺永远排最后，盟约停在 1/2。
  const order = benchDeployOrder(['夜莺', '雪猎'], {
    boardNames: ['初雪'],
    covenants: ['伊比利亚', '谢拉格', '炎'],
    slotsLeft: 2,
  });
  assert.deepEqual(order, [0, 1], '补上就激活的 夜莺 应该排第一');
  // 没给目标盟约时也一样（want 为空会让所有盟约权重回落到 1，不该反过来把激活压下去）
  const order2 = benchDeployOrder(['夜莺', '雪猎'], { boardNames: ['初雪'], covenants: [], slotsLeft: 2 });
  assert.deepEqual(order2, [0, 1], '目标清单为空时同样按补激活优先');
});
