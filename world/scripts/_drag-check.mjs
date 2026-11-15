// 单次验证：折叠商店 → 拖 1~2 个干员上场 → 复核（不点准备就绪、不开新局）
// 只读 + 一次拖拽；跑完把 steps.jsonl / map-issues.jsonl 的增量打出来。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POINTS, sleep, tapAt, scanDeckChips } from '../lib/run.js';
import { senseRun, deployFromDeck, setTrace } from '../lib/drive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ISSUES = join(HERE, '..', 'data', 'map-issues.jsonl');
const issuesCount = () => (existsSync(ISSUES) ? readFileSync(ISSUES, 'utf8').split('\n').filter(Boolean).length : 0);
const out = (tag, obj) => console.log(tag, JSON.stringify(obj));

if (process.env.COOP_DEPLOY_HOLD_MS || process.env.COOP_DECK_HOLD_MS) {
  out('REFUSE', { COOP_DEPLOY_HOLD_MS: process.env.COOP_DEPLOY_HOLD_MS || null, COOP_DECK_HOLD_MS: process.env.COOP_DECK_HOLD_MS || null, why: '这两个变量会改起手时长，验证前必须清掉' });
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
const traceDir = join(HERE, '..', 'traces', 'drag-check-' + ts);
setTrace(traceDir);

const st0 = await senseRun();
out('STATE0', { ok: st0.ok, screen: st0.screen, round: st0.round, slotsLeft: st0.slotsLeft, money: st0.money, shopExpanded: st0.shopExpanded, shopBrightness: st0.shopBrightness });
if (!st0.ok || st0.screen !== 'rest') { console.log('ABORT 不在休整期，不动手'); process.exit(0); }

const cards0 = (st0.shop || []).filter((c) => c && !c.empty);
const isOpen = st0.shopExpanded === true
  || (typeof st0.shopBrightness === 'number' && st0.shopBrightness < 300)
  || cards0.length > 1;
out('SHOP0', { open: isOpen, cards: cards0.length, names: cards0.map((c) => c.name), expandedFlag: st0.shopExpanded, brightness: st0.shopBrightness });

if (isOpen) {
  const t = Date.now();
  await tapAt(POINTS.collapse, 1300, '折叠商店');
  const stF = await senseRun();
  const folded = stF.shopExpanded === false || (typeof stF.shopBrightness === 'number' && stF.shopBrightness >= 300);
  out('FOLD', { ms: Date.now() - t, folded, brightness: stF.shopBrightness, expandedFlag: stF.shopExpanded, cards: (stF.shop || []).filter((c) => c && !c.empty).length });
  if (!folded) { console.log('ABORT 折叠失败，不在展开态操作甲板'); process.exit(0); }
}

const deck0 = await scanDeckChips({ minPressY: 840 });
out('DECK0', { ok: deck0.ok, n: (deck0.chips || []).length, chips: (deck0.chips || []).map((c) => [c.x, c.y]) });
if (!deck0.chips || !deck0.chips.length) { console.log('DECK_EMPTY 甲板扫不到牌，先买卡再验证（本次不动手）'); console.log('TRACE', traceDir); process.exit(0); }

const want = Math.max(1, Math.min(2, deck0.chips.length, Number(st0.slotsLeft) || 2));
const issuesBefore = issuesCount();
const r = await deployFromDeck(Array.from({ length: want }, () => ({ name: '' })), {
  slotsLeft: Number(st0.slotsLeft),
  trace: traceDir,
  shopOpen: false,
  triesPerUnit: 2,
});
out('DEPLOY', { ok: r.ok, placed: r.placed, attempts: r.attempts, holdStart: r.holdStart, ms: r.ms, failed: (r.failedTiles || []).length, cells: r.placedCells || [] });
for (const s of r.steps || []) console.log('  step:', s);

await sleep(800);
const issuesAfter = issuesCount();
out('ISSUES', { before: issuesBefore, after: issuesAfter, delta: issuesAfter - issuesBefore });

const deck1 = await scanDeckChips({ minPressY: 840 });
out('DECK1', { ok: deck1.ok, n: (deck1.chips || []).length, chips: (deck1.chips || []).map((c) => [c.x, c.y]) });

const st1 = await senseRun();
const cards1 = (st1.shop || []).filter((c) => c && !c.empty);
const openNow = st1.shopExpanded === false ? false
  : (typeof st1.shopBrightness === 'number' ? st1.shopBrightness < 300 : cards1.length > 1);
out('STATE1', { screen: st1.screen, slotsLeft: st1.slotsLeft, money: st1.money, round: st1.round, shopOpen: openNow });
if (openNow) {
  await tapAt(POINTS.collapse, 1300, '收尾折叠');
  const st2 = await senseRun();
  out('FOLD_END', { brightness: st2.shopBrightness, expandedFlag: st2.shopExpanded });
}
out('TRACE', traceDir);
console.log('DONE');
