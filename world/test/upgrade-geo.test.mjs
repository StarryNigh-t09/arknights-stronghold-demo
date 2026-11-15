// 2026-11-12：升级面板中心必须随等级变（OCR 读不到「升级」两个字时的兜底坐标）。
// 两个入口：
//   upgradePanelCenter(idx)      —— 下标口径（= 界面 LEVEL − 1），公式本体
//   upgradePanelCenterFor(lv)    —— 界面等级口径，内部减 1 再算（read_shop_level 现在返回界面等级）
// 实测锚点：界面 Ⅰ/Ⅱ 真按钮中心 578,972（world/.tmp/up-before.png 手量）；
// 界面 Ⅲ 的升级面板中心 336（12:12 实拍），界面 Ⅳ 的 95（12:16 实拍）。
import { upgradePanelCenter, upgradePanelCenterFor } from '../lib/placement.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const idx1 = upgradePanelCenter(1);
ok('idx1 中心≈578（界面 Ⅱ）', Math.abs(idx1.x - 578) <= 2, 'x=' + idx1.x);
const idx2 = upgradePanelCenter(2);
ok('idx2 中心≈338（界面 Ⅲ）', Math.abs(idx2.x - 338) <= 2, 'x=' + idx2.x);
ok('idx3 中心≈98（界面 Ⅳ）', Math.abs(upgradePanelCenter(3).x - 98) <= 3, 'x=' + upgradePanelCenter(3).x);
ok('idx 越大越靠左', upgradePanelCenter(1).x > upgradePanelCenter(2).x && upgradePanelCenter(2).x > upgradePanelCenter(3).x);
// 2026-11-12 09:4x：不再把 x 夹到 60。界面 Ⅴ 的几何中心本来就在屏幕外（-141，panelLeft -228），
// 夹住 = 假装按钮还能点，实际点在左边缘空地；现在返回 visible=false 由调用方改走 OCR。
const idx4 = upgradePanelCenter(4);
ok('idx4 落在屏幕外且 visible=false', idx4.x === -141 && idx4.panelLeft === -228 && idx4.visible === false, 'x=' + idx4.x + ' pl=' + idx4.panelLeft);
ok('idx1/idx2/idx3 都在屏幕内 visible=true', idx1.visible === true && idx2.visible === true && upgradePanelCenter(3).visible === true);
ok('越界输入仍按 idx 1..6 夹住', upgradePanelCenter(99).level === 6 && upgradePanelCenter(0).x === idx1.x);
const idxNull = upgradePanelCenter(null);
ok('null 按 idx1', idxNull.level === 1 && idxNull.x === idx1.x);

// 界面等级入口（read_shop_level / drive.js 用的就是这个）
ok('display 2 中心≈579（界面 Ⅱ，实拍 578）', Math.abs(upgradePanelCenterFor(2).x - 579) <= 2, 'x=' + upgradePanelCenterFor(2).x);
ok('display 3 中心≈339（界面 Ⅲ，实拍 336）', Math.abs(upgradePanelCenterFor(3).x - 339) <= 2, 'x=' + upgradePanelCenterFor(3).x);
ok('display 4 中心≈99（界面 Ⅳ，实拍 95）', Math.abs(upgradePanelCenterFor(4).x - 99) <= 2, 'x=' + upgradePanelCenterFor(4).x);
const d5 = upgradePanelCenterFor(5);
ok('display 5 落在屏幕外且 visible=false', d5.x === -141 && d5.visible === false, 'x=' + d5.x);
ok('display 1 / null 都按界面 Ⅱ 的布局兜底（idx 夹到 1）', upgradePanelCenterFor(1).x === upgradePanelCenterFor(2).x && upgradePanelCenterFor(null).x === upgradePanelCenterFor(2).x);
ok('display 与 idx 差一级', upgradePanelCenterFor(3).x === upgradePanelCenter(2).x && upgradePanelCenterFor(4).x === upgradePanelCenter(3).x);

console.log('tests ' + (pass + fail) + ' / pass ' + pass + ' / fail ' + fail);
process.exit(fail ? 1 : 0);
