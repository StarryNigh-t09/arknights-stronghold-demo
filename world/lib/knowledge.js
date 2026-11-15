/**
 * knowledge.js — 知识层 + 学习层（不碰设备，纯本地数据）
 *
 * 两个来源：
 *   data/protocol.json   从 PRTS 抓的规程数据（盟约/干员/装备/策略/领袖/经济/规则）
 *   data/videos.json     B 站攻略视频索引（带版本标签 current / old）
 *
 * 学习层：
 *   data/runs.jsonl      每局复盘的追加日志（一行一局），progress() 汇总成进步曲线
 *
 * 设计：这个文件只读数据、只做查询与统计，不做决策（决策在 decide.js），不碰 ADB。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import covenantAsset from '../assets/covenants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 工程根目录（plugin/lib/../.. = coopanion-arknights） */
export const ROOT = path.resolve(HERE, '..', '..');
/** 数据目录：发布包里读包内 assets/（自带一份），开发时读仓库 data/ */
export const BUNDLED_ASSETS = path.resolve(HERE, '..', 'assets');
export const DATA_DIR = fs.existsSync(path.join(BUNDLED_ASSETS, 'protocol.json'))
  ? BUNDLED_ASSETS
  : path.join(ROOT, 'data');
let _runsDir = null
/**
 * 对局记录写到哪。World 装进扩展后，包目录在 node_modules 下，不该往里写东西，
 * 所以启动时用 ctx.dataDir 覆盖一次。没覆盖时退回仓库 data/ 或包内 assets/。
 */
export function setRunsDir(dir) {
  if (dir) _runsDir = dir
}
export function runsFile() {
  if (_runsDir) return path.join(_runsDir, 'runs.jsonl')
  return fs.existsSync(path.join(ROOT, 'data'))
    ? path.join(ROOT, 'data', 'runs.jsonl')
    : path.join(BUNDLED_ASSETS, 'runs.jsonl')
}

export const COVENANTS = covenantAsset.covenants;
export const COVENANT_MEMBERS = covenantAsset.members;
export const COVENANT_OF = covenantAsset.byOperator;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let _protocol = null;
export function protocol() {
  if (!_protocol) _protocol = readJson(path.join(DATA_DIR, 'protocol.json'), {});
  // covenants 用同一个源头，但补上 need / kind 便于决策层读（protocol.json 里字段名是 need_operators）
  return _protocol;
}

let _videos = null;
/** videos.json 顶层是数组（60 条），兼容 {videos:[]} 的写法 */
export function videos() {
  if (!_videos) {
    const raw = readJson(path.join(DATA_DIR, 'videos.json'), []);
    _videos = Array.isArray(raw) ? { videos: raw } : raw;
  }
  return _videos;
}

/** 干员详情：等阶、所属盟约、专属特质（初/精锐两版） */
export function opInfo(name) {
  const roster = (protocol().operators && protocol().operators.roster) || [];
  const hit = roster.find((o) => o.name === name);
  if (!hit) return null;
  const meta = ((protocol().operators && protocol().operators.tier_meta) || []).find((t) => t.tier === hit.tier);
  return { ...hit, tierMeta: meta || null };
}

let _unitRoles = null;
/** 强卡「干什么用」的速查表（data/unit-roles.json） */
export function unitRoles() {
  if (!_unitRoles) _unitRoles = readJson(path.join(DATA_DIR, 'unit-roles.json'), { units: [], stacksWithAnyCovenant: [] });
  return _unitRoles;
}

/**
 * 干员用途：这张卡在体系里干什么活。
 * 强卡表里查得到 → role / why / tier / 所属盟约；
 * 查不到但有 PRTS 数据 → 只给等阶和盟约；
 * 是「通用叠层」名单里的 → 标成通用叠层。
 */
export function unitRole(name) {
  const t = unitRoles();
  const hit = (t.units || []).find((u) => u.name === name);
  const stacks = (t.stacksWithAnyCovenant || []).includes(name);
  const base = opInfo(name);
  if (hit) {
    return {
      ...hit,
      covenants: (hit.covenants && hit.covenants.length) ? hit.covenants : ((base && base.covenants) || []),
      roleNote: hit.role ? ((t.roles || {})[hit.role] || '') : '',
      known: true,
    };
  }
  if (stacks) {
    return { name, tier: base ? base.tier : null, covenants: (base && base.covenants) || [], role: '通用叠层', roleNote: (t.roles || {})['通用叠层'], why: '能给任意干员补层数，不挑盟约', known: true };
  }
  if (!base) return null;
  return { name, tier: base.tier, covenants: base.covenants || [], role: null, why: '', known: false };
}

/* ---------------- 社区攻略数据（2026-11-09 外派产出，2026-11-10 接进决策层） ----------------
 *
 * 这些文件以前只躺在 data/ 里没人读，决策层等于只有 PRTS 的表 + 手写常量。
 * 现在统一从这里读：data 目录找不到就退回仓库 data/，再找不到给空结构（不抛错）。
 */

function readData(name, fallback) {
  // world/data 是这几个文件的落点；DATA_DIR（打包后在 assets/）与仓库 data/ 作兜底
  for (const dir of [path.join(HERE, '..', 'data'), DATA_DIR, path.join(ROOT, 'data')]) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return readJson(f, fallback);
  }
  return fallback;
}


/* ---------------- ASP Assistant 数据（2026-11-10 接入） ----------------
 * 来源：github.com/bingyunhe/asp-assistant-arknights（Apache-2.0，上游 Moonfair/ASP_Assistant）。
 * 只读查询：谁归哪个盟约、某干员的叠层文本、装备数值。决策层还没强制用它。
 */

let _covenantMap = null;
/** 干员↔盟约对应表（data/covenants-map.json）：141 人，含 tier / core / extra / traits */
export function covenantMap() {
  if (!_covenantMap) _covenantMap = readData('covenants-map.json', { total: 0, covenants: [], operators: {}, members: {} });
  return _covenantMap;
}

/** 某个干员的盟约归属与叠层文本；查不到返回 null（别猜）。 */
export function operatorCovenants(name) {
  const m = covenantMap().operators || {};
  return Object.prototype.hasOwnProperty.call(m, name) ? m[name] : null
}

let _ranges = null;
/** 干员攻击范围 + 职业（data/operator-ranges.json，143 人）。找不到返回 {}。 */
export function operatorRanges() {
  if (!_ranges) {
    const cands = [
      path.join(DATA_DIR, 'operator-ranges.json'),
      path.join(ROOT, 'data', 'operator-ranges.json'),
      path.join(HERE, '..', 'data', 'operator-ranges.json'),
    ]
    const hit = cands.find((f) => fs.existsSync(f))
    _ranges = hit ? (readJson(hit, {}).operators || {}) : {}
  }
  return _ranges
}

/**
 * 本局可选干员池：[{ name, tier, covenants, cls }]，喂给 wants.buildWantList 生成购物清单。
 * covenants = 核心盟约 + 附加盟约（ASP 表），cls 来自 PRTS 攻击范围表（查不到就是空串）。
 */
export function operatorPool() {
  const roster = (protocol().operators && protocol().operators.roster) || []
  const rng = operatorRanges()
  return roster.map((o) => {
    const c = operatorCovenants(o.name) || {}
    const covs = []
    for (const x of [...(c.core || []), ...(c.extra || [])]) if (!covs.includes(x)) covs.push(x)
    if (!covs.length && Array.isArray(o.covenants)) covs.push(...o.covenants)
    return {
      name: o.name,
      tier: Number(c.tier) || Number(o.tier) || 1,
      covenants: covs,
      cls: (rng[o.name] && rng[o.name].class) || '',
    }
  })
}

/** 某个盟约下有哪些干员可用（用于凑羁绊时查库存）。 */
export function covenantMembers(name) {
  const m = covenantMap().members || {};
  return Object.prototype.hasOwnProperty.call(m, name) ? m[name] : null
}

let _equipment = null;
/** 装备表（data/equipment.json）：70 件 + 16 件转职装备，普通/精锐两套数值 */
export function equipmentBook() {
  if (!_equipment) _equipment = readData('equipment.json', { total: 0, items: [], jobChangeItems: [] });
  return _equipment;
}

/** 按名字找装备（普通与转职都找）。 */
export function equipmentInfo(name) {
  const b = equipmentBook()
  const all = [...(b.items || []), ...(b.jobChangeItems || [])]
  return all.find(e => e && e.name === name) || null
}
let _economy = null;
/** 经济表（data/economy.json）：升级节奏、花钱优先级、开局、阶段、常见错 */
export function economy() {
  if (!_economy) _economy = readData('economy.json', { levelup: [], spending: [], openings: [], phases: [], mistakes: [] });
  return _economy;
}

/**
 * 调度中心升级费表 {升前等级: 花费}，来自 economy.json 的 levelup。
 * 只返回有明确数额的行（目前只有「首次升级 5 点」一条），其余由调用方用默认表补。
 * 别把没数额的行猜成 0 —— 那会让决策层以为升级免费。
 */
export function levelupCostTable() {
  const rows = economy().levelup || [];
  const out = {};
  for (const r of rows) {
    const money = Number(r.money);
    const toLevel = Number(r.level);
    if (!Number.isFinite(money) || !Number.isFinite(toLevel) || money <= 0) continue;
    // level 记的是「升到第几本」，换算成「升前等级」做键
    out[Math.max(1, toLevel - 1)] = money;
  }
  return out;
}

let _covenantBook = null;
/** 盟约全书（data/covenants.json）：S/A/B 评级、叠层来源、协同、选卡建议 */
export function covenantBook() {
  if (!_covenantBook) {
    _covenantBook = readData('covenants.json', { core: [], extra: [], synergy: [], pickAdvice: [], unknowns: [] });
  }
  return _covenantBook;
}

/**
 * 盟约强度表 {盟约名: {tier, rating, kind}}。
 * tier 是 S/A/B+/B/C 这种档位（来自社区攻略，不是游戏内数值），只用于排序，不能当事实。
 */
export function covenantStrength() {
  const b = covenantBook();
  const out = {};
  for (const c of (b.core || [])) {
    if (c && c.name) out[c.name] = { tier: c.tier || '', rating: c.rating || '', kind: 'core' };
  }
  for (const c of (b.extra || [])) {
    // 附加盟约的数据字段是 n（{n:"精准", id:"jingzhun"}），name 常常没有；
    // 只认 name||id 会把 16 条全变成拼音键，查找时「精准」永远查不到。
    const name = c.name || c.n || c.id;
    if (name) out[name] = { tier: c.tier || '', rating: c.rating || c.note || '', kind: 'extra' };
  }
  return out;
}

/** 选卡/盟约建议（按 rank 排好），给「这版该走什么」用 */
export function covenantPick() {
  return (covenantBook().pickAdvice || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
}

let _runflow = null;
/** 对局流程（data/runflow.json）：阶段步骤、买卡优先级、单位评价、技能换法、常见错 */
export function runflow() {
  if (!_runflow) _runflow = readData('runflow.json', { steps: [], buyPriority: [], units: [], skillSwap: [], mistakes: [] });
  return _runflow;
}

/** 字幕转写留了「哲亚(?)」这种存疑标记，查名字时先剥掉再比 */
function bareName(s) {
  return String(s || '').replace(/[(（]\s*[?？]\s*[)）]/g, '').replace(/[?？]+$/, '').trim()
}

/** 干员技能建议（runflow.skillSwap，133 条）：这张卡技能换什么、什么时候换 */
export function operatorTech(name) {
  const want = bareName(name)
  if (!want) return null
  const hit = (runflow().skillSwap || []).find((x) => bareName(x.name) === want)
  if (!hit) return null;
  return { skill: hit.skill, tier: hit.tier, evidence: hit.evidence || null };
}

let _guides = null;
/** 视频攻略要点（data/guides.json）：原则、开局、阵容、针对性、常见错 */
export function guides() {
  if (!_guides) _guides = readData('guides.json', { principles: [], openings: [], comp: [], counters: [], mistakes: [], unknowns: [] });
  return _guides;
}

let _live = null;
/** 直播观察（data/live.json，数组）：主播实战里的具体操作与数字 */
export function liveNotes() {
  if (!_live) {
    const raw = readData('live.json', []);
    _live = Array.isArray(raw) ? raw : [];
  }
  return _live;
}

/** 盟约详情：类型、激活门槛、加强门槛、成员、效果原文 */
export function covenantInfo(name) {
  const c = COVENANTS.find((x) => x.name === name);
  if (!c) return null;
  return {
    name: c.name,
    kind: c.kind,
    need: c.need,
    enhance: c.kind === 'core' ? 6 : 3,
    effect: c.effect,
    operators: c.operators,
  };
}

/** 把数据摊平成可搜索的条目 */
function index() {
  const p = protocol();
  const out = [];
  const push = (kind, name, text, extra) => {
    if (name || text) out.push({ kind, name: name || '', text: text || '', ...(extra || {}) });
  };

  for (const o of ((p.operators && p.operators.roster) || [])) {
    push('干员', o.name, [
      '等阶 ' + o.tier,
      o.covenants && o.covenants.length ? '盟约 ' + o.covenants.join('/') : '',
      o.trait_type ? '特质类型 ' + o.trait_type : '',
      o.trait_initial || '',
      o.trait_elite ? '精锐：' + o.trait_elite : '',
    ].filter(Boolean).join('｜'), { tier: o.tier });
  }
  for (const [kindName, list] of [
    ['装备', (p.items && p.items.equipment) || []],
    ['法术道具', (p.items && p.items.spells && p.items.spells.items) || []],
    ['策略', p.strategies || []],
    ['领袖', (p.enemies && p.enemies.leaders) || []],
    ['悬赏敌人', (p.enemies && p.enemies.bounties) || []],
    ['战术特训', (p.enemies && p.enemies.training_groups) || []],
  ]) {
    for (const it of list) {
      push(kindName, it.name, [
        it.tier ? '等阶 ' + it.tier : '',
        it.price != null ? '价 ' + it.price : '',
        it.effect_base || it.effect || '',
        it.effect_advanced ? '进阶：' + it.effect_advanced : '',
        it.hp ? '血量 ' + JSON.stringify(it.hp) : '',
        it.owner ? '持有者 ' + it.owner : '',
      ].filter(Boolean).join('｜'));
    }
  }
  for (const c of COVENANTS) push('盟约', c.name, '【' + (c.kind === 'core' ? '核心' : '附加') + '】' + (c.effect || ''), { need: c.need });

  // 社区攻略也进索引：wz_search('奥术') 能同时搜到 PRTS 原文和社区评级/建议
  for (const [name, info] of Object.entries(covenantStrength())) {
    push('盟约评级', name, ['档位 ' + (info.tier || '?'), info.rating].filter(Boolean).join('｜'));
  }
  for (const p2 of covenantPick()) {
    push('选卡建议', '策略' + (p2.rank || ''), [p2.advice, p2.why, p2.how].filter(Boolean).join('｜'));
  }
  for (const s of (guides().principles || [])) push('原则', '', String(s));
  for (const s of (guides().openings || [])) push('开局', '', String(s));
  // guides.json 里只有 mistakes（字符串数组），没有 errors：写显式字段，别用回退把两种形状混在一起
  for (const s of (guides().mistakes || [])) push('常见错', '', String(s && s.text ? s.text + '｜' + (s.detail || '') : s));
  for (const b of (runflow().buyPriority || [])) push('买卡优先级', b.rule, b.why || '');
  for (const m of (runflow().mistakes || [])) push('常见错', m.text, m.detail || '');
  for (const u of (runflow().units || [])) push('单位评价', u.name, [u.tier, u.why].filter(Boolean).join('｜'));
  for (const r of (economy().levelup || [])) push('升级节奏', 'R' + r.round + '→' + r.level + '本', r.note || '');
  for (const s of (economy().spending || [])) push('花钱', s.topic, s.rule || '');
  for (const s of (economy().phases || [])) push('阶段', s.stage, s.action || '');
  for (const n of liveNotes()) push('直播', n.speaker || '', [n.claim, n.evidence].filter(Boolean).join('｜'));
  for (const [k, v] of Object.entries(p.mechanics || {})) {
    push('机制', k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  for (const [k, v] of Object.entries(p.rules || {})) {
    push('规则', k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return out;
}

/** 全量搜索：名字命中 > 正文命中；返回 [{kind,name,snippet}] */
export function search(query, { limit = 6 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of index()) {
    let score = 0;
    for (const t of terms) {
      if (e.name === t) score += 10;
      else if (e.name.includes(t)) score += 6;
      if (e.text.includes(t)) score += 2;
    }
    if (score > 0) scored.push({ ...e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((e) => ({
    kind: e.kind,
    name: e.name,
    snippet: e.text.slice(0, 220),
    score: e.score,
  }));
}

/** 版本信息：赛季 + 视频版本分布（判断攻略是否过期用） */
/** 本季社区共识快照（assets/meta.json）——带日期，只当参考，别写死进打分。 */
export function meta() {
  return readJson(path.join(DATA_DIR, 'meta.json'), null);
}

export function versionInfo() {
  const p = protocol();
  const v = videos();
  const list = v.videos || [];
  const cur = list.filter((x) => x.version_tag === 'current');
  const old = list.filter((x) => x.version_tag === 'old');
  const newest = cur.map((x) => x.pubdate || '').sort().pop() || '';
  return {
    title: (p.meta && p.meta.title) || '',
    season: (p.meta && p.meta.season) || '',
    seasonStart: (p.meta && p.meta.season_start) || '',
    generatedAt: (p.meta && p.meta.generated_at) || '',
    videos: { current: cur.length, old: old.length, newestCurrent: newest },
    meta: (() => {
      const m = meta();
      return m ? { capturedAt: m.capturedAt, season: m.season, noteCount: (m.notes || []).length } : null;
    })(),
    note: '当前赛季：规程（2026-11-08 起，赛季制一年）。old 标签的是前三期作废玩法，别按它们的强度表打。',
  };
}

/* ---------------- 学习层：对局记录 ---------------- */

function ensureDataDir() {
  const dir = path.dirname(runsFile());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 记一局。entry: { rounds:[{round,moneyLeft,lifeLost,won,notes}], difficulty?, seed?, note? }
 * 落盘一行 JSON（追加，不改历史），返回这条记录。
 */
export function recordRun(entry, review) {
  ensureDataDir();
  // decide.js 的 winRate 是 0~1 的小数，落盘统一成百分数，免得后面两种口径混着算
  if (review && typeof review.winRate === 'number' && review.winRate <= 1) {
    review = { ...review, winRate: Math.round(review.winRate * 100) };
  }
  const rec = {
    at: new Date().toISOString(),
    _v: 1,
    difficulty: entry.difficulty || '未知',
    note: entry.note || '',
    rounds: entry.rounds || [],
    review: review || null,
  };
  const recWithReview = { ...rec, review: review || summarise(rec.rounds) };
  fs.appendFileSync(runsFile(), JSON.stringify(recWithReview) + '\n', 'utf8');
  return recWithReview;
}

function summarise(rounds) {
  const total = rounds.length;
  const wins = rounds.filter((r) => r.won).length;
  const wasted = rounds.filter((r) => Number(r.moneyLeft) > 0).map((r) => r.round);
  const lost = rounds.filter((r) => Number(r.lifeLost) > 0).map((r) => r.round);
  return {
    rounds: total,
    winRate: total ? Math.round((wins / total) * 100) : null,
    wastedMoneyRounds: wasted,
    lifeLostRounds: lost,
  };
}

export function listRuns() {
  if (!fs.existsSync(runsFile())) return [];
  return fs.readFileSync(runsFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/** 进步曲线：胜率、平均撑到第几回合、平均浪费资金的回合数 */
export function progress() {
  const runs = listRuns();
  if (!runs.length) return { runs: 0, note: '还没有对局记录。打完一局用 wz_review(save=true) 记一笔。' };
  const winRates = [];
  const depths = [];
  const wastes = [];
  for (const r of runs) {
    const s = r.review || summarise(r.rounds || []);
    if (s.winRate != null) winRates.push(s.winRate);
    depths.push((r.rounds || []).length);
    wastes.push((s.wastedMoneyRounds || []).length);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const first = winRates.slice(0, Math.max(1, Math.floor(winRates.length / 2)));
  const rest = winRates.slice(Math.max(1, Math.floor(winRates.length / 2)));
  return {
    runs: runs.length,
    avgWinRate: Math.round(avg(winRates)),
    avgDepth: Number(avg(depths).toFixed(1)),
    avgWastedMoneyRounds: Number(avg(wastes).toFixed(1)),
    firstHalfWinRate: Math.round(avg(first)),
    latestHalfWinRate: Math.round(avg(rest)),
    lastRunAt: runs[runs.length - 1].at,
  };
}
