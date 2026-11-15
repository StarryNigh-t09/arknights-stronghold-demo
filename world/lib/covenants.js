// 盟约读取：从休整期顶栏认出本局开了哪些盟约。
//
// 用户 m02381：「去跑实测吧，这次加入决策层」。决策层里 wantScore 按「阶数 + 命中盟约×2.5」
// 打分，但 activeCovenants 一直只能由调用方手填，senseRun 不返回盟约名 —— 于是清单从来
// 没按盟约算过。这里补上「谁去读画面」。
//
// 只取名字：wantScore/buildWantList 只用名字（层数暂不解析，顶栏层数字号太小）。
// 单独一个侧车（sidecar/covnames.py）裁顶部 160px 的盟约条带识别，不拖慢既有的整帧 OCR。

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './pyenv.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SIDECAR = path.join(ROOT, 'sidecar', 'covnames.py');
const DATA = path.join(ROOT, 'data');

/** 单测兜底：data/ 读不到时也要有个像样的名单。 */
const FALLBACK_NAMES = [
  '乌萨斯', '伊比利亚', '卡西米尔', '叙拉古', '炎', '维多利亚', '莱塔尼亚', '萨尔贡', '谢拉格', '阿戈尔',
  '不屈', '助力', '协防', '坚守', '奇迹', '奥术', '投资人', '灵巧', '独行', '突袭', '精准', '绝技',
  '聚合', '调和', '迅捷', '远见', '迅击', '坚壁', '秘术',
];

let KNOWN = null;

function pythonBin() {
  return process.env.COOP_OCR_PYTHON || 'python';
}

function readJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

/**
 * 已知盟约名：data/covenants.json 的 core/extra + data/covenants-map.json 的 141 条。
 * 按长度降序排，解析时最长优先。
 */
export function knownCovenantNames() {
  if (KNOWN) return KNOWN;
  const set = new Set();
  const cov = readJson(path.join(DATA, 'covenants.json'), null);
  if (cov) {
    for (const c of cov.core || []) if (c && c.name) set.add(String(c.name).trim());
    for (const c of cov.extra || []) if (c && (c.n || c.name)) set.add(String(c.n || c.name).trim());
  }
  const map = readJson(path.join(DATA, 'covenants-map.json'), null);
  for (const c of (map && map.covenants) || []) if (c && c.name) set.add(String(c.name).trim());
  if (!set.size) for (const n of FALLBACK_NAMES) set.add(n);
  KNOWN = [...set].filter(Boolean).sort((a, b) => b.length - a.length || a.localeCompare(b));
  return KNOWN;
}

/**
 * 从 OCR 文本里挑盟约名。纯函数，单测直接喂字符串。
 * - 先剥掉数字/标点/空格（层数、括号和名字挤在同一行）
 * - 单字盟约（如「炎」）只认整串相等，别把「炎魔」里的炎算成盟约
 * - 多字盟约做子串匹配，最长优先
 * @param {string[]} texts
 * @param {string[]} [known]
 * @param {{limit?:number}} [opts]
 * @returns {string[]}
 */
/**
 * 顶栏盟约条带 → [{name, stacks}]。层数数字在名字上方几像素，按 x 中心配对。
 * 2026-11-15 04:16 实测（.tmp/look-0416.png）：名字 box y≈168，层数 box y≈146，x 中心差 <20。
 * 配对不上就是 null（图标是灰的、层数没亮），不猜数字。
 * @param {Array<{text:string, box:number[]}>} rows
 * @param {string[]} [known]
 */
export function parseBarStacks(rows, known = knownCovenantNames()) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.text && Array.isArray(r.box) && r.box.length >= 4);
  const names = [];
  const digits = [];
  for (const r of list) {
    const raw = String(r.text);
    const [x, y, w, h] = r.box;
    if (/^\d{1,2}$/.test(raw.trim())) {
      digits.push({ n: Number(raw.trim()), cx: x + w / 2, bottom: y + h });
      continue;
    }
    const t = raw.replace(/[^\u4e00-\u9fff]/g, '');
    if (!t) continue;
    if (!known.includes(t)) continue;
    names.push({ name: t, cx: x + w / 2, bottom: y + h });
  }
  const out = [];
  for (const nm of names) {
    let best = null;
    for (const d of digits) {
      if (Math.abs(d.cx - nm.cx) > 46) continue;
      const dy = nm.bottom - d.bottom;
      if (dy < 0 || dy > 60) continue;      // 层数在名字上方 0~60px
      if (!best || dy < best.dy) best = { n: d.n, dy };
    }
    out.push({ name: nm.name, stacks: best ? best.n : null });
  }
  return out;
}

export function parseCovenantNames(texts, known = knownCovenantNames(), opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 8;
  const out = [];
  const push = (n) => {
    if (!n) return;
    if (out.includes(n)) return;
    if (out.length >= limit) return;
    out.push(n);
  };
  const list = Array.isArray(texts) ? texts : [];
  for (const raw of list) {
    if (raw == null) continue;
    const s = String(raw).replace(/[^\u4e00-\u9fff]/g, '');
    if (!s) continue;
    // 整串本身就是个盟约名（含单字），优先认
    if (known.includes(s)) push(s);
    for (const name of known) {
      if (name.length < 2) continue;      // 单字只认整串，避免误命中
      if (s.includes(name)) push(name);
    }
  }
  return out;
}

/**
 * 读一张 1920x1080 截图里的盟约名。
 * @param {string} pngPath
 * @param {{timeoutMs?:number, limit?:number}} [opts]
 * @returns {Promise<{ok:boolean, names:string[], texts:string[], ms:number, error?:string}>}
 */
export async function readCovenants(pngPath, opts = {}) {
  const t0 = Date.now();
  const dir = mkdtempSync(path.join(tmpdir(), 'coop-cov-'));
  const outPath = path.join(dir, 'cov.json');
  try {
    const exit = await new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      let ch;
      try {
        ch = spawn(pythonBin(), [SIDECAR, outPath, pngPath], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
      } catch {
        finish(-1);
        return;
      }
      const timer = setTimeout(() => { try { ch.kill(); } catch { /* 已经退了 */ } finish(-2); }, Number(opts.timeoutMs) || 45000);
      ch.on('error', () => { clearTimeout(timer); finish(-1); });
      ch.on('exit', (code) => { clearTimeout(timer); finish(code == null ? -1 : code); });
    });
    if (!existsSync(outPath)) {
      return { ok: false, names: [], texts: [], ms: Date.now() - t0, error: 'covnames 没产出（exit ' + exit + '）' };
    }
    const got = readJson(outPath, {});
    const rows = (got && got[pngPath]) || [];
    const texts = rows.map((r) => (r && r.text) || '').filter(Boolean);
    const names = parseCovenantNames(texts, knownCovenantNames(), opts);
    // 2026-11-15 04:2x：顶栏每个盟约图标上方还有个层数（1~2 位数），
    // 「凑出 3 个盟约并叠层」这条验收只有游戏自己的顶栏能作证，顺手一起解析出来，不额外跑一次 OCR。
    const bar = parseBarStacks(rows, knownCovenantNames());
    return { ok: names.length > 0, names, texts, rows, bar, ms: Date.now() - t0 };
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 500);
  }
}

/**
 * 现拍一帧再读盟约（实测脚本用）。
 * @param {{timeoutMs?:number, limit?:number, saveAs?:string}} [opts]
 */
export async function readCovenantsNow(opts = {}) {
  const { screenshot } = await import('./adb.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'coop-shot-'));
  const png = path.join(dir, 'cov.png');
  try {
    const buf = screenshot();
    writeFileSync(png, buf);
    if (opts.saveAs) { try { writeFileSync(opts.saveAs, buf); } catch { /* 存图失败不影响识别 */ } }
    return await readCovenants(png, opts);
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 500);
  }
}

export default { knownCovenantNames, parseCovenantNames, parseBarStacks, readCovenants, readCovenantsNow };
