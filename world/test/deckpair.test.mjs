// 2026-11-13 15:5x：甲板名字配对（run.js pairDeckUnits）的单测。
// 来由：真实 bug —— identifyDeck 读回的名字条数常少于甲板牌数，旧代码按下标硬配，
// 把「角峰(重装)」的名字挂到狙击牌上，于是重装被摆到后排、狙击被摆到前排（用户 m01079 骂的就是这个）。
// 现在只按 x 最近配对，配不上就是无名（宁可留空，也不张冠李戴）。
import { pairDeckUnits } from '../lib/run.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const book = { operators: { 角峰: { class: '重装', range: [[0, 0]] }, 灰喉: { class: '狙击', range: [[0, 1]] } } };

// 1) 三张牌、只认出一个名字：只有 x 最近的那张拿到名字
{
  const chips = [{ x: 1413, y: 883 }, { x: 1562, y: 883 }, { x: 1115, y: 883 }];
  const cand = [{ name: '角峰', x: 1562 }];
  const u = pairDeckUnits(chips, cand, 150, book);
  ok('只认出一个名字 → 只挂到 x 最近那张', u.length === 3 && u.filter((x) => x.name === '角峰').length === 1 && u.find((x) => Math.abs(x.x - 1562) < 1).name === '角峰', JSON.stringify(u.map((x) => [x.x, x.name])));
  ok('没配上的牌是 null 而不是借用别人的名字', u.filter((x) => !x.name).length === 2);
}
// 2) 名字比牌多（同一个名字被 OCR 读了两遍）：不重复用
{
  const chips = [{ x: 1413, y: 883 }];
  const cand = [{ name: '角峰', x: 1413 }, { name: '角峰', x: 1410 }];
  const u = pairDeckUnits(chips, cand, 150, book);
  ok('名字条数多于牌数 → 一张牌只拿一个名字', u.length === 1 && u[0].name === '角峰');
}
// 3) 超出容差 → 宁可空着
{
  const u = pairDeckUnits([{ x: 1413, y: 883 }], [{ name: '灰喉', x: 900 }], 150, book);
  ok('超出容差 → 判无名（不张冠李戴）', u.length === 1 && u[0].name === null, String(u[0] && u[0].name));
}
// 4) 顺序：甲板按 x 升序返回，与下游「左→右＝最早买入→最新买入」一致
{
  const u = pairDeckUnits([{ x: 1562, y: 883 }, { x: 1115, y: 883 }], [{ name: '灰喉', x: 1562 }, { name: '角峰', x: 1115 }], 150, book);
  ok('返回顺序按 x 升序', u[0].x === 1115 && u[1].x === 1562 && u[0].name === '角峰' && u[1].name === '灰喉', JSON.stringify(u.map((x) => [x.x, x.name])));
}
// 5) 职业信息跟着名字走（排位靠它）
{
  const u = pairDeckUnits([{ x: 1413, y: 883 }], [{ name: '角峰', x: 1413 }], 150, book);
  ok('配对结果带职业（排位用）', u[0].cls === '重装');
}
console.log('tests ' + (pass + fail) + ' / pass ' + pass + ' / fail ' + fail);
process.exit(fail ? 1 : 0);
