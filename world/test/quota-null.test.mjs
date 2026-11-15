// 2026-11-12：名额闸门不许再把 null 当 0。
// 真机后果：decision-log.jsonl round 7/8 的 slotsLeft 是 null，旧代码 Number(null)===0 →
// 「配额用满」→ 连续两次落位被拒就收工，那两回合一个干员都没上去。
//
// 2026-11-14 09:0x（用户 m02396「布阵结束之后再扫一次确认」）：
// 原来那条「名额读作 0 + 连续 2 次落位被拒 → 收手」搬在**逐张牌的截图复核**里，
// 复核整块已经删掉（每张牌两次重扫 ≈ 10s）。现在成败由**收尾时扫一次甲板**统一判定：
// 甲板剩的张数对不上就改 placed，placed === 0 记 QUOTA_STUCK_ROUND，下一回合跳过部署。
// 所以这条锁改成：① 不许裸比 slotsLeft；② 剩下的两处闸门必须走 null→NaN 守卫；③ 收尾复核还在。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'lib', 'drive.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const bare = /slotsLeft\)\s*<=\s*0/.test(SRC);
ok('drive.js 里没有裸的 slotsLeft) <= 0', bare === false, 'found bare comparison');
ok('名额闸门用的是有限数守卫（quotaN2 / quotaN3）',
  /Number\.isFinite\(quotaN[23]\)\s*&&\s*quotaN[23]\s*<=\s*0/.test(SRC), 'guard missing');
ok('quotaN2 / quotaN3 从 null 映射成 NaN',
  /const quotaN3 = opts\.slotsLeft == null \? NaN : Number\(opts\.slotsLeft\)/.test(SRC) &&
  /const quotaN2 = opts\.slotsLeft == null \? NaN : Number\(opts\.slotsLeft\)/.test(SRC), 'null mapping missing');
ok('成败兜底改由收尾甲板复核判定', /布阵收尾复核/.test(SRC) && /QUOTA_STUCK_ROUND = Number\(opts\.round\)/.test(SRC), 'tail verification missing');
ok('逐张牌的截图复核已删掉（不再每张重扫甲板）',
  !/let chipsNow = null/.test(SRC) && !/stillThere/.test(SRC), 'per-card recheck still present');

console.log('tests ' + (pass + fail) + ' / pass ' + pass + ' / fail ' + fail);
process.exit(fail ? 1 : 0);
