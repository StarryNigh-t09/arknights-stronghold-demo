/**
 * wants.js — 目标阵容清单（纯函数，不碰设备、不读文件）
 *
 * 用户 2026-11-10 15:46 的原话：每局开局前列出需要哪些角色，然后照着买；
 * 不是每轮看商店里谁分高就买谁。所以买卡从「逐张打分」改成「清单驱动」：
 *
 *   开局 → buildWantList 定清单（谁、为什么）
 *   每轮 → wantGaps 算缺口
 *   买卡 → pickFromShop 先补缺口，补不上才回落到 decide.scoreCandidate
 *
 * 清单还会被现实改：盟约被 ban、某人一直刷不出、有机会凑三合一 —— 这些都用
 * 「重新算一次 gaps」来表达，不往清单里写死状态。
 *
 * 排序依据（用户 m03925 / m03946）：
 *   - 叠层（盟约）比阶数重要：不凑盟约时阶数越高越好；
 *   - 池子是「默认干员 + 自选编队 − 被 ban 的盟约」，传进来的 pool 已经是算完的。
 */

/** 一条清单项的分：阶数打底，能叠本局盟约的加权。 */
export function wantScore(op = {}, { activeCovenants = [] } = {}) {
  const tier = Number(op.tier) || 1;
  const covs = Array.isArray(op.covenants) ? op.covenants : [];
  const act = new Set(activeCovenants.map((x) => String(x)));
  const hit = covs.filter((c) => act.has(String(c)));
  // 阶数：1 阶 1 分、6 阶 6 分，线性（不作指数 —— 高阶卡贵，清单里要留低阶位给叠层件）。
  let score = tier;
  // 每条命中本局已激活盟约 +2.5：用户说叠层比阶数重要。
  score += hit.length * 2.5;
  // 只在「附加盟约」上沾边的给一点：能帮别人激活，但不如自己就是。
  if (!hit.length && covs.length) score += 0.3;
  return { score, hit };
}

/**
 * 生成目标阵容清单。
 * @param {object} p
 * @param {Array<{name:string,tier:number,covenants:string[],cls?:string}>} p.pool 本局池子
 * @param {string[]} [p.activeCovenants] 本局能激活的盟约（核心盟约 + 已叠起来的）
 * @param {Record<string,number>} [p.quota] 职业配额，如 {重装:2,医疗:1}；不传就不限职业
 * @param {number} [p.limit] 清单最多几条，默认 8（部署上限）
 * @returns {Array<{name,tier,covenants,cls,score,why}>}
 */
export function buildWantList({ pool = [], activeCovenants = [], quota = null, limit = 8, maxTier = 6 } = {}) {
  const scored = (pool || [])
    .filter((x) => x && x.name)
    // 前期资金只有 4–7 块，6 阶卡根本买不起；用 maxTier 把清单按回合阶段收窄。
    .filter((x) => (Number(x.tier) || 1) <= Number(maxTier))
    .map((op) => {
      const { score, hit } = wantScore(op, { activeCovenants });
      const why = [];
      why.push('等阶' + (Number(op.tier) || 1));
      if (hit.length) why.push('能叠 ' + hit.join('/') + '（+' + (hit.length * 2.5).toFixed(1) + '）');
      return {
        name: op.name,
        tier: Number(op.tier) || 1,
        covenants: op.covenants || [],
        cls: op.cls || '',
        score: Number(score.toFixed(3)),
        why: why.join(' · '),
        hit,
      };
    })
    .sort((a, b) => (b.score - a.score) || String(a.name).localeCompare(String(b.name)));

  const out = [];
  const used = new Set();
  // 先按职业配额各取前几名，保证阵容不缺位置（用户 m03053：至少一个医疗、要坦、其余输出）。
  if (quota && typeof quota === 'object') {
    for (const cls of Object.keys(quota)) {
      const need = Number(quota[cls]) || 0;
      let taken = 0;
      for (const it of scored) {
        if (taken >= need) break;
        if (used.has(it.name)) continue;
        if (it.cls !== cls) continue;
        out.push(it);
        used.add(it.name);
        taken += 1;
      }
    }
  }
  for (const it of scored) {
    if (out.length >= limit) break;
    if (used.has(it.name)) continue;
    out.push(it);
    used.add(it.name);
  }
  return out.slice(0, Math.max(0, limit));
}

/**
 * 清单缺口：清单里还没有的（owned 是「已有同名数量」，onBoard 是场上已有的名字）。
 * 三合一要 3 张同名，所以 need 按数量算：清单里每人要 1 张，除非显式给了 need。
 */
export function wantGaps({ wantList = [], owned = {}, onBoard = [], need = 1 } = {}) {
  const board = new Set((onBoard || []).map((x) => String(x && x.name ? x.name : x)));
  return (wantList || [])
    .map((w) => {
      const have = (Number(owned && owned[w.name]) || 0) + (board.has(w.name) ? 1 : 0);
      return { name: w.name, cls: w.cls, tier: w.tier, why: w.why, need, have, gap: Math.max(0, need - have) };
    })
    .filter((g) => g.gap > 0);
}

/**
 * 商店里有没有缺口里的卡。先按清单顺序（清单本身已排好优先），再看买不买得起。
 * @returns {{name:string, cost:number|null, gap:object}|null}
 */
export function pickFromShop({ shop = [], gaps = [], money = Infinity } = {}) {
  const byName = new Map((shop || []).filter((c) => c && c.name).map((c) => [c.name, c]));
  for (const g of gaps) {
    const c = byName.get(g.name);
    if (!c) continue;
    const cost = c.cost == null ? null : Number(c.cost);
    if (cost != null && Number.isFinite(money) && cost > money) continue;
    return { name: c.name, cost, gap: g };
  }
  return null;
}

export default { wantScore, buildWantList, wantGaps, pickFromShop };
