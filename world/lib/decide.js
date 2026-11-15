/**
 * decide.js — 卫戍协议决策引擎（只读 data/，不碰设备）
 *
 * 依据：data/protocol.json（PRTS，规程版）+ 游戏内实测规则
 * 核心约束（来自 rules/economy，不是猜的）：
 *   1. 资金回合结束清零、无利息 → 每回合必须花光，留着就是亏
 *   2. 部署不消耗费用，按整备区顺序自动部署，上限 8
 *   3. 手牌 10 常规槽 + 5 临时槽，临时槽进入下一阶段清空
 *   4. 调度中心等级 ≥ 干员等阶才可能刷出（硬门槛）
 *   5. 3 名同名【初始】→ 1 名【精锐】
 *   6. 每名干员最多 2 件装备，2 件同名自动合成进阶
 *   7. 刷新 1 资金
 *
 * 已知缺口（protocol.json 的 gaps，不要假装知道）：
 *   - 调度中心各级升级费、各阶栏位数
 *   - 每回合基础资金、各干员招募价
 *   - 逐回合出怪表、敌人属性倍率
 * 所以凡是依赖这些数值的判断都走「可配置近似 + 明确标注」。
 */

import COV from '../assets/covenants.js';
import { economy, runflow, covenantStrength as communityCovenantStrength, protocol } from './knowledge.js';

/** 盟约全表（26 条，来自 data/protocol.json） */
export const COVENANTS = COV.covenants;
/** 盟约名 → 成员干员名数组 */
export const COVENANT_MEMBERS = COV.members;
/** 干员名 → 它所属的盟约名数组 */
export const COVENANT_OF = COV.byOperator;

/**
 * 本赛季轮替掉的盟约：PRTS 那份表是旧版本的，这些本赛季不再出现，
 * 拿它们的成员去加分等于推荐空气。
 * 来源：游戏内 更新日志→协议开放 2026.11.8→盟约调整（实录见 docs/in-game-rules.md）。
 * 换赛季要改的就是这一行 + assets/meta.json 的 covenantChanges。
 */
export const RETIRED_COVENANTS = new Set(['拉特兰']);

/**
 * 盟约协同加分：一只干员值不值得买，很大程度看它能不能把某个盟约凑齐。
 *
 * 硬数据：每个盟约要 3 名同阵营干员才起效，在场 6 名不同的同阵营干员解锁加强效果。
 * 所以「已有 2 只」时买第 3 只的边际价值最高（阈值正好被跨过），
 * 「已有 5 只」时第 6 只同理。这个阶梯来自 protocol.json 的 need_operators 与效果原文，
 * 不是拍脑袋的平滑曲线。
 */
export function covenantBonus(cand, ctx = {}) {
  const members = ctx.covenantMembers || COVENANT_MEMBERS;
  const active = new Set(ctx.activeCovenants || []);
  const owned = ctx.owned || {};
  const info = new Map(COVENANTS.map((c) => [c.name, c]));
  // 初值给 -Infinity：默认 0 会让「只有负权重」的盟约（比如炎 C 档但已经在叠）
  // 连理由都轮不上，明明手里有炎却被劝成「没协同」。
  let best = { bonus: -Infinity, reason: '', carry: false };

  for (const [cov, list] of Object.entries(members)) {
    if (!Array.isArray(list) || !list.includes(cand.name)) continue;
    if (RETIRED_COVENANTS.has(cov)) continue; // 本赛季轮替掉的，不参与打分
    const meta = info.get(cov);
    // 激活门槛：核心盟约 3 名，附加盟约 1~3 名（protocol.json 的 need_operators，实测 1/2/3 都有）
    const need = Number(meta && meta.need) || (meta ? 3 : Number(ctx.covenantNeed) || 3);
    // 加强门槛：核心盟约「在场 6 名不同」，附加盟约「在场 3 名不同」（效果原文）
    const enhance = meta ? (meta.kind === 'core' ? 6 : 3) : 6;
    const have = list.filter((n) => (Number(owned[n]) || 0) > 0).length;
    const next = have + 1;                 // 买了这只之后有几名
    let bonus = 0;
    const bits = [];
    if (active.has(cov)) { bonus += 1.2; bits.push('已在叠'); }
    if (next === need) { bonus += 3; bits.push('这只正好凑满激活(' + need + '名)'); }
    else if (have >= 1 && next < need) { bonus += 1.5; bits.push('向激活推进'); }
    else if (have >= need) { bonus += 1; bits.push('已激活，继续叠'); }
    if (next === enhance) { bonus += 2.5; bits.push('这只正好凑满加强(' + enhance + '名)'); }
    // 社区评级（data/covenants.json）只做排序微调：S/A 值得为它攒人，C 档别浪费钱。
    const st = (ctx.covenantStrength || {})[cov];
    if (st && st.tier) {
      const w = tierWeightOf(st.tier);
      if (w !== 0) {
        bonus += w;
        bits.push('社区评级 ' + st.tier + (w > 0 ? '+' : '') + w);
      }
    }
    if (bonus > best.bonus) {
      best = {
        bonus,
        carry: active.has(cov),
        reason: '盟约·' + cov + '（' + (meta ? (meta.kind === 'core' ? '核心' : '附加') : '?')
          + '，已有 ' + have + '/' + list.length + ' 名' + (bits.length ? '，' + bits.join('、') : '') + '）',
      };
    }
  }
  // 负权重不能把「已经在叠」变成劝退：分数夹到 0，理由照留。
  // 但 0 分又没在叠的盟约（C 档、手里 0 名）不该塞进理由里
  // —— 那是「不推荐」的意思，写成推荐理由只会让人以为有协同。
  const bonus = Math.max(0, best.bonus);
  return { bonus, reason: bonus > 0 || best.carry ? best.reason : '' };
}

/** 招募价未知时的保守近似：按等阶给一个价，可在 config.costByTier 覆盖 */
/**
 * 本局能刷出哪些干员 —— 这条规则来自游戏内「协议数据库 · 模拟细则」原文，PRTS 上没有：
 *
 *   「每局模拟中只会出现 N 个核心盟约，任何归属于未随机到的核心盟约的干员将不会出现在调度中心内。
 *     在独立模拟中，可在两组随机核心盟约中选择一组进行模拟。」
 *   「对于无核心盟约归属的干员，若随机盟约中不存在任何其所归属的附加盟约，
 *     则这些干员同样不会出现在调度中心内。」
 *
 * 也就是：开局先看核心盟约随机到哪几个，再去决定池子。没随机到的核心盟约，它的人根本买不到，
 * 之前「看见什么买什么」的假设是错的 —— 池子是被盟约筛过的。
 *
 * @param {string[]} coreCovenants 本局生效的核心盟约（独立模拟是自己从两组里选的那一组）
 * @param {object} [opts] { addons } 附加盟约清单；不传＝按「都可能出现」的上界算
 * @returns {{ available: string[], excluded: string[], reason: string }}
 */
export function operatorPool(coreCovenants, opts = {}) {
  const cores = new Set(coreCovenants || []);
  const addons = opts.addons ? new Set(opts.addons) : null;
  const coreNames = new Set(COVENANTS.filter((c) => c.kind === 'core').map((c) => c.name));
  const addonNames = new Set(COVENANTS.filter((c) => c.kind !== 'core').map((c) => c.name));
  const available = [];
  const excluded = [];

  for (const [op, belong] of Object.entries(COVENANT_OF)) {
    const opCores = belong.filter((n) => coreNames.has(n));
    const opAddons = belong.filter((n) => addonNames.has(n));
    let ok;
    if (opCores.length) {
      ok = opCores.some((n) => cores.has(n));      // 有核心归属：该核心随机到了才出现
    } else if (addons) {
      ok = opAddons.some((n) => addons.has(n));    // 无核心归属：看附加盟约
    } else {
      ok = opAddons.length > 0;                    // 上界：只要挂过附加盟约就当可能出现
    }
    (ok ? available : excluded).push(op);
  }

  const shownCores = [...cores].filter((n) => coreNames.has(n));
  return {
    available: available.sort(),
    excluded: excluded.sort(),
    reason: '本局核心盟约 ' + (shownCores.length ? shownCores.join('、') : '（没给）')
      + (addons ? '；附加盟约已按给定清单算' : '；附加盟约未给，按「都可能出现」的上界算'),
  };
}

export const DEFAULT_COST_BY_TIER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

/** 调度中心升级费默认表（Lv→下一级花费）。2 本以上仍是 GAP，只有 1→2 有实测数。 */
export const DEFAULT_LEVELUP_COST = { 1: 5, 2: 4, 3: 6, 4: 8, 5: 10 };

/**
 * 用 economy.json 的 levelup 行覆盖默认升级费表。
 * 数据里只有「首次升级 5 点」这一条有确切数额（险境），其余行 money 为 null ——
 * 没数额的保持默认，不猜 0（猜 0 会让决策层以为升级免费，把钱全砸进去）。
 * @param {Array<{level:number,money:number|null,note?:string}>} rows
 * @param {Record<number,number>} [base]
 */
export function levelupTableFromEconomy(rows, base = DEFAULT_LEVELUP_COST) {
  const out = { ...base };
  for (const r of Array.isArray(rows) ? rows : []) {
    const money = Number(r && r.money);
    const to = Number(r && r.level);
    if (!Number.isFinite(money) || money <= 0 || !Number.isFinite(to)) continue;
    out[Math.max(1, to - 1)] = money; // level 记的是「升到第几本」，表键用升前等级
  }
  return out;
}

/**
 * 社区评级权重（covenants.json 的 S/A/B/C 档）。
 * 只用于在两三只卡之间排序，不能当游戏内数值；C 档给负分是「别为它花钱」。
 */
export const COVENANT_TIER_WEIGHT = {
  S: 1.5, 'A+': 1.1, A: 0.8, 'A-': 0.6, 'B+': 0.3, B: 0, 'B-': -0.5, C: -1.5, D: -2,
};

/**
 * 档位字符串 → 权重表的键。数据里有「B（被削）」这种带备注的写法，
 * 直接大写查表查不到（等于没评级），先剥到 /^[SABCD][+-]?/。
 * 带「被削/削弱」又没写 +/- 的落低半档：B（被削）按 B- 算，别和干净的 B 同分。
 */
export function tierKeyOf(tier) {
  const raw = String(tier == null ? '' : tier).trim().toUpperCase();
  const m = raw.match(/^[SABCD][+-]?/);
  if (!m) return '';
  const key = m[0];
  if (COVENANT_TIER_WEIGHT[key] === 0 && /削/.test(String(tier))) {
    const low = key + '-';
    if (low in COVENANT_TIER_WEIGHT) return low;
  }
  return key;
}

/** 档位 → 权重。认不出的档位按 0（不参与排序），但「B（被削）」这类能认。 */
export function tierWeightOf(tier) {
  const w = COVENANT_TIER_WEIGHT[tierKeyOf(tier)];
  return typeof w === 'number' ? w : 0;
}

/** 等阶的基础价值权重：高阶干员面板与技能更强，但不能无脑拿 */
export const TIER_VALUE = { 1: 1, 2: 1.6, 3: 2.4, 4: 3.4, 5: 4.6, 6: 6.0 };
const CN_NUM = '一二三四五六';
/** 卡面等阶可能是 3 / '3' / '三阶' / 'III'，统一折成 1–6 再查权重；认不出就当 0 分 */
export function tierValueOf(tier) {
  const n = Number(tier);
  if (Number.isFinite(n) && TIER_VALUE[n]) return TIER_VALUE[n];
  let s = String(tier || '').trim().replace(/[阶星]$/, '');
  if (CN_NUM.includes(s) && s.length === 1) { const d = CN_NUM.indexOf(s) + 1; return TIER_VALUE[d] || 0; }
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }[s.toUpperCase()];
  if (roman) return TIER_VALUE[roman] || 0;
  const m = s.match(/\d+/);
  return m ? (TIER_VALUE[Number(m[0])] || 0) : 0;
}

/* ---------------- 数据驱动的买卡打分（2026-11-10 重写） ----------------
 * 打分只认 world/data 里的条目，每条加分都要能在理由里指出命中了哪一条：
 *   covenants.core / extra  → 核心盟约成员 + 社区评级（S/A/B…）
 *   runflow.units           → 18 条强卡评价
 *   runflow.buyPriority     → 9 条买卡优先级
 *   guides.principles       → 三合一等基础原则
 *   protocol.items          → 装备/消耗品（盟约之币这类不许当默认首选）
 * 没有数据支撑的卡只拿基础强度分，不当主角。
 */
const STACKER_NAMES = ['空弦', '云记', '渡桥', '卡达', '小猫', '青汁'];

/** 剥掉「(?)」「（暂译）」这类后缀，数据表里的名字和 OCR 出来的名字才能对上 */
function bareName(name) {
  return String(name == null ? '' : name)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function shortText(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** 消耗品：装备时销毁换钱，且不提供层数（盟约之币是典型；随身身份牌给层数，不算） */
function isConsumableItem(item) {
  const eff = String((item && (item.effect_base || item.effect)) || '');
  return /获得\s*\d*\s*资金/.test(eff) && !/层数/.test(eff);
}

let _dataCache = null;
/** 懒加载只读数据。knowledge.js 自己会缓存文件内容，这里缓存整理后的索引。 */
function dataCache() {
  if (_dataCache) return _dataCache;
  const rf = (() => { try { return runflow() || {}; } catch { return {}; } })();
  const eco = (() => { try { return economy() || {}; } catch { return {}; } })();
  const proto = (() => { try { return protocol() || {}; } catch { return {}; } })();
  const strength = (() => { try { return communityCovenantStrength() || {}; } catch { return {}; } })();
  const unitMap = new Map();
  for (const u of rf.units || []) {
    const k = bareName(u && u.name);
    if (k) unitMap.set(k, u);
  }
  const itemMap = new Map();
  for (const it of ((proto.items && proto.items.equipment) || [])) if (it && it.name) itemMap.set(it.name, it);
  _dataCache = {
    buyPriority: rf.buyPriority || [],
    unitMap,
    itemMap,
    strength,
    coreNames: new Set(COVENANTS.filter((c) => c.kind === 'core').map((c) => c.name)),
    covenantMeta: new Map(COVENANTS.map((c) => [c.name, c])),
    levelup: eco.levelup || [],
  };
  return _dataCache;
}

/** 这只干员是不是核心盟约成员，顺带算它离激活还差几只 */
function coreFitOf(cand, ctx) {
  const idx = dataCache();
  const name = bareName(cand && cand.name);
  const owned = (ctx.owned && (ctx.owned[cand.name] || ctx.owned[name])) || 0;
  const covs = COVENANT_OF[name] || [];
  for (const cov of covs) {
    if (!idx.coreNames.has(cov)) continue;
    const meta = idx.covenantMeta.get(cov) || {};
    const need = Number(meta.need) || 3;
    const have = ((ctx.covenantMembers && ctx.covenantMembers[cov]) || [])
      .filter((x) => (((ctx.owned && (ctx.owned[x] || ctx.owned[bareName(x)])) || 0) > 0)).length;
    const next = have + (owned > 0 ? 0 : 1);
    const rating = (ctx.covenantStrength && ctx.covenantStrength[cov] && ctx.covenantStrength[cov].tier)
      || (idx.strength[cov] && idx.strength[cov].tier) || meta.tier || '';
    const w = tierWeightOf(rating);
    const active = (ctx.activeCovenants || []).includes(cov) || (ctx.coreCovenants || []).includes(cov);
    // C 档核心（炎/谢拉格/卡西米尔）没激活时不值得为「核心」二字加分——
    // 那是「不推荐」的意思，理由也不该出现（wiring 用例盯着这条）。
    if (!active && w < 0.3) continue;
    return {
      bonus: 1.5 + w,
      tag: next === need ? 'core-activation' : 'core-member',
      reason: '核心盟约·' + cov + ' 成员（covenants.core 评级 ' + (rating || '?')
        + '，权重 ' + w.toFixed(2) + '；' + have + '/' + need + ' 人'
        + (next === need ? '，这只正好凑满激活' : '') + '）',
    };
  }
  return null;
}

/** 命中 runflow.buyPriority 的哪几条（最多返回全部，调用方取前 2） */
function buyPriorityHits(cand, ctx, item, cost) {
  const idx = dataCache();
  const name = bareName(cand && cand.name);
  const round = Number(ctx.round) || 1;
  const covs = COVENANT_OF[name] || [];
  const core = (Array.isArray(ctx.coreCovenants) && ctx.coreCovenants.length)
    ? ctx.coreCovenants : ctx.activeCovenants;
  const hits = [];
  const add = (n) => {
    const rule = idx.buyPriority[n - 1];
    hits.push({ n, rule: typeof rule === 'string' ? rule : String((rule && rule.rule) || '') });
  };
  if (round === 1 && (Number(cand.tier) || 1) === 1 && cost <= 2) add(1);
  if (STACKER_NAMES.includes(name)) add(3);
  if (covs.includes('精准') || covs.includes('灵巧')) add(4);
  if (name === '机械师' || name === '华法林') add(5);
  if (Array.isArray(core) && core.includes('阿戈尔') && covs.includes('阿戈尔')) add(6);
  if (name === '车尔尼' && round <= 5) add(7);
  if ((name === '黑键' || name === '霍尔海雅') && round >= 4) add(7);
  if (item && !isConsumableItem(item)
    && /资金|理财|斗篷/.test(String(item.name) + String(item.effect_base || '')) && round <= 4) add(8);
  return hits;
}

/** 并列时：分数高的先，同分便宜的先，再按名字稳定排序（adviseRest 用它） */
export function compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.cost !== b.cost) return a.cost - b.cost;
  return String(a.name).localeCompare(String(b.name), 'zh');
}

/**
 * 给一个商店候选打分。分数越高越该买。
 * 公式（每一项都能在 reasons 里找到数据出处）：
 *   2.0*TIER_VALUE − 0.2*费用
 *   + 核心盟约(1.5+评级权重) + 强卡 2.2 + buyPriority 0.8/条
 *   + 三合一(差1只 1.8 / 差0只 4.5) + covenantBonus
 *   − 消耗品 12（钱 ≥ 费用+4 时免罚） / 普通装备 3
 * @param {{name:string,tier:number,traits?:string[],tags?:string[]}} cand
 * @param {object} ctx
 * @param {Record<string,number>} [ctx.owned]  已有同名干员数量（算三合一）
 * @param {string[]} [ctx.activeCovenants]     已经叠起来的盟约名
 * @param {string[]} [ctx.coreCovenants]       本局核心盟约（buyPriority #6 用）
 * @param {Record<string,string[]>} [ctx.covenantMembers] 盟约名→干员名列表
 * @param {number} [ctx.money]
 * @param {number} [ctx.round]
 * @param {object} [ctx.config]
 */
export function scoreCandidate(cand, ctx = {}) {
  const config = ctx.config || {};
  const costByTier = config.costByTier || DEFAULT_COST_BY_TIER;
  const tier = Number(cand.tier) || 1;
  const cost = cand.cost != null ? Number(cand.cost) : (costByTier[tier] ?? tier);
  const value = TIER_VALUE[tier] ?? tier;
  const name = bareName(cand.name);
  const idx = dataCache();
  const item = idx.itemMap.get(name) || null;
  const consumable = Boolean(item && isConsumableItem(item));
  const money = typeof ctx.money === 'number' ? ctx.money : Infinity;
  const reasons = [];
  const tags = [];

  // 池子校验：给 ctx.pool 就说明已经知道本局核心盟约随机到哪几个了，
  // 池子外的干员根本刷不出来（规则来自游戏内「模拟细则」），别给它打分。
  if (Array.isArray(ctx.pool) && !ctx.pool.includes(cand.name)) {
    return {
      name: cand.name, score: -Infinity, affordable: false, tags,
      reasons: ['不在本局池子里（核心盟约没随机到它，调度中心不会出现）'],
    };
  }

  // 基线用「绝对强度」而不是「性价比」：资金回合结束清零，花光才是目标，
  // 买得起的情况下该拿最强的那只，省下来的钱不会变成任何东西。
  let score = 2.0 * value - 0.2 * (Number.isFinite(cost) ? cost : 0);
  reasons.push('基础强度 等阶' + tier + '/' + cost + '费（TIER_VALUE）');

  // 核心盟约成员：优先级高于「便宜」。乌萨斯 A、阿戈尔 S 直接决定全队上限。
  const core = coreFitOf(cand, ctx);
  if (core) {
    score += core.bonus;
    tags.push(core.tag);
    reasons.push(core.reason);
  }

  // runflow.units 的 18 条强卡评价（塔露拉、空弦、乌啾…）
  const unit = idx.unitMap.get(name);
  if (unit) {
    score += 2.2;
    tags.push('strong');
    reasons.push('runflow.units 强卡：' + shortText(unit.why, 26));
  }

  // buyPriority：每条命中 +0.8，最多计前 2 条，理由里带条目原文。
  const hits = buyPriorityHits(cand, ctx, item, cost).slice(0, 2);
  for (const h of hits) {
    score += 0.8;
    tags.push('priority');
    reasons.push('buyPriority #' + h.n + '：' + shortText(h.rule, 22));
  }

  // 三合一（guides.principles：3 张同名【初始】合成 1 张【精锐】）
  const owned = (ctx.owned && (ctx.owned[cand.name] || ctx.owned[name])) || 0;
  if (owned >= 2) {
    score += 4.5;
    tags.push('triple-ready');
    reasons.push('已 2 只，再 1 只凑三合一升精锐（guides.principles #3）');
  } else if (owned === 1) {
    score += 1.8;
    tags.push('triple');
    reasons.push('已有 1 只，再 1 只可凑三合一（guides.principles #3）');
  }

  // 盟约协同：沿用 covenantBonus，没传评级就用社区数据。
  const covBonus = covenantBonus(cand, { ...ctx, covenantStrength: ctx.covenantStrength || idx.strength });
  // 只加正分（负权重不该把「已经在叠的盟约」算成减分），
  // 但理由非空就留下：负权重被夹成 0 这件事本身就是要说给人听的。
  if (covBonus.bonus > 0) score += covBonus.bonus;
  if (covBonus.reason) reasons.push(covBonus.reason);

  // 装备 / 消耗品：盟约之币这类「装备时销毁换 1 资金」是理财装，不是默认首选。
  if (item) {
    if (consumable) {
      tags.push('consumable');
      if (money >= cost + 6 && money >= 6) {
        reasons.push('protocol.items 消耗品（' + item.name + '：' + shortText(item.effect_base, 20)
          + '）——钱多到花不完才顺手买');
      } else {
        score -= 12;
        reasons.push('protocol.items 消耗品（' + item.name + '：' + shortText(item.effect_base, 20)
          + '）——会烧掉，不该当默认首选');
      }
    } else {
      tags.push('equipment');
      score -= 3;
      reasons.push('protocol.items 装备（' + item.name + '：' + shortText(item.effect_base, 20) + '）——装备位有限');
    }
  }

  // 买不起：分数照算，只标 affordable=false。
  // 不能直接给 -Infinity —— 那样「值得留但买不起」的卡就消失了，
  // 而这正是该冻结(freeze)的信号（冻结能把它留到下回合休整期）。
  if (typeof ctx.money === 'number' && cost > ctx.money) {
    return {
      name: cand.name, tier, cost,
      score: Number(score.toFixed(3)),
      affordable: false, tags,
      reasons: reasons.concat(['买不起（' + cost + ' > ' + ctx.money + '）']),
    };
  }

  return { name: cand.name, tier, cost, score: Number(score.toFixed(3)), affordable: true, tags, reasons };
}

/**
 * 休整期该干什么。返回单个动作。
 * @param {object} s 场面
 * @param {number} s.money 当前资金
 * @param {number} s.centerLevel 调度中心等级
 * @param {number} s.round 当前回合（1 起）
 * @param {number} s.totalRounds 总回合数（标准 9）
 * @param {Array} s.shop 本轮商店候选 [{name,tier,traits,cost?}]
 * @param {Record<string,number>} [s.owned] 同名持有数
 * @param {string[]} [s.activeCovenants]
 * @param {Record<string,string[]>} [s.covenantMembers]
 * @param {number} [s.deployLimit] 默认 8
 * @param {number} [s.deployed] 已上场人数
 * @param {object} [s.config]
 * @returns {{action:string,target?:string,reason:string,spend?:number,alternatives?:Array}}
 */
/**
 * 这一回合「应该已经升到」的调度中心等级。
 * 表来自社区攻略（world/data/economy.json → levelup），2026-11-09 学习：
 * 险境初始 4 块、首次升级 5 点，所以 R1 升不了；R2 上 2 本；R4–5 上 3 本；
 * R5 前后跳 4 本（4 本才刷本家叠层牌）；R8 上 5 本；6 本看经济，不强求。
 */
export const LEVEL_PLAN = [
  [1, 1], [2, 2], [4, 3], [5, 4], [8, 5], [10, 6],
]

/**
 * 从 economy.levelup 生成「第几回合该到几本」的表 {本数: 最早回合}。
 * 数据里 R1 那行写着「第 1 回合升不了」，实际最早 R2 到 2 本；同一本有多行取最早。
 * 数据缺了才回落到 LEVEL_PLAN（旧的手写表，不能让缺数据变成不升级）。
 */
export function levelupSchedule() {
  const at = new Map();
  for (const r of dataCache().levelup) {
    const lv = Number(r && r.level);
    const rd = Number(r && r.round);
    if (!Number.isFinite(lv) || lv < 2 || !Number.isFinite(rd)) continue;
    const round = /升不了/.test(String((r && r.note) || '')) ? rd + 1 : rd;
    const prev = at.get(lv);
    if (prev == null || round < prev) at.set(lv, round);
  }
  if (!at.size) for (const [from, lv] of LEVEL_PLAN) at.set(lv, from);
  return at;
}

export function targetLevelFor(round) {
  const r = Number(round) || 1;
  let want = 1;
  for (const [lv, from] of levelupSchedule()) if (r >= from) want = Math.max(want, lv);
  return want;
}

/**
 * 首升本的实际费用：economyMeta.firstUpgradeCost=5（R1），levelupCostDecay=每回合 -1（最低 0）。
 * 只对 Lv1→2 应用衰减（有实测），Lv2 以上没有数据，别猜。
 * 调用方用 OCR 读到的价覆盖时（drive.js 的 config.levelupCost）不要调这个，否则二次衰减。
 */
export function effectiveLevelupCost(level, round) {
  const base = Number(DEFAULT_LEVELUP_COST[level]);
  if (!Number.isFinite(base) || base <= 0) return base;
  if (Number(level) !== 1) return base;
  return Math.max(1, base - Math.max(0, (Number(round) || 1) - 1));
}

export function adviseRest(s) {
  const config = s.config || {};
  const costByTier = config.costByTier || DEFAULT_COST_BY_TIER;
  const levelupCost = config.levelupCost || s.levelupCost || DEFAULT_LEVELUP_COST;
  // 社区买卡优先级（data/runflow.json 的 buyPriority）：只当提示条，不改分数。
  // 分数是算出来的，攻略是别人的嘴 —— 冲突时听分数的，提示条留给人看。
  const rules = Array.isArray(s.buyRules) ? s.buyRules : [];
  const deployLimit = s.deployLimit ?? 8;
  const money = Number(s.money) || 0;
  const centerLevel = Number(s.centerLevel) || 1;
  const round = Number(s.round) || 1;
  const totalRounds = Number(s.totalRounds) || 9;
  const shop = Array.isArray(s.shop) ? s.shop : [];

  /**
   * 一条买卡规则管哪几回合：数据里有 from/to/round 就用字段，
   * 没有就从「第 N 回合 / 第 N-M 回合」里认；都认不出 = 全程适用。
   * 之前不分回合，「第 1 回合只买一阶」能一直挂在第 6 回合的买卡清单里。
   */
  const ruleRange = (r) => {
    const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const from = num(r && r.from);
    const to = num(r && r.to);
    const only = num(r && r.round);
    if (from != null || to != null || only != null) {
      const a = only != null ? only : (from != null ? from : 0);
      const b = only != null ? only : (to != null ? to : Infinity);
      return [Math.min(a, b), Math.max(a, b)];
    }
    const m = String((r && r.rule) || '').match(/第\s*(\d+)\s*(?:[-–~—到至]\s*(\d+))?\s*回合/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const checklistFor = (action) => {
    const kw = {
      levelup: /升调度|升本|升到|升级|跳.{0,2}本|上.{0,2}本/,
      // 「卡」太宽（卡达、小猫、莱塔尼亚…都会误命中），刷牌归 reroll
      buy: /买|拿/,
      reroll: /刷新|刷牌|搜/,
      freeze: /冻/,
      place: /摆|站|部署/,
      ready: /准备/
    }[action];
    if (!kw) return [];
    return rules.filter((r) => {
      if (!kw.test(String((r && r.rule) || ''))) return false;
      const range = ruleRange(r);
      return !range || (round >= range[0] && round <= range[1]);
    }).map((r) => r.rule).slice(0, 3);
  };

  const scored = shop
    .map((c) => scoreCandidate(c, {
      owned: s.owned,
      activeCovenants: s.activeCovenants,
      covenantMembers: s.covenantMembers,
      covenantStrength: s.covenantStrength,
      coreCovenants: s.coreCovenants || s.activeCovenants,
      pool: s.pool,
      money,
      round,
      config,
    }))
    .sort(compareCandidates);
  const buyable = scored.filter((x) => x.affordable && x.score > 0);

  // 1) 升调度中心：按 economy.levelup 的回合表判断「该不该到几本」，不是「有钱就升」。
  //    表里的行是 {round, level, note}：R2 到 2 本、R4–5 到 3 本、R5 跳 4 本、R8 到 5 本、R10 到 6 本。
  //    升级和买卡一起排序：店里全是垃圾才把钱砸进升级，有核心/强卡就先补阵容（buyPriority #2/#3）。
  const nextLevel = centerLevel + 1;
  const levelCap = Number(config.centerLevelCap) || 6;
  const wantLevel = Math.min(levelCap, targetLevelFor(round));
  const schedule = levelupSchedule();
  const schedRound = Number(schedule.get(nextLevel)) || round;
  const late = round > schedRound;
  // 升完必须留够买卡的钱，否则就是纯空窗 —— 2026-11-10 两局都栽在这：
  //   第 2 回合钱 5，直接升 Lv2 花掉 5（OCR 那个价），战报 bought: []，阵容空转；
  //   第 5 回合把 8 块全砸进 4 本，剩 2 块什么都买不起，当场 19 血掉到 1 血。
  //
  // 阈值 3 的依据（world/data/economy.json，不是拍的）：
  //   · economyMeta.firstUpgradeCost = 5（R1→Lv2 首升），levelupCostDecay = 每回合 -1（最低 0），
  //     所以 R2 升 Lv2 是 4 点 —— 钱 4~5 时「刚好够升」，升完只剩 0~1，一张卡都买不起；
  //   · economyMeta.startMoney = 4、income 只有「击倒悬赏敌人 1–4 资金」，
  //     没有稳定的每回合基础收入，下一回合拿多少不可预期，不能拿它做兜底；
  //   · DEFAULT_COST_BY_TIER 里二阶卡 2 费，economyMeta.refreshCost = 1，
  //     3 = 一张 2 费卡 + 1 块刷新（或一张 1 费卡 + 一张 2 费卡）。
  // 所以：升级后剩不到 3 块就先进商店买卡，把升级留到下一回合（晚升还更便宜）。
  // 升级仍和买卡用同一套分数排序（下面的 levelScore 对 buyable[0].score），
  // 不是「升级永远优先」也不是「买卡永远优先」。
  const UPGRADE_MIN_RESERVE = 3;
  const reserve = UPGRADE_MIN_RESERVE;
  const explicitTable = config.levelupCost || s.levelupCost || null;
  const rawUpCost = (explicitTable || DEFAULT_LEVELUP_COST)[centerLevel];
  const upCost = explicitTable ? rawUpCost : effectiveLevelupCost(centerLevel, round);
  const canLevel = centerLevel < wantLevel && typeof upCost === 'number'
    && money >= upCost + reserve && round <= totalRounds - 2;
  // 升级的基础分：该升就值钱，已经晚了更急；本数差得越多越优先。
  const levelScore = 4 + (late ? 2 : 0) + 1.5 * Math.max(0, wantLevel - centerLevel);
  if (canLevel && (!buyable.length || buyable[0].score < levelScore)) {
    return {
      action: 'levelup',
      target: String(nextLevel),
      spend: upCost,
      reason: '升调度中心 Lv' + centerLevel + '→' + nextLevel
        + '：economy.levelup 表要求第 ' + schedRound + ' 回合到 ' + nextLevel + ' 本（现在第 ' + round + ' 回合'
        + (late ? '，已经晚了' : '') + '）；花 ' + upCost + '，留 ' + reserve + ' 买卡'
        + (explicitTable ? '' : '（首升 5 点每回合 -1，economyMeta.levelupCostDecay）'),
      checklist: checklistFor('levelup'),
    };
  }

  // 2) 能买就买最值的（资金清零规则：留着 = 浪费）。
  //    优先级来自 runflow.buyPriority：核心盟约成员/强卡 > 三合一组件 > 升级 > 刷新 > 冻结。
  if (buyable.length > 0) {
    const best = buyable[0];
    const prefix = canLevel ? '先补阵容（比升级更值）：' : '';
    return {
      action: 'buy',
      target: best.name,
      spend: best.cost,
      reason: prefix + best.reasons.join('；'),
      alternatives: buyable.slice(1, 4).map((x) => x.name + '(' + x.score + ')'),
      checklist: checklistFor('buy'),
    };
  }

  // 2.5) 冻结：想买但这一回合买不起（或栏位不够）的好卡，冻结能留到下一回合的休整期。
  //      规则原文（游戏内战斗细则）：「冻结可保留当前调度中心的状态并将其保持至下回合的休整期中」，
  //      「若冻结时调度中心内存在空置栏位，其状态不会被保留」—— 所以只有满了的栏位才值得冻。
  const wanted = scored.filter((x) => x.score > 0 && !x.affordable);
  if (wanted.length > 0 && round <= totalRounds - 1) {
    const want = wanted[0];
    return {
      action: 'freeze',
      target: want.name,
      reason: '买不起但值得留（' + want.reasons.join('；') + '），冻结到下回合休整期；注意空置栏位不会被冻结',
      alternatives: wanted.slice(1, 3).map((x) => x.name + '(' + x.score + ')'),
      checklist: checklistFor('freeze'),
    };
  }

  // 3) 还有闲钱 → 刷新找更好的（1 资金）；末期不再刷，直接摆位
  if (money >= 1 && round <= totalRounds - 1) {
    return { action: 'reroll', spend: 1, reason: '手里 ' + money + ' 资金但店里没有值得买的，花 1 刷新', checklist: checklistFor('reroll') };
  }

  // 4) 摆位检查
  const deployed = Number(s.deployed) || 0;
  if (deployed < Math.min(deployLimit, (s.handSize || deployed))) {
    return { action: 'place', reason: '还有空位没站满（' + deployed + '/' + deployLimit + '），部署顺序=整备区顺序，先站满', checklist: checklistFor('place') };
  }

  // 5) 收工
  return { action: 'ready', reason: '资金 ' + money + '，没有可买项，检查完站位就点准备', checklist: checklistFor('ready') };
}

/**
 * 多选一（3 选 1 / 6 选 1）该拿哪个。
 * @param {Array<{name:string,kind?:string,tier?:number,effect?:string}>} options
 * @param {{activeCovenants?:string[],covenantMembers?:Record<string,string[]>,round?:number,totalRounds?:number,money?:number}} ctx
 */
export function adviseDraft(options, ctx = {}) {
  const active = new Set(ctx.activeCovenants || []);
  const members = ctx.covenantMembers || {};
  const list = (Array.isArray(options) ? options : []).map((o) => {
    let score = 0;
    const reasons = [];
    const name = o.name || '';
    if (o.tier) { const tv = tierValueOf(o.tier); if (tv) score += tv; reasons.push('等阶' + o.tier); }
    for (const [cov, arr] of Object.entries(members)) {
      if (Array.isArray(arr) && arr.includes(name)) {
        if (active.has(cov)) { score += 3; reasons.push('延续盟约' + cov); }
        else { score += 1; reasons.push('可开盟约' + cov); }
        const stw = (ctx.covenantStrength || {})[cov];
        const w = stw && stw.tier ? tierWeightOf(stw.tier) : 0;
        if (w !== 0) { score += w; reasons.push('评级 ' + stw.tier); }
        break;
      }
    }
    if (/资金|补给|招募/.test(String(o.effect || ''))) { score += 1.5; reasons.push('经济类'); }
    if (/盟约|层数/.test(String(o.effect || ''))) { score += 2; reasons.push('盟约类'); }
    return { name, score: Number(score.toFixed(2)), reasons };
  }).sort((a, b) => b.score - a.score);

  return { pick: list[0] ? list[0].name : null, ranking: list };
}

/**
 * 开局「初始策略」6 选？（数据里共 61 条，按通关次数解锁）。
 *
 * 打分逻辑（有理由，别乱调）：初始目标生命值是唯一直接决定「能错几次」的资源，
 * 所以 hp 给固定底分；再按这局打算走的路子加关键字分。没解锁的直接判 -Infinity。
 *
 * @param {Array<{name:string,hp:string|number,effect:string,unlock?:string}>} strategies
 * @param {{plan?:'balanced'|'covenant'|'economy'|'elite', unlocked?:string[]}} ctx
 */
export function adviseOpening(strategies, ctx = {}) {
  const unlocked = new Set(ctx.unlocked || []);
  const plan = ctx.plan || 'balanced';
  const list = (Array.isArray(strategies) ? strategies : []).map((o) => {
    const hp = Number(String(o.hp ?? '').replace(/[^\d.]/g, '')) || 0;
    const effect = String(o.effect || '');
    const locked = Boolean(o.unlock) && !unlocked.has(o.name);
    // hp 用「超过 20 的部分」计分，不线性放大：40 血≠比 26 血强一倍，
    // 但 4 点血的差距应该能被一个路子对得上的关键词翻过去（实测 29 vs 25 就是分界）
    let score = Math.max(0, hp - 20);
    const reasons = ['生命值 ' + hp];
    if (locked) {
      return { name: o.name, score: -Infinity, locked: true, reasons: ['未解锁：' + o.unlock] };
    }
    if (/盟约|层数/.test(effect)) {
      const b = plan === 'covenant' ? 6 : 2;
      score += b; reasons.push('盟约向' + (plan === 'covenant' ? '（本局主打）' : ''));
    }
    if (/资金|补给|招募|价格|刷新/.test(effect)) {
      const b = plan === 'economy' ? 5 : 1.5;
      score += b; reasons.push('经济向' + (plan === 'economy' ? '（本局主打）' : ''));
    }
    if (/精锐/.test(effect)) {
      const b = plan === 'elite' ? 5 : 1.5;
      score += b; reasons.push('精锐向' + (plan === 'elite' ? '（本局主打）' : ''));
    }
    if (/击倒|复活|生命上限|再部署/.test(effect)) { score += 2; reasons.push('容错'); }
    return { name: o.name, score: Number(score.toFixed(2)), locked: false, reasons };
  }).sort((a, b) => {
    // 未解锁的永远沉底（-Infinity 参与相减会变 NaN，得单独挡）
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    return b.score - a.score;
  });

  const pick = list.find((x) => !x.locked);
  return {
    pick: pick ? pick.name : null,
    reason: pick ? pick.reasons.join('，') : '没有可用策略（全被解锁条件挡着）',
    ranking: list,
  };
}

/**
 * 一局结束后从记录里抽结论。输入是采集到的回合序列。
 * @param {Array<{round:number,moneyLeft?:number,lifeLost?:number,won?:boolean,notes?:string}>} rounds
 */
export function reviewRun(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  const wasted = list.filter((r) => (r.moneyLeft || 0) > 0);
  const lost = list.filter((r) => (r.lifeLost || 0) > 0);
  const won = list.filter((r) => r.won === true).length;
  const findings = [];
  if (wasted.length) {
    findings.push('有 ' + wasted.length + ' 个回合没把钱花光（回合 ' + wasted.map((r) => r.round).join(',') + '），按规则这是纯亏');
  }
  if (lost.length) {
    findings.push('掉血回合：' + lost.map((r) => r.round + '(掉' + r.lifeLost + ')').join('、'));
  }
  if (list.length) {
    findings.push('作战通过 ' + won + '/' + list.length);
  }
  return {
    rounds: list.length,
    wastedMoneyRounds: wasted.map((r) => r.round),
    lifeLostRounds: lost.map((r) => r.round),
    winRate: list.length ? Number((won / list.length).toFixed(3)) : null,
    findings,
  };
}
