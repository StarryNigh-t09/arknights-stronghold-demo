/**
 * run.js — 一局卫戍协议的驱动器：进对局、过一个回合、打完一局
 *
 * 坐标全部来自 2026-11-09 实机（docs/duel-flow.md），1920x1080 逻辑坐标。
 * 界面判断只认 vision 的状态名；新状态（wz_diff / wz_rest / wz_prep / wz_battle / wz_settle）
 * 由 sidecar/vision.py 提供，缺了就退回「按坐标点 + 等固定时间」。
 */
import { tap, swipe, screenshot, seSwipe, adbPath, currentDevice } from './adb.js';
import { createTouch, toRaw, PICK_DWELL_MS, ARRIVE_DWELL_MS } from './touch.js';
import { classifyBuffer } from './vision.js';
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pythonBin } from './pyenv.js' // 补齐 APPDATA/TEMP 等：python 侧车靠它找 site-packages、找解释器
import { loadGameMap } from './gamemap.js'
import { planDeckChips, rememberDeck } from './decklayout.js'
import { chooseCoreGroup } from './guideplan.js'

const HERE = dirname(fileURLToPath(import.meta.url))

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const POINTS = {
  modePersonal: [1462, 843],
  modeJoint: [1560, 843],
  independent: [1685, 956],
  // 同一格：有进行中的对局时，大厅右下这颗按钮变成「断线重连」（实测 x1480–1890、y905–1045，
  // 中心 1685,975），点了直接回到那一局，不会走「选难度」页。2026-11-11 15:4x 实测。
  reconnect: [1685, 975],
  quick: [1290, 956],
  startSim: [1601, 992],
  ready: [1774, 166],
  dialogConfirm: [1394, 742],
  dialogRememberOff: [877, 607],
  startBattle: [916, 54],
  // 升级按钮（面板底部「升级」二字，y 实测 972）的 x 不能写死：面板紧贴在商店最左卡左边，
  // 而商店格子数 = 3 + 中心等级，每升一级 / 每回合刷新都会挪。用 upgradePoint() 按最左卡边缘算。
  // 兜底的 337 是 Lv2（5 格，最左卡 447）时的实测中心。
  upgrade: [337, 972],
  refresh: [1763, 686],
  freeze: [1540, 686],
  collapse: [1763, 953],
  settleHome: [1753, 1004],
  viewBtn: [1722, 338],
  SHOP_X: [755, 997, 1236, 1476],
  SHOP_Y: 910,
  // 开局三步（1/3 确认本局信息 / 2/3 选择策略 / 3/3 确定自选编队）右下那颗大按钮，
  // 三页共用同一个位置：准备就绪 / 确认选择 / 准备就绪
  setupReady: [1655, 982],
  // 1/3 页左侧那组核心盟约的第一个图标（乌萨斯），点它选整组
  coreGroupA: [473, 371],
  // 2/3 页第一张策略卡（阿米娅「众志合一」）中心
  strategyCard0: [575, 360],
  // 商店折叠/展开按钮在右下角：折叠态显示「展开」（靠下，y≈1005），
  // 展开态显示「收起 ✕」（y≈953）。折叠之后甲板会整体右移 40~150px，
  // 所有甲板坐标必须重新截图量，不能沿用。
  shopExpand: [1770, 1005],
  shopCollapse: [1763, 953],
};

/**
 * 上场用的落点（1920x1080）。前 4 个在蓝色己方半场的可站格上，第 5 个是左侧退路格。
 * 单位按整备区顺序自动部署，落点只决定这一只手放到哪一格。
 */
export const DEPLOY_SLOTS = [
  [1200, 285],
  [1050, 430],
  [900, 300],
  [1350, 470],
  [750, 520],
];

// 2026-11-11 20:40 实测：定朝向原来滑 600px，游戏把它当成「把干员挪到别处」，
// 落到非法格就停在「按住干员等落位」的状态（左侧弹面板、右侧出售、准备就绪点不动）。
// 缩到 70px 只够触发朝向判定，不会进入移动模式。
const FACING_VEC = { right: [70, 0], left: [-70, 0], up: [0, -70], down: [0, 70] };
/** 拖动时幻影相对手指的偏移（实测 2026-11-10 09:16） */
export const PHANTOM = { dx: 33, dy: 120 };

/**
 * 把一个干员从甲板拖到地图格上 —— 严格照 MAA 的两步滑动来（BattleHelper.cpp deploy_oper）：
 *   1) 甲板起手点 → 目标格，20+ 个中间点、总时长 ~600ms（太短的滑动游戏直接忽略）；
 *   2) 停 200ms 让游戏认到「已上场」；
 *   3) 朝目标方向再滑一小段定朝向（1080p 上 600px、150ms）；
 *   4) 停一下再让调用方截图核对。
 *
 * 起手点必须是**干员脚下那块格子的中心**，按精灵身上会被当成单击（弹详情 + 镜头偏移）。
 * 商店展开时拖动无效，调用前先折起来（run.js 的 shopToggle）。
 */
let _touch = null;
function touchChannel() {
  if (_touch) return _touch;
  _touch = createTouch({ adb: adbPath(), serial: currentDevice(), abi: 'x86_64', log: () => {} });
  return _touch;
}

/**
 * 把一个干员从甲板拖到地图格上。2026-11-10 08:55 实测出一条能真正落位的配方：
 *   **起手必须长按 450ms**（不按直接滑 = 只选中，松手不落位），再 12 段 × 45ms 滑到目标格，
 *   落点停 400ms 再松手。松开后「剩余可放置角色」立刻减 1，干员站在格上并带朝向箭头。
 * 走的通道是 minitouch（touch.js），adb input / sendevent 那条路在落位这一步全废。
 * 第二步定朝向：在格心再长按 450ms 后朝目标方向滑，松手生效。
 */
/**
 * 2026-11-11 20:40：收拾「干员被按住等落位」的残留状态。
 * 现象：定朝向那一步把干员拖起来挪到非法格，松手后游戏仍停在移动模式，
 * 左侧弹着干员面板、右侧显示「出售 +1」、「准备就绪」怎么点都没反应。
 * 点一下战场右上角那块空地即可取消选中（实测有效）。
 */
export async function deselectUnit() {
  await tapAt([1700, 250], 300, '取消选中（空白处）');
  await sleep(200);
  return { ok: true };
}
export async function placeUnit({ from, to, facing = 'right', holdStartMs = 50 } = {}) {
  const log = [];
  if (!from || !to) return { ok: false, error: 'placeUnit 需要 from/to', log };
  // 2026-11-10 23:10 用户指出：两步之间在 Node 侧 sleep、重新截图，一个干员要 7 秒。
  // 现在把「长按拖上场 → 松手 → 立刻长按定朝向」写进同一个 minitouch 命令文件，一次执行到底。
  const fx = to[0] + PHANTOM.dx;
  const fy = to[1] + PHANTOM.dy;
  const [sx, sy] = toRaw(from[0], from[1]);
  const [tx, ty] = toRaw(fx, fy);
  // 2026-11-11 用户 m06404：按下之后先停 PICK_DWELL_MS 再滑，游戏才认「拎起来」。
  // 合并成一个 w —— minitouch 连续两行 w 会互相覆盖（touch.js 里有说明）。
  const lines = ['d 0 ' + sx + ' ' + sy + ' 50', 'c', 'w ' + (holdStartMs + PICK_DWELL_MS)];
  const N = 10;
  for (let i = 1; i <= N; i++) {
    const x = Math.round(sx + (tx - sx) * i / N);
    const y = Math.round(sy + (ty - sy) * i / N);
    lines.push('m 0 ' + x + ' ' + y + ' 50', 'c', 'w 45');
  }
  // 2026-11-11 m06537：到格心后停 ARRIVE_DWELL_MS 再松手，等游戏确认落点。
  lines.push('w ' + ARRIVE_DWELL_MS, 'u 0', 'c', 'w 150');
  const d = FACING_VEC[facing];
  if (d) {
    const [ox, oy] = toRaw(to[0], to[1]);
    const [ex, ey] = toRaw(to[0] + d[0], to[1] + d[1]);
    lines.push('d 0 ' + ox + ' ' + oy + ' 50', 'c', 'w 120');
    const M = 6;
    for (let i = 1; i <= M; i++) {
      const x = Math.round(ox + (ex - ox) * i / M);
      const y = Math.round(oy + (ey - oy) * i / M);
      lines.push('m 0 ' + x + ' ' + y + ' 50', 'c', 'w 40');
    }
    lines.push('w 250', 'u 0', 'c', 'w 120');
  }
  log.push('一步上场 手指(' + from.join(',') + ') → 格(' + to.join(',') + ') 朝' + facing);
  const dir = join(HERE, '..', '.tmp');
  mkdirSync(dir, { recursive: true });
  const cmdfile = join(dir, 'place-' + Date.now() + '.txt');
  writeFileSync(cmdfile, lines.join('\n') + '\n', 'utf8');
  const adb = adbPath();
  const serial = currentDevice();
  const push = spawnSync(adb, ['-s', serial, 'push', cmdfile, '/sdcard/_coopanion_place.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  if (push.status !== 0) {
    log.push('push 失败，退回 seSwipe');
    await seSwipe(from[0], from[1], fx, fy, { points: 24, durationMs: 900 });
    return { ok: true, via: 'seSwipe', log };
  }
  const run = spawnSync(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_place.txt'], { windowsHide: true, stdio: 'ignore', timeout: 20000 });
  if (run.error) log.push('minitouch 执行异常：' + run.error.message);
  return { ok: true, via: 'minitouch-onefile', log };
}
/**
 * 通用「长按 → 拖动 → 松手」。拖上场、卖卡、把场上干员拖回甲板都用这一条通道。
 * 2026-11-10 实测：起手不按 450ms 会被当成「选中」，松手什么也不发生。
 */
/**
 * 给干员装装备（2026-11-10 23:26 实测通过）。
 * 配方：长按装备 600ms → 12 段滑到目标格心 → 停 700ms → 松手。
 * 与 placeUnit 的区别：装备不需要幻影偏移，直接落格心；也没有第二步定朝向。
 * 抓起判据：场上干员所在格变绿、甲板格变青；松手后目标单位头顶多一条白条。
 */
/** 比较两张截图在某个格子附近的灰度差，判「格子上有没有多出东西」。 */
/** 一次算多个格子的灰度差（批量上场后统一验收，省 n-1 次 python 启动）。 */
export async function diffCells(before, after, points, half = 55) {
  if (!points || !points.length) return []
  const dir = join(HERE, '..', '.tmp')
  mkdirSync(dir, { recursive: true })
  const b = join(dir, 'dcs-b.png')
  const a = join(dir, 'dcs-a.png')
  const out = join(dir, 'dcs.json')
  writeFileSync(b, before)
  writeFileSync(a, after)
  const payload = JSON.stringify(points.map((q) => [Math.round(q[0]), Math.round(q[1])]))
  const r = spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'diffcells.py'), b, a, payload, String(half), out], { stdio: 'ignore', timeout: 90_000 })
  if (r.status !== 0) return points.map(() => null)
  try {
    return JSON.parse(readFileSync(out, 'utf8')).diffs
  } catch {
    return points.map(() => null)
  }
}

export async function diffCell(before, after, cx, cy, half = 55) {
  const dir = join(HERE, '..', '.tmp')
  mkdirSync(dir, { recursive: true })
  const b = join(dir, 'dc-b.png')
  const a = join(dir, 'dc-a.png')
  const out = join(dir, 'dc.json')
  writeFileSync(b, before)
  writeFileSync(a, after)
  const r = spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'diffcell.py'), b, a, String(Math.round(cx)), String(Math.round(cy)), String(half), out], { stdio: 'ignore', timeout: 60_000 })
  if (r.status !== 0) return null
  try {
    return JSON.parse(readFileSync(out, 'utf8')).diff
  } catch {
    return null
  }
}

export async function placeEquip({ from, to, holdStartMs = DECK_PICK_HOLD_MS, holdMs = 700, steps = 12, stepMs = 45 } = {}) {
  const log = [];
  if (!from || !to) return { ok: false, error: "placeEquip 需要 from/to", log };
  const [sx, sy] = toRaw(from[0], from[1]);
  const [tx, ty] = toRaw(to[0], to[1]);
  const lines = ["d 0 " + sx + " " + sy + " 50", "c", "w " + (holdStartMs + PICK_DWELL_MS)];
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(sx + (tx - sx) * i / steps);
    const y = Math.round(sy + (ty - sy) * i / steps);
    lines.push("m 0 " + x + " " + y + " 50", "c", "w " + stepMs);
  }
  lines.push("w " + (holdMs + ARRIVE_DWELL_MS), "u 0", "c", "w 300");
  const dir = join(HERE, '..', '.tmp')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'coopanion_equip.txt');
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  const pushed = spawnSync(adbPath(), ["-s", currentDevice(), "push", file, "/data/local/tmp/_equip.txt"], { windowsHide: true, stdio: "ignore", timeout: 20000 });
  if (pushed.status !== 0) { log.push("push 失败"); return { ok: false, log }; }
  const run = spawnSync(adbPath(), ["-s", currentDevice(), "shell", "/data/local/tmp/minitouch -f /data/local/tmp/_equip.txt"], { windowsHide: true, stdio: "ignore", timeout: 25000 });
  if (run.error) log.push("minitouch 执行异常：" + run.error.message);
  log.push("装装备 手指(" + from.join(",") + ") → 格(" + to.join(",") + ")");
  return { ok: true, via: "minitouch-onefile", log };
}

export async function dragHold(from, to, opts = {}) {
  const { holdStartMs = 50, holdMs = 800, steps = 12, stepMs = 45 } = opts
  const t = touchChannel()
  const r = t.swipe(from[0], from[1], to[0], to[1], { steps, stepMs, holdMs, holdStartMs, jiggle: false })
  if (!r.ok) {
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
    await seSwipe(from[0], from[1], to[0], to[1], { points: Math.max(20, Math.round(dist / 40)), durationMs: Math.max(550, (dist / 1000) * 450) })
    return { ok: true, via: 'seSwipe' }
  }
  return { ok: true, via: 'minitouch' }
}

/**
 * 卖掉甲板上的一个干员：长按拖到右下角黄色「拖拽至此售出 +1」区域。
 * 普通卡卖 1 块；卖价按**当回合**算（用户 m03053：资金每回合清零）。
 * 2026-11-12 09:2x 真机验证（回合 7，钱 10、甲板 1 张）：从甲板卡 (1414,882) 拖到 (1770,920)
 * → 钱 10→11、甲板 1→0。面板实测边界 x 1657..1880 / y 780..1065（裁图 .tmp/sellzone.png 换算），
 * 旧值 [1840,860] 贴右边缘，换成面板中心。**不需要先进待确认态**，休整期直接拖就行。
 */
export const SELL_ZONE = [1770, 920]

export async function sellDeckUnit(point, opts = {}) {
  if (!point) return { ok: false, error: 'sellDeckUnit 需要甲板落点' }
  const zone = opts.zone || SELL_ZONE
  // 实测：按下 20ms + 14 步 × 40ms 就够（700ms 长按是旧配方，白等 0.7s）
  const r = await dragHold([point[0], point[1]], zone, { holdMs: 20, steps: 14, stepMs: 40 })
  await sleep(500)
  return { ok: r.ok, via: r.via, log: ['卖卡 手指(' + point.join(',') + ') → (' + zone.join(',') + ')'] }
}

/**
 * 把场上的干员收回甲板（换人/挪位）。起点是干员**脚下的格子中心**，终点是甲板空位。
 * 用户 m03053：拖到甲板任意空格即可，收回后甲板上的其它人不重排。
 * 休整期内也可以直接把场上干员拖到另一个格子换位（同一套手势，终点不同）。
 */
export async function boardUnitDrag(fromTile, toPoint, opts = {}) {
  if (!fromTile || !toPoint) return { ok: false, error: 'boardUnitDrag 需要起点格与终点' }
  const r = await dragHold(fromTile, toPoint, { holdMs: opts.holdMs || 700 })
  await sleep(500)
  return { ok: r.ok, via: r.via, log: ['场上拖动 (' + fromTile.join(',') + ') → (' + toPoint.join(',') + ')'] }
}

/**
 * 甲板（整备区）格位。**只在商店折叠状态下有效** —— 展开时拖动无效还会带偏镜头。
 * 实测（2026-11-10 00:00，回合 1）：商店折叠后干员脚下格子在 y≈860，
 * 最右一格 x≈1565，往左每格 180px；拖走一个之后剩下的**不重排**，留在原格。
 */
/**
 * 甲板格位坐标（2026-11-11 用户圈心实测，**商店折叠态**）。
 * 装备甲板 5 格：y 统一 775，间距 142；干员甲板 10 格：间距 148.2，y 从 911 逐格漂到 921（透视）。
 * 商店展开时整套甲板会平移 40~150px，所以操作前必须先折叠（run.js 的 collapseShop）。
 */
export const DECK_EQUIP = [[821, 775], [963, 775], [1104, 775], [1246, 775], [1388, 775]];
export const DECK_UNIT = [[217, 911], [366, 912], [514, 913], [662, 914], [810, 915], [958, 916], [1106, 917], [1255, 918], [1403, 919], [1551, 921]];
/**
 * 甲板取货时「按下到开始移动」的时长（ms）。
 * 2026-11-11 08:27 实测：50ms 起手会被游戏当成**一次点击**，弹出干员/装备详情；
 * 600ms 起手才能把它拎起来（地块变绿 + 朝向菱形 + 白框「点击取消」）。
 * 先在 600 上跑稳，再逐步压到最小可行值（300 → 200 → 150）。
 */
export const DECK_PICK_HOLD_MS = (() => {
  const v = Number(process.env.COOP_DECK_HOLD_MS)
  if (Number.isFinite(v) && v >= 80) return v
  // 2026-11-11 早上实测 600ms 起手能把它拎起来（地块变绿 + 朝向菱形）。
  // m06537 用户明确：拖不到位的原因是**到位置之后没停**，不是起手时长，所以起手回 600，
  // 缺的那段停顿交给 touch.js 的 ARRIVE_DWELL_MS（到格心后、松手前）。
  return 600
})();
/** 甲板按压点的纵向偏移：圈心 y 落在卡片下沿，往上一格才好拎（U1: 911 → 890）。 */
export const DECK_PICK_DY = -21;
/** 旧接口兜底：index 0 = 最右一格（U10）。新代码请直接用 DECK_UNIT。 */
export const DECK_SLOT = { rightX: 1551, pitch: 148, y: 918 };

/**
 * 按甲板序号把干员拖上场。index=0 是最右一格（最先买到的那个排最右）。
 * 调用方自己维护「甲板上还有谁、各自原序号」—— 因为拖走不重排。
 */
/** x 有值时直接用（甲板块检测出来的中心），没有才按序号往回数。 */
/**
 * 扫甲板：用 sidecar/deck.py 找干员头顶那块「Ⅰ」小牌（深色圆角方块 + 白字），
 * 返回的每个点就是**可以按下拖动的点**（牌心 + (52,99) 落在干员身上）。
 * 顺序：从右往左（最右 = 最早买到的）。
 * 2026-11-10 09:19 实测：两家干员 → [{x:1338,y:595},{x:1217,y:595}]；拖走右边那个后只剩 1217。
 */
export async function scanDeckChips(scanOpts = {}) {
  try {
    const buf = screenshot()
    const dir = join(HERE, '..', '.tmp')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const png = join(dir, 'deck-' + Date.now() + '.png')
    const out = png + '.json'
    writeFileSync(png, buf)
    const r = spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'deck.py'), png, out], { windowsHide: true, stdio: 'ignore', timeout: 120_000 })
    if (!existsSync(out)) return { ok: false, error: 'deck.py 没产出（' + (r.error ? r.error.message : 'exit ' + r.status) + '）', chips: [] }
    const raw = JSON.parse(readFileSync(out, 'utf8'))
    // deck.py 返回 { rows, best }：商店卡、干员甲板、装备甲板的「阶」小牌长得一样，
    // Python 侧的 best 规则（成员最多、打平取更靠上）会把**装备甲板**当干员甲板。
    // 2026-11-11 16:0x 实测（trace-08-00-19 第 6 回合）：从那行拖了 2 次，格差 28/58 看着都成功，
    // 实际一个干员都没上场（整备区张数没变），那回合只剩 2 人迎战。
    // 现在按牌间距挑：干员甲板/装备甲板间距 142~148，商店卡间距 243；再取更靠下的那行（折叠态干员甲板 y≈882、
    // 装备甲板 y≈741）。挑不出来才退回 Python 的 best。
    return pickChipsFromDeckJson(raw, scanOpts)
  } catch (e) {
    return { ok: false, error: e.message, chips: [] }
  }
}

export function pickChipsFromDeckJson(raw, scanOpts = {}) {
  const rows = Array.isArray(raw) ? [raw] : (raw.rows || [])
  const rowGap = (row) => {
    const xs = row.map((c) => c.x).sort((a, b) => a - b)
    const gaps = []
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1])
    if (!gaps.length) return null
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }
  // 2026-11-12 10:1x：优先用 deck.py 的木台锚点（bench）。
  //   场上道具（蓝色飞行器/青色球/黑箱）头顶挂着同款「罗马数字」深灰牌，3 个一排、间距 142，
  //   与真整备区干员行的几何完全一致 —— 旧规则「取最靠下的多成员行」在整备区空着时会选中道具行，
  //   报「整备区 3 张」，布阵就去拖幽灵点（trace-2026-11-11T19-10-2 那种反复失败）。
  //   真整备区干员站在底部木台上：按压点 y≈883 落在木台亮带（y 862..982）；道具行按压点 y≈741 在带外。
  //   锚点在（rail.ok）时：bench 就是真甲板行，单张也照收 → 顺手修掉「1 张读成 0 张」。
  const K_OF = (row) => {
    const g = rowGap(row.map((c) => ({ x: c.x }))) || 148.2
    return Math.min(1, Math.max(0.6, g / 148.2))
  }
  const offK = (k) => (c) => ({ x: Math.round(c.x + 52 * k), y: Math.round(c.y + 99 * k), chip: c })
  const rail = (!Array.isArray(raw) && raw.rail) || null
  if (rail && rail.ok === true && Array.isArray(raw.bench)) {
    const keptRows = raw.bench.filter((r) => r.length)
    // 2026-11-14 01:0x：bench 按「最靠下」排，单成员的假行（干员脚下的地图图标）会排到真甲板行前面
    // （deck-1794588405314：bench=[[1190,869 一个],[1510/1212/615, 783 三个]]）→ 优先取成员最多的那行，打平取更靠下。
    const pick = keptRows.slice().sort((a, b) => b.length - a.length || ((b[0] && b[0].y) || 0) - ((a[0] && a[0].y) || 0))[0] || []
    // 2026-11-12 17:5x 实测（萨尔贡沙漠图，trace-2026-11-12T09-41-02/step-020.png）：
    // 底部木台逐行木色只有 900~1000，连续 >1000 的只剩战场上方那条栅栏（y 632..719）→ 锚点 ok、bench 一行都没有。
    // 旧代码这时直接 return chips: []，于是「整备区明明站着 6 个却报 0 张」，第 5、6 回合整回合没布阵、血量掉到 10。
    // 锚点认空就当它不可靠：捞到真行才用，否则往下走行规则（minPressY 仍会把战场里的假行挡掉）。
    if (!pick.length) {
      // fallthrough
    } else {
    const k = pick.length ? K_OF(pick) : 1
    return {
      ok: true,
      chips: pick.map(offK(k)),
      rows: rows.map((row) => row.map(offK(K_OF(row)))),
      camMoved: Math.abs(k - 1) > 0.12,
      railOk: true,
      rail,
      lowConfidence: false,
      benchCount: pick.length,
    }
    }
  }
  // 2026-11-14 00:2x 真机（trace-night-2026-11-13T15-45-01 第 3 回合，布阵 0 上场、REST 105.8s）：
  // 卫戍协议这一关的甲板是「大卡」：牌距 243、卡框 233 宽（干员甲板的小牌是 148）。旧窗口
  // 110~200 把整排 243 的卡筛掉，于是退到下面 y=884 那排杂物上，按出来的点全落在空位，
  // 每张牌拖两次 5s 全废。这里做四件事：
  //   ① 同一张卡的小牌会被 deck.py 拆成上下两半（y 差 ~15、x 差 ~88），先按 y±25 + x 重叠合并；
  //   ② 牌距窗口放宽到 110~280（148 小牌 / 243 大卡都吃）；
  //   ③ 剔掉孤立的假成员（离最近同伴 > 1.6×牌距，比如左侧「升级」按钮那块牌）；
  //   ④ 行排序：按压点落进甲板带（830~1060）优先，其次按压点局部方差 pv 均值，再其次张数、y。
  //   pv 只当打平时的裁判，不当硬门槛：卡面是深色立绘时 pv 也会很低（雪祀之衣实测 0.9）。
  const rowY = (r) => r.reduce((s2, c) => s2 + (Number(c.y) || 0), 0) / Math.max(1, r.length)
  const mergedRows = []
  for (const r of rows) {
    if (!Array.isArray(r) || !r.length) continue
    const y = rowY(r)
    let hit = null
    for (const m of mergedRows) {
      if (Math.abs(m.y - y) > 25) continue
      const overlap = r.filter((c) => m.row.some((d) => Math.abs(d.x - c.x) <= 60)).length
      if (overlap >= Math.max(1, Math.min(2, r.length))) { hit = m; break }
    }
    if (hit) { hit.row = hit.row.concat(r); hit.y = rowY(hit.row) } else mergedRows.push({ y, row: r.slice() })
  }
  const merged = mergedRows.map((m) => {
    const out = []
    for (const c of m.row.slice().sort((a, b) => a.x - b.x)) {
      if (!out.some((o) => Math.abs(o.x - c.x) <= 30)) out.push(c)
    }
    return out
  })
  const trimOutliers = (r) => {
    if (r.length < 3) return r
    const g = rowGap(r.map((c) => ({ x: c.x })))
    if (g == null) return r
    const lim = g * 1.6
    const keep = [r[0]]
    for (let i = 1; i < r.length; i++) {
      if (Math.abs(r[i].x - keep[keep.length - 1].x) <= lim) keep.push(r[i])
      else break
    }
    // 从最密的一侧往回捞：优先保留成员多的连续段
    const back = [r[r.length - 1]]
    for (let i = r.length - 2; i >= 0; i--) {
      if (Math.abs(back[0].x - r[i].x) <= lim) back.unshift(r[i])
      else break
    }
    return back.length > keep.length ? back : keep
  }
  const cleanRows = merged.map(trimOutliers).filter((r) => r.length)
  const deckRows = cleanRows.filter((r) => {
    if (!r.length || r.length === 1) return false
    const g = rowGap(r.map((c) => ({ x: c.x })))
    return g != null && g >= 110 && g <= 280
  })
  const rowPv = (r) => {
    const vs = r.map((c) => Number(c && c.pv)).filter((v) => Number.isFinite(v))
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : -1
  }
  const pressBand = (r) => {
    const k2 = K_OF(r)
    const ys = r.map((c) => (Number(c.y) || 0) + 99 * k2)
    return ys.every((v) => v >= 830 && v <= 1060)
  }
  const pickPool = deckRows.length ? deckRows : cleanRows.filter((r) => r.length)
  pickPool.sort((a, b) => (pressBand(b) ? 1 : 0) - (pressBand(a) ? 1 : 0) || rowPv(b) - rowPv(a) || b.length - a.length || rowY(b) - rowY(a))
  const bestRow = pickPool.length ? pickPool[0] : (Array.isArray(raw) ? raw : (raw.best || []))
  const best = bestRow;
  // 2026-11-11 19:00 实测（trace-10-56-37）：甲板明明是空的，deck.py 还是从战场 y≈672 抠出一行「牌」，
  // 于是布阵反复拖同一个幽灵点到 4 个格子全失败还报「整备区 1 张」。折叠态真甲板按压点 y≈883，
  // 战场里的东西不会低到这个位置 —— 折叠态传 minPressY=840 就能挡掉。
  // 2026-11-12 01:0x 实测：镜头被拉远后整排甲板会上移（牌间距 148→121，徽章 y 783→594），
  // 硬编码的 minPressY=840 就把真甲板全滤掉了（scanDeckChips 返回 0 张，明明是 5 张）。
  // 现在按压偏移按间距等比缩放；间距偏离 148 超过 12% 时认为镜头变了，不再套用绝对 y 阈值。
  const g0 = rowGap(best.map((c) => ({ x: c.x }))) || 148.2
  const k = Math.min(1, Math.max(0.6, g0 / 148.2))
  const camMoved = Math.abs(k - 1) > 0.12
  const off = (c) => ({ x: Math.round(c.x + 52 * k), y: Math.round(c.y + 99 * k), chip: c })
  // ⚠️ 走到这里说明木台被挡住了（商店展开 / 面板压住底部）→ 数出来的张数不可信。
  // 调用方看到 lowConfidence:true 就别拿它覆盖上一次已知张数（也别据此判「甲板空了」）。
  // 2026-11-14 10:3x 真机（本局 R4~R9 每回合「甲板张数不可信」→ 上场 0、商店跳过 → 死锁 6 回合）：
  // 这里以前无论 deck.py 找没找到木台都硬写 lowConfidence:true，等于告诉调用方「甲板数一律不可信」。
  // 结果是①木台明明空着（牌全上完了）也说不可信 → 账本旧值 6 张永远清不掉 → 不再买卡；
  //        ②甲板明明扫到牌了也说不可信 → 布阵先折面板再扫，还是不可信 → 整回合不布阵。
  // 现在按 deck.py 的木台锚点判：rail.ok 是真找到了木台（画面没被挡住），这时空就是真空、有就是真有。
  const railOkNow = !!(raw && raw.rail && raw.rail.ok)
  if (scanOpts.minPressY && !camMoved) {
    const kept = best.filter((c) => c.y + 99 * k >= Number(scanOpts.minPressY))
    if (!kept.length) return { ok: true, chips: [], rows: [], camMoved, railOk: railOkNow, lowConfidence: !railOkNow }
    return {
      ok: true,
      chips: kept.map(off),
      rows: rows.map((row) => row.map(off)),
      camMoved,
      railOk: railOkNow,
      lowConfidence: !railOkNow,
    }
  }
  return {
    ok: true,
    chips: best.map(off),
    rows: rows.map((row) => row.map(off)),
    camMoved,
    railOk: false,
    lowConfidence: true,
  }
}

export async function hasFreeRefresh() {
  try {
    const buf = screenshot()
    const dir = join(HERE, '..', '.tmp')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const png = join(dir, 'free-' + Date.now() + '.png')
    const out = png + '.json'
    writeFileSync(png, buf)
    spawnSync(process.env.COOP_OCR_PYTHON || 'python', [join(HERE, '..', 'sidecar', 'freebadge.py'), png, out],
      { windowsHide: true, stdio: 'ignore', timeout: 60_000 })
    if (!existsSync(out)) return false
    const raw = JSON.parse(readFileSync(out, 'utf8'))
    return Boolean(raw && raw.ok && raw.free)
  } catch {
    return false
  }
}

/**
 * 认人：轻按甲板干员 → 左侧详情面板 → OCR 大字名字 → 查 data/operator-ranges.json 得职业与攻击范围。
 *
 * 2026-11-10 13:38 实测（第 13 回合休整期，甲板 4 个牌）：
 *   chip(1390,694) → 星源 / chip(1269,694) → 渡桥 / chip(1147,694) → 渡桥 / chip(1026,694) → 灰喉
 * 面板同时给出费用、攻击、防御、法抗、阻挡和盟约图标文字，认人的唯一判据是那个大字名字。
 *
 * 立绘模板匹配走不通（PRTS 只有头像/半身/立绘三个图族，甲板是 Q 版小人，最小距离落在空地形区间），
 * 所以只能这样点开面板读字。10 个牌约 10 秒点击 + 一次 OCR（同一个进程跑完所有图，别一张一进程）。
 */
export async function identifyDeck() {
  // 2026-11-13 19:0x：顺手存一张「整备区原样 + 认出来的名字」样本，给以后的小人图
  // 识别（chibi 模板比对）当标定集。用户 m07310 要求只比对「本局编队里有的干员」，
  // 这份 data/chibi-labels/ 就是那个候选集的来源。
  let benchShot = null
  try { benchShot = screenshot() } catch { benchShot = null }
  let { chips } = await scanDeckChips()
  // deck.py 会把甲板上的杂块（等级小牌、拖拽售出区）也当成牌，这里只留同一行、间距够的。
  chips = dedupeDeckChips(chips)
  if (chips.length < 2) {
    // 甲板可能处于「收起」态，牌挤在一起认不准；展开再扫一次
    tap(POINTS.shopExpand[0], POINTS.shopExpand[1])
    await sleep(1200)
    chips = dedupeDeckChips((await scanDeckChips()).chips)
  }
  if (!chips.length) {
    await tap(POINTS.shopExpand[0], POINTS.shopExpand[1])
    await sleep(1200)
    ;({ chips } = await scanDeckChips())
  }
  if (!chips.length) return { ok: false, error: '甲板没有可认的牌', units: [] }

  const dir = join(HERE, '..', '.tmp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // 2026-11-13 15:1x：每张牌要「轻按 1.2s + 截图 + 再点 0.5s」，10 张就是 20s+。
  // 甲板上真的能上场的没那么多，最多认 6 张（多出来的下一轮再说），省一半时间。
  // 2026-11-13 18:5x：轻按等待从 1200ms 压到 650ms（实测面板 300ms 内就画完了），
  // 收起从 500ms 压到 250ms；6 张省 ~4s。
  const shots = []
  for (const c of chips.slice(0, 6)) {
    tap(c.x, c.y)
    await sleep(650)
    const png = join(dir, 'id-' + Math.round(c.x) + '-' + Date.now() + '.png')
    writeFileSync(png, screenshot())
    shots.push({ c, png })
    tap(c.x, c.y)
    await sleep(250)
  }

  // 2026-11-12 20:0x 实测（trace-cont-11-59-40）：连点 7 张牌之后停在 wz_buydetail，
  // 详情面板没关 → 后面整局卡在“看卡”界面。收尾统一点一次红 X，再不行点右上空地。
  try {
    if (peek().state === 'wz_buydetail' || peek().state === 'wz_buy' || peek().state === 'wz_shopdetail') {
      tap(965, 240)
      await sleep(800)
      if (peek().state === 'wz_buydetail') { tap(1700, 250); await sleep(600) }
    }
  } catch { /* 关面板失败留给调用方判状态 */ }
  // 2026-11-13 18:5x：把 6 张截图的名字小条（x0~230 / y233~322）裁出来竖着拼成一张，
  // 只对这张小图跑一次 OCR（原来整屏 OCR 6 次，一次 5~7s）。
  const stackPng = join(dir, 'id-stack-' + Date.now() + '.png')
  const stackJson = join(dir, 'id-stack-' + Date.now() + '.json')
  let rowMap = []
  try {
    spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'name_strip.py'), stackPng, stackJson, ...shots.map((s) => s.png)], { windowsHide: true, stdio: 'ignore', timeout: 60_000 })
    rowMap = (JSON.parse(readFileSync(stackJson, 'utf8')).rows || [])
  } catch { rowMap = [] }
  const out = join(dir, 'id-out-' + Date.now() + '.json')
  const ocrTargets = rowMap.length ? [stackPng] : shots.map((s) => s.png)
  spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'names_ocr.py'), out, ...ocrTargets], { windowsHide: true, stdio: 'ignore', timeout: 180_000 })
  let ocr = null
  try { ocr = JSON.parse(readFileSync(out, 'utf8')) } catch { ocr = null }
  const stackLines = (ocr && rowMap.length && (ocr[stackPng] || ocr[stackPng.replace(/\\/g, '/')])) || []

  const book = loadRanges()
  const names = Object.keys(book.operators || {})
  const known = new Set(names)
  const units = shots.map((s, si) => {
    let lines
    let line
    if (rowMap.length && stackLines.length) {
      // 拼图里每一行就是一张截图：按 y 落在哪一行分配，再按行内位置取名字
      const row = rowMap.find((r) => r.i === si)
      const y0 = row ? row.y : si * ((rowMap[0] && rowMap[0].h) || 90) + si * 6
      const y1 = y0 + (row ? row.h : 90)
      const mine = stackLines.filter((l) => l.box && l.box[1] >= y0 && l.box[1] < y1)
      line = mine.find((l) => l.box[3] >= 20 && l.box[2] > l.box[3] * 1.1)
      lines = mine
    } else {
      lines = (ocr && (ocr[s.png] || ocr[s.png.replace(/\\/g, '/')])) || []
      // 名字在面板里的位置是固定的：x≈26、y≈275、高 34–38（2026-11-10 两张实测都是这个位置）。
      // 之前按「x<700 且命中干员名」全图找，把商店卡上的名字也算进来了，
      // 第 3 个牌明明还是渡桥，却被认成商店里的罗比菈塔。
      line = lines.find((l) => l.box && l.box[0] < 80 && l.box[1] >= 245 && l.box[1] <= 305 && l.box[3] >= 26)
    }
    let name = line ? String(line.text).trim() : null
    if (name && !known.has(name)) name = nearestName(name, names)
    const info = name ? book.operators[name] : null
    return {
      x: s.c.x,
      y: s.c.y,
      name,
      cls: info ? info.class : null,
      range: info && Array.isArray(info.range) ? info.range : null,
      leftText: lines.filter((l) => l.box && l.box[0] < 700).map((l) => l.text).slice(0, 6),
    }
  })
  // 认成功的样本落盘（名字非空的才记），供 chibi 模板标定用
  try {
    const got = units.filter((u) => u && u.name)
    if (benchShot && got.length) {
      const lb = join(HERE, '..', 'data', 'chibi-labels')
      if (!existsSync(lb)) mkdirSync(lb, { recursive: true })
      const stamp = String(Date.now())
      writeFileSync(join(lb, 'bench-' + stamp + '.png'), benchShot)
      writeFileSync(join(lb, 'bench-' + stamp + '.json'), JSON.stringify({ at: new Date().toISOString(), units: got.map((u) => ({ x: u.x, y: u.y, name: u.name, cls: u.cls })) }, null, 1))
      const seenPath = join(HERE, '..', 'data', 'squad-seen.json')
      let seen = []
      try { seen = JSON.parse(readFileSync(seenPath, 'utf8')) } catch { seen = [] }
      const set = new Set(Array.isArray(seen) ? seen : [])
      for (const u of got) set.add(u.name)
      writeFileSync(seenPath, JSON.stringify([...set].sort(), null, 1))
    }
  } catch { /* 标定集落盘失败不影响认人 */ }
  return { ok: true, units }
}

/**
 * 折叠态下一张截图就认出整排甲板干员（省掉逐张轻按的 20s）。
 *
 * 2026-11-13 15:4x 实测（.tmp/now.png → names_ocr）：甲板卡面下方的名字就在 y≈1008~1012，
 * 例如 蛇屠箱 box=[714,1010]、摆渡人 [960,1012]、奥斯塔 [1200,1008]、折光 [1442,1008]；
 * 同一片区域的 y≈960 是职业/盟约标签（派坚守/不屈/叙拉古/米莱塔尼亚），y≈933 是「派坚守」。
 * 所以只取 y∈[980,1050]、高≥24、宽≥40 的文本行，再用名字中心 x 跟甲板牌配对。
 * 一次整屏 OCR 约 6~8s，逐张轻按最多 6 张要 12~20s，还多跑一次 OCR。
 */
/**
 * 把「OCR 认出的名字（带 x）」配到「甲板牌（带 x）」上。
 * 2026-11-12 19:36 真机：identifyDeck 连点 10 张牌只读回 1~4 个名字，按下标硬配会把名字挂到错的人身上
 * ——「重装在后、远程在前」就是这么来的。所以一律按 x 最近配对，容差外判无名。
 */
export function pairDeckUnits(chips = [], cand = [], tol = 150, book = null) {
  const xs = (Array.isArray(chips) ? chips : []).slice().sort((a, b) => a.x - b.x)
  const cs = (Array.isArray(cand) ? cand : []).slice().sort((a, b) => a.x - b.x)
  // 全局最近优先分配（不能按牌逐个贪心）：容差 150 大于牌间距的一半时，
  // 逐牌贪心会让左边的牌抢走右边的名字（实测 1413 抢走本该属于 1562 的名字）。
  const pairs = []
  for (let i = 0; i < xs.length; i++) {
    for (let k = 0; k < cs.length; k++) {
      const d = Math.abs(cs[k].x - xs[i].x)
      if (d <= tol) pairs.push({ d, i, k })
    }
  }
  pairs.sort((a, b) => a.d - b.d)
  const byIdx = new Map()
  const usedCand = new Set()
  for (const p of pairs) {
    if (byIdx.has(p.i) || usedCand.has(p.k)) continue
    byIdx.set(p.i, p.k)
    usedCand.add(p.k)
  }
  return xs.map((c, i) => {
    const k = byIdx.get(i)
    const nm = k == null ? null : cs[k].name
    const info = nm && book && book.operators ? book.operators[nm] : null
    return { x: c.x, y: c.y, name: nm || null, cls: info ? info.class : null, range: info && Array.isArray(info.range) ? info.range : null }
  })
}

export async function identifyDeckByOcr({ tol = 150 } = {}) {
  let { chips } = await scanDeckChips()
  chips = dedupeDeckChips(chips)
  if (!chips.length) return { ok: false, error: '甲板没有可认的牌', units: [] }
  const dir = join(HERE, '..', '.tmp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const png = join(dir, 'deckocr-' + Date.now() + '.png')
  writeFileSync(png, screenshot())
  const lines = ocrPngLines(png)
  const book = loadRanges()
  const names = Object.keys(book.operators || {})
  const known = new Set(names)
  const cand = []
  for (const l of lines) {
    const b = l.box
    // 甲板卡（折叠态）在 y≈830~1010；商店展开时同一条带里是商店卡名。
    // 这里只认「能对上干员表」的文本，职业/盟约标签（派坚守/不屈/叙拉古…）自然过滤掉。
    if (!b || b[1] < 800 || b[1] > 1015 || b[3] < 22 || b[2] < 36) continue
    let nm = String(l.text || '').trim()
    if (!nm) continue
    if (!known.has(nm)) nm = nearestName(nm, names)
    if (!nm || !known.has(nm)) continue
    cand.push({ name: nm, x: b[0] + b[2] / 2 })
  }
  if (!cand.length) return { ok: false, error: '甲板卡名一行都没认出来', units: [], png }
  const units = pairDeckUnits(chips, cand, tol, book)
  return { ok: true, units, png, matched: units.filter((u) => u.name).length }
}

/** 把一个 png 丢给 names_ocr.py，返回它认出的文本行 [{text,score,box}]（box=[x,y,w,h]）。 */
function ocrPngLines(png) {
  const out = png + '.json'
  spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'names_ocr.py'), out, png], { windowsHide: true, stdio: 'ignore', timeout: 180_000 })
  try {
    const obj = JSON.parse(readFileSync(out, 'utf8'))
    return Object.values(obj)[0] || []
  } catch {
    return []
  }
}

/** 跑 sidecar/banpanel.py，返回红叉行 [{y, xs:[x...]}]（每行一串等距的头像红叉）。 */
function banRowsOf(png) {
  const out = png + '.ban.json'
  spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'banpanel.py'), png, out], { windowsHide: true, stdio: 'ignore', timeout: 120_000 })
  try {
    const j = JSON.parse(readFileSync(out, 'utf8'))
    return Array.isArray(j.rows) ? j.rows : []
  } catch {
    return []
  }
}

/** 盟约名清单（核心 + 附加），给「禁用干员」分组配名字用。
 *
 * 2026-11-12 23:5x 修：原来读 covenants.json，但那份表里**附加盟约的字段叫 n 不叫 name**，
 * 于是只拿到 10 个核心盟约名 —— 面板上顶着「精准 / 灵巧 / 突袭」的组会被判成「未知」。
 * 现在以 covenants-map.json 的 26 条为准（covenantplan 用的也是它），读不到再退 covenants.json、
 * 最后退硬编码的 18 个名字。
 */
function covenantNameList() {
  try {
    const m = JSON.parse(readFileSync(join(HERE, '..', 'data', 'covenants-map.json'), 'utf8'))
    const names = (Array.isArray(m.covenants) ? m.covenants : [])
      .map((c) => String((c && c.name) || '').trim())
      .filter(Boolean)
    if (names.length >= 18) return names
  } catch { /* 退到 covenants.json */ }
  try {
    const j = JSON.parse(readFileSync(join(HERE, '..', 'data', 'covenants.json'), 'utf8'))
    const names = []
    for (const k of ['core', 'extra']) {
      const arr = Array.isArray(j[k]) ? j[k] : Object.values(j[k] || {})
      for (const c of arr) if (c && (c.name || c.n)) names.push(String(c.name || c.n))
    }
    return names
  } catch {
    return ['炎', '维多利亚', '谢拉格', '叙拉古', '萨尔贡', '乌萨斯', '伊比利亚', '莱塔尼亚', '精准', '迅捷', '坚守', '远见', '不屈', '调和', '协防干员', '聚合', '助力', '奥术']
  }
}

/**
 * 扫「本局禁用干员」并落盘。
 *
 * runflow.json 第 25 行要求开局先看随机禁用。2026-11-12 实测：三个开局页
 * （1/3 本局信息、2/3 策略、3/3 自选编队）都没有名单，名单只在**休整期顶栏放大镜
 * 「本局信息」面板**里 —— 滚到最下面是「本局禁用干员」区块，按盟约分组，
 * 每张头像右上角一个红 ✖，**没有文字名字**。
 *
 * 名字级识别试过头像模板匹配，判不出来（图库是方形头像、面板是半身像，最好的分只有 0.32），
 * 所以这里只记「哪个盟约被禁了几张」+ 留截图；名字清单留到以后做专用特征。
 *
 * 面板打开时 vision 会把这屏误判成 wz_hall_joint（多次复现），所以：进来先确认在休整期，
 * 扫完必须点 X 关回 wz_rest/wz_prep，关不回来就报错让调用方停手。
 */
export async function scanBans(opts = {}) {
  const dir = join(HERE, '..', '.tmp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const st0 = peek().state
  if (st0 !== 'wz_rest' && st0 !== 'wz_prep') {
    return { ok: false, error: '不在休整期，扫禁用干员要休整期（现在 ' + st0 + '）' }
  }

  tap(509, 53) // 顶栏放大镜「本局信息」
  await sleep(1600)

  const covNames = covenantNameList()
  let shot = null
  let lines = []
  let head = null
  for (let i = 0; i < 5 && !head; i++) {
    shot = join(dir, 'ban-' + Date.now() + '-' + i + '.png')
    writeFileSync(shot, screenshot())
    lines = ocrPngLines(shot)
    head = lines.find((l) => /禁用干员/.test(String(l.text || ''))) || null
    if (head) break
    swipe(400, 800, 400, 470, 420) // 往下滚一屏（面板本身很长）
    await sleep(900)
  }
  if (!head) {
    tap(1768, 56)
    await sleep(1000)
    return { ok: false, error: '「本局信息」里没找到「本局禁用干员」区块（面板结构可能变了）' }
  }

  // 让区块靠上，争取一屏装完
  const hy = head.box ? Number(head.box[1]) || 0 : 0
  if (hy > 250) {
    const dy = Math.min(hy - 150, 520)
    swipe(400, 820, 400, Math.round(820 - dy), 450)
    await sleep(900)
    shot = join(dir, 'ban-' + Date.now() + '-final.png')
    writeFileSync(shot, screenshot())
    lines = ocrPngLines(shot)
    head = lines.find((l) => /禁用干员/.test(String(l.text || ''))) || head
  }

  // 左侧绿色圆圈旁的汉字是盟约组名，**竖着居中对齐它那组头像**（2026-11-12 实测：
  // 两行头像 y=536/724 的那组，组名「萨尔贡」中心 y=659）。所以按「离哪个组名最近」分行，
  // 只认落在「禁用干员」标题以下的名字 —— 标题上面那排是附加盟约的图标名（精准/迅捷…），不是分组。
  const analyse = (shotPath, ocrLines, headLine) => {
    const hy2 = headLine && headLine.box ? Number(headLine.box[1]) || 0 : 0
    const rows2 = banRowsOf(shotPath).filter((r) => r && r.y > hy2 + 40)
    const labels = ocrLines
      .filter((l) => l.box && Number(l.box[0]) < 360 && String(l.text || '').trim())
      .map((l) => ({ text: String(l.text).trim(), y: Number(l.box[1]) + (Number(l.box[3]) || 0) / 2 }))
      .filter((l) => covNames.some((n) => l.text.includes(n) || n.includes(l.text)))
      .filter((l) => l.y > hy2 + 20)
    const gs = []
    for (const r of rows2) {
      let cov = null
      if (labels.length) {
        const near = labels.slice().sort((a, b) => Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0]
        // 只接受 200px 以内的最近组名（组名在它那组头像的竖直中心），再远就不敢认了，
        // 宁可记成「未知」也不把禁用记到别的盟约头上（组名 OCR 偶尔漏，漏了就是未知）。
        if (near && Math.abs(near.y - r.y) <= 200) {
          cov = covNames.find((n) => near.text.includes(n) || n.includes(near.text)) || near.text
        }
      }
      if (cov && gs.length && gs[gs.length - 1].covenant === cov) {
        gs[gs.length - 1].count += r.xs.length
      } else {
        gs.push({ covenant: cov || null, count: r.xs.length })
      }
    }
    return { rows: rows2, groups: gs }
  }

  let rows = []
  let groups = []
  try {
    const a1 = analyse(shot, lines, head)
    rows = a1.rows
    groups = a1.groups
  } catch (e) {
    return { ok: false, error: '数禁用头像失败（' + e.message + '）' }
  }

  // 面板一屏装不下（2026-11-12 23:4x 实测：这一局有 5 行、23 张，标题靠上也只能看到 4 行）。
  // 再往下滚一屏多数一遍，然后**按盟约取最大值合并**（不是相加：同一组会跨两帧重复出现）。
  try {
    swipe(400, 900, 400, 640, 500)
    await sleep(900)
    const shot2 = join(dir, 'ban-' + Date.now() + '-more.png')
    writeFileSync(shot2, screenshot())
    const lines2 = ocrPngLines(shot2)
    const head2 = lines2.find((l) => /禁用干员/.test(String(l.text || ''))) || null
    const a2 = analyse(shot2, lines2, head2)
    const merged = new Map()
    const push = (g) => {
      const k = g.covenant || '未知'
      merged.set(k, Math.max(merged.get(k) || 0, g.count))
    }
    groups.forEach(push)
    a2.groups.forEach(push)
    groups = [...merged.entries()].map(([k, v]) => ({ covenant: k === '未知' ? null : k, count: v }))
    rows = rows.concat(a2.rows)
  } catch { /* 第二帧数不出来就只用第一帧 */ }

  const total = groups.reduce((a, g) => a + g.count, 0)

  // 留档：截图拷进 data/，清单写 bans-<时间戳>.json + bans-latest.json
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds())
  const dataDir = join(HERE, '..', 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const pngOut = join(dataDir, 'bans-' + stamp + '.png')
  try { writeFileSync(pngOut, readFileSync(shot)) } catch { /* 截图拷不过去不影响清单 */ }
  const rec = {
    at: new Date().toISOString(),
    total,
    groups,
    rows: rows.map((r) => ({ y: r.y, count: r.xs.length })),
    png: 'data/bans-' + stamp + '.png',
    note: '只有盟约分组和数量：面板上的头像是半身像，认不出名字（模板匹配最好分 0.32）。',
  }
  try {
    writeFileSync(join(dataDir, 'bans-' + stamp + '.json'), JSON.stringify(rec, null, 2))
    writeFileSync(join(dataDir, 'bans-latest.json'), JSON.stringify(rec, null, 2))
  } catch { /* 落盘失败也要把面板关掉 */ }

  tap(1768, 56) // 关本局信息
  await sleep(1200)
  let st1 = peek().state
  for (let i = 0; i < 3 && st1 !== 'wz_rest' && st1 !== 'wz_prep'; i++) {
    tap(1768, 56)
    await sleep(1000)
    st1 = peek().state
  }
  if (st1 !== 'wz_rest' && st1 !== 'wz_prep') {
    return { ok: false, error: '扫完关不回休整期（现在 ' + st1 + '）', total, groups, png: pngOut }
  }
  return { ok: true, total, groups, rows, png: pngOut, json: 'data/bans-' + stamp + '.json' }
}


/**
 * 找甲板干员头顶那一排的装备，并认出是什么装备。
 *
 * 为什么不用模板匹配：甲板上装备图标和 Q 版小人、等级小牌叠在一起，还会被旋转/遮挡，
 * 拿 ASP 的 88 张装备图标做灰度相关最高只有 0.4（2026-11-10 17:35 实测），认不出来。
 * 改用和认干员同一套办法：**轻按图标 → 左侧详情面板 → OCR 大字名字**，
 * 但只采信能对上 data/equipment.json 名单的结果（干员名会被排除掉）。
 *
 * 返回 [{x,y,name,effect,tier,chip}]，x/y 是**图标的按压点**（也就是长按拖动的起点）。
 */
export async function findDeckEquip(opts = {}) {
  const chips = dedupeDeckChips((await scanDeckChips()).chips)
  if (!chips.length) return { ok: false, error: '甲板没有牌', items: [] }
  const book = loadEquipBook()
  if (!book) return { ok: false, error: '读不到 data/equipment.json', items: [] }
  const dir = join(HERE, '..', '.tmp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const png = join(dir, 'eqkb-' + Date.now() + '.png')
  writeFileSync(png, screenshot())
  // 装备图标画在干员头顶那一带：以等级小牌为锚往上取 150px。
  const badgeTop = Math.min(...chips.map((c) => c.y - 99))
  const xs = chips.map((c) => c.x - 52)
  const box = [Math.min(...xs) - 90, badgeTop - 150, Math.max(...xs) + 150, badgeTop + 30]
  const out = png + '.json'
  spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'equipkb.py'), png, JSON.stringify(box), out], { windowsHide: true, stdio: 'ignore', timeout: 120_000 })
  let res = null
  try { res = JSON.parse(readFileSync(out, 'utf8')) } catch { res = null }
  if (!res || !res.ok) return { ok: false, error: 'equipkb.py 没产出', items: [] }
  const items = []
  for (const h of res.hits || []) {
    const cx = h.x + h.w / 2
    const chip = chips.slice().sort((a, b) => Math.abs(a.x - 52 + 18 - cx) - Math.abs(b.x - 52 + 18 - cx))[0]
    const info = book.byName[h.name] || { name: h.name, tier: 0, effect: '' }
    const headX = chip.x - 52 + 18
    const headY = chip.y - 99 - 34
    items.push({
      name: h.name, score: h.score, x: h.x, y: h.y, w: h.w, h: h.h,
      tier: info.tier, effect: info.effect,
      chip, placed: Math.abs(cx - headX) < 30 && Math.abs(h.y + h.h / 2 - headY) < 45,
    })
  }
  return { ok: true, items, kb: res.kb || [] }
}

let _equipBook = null
function loadEquipBook() {
  if (_equipBook) return _equipBook
  const candidates = [join(HERE, '..', 'data', 'equipment.json'), join(HERE, '..', '..', 'data', 'equipment.json')]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      const j = JSON.parse(readFileSync(p, 'utf8'))
      const byName = {}
      for (const it of (j.items || j.equipment || [])) {
        const eff = (it.effectDescription || (it.normal && it.normal.effectDescription) || '')
        byName[it.name] = { name: it.name, tier: it.tier || 1, effect: eff }
      }
      for (const it of (j.jobChangeItems || [])) {
        const eff = (it.effectDescription || (it.normal && it.normal.effectDescription) || '')
        byName[it.name] = { name: it.name, tier: it.tier || 1, effect: eff }
      }
      if (Object.keys(byName).length) { _equipBook = { byName }; return _equipBook }
    } catch { /* 试下一个 */ }
  }
  return null
}

/** 只留同一行的甲板牌（y≈694），并把挨得太近的杂块去掉。 */
function dedupeDeckChips(chips) {
  // 甲的纵向位置会变（商店展开/收起、镜头平移）：09:19 那帧牌在 y≈694，17:30 那帧在 y≈882。
  // 所以不写死 y，改成按行聚簇取「牌最多」的一行，再按 x 间距去重。
  const rows = []
  for (const c of [...chips].sort((a, b) => a.y - b.y)) {
    const hit = rows.find((r) => Math.abs(r[0].y - c.y) <= 25)
    if (hit) hit.push(c)
    else rows.push([c])
  }
  rows.sort((a, b) => b.length - a.length)
  const row = (rows[0] || []).sort((a, b) => b.x - a.x)
  const out = []
  for (const c of row) {
    if (out.some((o) => Math.abs(o.x - c.x) < 80)) continue
    out.push(c)
  }
  return out
}

/** OCR 常常把生僻字读错一格（塔→搭、菈→拉），允许距离 1 的模糊匹配，超过就认为没认出来。 */
function nearestName(text, names) {
  const t = String(text || '').trim()
  if (!t) return null
  let best = null
  for (const n of names) {
    if (Math.abs(n.length - t.length) > 1) continue
    const d = editDistance(t, n)
    if (!best || d < best.d) best = { d, n }
    if (best.d === 0) break
  }
  return best && best.d <= 1 ? best.n : null
}

function editDistance(a, b) {
  const m = a.length, n = b.length
  const prev = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[n]
}

let _ranges = null
function loadRanges() {
  if (_ranges) return _ranges
  // 这份是子代理抓的 PRTS 数据，落在工程根的 data/ 下（world/data 里没有），两处都试。
  const candidates = [
    join(HERE, '..', 'data', 'operator-ranges.json'),
    join(HERE, '..', '..', 'data', 'operator-ranges.json'),
    join(process.env.DATA_DIR || '', 'operator-ranges.json'),
  ]
  for (const f of candidates) {
    try { _ranges = JSON.parse(readFileSync(f, 'utf8')); return _ranges } catch { /* 下一个 */ }
  }
  _ranges = { operators: {} }
  return _ranges
}

/**
 * 「确认准备吗？剩余资金将在离开整备期时清空」这个模态框。
 * 画面中部会出现一条近乎全黑的横带，正常休整/战斗界面不会这样 —— 用像素判定，不用 OCR。
 * 2026-11-10 实测：模态在 mean 20.9 / dark 0.971，正常休整期 mean 94 / dark 0.002。
 */
export async function prepModalVisible() {
  try {
    const buf = screenshot()
    const dir = join(HERE, '..', '.tmp')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const png = join(dir, 'dlg-' + Date.now() + '.png')
    const out = png + '.json'
    writeFileSync(png, buf)
    spawnSync(pythonBin(), [join(HERE, '..', 'sidecar', 'dialog.py'), png, out], { windowsHide: true, stdio: 'ignore', timeout: 60_000 })
    if (!existsSync(out)) return false
    return Boolean(JSON.parse(readFileSync(out, 'utf8')).modal)
  } catch (e) {
    return false
  }
}

/**
 * 「道具补给」三选一面板（可选一张装备补给，选定后不可更改）。
 *
 * 2026-11-10 实测踩坑：画面上看到的白条「确认选择」中心在 y≈676，点它**毫无反应**；
 * 真正生效的是 y≈728（和战术决策的确认钮同一个高度），x 取选中的那张卡中心。
 * 默认中间那张（攻击类）已经被预选中，所以直接按 (981,728) 就行。
 */
/** 「三选一卡片」这类面板共用的确认钮高度（道具补给 / 战术决策实测都是 728）。 */
export const CARD_CONFIRM_Y = 728;

export const ITEM_PANEL = {
  cards: [[478, 470], [981, 470], [1450, 470]],
  confirmY: CARD_CONFIRM_Y,
};

/** 面板左上角有大号绿字标题「道具补给」，用颜色计数判，不用 OCR。 */
export async function itemPanelVisible() {
  try {
    const buf = screenshot()
    const dir = join(HERE, '..', '.tmp')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const png = join(dir, 'item-' + Date.now() + '.png')
    const out = png + '.json'
    writeFileSync(png, buf)
    // 2026-11-11 16:0x：原来写死 'python'，run_code/后台作业的 PATH 里没有它时 spawnSync 静默失败
    // → itemPanelVisible() 永远 false，「道具补给」三选一面板识别不出来，整局卡在原地。改用与 OCR 侧车同一个解释器。
    spawnSync(process.env.COOP_OCR_PYTHON || 'python', [join(HERE, '..', 'sidecar', 'item.py'), png, out], { windowsHide: true, stdio: 'ignore', timeout: 60_000 })
    if (!existsSync(out)) return false
    return Boolean(JSON.parse(readFileSync(out, 'utf8')).item)
  } catch (e) {
    return false
  }
}

/** 看到道具补给面板就按「确认选择」（默认中间那张）。返回有没有动过手。 */
export async function clearItemPanel({ prefer = 1, tries = 4 } = {}) {
  const c = ITEM_PANEL.cards[prefer] || ITEM_PANEL.cards[1]
  let acted = false
  for (let i = 0; i < tries; i++) {
    if (!(await itemPanelVisible())) return acted
    await tapAt([c[0], ITEM_PANEL.confirmY], 1500, '道具补给：确认选择')
    acted = true
  }
  return acted
}

export async function placeDeckUnit({ index = 0, x, y, to, facing = 'right' } = {}) {
  // index 0 = 最右一格（沿用旧语义），缺省走实测坐标表，不再按 163 的固定间距推算。
  const slot = DECK_UNIT[DECK_UNIT.length - 1 - Math.max(0, Math.min(index, DECK_UNIT.length - 1))];
  const from = [x != null ? x : slot[0], y != null ? y : slot[1] + DECK_PICK_DY];
  const r = await placeUnit({ from, to, facing, holdStartMs: DECK_PICK_HOLD_MS });
  r.from = from;
  r.index = index;
  return r;
}

/**
 * 扫描「这一回合到底哪些格子能站人」——靠抓取态的绿色高亮，不依赖任何写死坐标。
 *
 * 2026-11-10 实测的判据：抓住干员时，空的可站格整格变绿（绿占比 0.7–0.9），
 * 站着干员的格只有 0.25 左右（Q 版小人挡住了中心），岩石/水面 0–0.26。
 * 所以阈值 0.55 就能把「空的可站格」单独挑出来，见 world/sidecar/freetiles.py。
 *
 * 手法：按住甲板最后一张牌 450ms → 拖到左下角非法格 → 停住（此时截图）→ 松手退回甲板。
 * 松手落在非法格不会上场，所以这一步不消耗部署位。
 */
export async function scanFreeTiles(opts = {}) {
  const { chips } = await scanDeckChips()
  if (!chips.length) return { ok: false, tiles: [], error: '甲板没有可抓的牌' }
  const c = chips[opts.chipIndex != null ? opts.chipIndex : chips.length - 1]
  const [rx, ry] = toRaw(c.x, c.y)
  const [tx, ty] = toRaw(300, 950)
  const holdStart = Number(opts.holdStartMs) || DECK_PICK_HOLD_MS
  const lines = ['d 0 ' + rx + ' ' + ry + ' 50', 'c', 'w ' + holdStart]
  const N = 6
  for (let i = 1; i <= N; i++) {
    const x = Math.round(rx + (tx - rx) * i / N)
    const y = Math.round(ry + (ty - ry) * i / N)
    lines.push('m 0 ' + x + ' ' + y + ' 50', 'c', 'w 45')
  }
  // 2026-11-11 18:0x 提速：原来按住 3000ms、等 2100ms 才截图（一次 5s 多）。实测起手 120ms
  // 就能把牌拎起来（<90ms 拎不动），拖到位之后再按 1400ms 足够，截图在水滴仍按着的窗口里。
  lines.push('w 1400', 'u 0', 'c', 'w 200')
  const dir = join(HERE, '..', '.tmp')
  mkdirSync(dir, { recursive: true })
  const cmdfile = join(dir, 'grab-cmds.txt')
  writeFileSync(cmdfile, lines.join('\n') + '\n', 'utf8')
  const adb = adbPath()
  const serial = currentDevice()
  const push = spawnSync(adb, ['-s', serial, 'push', cmdfile, '/sdcard/_coopanion_grab.txt'], { windowsHide: true, stdio: 'ignore', timeout: 60000 })
  if (push.status !== 0) return { ok: false, tiles: [], error: 'push 失败' }
  // 非阻塞跑：手指要一直按着，我们趁这个窗口截图
  const child = spawn(adb, ['-s', serial, 'shell', '/data/local/tmp/minitouch -f /sdcard/_coopanion_grab.txt'], { windowsHide: true, stdio: 'ignore' })
  // 2026-11-11 18:2x 实测：绿格是**手指拖离甲板之后**才出现的，光按住不动没有绿。
  // 所以截图要等「起手 + 6 段移动（约 570ms）」走完，不能写死 500ms（那样按住 1400ms 时还在原地按住，绿格 0）。
  await sleep(Math.max(300, holdStart) + 620)
  let png = null
  try { png = screenshot() } catch (e) { void e }
  // 等 minitouch 自己收尾最多 2.2s（脚本里松手在 ~1.7s），不再死等 8s。
  await new Promise((resolve) => { child.on('exit', resolve); setTimeout(resolve, 2200) })
  if (!png || png.length < 1000) return { ok: false, tiles: [], error: '抓取态截图失败' }
  const shot = join(dir, 'free-' + Date.now() + '.png')
  writeFileSync(shot, png)
  const out = join(dir, 'free-' + Date.now() + '.json')
  const py = join(HERE, '..', 'sidecar', 'freetiles.py')
  // 2026-11-11 18:0x（用户 m02774：「除了我标记过的格子其他都是废格子」）：
  // 给了 opts.cells（地图里的可部署格）就只判这些格绿不绿 —— 候选格以地图为准，
  // 绿格只用来筛掉「这一回合站不了人」的格（有干员占着、或这格其实在 UI 上）。
  const extra = []
  if (Array.isArray(opts.cells) && opts.cells.length) {
    const cellsPath = join(dir, 'free-cells-' + Date.now() + '.json')
    writeFileSync(cellsPath, JSON.stringify(opts.cells.map((c) => ({ x: c[0], y: c[1] }))))
    extra.push('--cells', cellsPath)
  }
  const pyRun = spawnSync(process.env.COOP_OCR_PYTHON || 'python', [py, shot, out, ...extra], { windowsHide: true, stdio: 'ignore', timeout: 120000 })
  if (pyRun.status !== 0) return { ok: false, tiles: [], error: (pyRun.error ? 'spawn:' + pyRun.error.message + ' ' : '') + 'freetiles.py status=' + pyRun.status + ' err=' + String(pyRun.stderr || '').slice(0, 300) + ' out=' + String(pyRun.stdout || '').slice(0, 200) + ' shot=' + shot }
  let parsed = null
  try { parsed = JSON.parse(readFileSync(out, 'utf8')) } catch (e) { return { ok: false, tiles: [], error: '解析失败' } }
  const tiles = (parsed.tiles || []).map((t) => [t.x, t.y])
  const cells = Array.isArray(parsed.cells) ? parsed.cells : null
  return { ok: tiles.length > 0, tiles, cells, mode: parsed.mode || 'auto', shot }
}

/**
 * 战术决策（3 选 1）：打完一回合之后、进下个休整期之前的那一屏。
 *
 * 三张卡横排，标题居中；点一张它变黄边并在**卡片底部**弹出「确认选择」，再点一下才生效。
 * 实测（2026-11-09 23:07）：卡1「整备」标题中心 (458,418)、确认钮 (497,728)；
 * 卡2「耶拉的盟誓」标题 (1016,448)、卡3「补给」标题 (1486,449)。
 * 确认钮 x = 卡中心 + 20，y 固定在 728（三张卡选中后都向下延伸到这个 y）。
 */
export const TACTIC = {
  cards: [[476, 450], [1016, 450], [1486, 450]],
  confirmY: CARD_CONFIRM_Y,
  confirmDx: 20,
};

/**
 * 右1「白铁的盟誓」只对这两种盟约加层数，所以只有本局真在玩它们时才值右1。
 * 来源：用户 2026-11-10 15:31 的规矩 + 该卡原文「【维多利亚】【助力】层数+15，若存在其他队友则他们也获得」。
 */
export const TACTIC_COVENANT_BOOST = ['维多利亚', '助力'];

/**
 * 在战术决策页选一张卡。prefer 是优先试的下标，失败会换下一张。
 * 认不出当前不在这一页就不动（和别的动作一样的规矩）。
 */
export function tacticPreference({ covenants = [] } = {}) {
  const cov = (covenants || []).map((x) => String(x));
  const boosted = cov.filter((c) => TACTIC_COVENANT_BOOST.includes(c));
  if (boosted.length) {
    return {
      order: [2, 0, 1],
      reason: '本局有 ' + boosted.join('/') + '，右1「白铁的盟誓」给这两种盟约 +15 层',
    };
  }
  return {
    order: [0, 1, 2],
    reason: '没有维多利亚/助力，优先队友也有增益的：左1「财富」+1 资金、中「补给」2 次免费刷新',
  };
}

export async function pickTactic({ prefer = 0, preferList = null } = {}) {
  const steps = [];
  const mark = lastLog.length;
  const pre = peek();
  if (pre.state !== 'wz_tactic') {
    return { ok: false, state: pre.state, reason: '不在战术决策页（现在 ' + pre.state + '），不盲点' };
  }
  // 用户 2026-11-10 15:31 给的规矩：玩维多利亚/助力选右1，否则随便选、优先队友增益。
  // preferList 是排好序的下标数组；没给就退回单个 prefer 的旧行为。
  const all = TACTIC.cards.map((_, n) => n);
  const want = (Array.isArray(preferList) && preferList.length
    ? preferList.map((n) => Number(n)).filter((n) => n >= 0 && n < TACTIC.cards.length)
    : [Number(prefer)]).filter((n, i, arr) => arr.indexOf(n) === i);
  // 先按偏好顺序试，剩下的按原顺序兜底；不重复试同一张。
  const order = want.concat(all.filter((n) => !want.includes(n)));
  for (let i = 0; i < order.length; i++) {
    const idx = order[i];
    const c = TACTIC.cards[idx];
    await tapAt(c, 900, '选战术决策第' + (idx + 1) + '张');
    await tapAt([c[0] + TACTIC.confirmDx, TACTIC.confirmY], 1500, '确认选择');
    const st = await waitFor(['wz_rest', 'wz_prep', 'wz_tactic'], { timeoutMs: 8000, gapMs: 800 });
    steps.push(...lastLog.slice(mark));
    if (st.state !== 'wz_tactic') return { ok: true, state: st.state, picked: idx + 1, steps };
  }
  return { ok: false, state: 'wz_tactic', reason: '三张都点过还停在这一页', steps };
}

/**
 * 把甲板上的装备/道具拖到场上某个干员身上。
 *
 * 和放干员只差一点：**不用第二次滑动定朝向**（用户 2026-11-09 23:12 确认）。
 * 起手必须落在「道具脚下那块木台面」上，不能按精灵身上 —— 按模型会被当成单击。
 * 实测（23:11）：商店折叠后从 (1092,860) 拖到 (712,440)，维式重锤离甲板、亚叶头顶的装备条 1 条变 2 条。
 *
 * 验证办法（用户 23:20 给的）：干员头顶的条 = 已装装备数，一条一个，没条就是空。
 * 注意「精打细算玩偶」这类消耗品装上就销毁、不占条，不能靠条判断。
 */
export async function placeItem({ from, to }) {
  const log = []
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
  const points = Math.max(18, Math.round(dist / 40))
  const durationMs = Math.max(300, (dist / 1000) * 400)
  log.push('拖 ' + from.join(',') + ' → ' + to.join(',') + '（' + points + ' 点 / ' + Math.round(durationMs) + 'ms）')
  await seSwipe(from[0], from[1], to[0], to[1], { points, durationMs })
  await sleep(900)
  return { ok: true, log }
}

/** 看一眼当前界面（不重试，快） */
export function peek() {
  try {
    return classifyBuffer(screenshot());
  } catch (e) {
    return { state: 'unknown', dist: 9, error: String(e && e.message) };
  }
}

/** 等界面变成 want（集合），超时返回最后看到的 */
export async function waitFor(want, { timeoutMs = 30_000, gapMs = 1200, strict = 0.12 } = {}) {
  const set = Array.isArray(want) ? want : [want];
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = peek();
    if (set.includes(last.state) && Number(last.dist) <= strict) return last;
    await sleep(gapMs);
  }
  return last || { state: 'unknown', dist: 9 };
}

/** 点一下，等 ms */
export async function tapAt(pt, ms = 1200, label) {
  tap(pt[0], pt[1]);
  if (label) lastLog.push('tap ' + label + ' (' + pt.join(',') + ')');
  await sleep(ms);
}

const lastLog = [];

/**
 * 从「卫戍协议大厅」进一局个人模拟。
 *
 * 2026-11-09 事故换来的硬规矩：**每一步都先认界面，认不出就返回 blocked，不再往下点。**
 * 「个人模拟」胶囊是个开关，已经在个人模式时点它会切到联合模式，
 * 之后同一个坐标就变成「搜寻队友」，一点就进陌生人的联机房（真被打过限制）。
 * @param {'independent'|'quick'} mode
 */
export async function enterRun({ mode = 'independent', tutorialTaps = 12, maxMs = 240_000, fromDiff = false } = {}) {
  lastLog.length = 0;
  const t0 = Date.now();
  const fail = (st, why) => ({ ok: false, state: st && st.state, dist: st && st.dist, blocked: why, log: lastLog.slice() });

  let st = peek();
  if (fromDiff) {
    // enterOrResume 已经把「断线重连 / 独立模拟」那一格点过了：大厅在没有进行中对局时
    // 那颗按钮就叫「独立模拟」，点完直接到难度页，这时候不能再等大厅（2026-11-11 16:07 实测：
    // 等不到 wz_hall → blocked「不在卫戍大厅」，白丢一次开局）。
    if (st.state !== 'wz_diff' && st.state !== 'wz_runinfo') {
      return fail(st, '已经点过大厅按钮，但现在不在难度页（现在 ' + st.state + '），停手');
    }
    lastLog.push('从难度页接着开局（fromDiff）');
  } else {
    // 0) 必须站在卫戍大厅（个人或联合），别的界面一律不动
    st = await waitFor(['wz_hall', 'wz_hall_joint'], { timeoutMs: 6000, gapMs: 800 });
    if (st.state !== 'wz_hall' && st.state !== 'wz_hall_joint') {
      return fail(st, '不在卫戍大厅（认不出 wz_hall / wz_hall_joint），不盲点');
    }

    // 1) 只有确认在联合模式时才点「个人模拟」；已经在个人模式绝不点
    if (st.state === 'wz_hall_joint') {
      await tapAt(POINTS.modePersonal, 1800, '切到个人模拟');
      st = await waitFor(['wz_hall'], { timeoutMs: 8000, gapMs: 800 });
      if (st.state !== 'wz_hall') return fail(st, '点了「个人模拟」但没切到个人模式，停手（绝不再往下点）');
    }

    // 2) 个人模式才点「独立模拟 / 极速模拟」，并且必须真的进到难度页
    await tapAt(mode === 'quick' ? POINTS.quick : POINTS.independent, 2000, mode === 'quick' ? '极速模拟' : '独立模拟');
    st = await waitFor(['wz_diff'], { timeoutMs: 10_000, gapMs: 900 });
    if (st.state !== 'wz_diff') return fail(st, '没进到「选择模拟难度」页（wz_diff）');
  }

  // 3) 难度页「开始模拟」→ 开局三步（盟约/策略/编队）→ 教学对话 → 休整期
  let corePicked = false;
  let stratPicked = false;
  const STEPS = ['wz_rest', 'wz_diff', 'wz_runinfo', 'wz_strategy', 'wz_squadsel'];
  for (let i = 0; i < tutorialTaps + 12; i++) {
    if (Date.now() - t0 > maxMs) return fail(peek(), '超时：开局流程走不完');
    st = peek();
    if (st.state === 'wz_rest') break;
    if (st.state === 'wz_diff') {
      await tapAt(POINTS.startSim, 1600, '开始模拟');
    } else if (st.state === 'wz_runinfo') {
      // 1/3：核心盟约二选一。默认左边那组是选中的，先点一下锁定，再「准备就绪」
      if (!corePicked) {
        // 顺路把「确认本局信息」页存一张，用来做 ban 位识别（2026-11-10 起）
        try {
          const dir = join(HERE, '..', 'shots')
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, 'runinfo-' + Date.now() + '.png'), screenshot())
        } catch (e) { lastLog.push('存 runinfo 截图失败：' + e.message) }
        // 2026-11-13 18:4x（用户 m07277）：主盟约只要 叙拉古/乌萨斯/莱塔尼亚/维多利亚/炎/谢拉格。
        // 1/3 页左右各一组，先 OCR 认一下两组分别是哪四个，选「全是这几家」的那组；
        // 认不出来就照旧点左边那组（当前版本左边正好是 炎/维多利亚/谢拉格/叙拉古）。
        let picked = 'A'
        // 2026-11-14 21:4x：left/right 原来在 try 里声明，落盘那段在另一个 try，直接 `left is not defined`
        // （真机 enterRun 实测「核心盟约落盘失败」→ data/run-covenants.json 根本没写出来）。改成外层先占个变量。
        let coresHere = []
        try {
          // 2026-11-14 19:4x 修：ocrPngLines(png) 的第二个参数是**文件路径**，原来把 screenshot() 的
          // Buffer 直接传进去 → spawn 报 `args[1] must be a string without null bytes` → 核心盟约永远走默认 A 组。
          const shotPath = join(HERE, '..', '.tmp', 'covenant-' + Date.now() + '.png')
          writeFileSync(shotPath, screenshot())
          const lines = await ocrPngLines(shotPath)
          const ALLOW = ['叙拉古', '乌萨斯', '莱塔尼亚', '维多利亚', '炎', '谢拉格']
          const row = (lines || []).filter((l) => {
            const t = String(l.text || '').trim()
            return l.box && l.box[1] >= 400 && l.box[1] <= 510 && ALLOW.concat(['伊比利亚', '萨尔贡', '卡西米尔', '阿戈尔']).some((n) => t === n || t.includes(n))
          })
          const left = row.filter((l) => l.box[0] < 960)
          const right = row.filter((l) => l.box[0] >= 960)
          const cnt = (arr) => arr.filter((l) => ALLOW.some((n) => String(l.text).includes(n))).length
          lastLog.push('核心盟约 OCR：左 ' + left.map((l) => l.text).join('/') + '（' + cnt(left) + ' 个合规）｜右 ' + right.map((l) => l.text).join('/') + '（' + cnt(right) + ' 个合规）')
          // 2026-11-14 23:1x（用户 m08805「照着别人的攻略流程走，不要自己凑盟约了」）：
          // 以前按「哪组合规盟约多」挑，那是我自己在挑。改成按攻略频次表挑：
          // 看哪组里有攻略更热门的大盟约（data/guide-covenant-rank.json，莱塔尼亚 40 / 伊比利亚 37 …）。
          const gp = chooseCoreGroup(left.map((l) => String(l.text || '').trim()), right.map((l) => String(l.text || '').trim()))
          lastLog.push('按攻略选核心盟约：' + gp.reason)
          if (gp.group === 'B' && right.length) {
            const f = right[0]
            await tapAt([Math.round(f.box[0] + 40), Math.max(300, Math.round(f.box[1] - 96))], 1000, '选核心盟约 右组')
            picked = 'B'
          }
          coresHere = (picked === 'B' ? right : left).map((l) => String(l.text || '').trim()).filter(Boolean)
        } catch (e) { lastLog.push('核心盟约 OCR 失败（' + e.message + '），按默认 A 组') }
        if (picked === 'A') await tapAt(POINTS.coreGroupA, 1000, '选核心盟约 A 组')
        // 2026-11-14 20:5x（用户 m07730「为什么每次都不凑盟约」）：本局可用的 4 个核心盟约
        // 就是这里选的那一组，落盘给买卡决策用。以前只写到日志里，drive 那边完全不知道本局核心是哪几家，
        // 目标盟约只能取休整期顶栏（顶栏只列已经有人的人）→ 目标永远从已有里长出来，凑不进新盟约。
        try {
          const coresToSave = coresHere.slice()
          writeFileSync(join(HERE, '..', 'data', 'run-covenants.json'),
            JSON.stringify({ at: new Date().toISOString(), group: picked, cores: coresToSave }, null, 1))
          lastLog.push('本局核心盟约（' + picked + ' 组）落盘：' + coresToSave.join('/'))
        } catch (e) { lastLog.push('核心盟约落盘失败：' + e.message) }
        corePicked = true
      }
      await tapAt(POINTS.setupReady, 1600, '准备就绪（1/3）');
    } else if (st.state === 'wz_strategy') {
      // 2/3：先点一张策略卡，右下才会从灰变「确认选择」
      if (!stratPicked) { await tapAt(POINTS.strategyCard0, 1000, '选第一张策略'); stratPicked = true; }
      await tapAt(POINTS.setupReady, 1600, '确认选择（2/3）');
    } else if (st.state === 'wz_squadsel') {
      await tapAt(POINTS.setupReady, 1600, '准备就绪（3/3）');
    } else {
      await tapAt([960, 540], 1600, '推进教学对话');
    }
    st = await waitFor(STEPS, { timeoutMs: 12_000, gapMs: 900 });
  }
  st = await waitFor(['wz_rest'], { timeoutMs: 90_000 });
  if (st.state !== 'wz_rest') return fail(st, '点完教学还没进到休整期');
  return { ok: true, state: st.state, dist: st.dist, log: lastLog.slice() };
}

/**
 * 大厅上「进一局」或「回进行中的一局」，两条路一起认。
 *
 * 为什么要有这个：大厅右下那颗按钮在「有进行中对局」时会变成「断线重连」，
 * 坐标和「独立模拟」几乎重合（1685,975 vs 1685,956）。原来 enterRun 点完只等 wz_diff，
 * 碰上断线就一定失败，白丢一局（2026-11-11 15:45 实测：大厅显示「当前回合 3 / 断线重连」）。
 * 现在点完之后两种结果都接：进了难度页 → 走原来的开局流程；直接回到对局 → 返回 resumed。
 */
export async function enterOrResume({ mode = 'independent', tutorialTaps = 12, maxMs = 240_000 } = {}) {
  lastLog.length = 0;
  let st = await waitFor(['wz_hall', 'wz_hall_joint'], { timeoutMs: 6000, gapMs: 800 });
  if (st.state !== 'wz_hall' && st.state !== 'wz_hall_joint') {
    return { ok: false, state: st.state, dist: st.dist, blocked: '不在卫戍大厅（现在 ' + st.state + '），不盲点', log: lastLog.slice() };
  }
  if (st.state === 'wz_hall_joint') {
    await tapAt(POINTS.modePersonal, 1800, '切到个人模拟');
    st = await waitFor(['wz_hall'], { timeoutMs: 8000, gapMs: 800 });
    if (st.state !== 'wz_hall') {
      return { ok: false, state: st.state, dist: st.dist, blocked: '点了「个人模拟」但没切到个人模式，停手', log: lastLog.slice() };
    }
  }

  await tapAt(POINTS.reconnect, 2500, '独立模拟 / 断线重连（同一格）');
  // 进对局会先黑屏加载几秒，所以这里等 40s，并且容忍还没认出来的中间态
  const RUN = ['wz_rest', 'wz_prep', 'wz_battle', 'wz_warbanner', 'wz_diff', 'wz_runinfo'];
  const st2 = await waitFor(RUN, { timeoutMs: 40_000, gapMs: 1200 });
  lastLog.push('点完看到 ' + st2.state + ' dist=' + st2.dist);

  if (st2.state === 'wz_rest' || st2.state === 'wz_prep' || st2.state === 'wz_battle' || st2.state === 'wz_warbanner') {
    return { ok: true, resumed: true, state: st2.state, dist: st2.dist, log: lastLog.slice() };
  }
  if (st2.state === 'wz_diff' || st2.state === 'wz_runinfo') {
    // 没有进行中的对局，走正常开局
    const en = await enterRun({ mode, tutorialTaps, maxMs, fromDiff: true });
    return { ...en, resumed: false };
  }
  return { ok: false, state: st2.state, dist: st2.dist, blocked: '点完既没进对局也没进难度页（现在 ' + st2.state + '）', log: lastLog.slice() };
}

/** 休整期：按计划买卡、升级、刷新 */
export async function shopAction({ buy = [], buyPoints = [], upgrade = false, refresh = 0, upgradePoint = null } = {}) {
  const done = [];
  // buyPoints 是 OCR 量出来的卡片中心（[x,y]），比写死的 SHOP_X 可靠：
  // 调度中心升级后商店会从 4 格变 5 格，整排往左长
  for (const pt of buyPoints) {
    // 2026-11-11 14:0x：等待从 1200/1500 收到 800/1100 —— 选中与确认之间 0.8s 够用
    // （卡面高亮是本地动画），每买一张省 0.8s。
    await tapAt(pt, 800, '选中商店卡 (' + pt.join(',') + ')');
    await tapAt(pt, 1100, '确认购买');
    done.push('买@' + pt[0]);
  }
  for (const idx of buy) {
    const x = POINTS.SHOP_X[idx];
    if (!x) continue;
    await tapAt([x, POINTS.SHOP_Y], 1200, '选中商店第' + (idx + 1) + '格');
    await tapAt([x, POINTS.SHOP_Y], 1500, '确认购买第' + (idx + 1) + '格');
    done.push('买第' + (idx + 1) + '格');
  }
  if (upgrade) {
    // 升级面板贴着商店最左卡，格数一变它就挪，所以调用方要传 OCR 算出来的 upgradePoint。
    const pt = upgradePoint || POINTS.upgrade;
    // 第一下把按钮变成「确认升级」，第二下才真扣钱
    await tapAt(pt, 1200, '升级调度中心 (' + pt.join(',') + ')');
    await tapAt(pt, 1500, '确认升级');
    done.push('升级@' + pt[0]);
  }
  for (let i = 0; i < refresh; i++) {
    await tapAt(POINTS.refresh, 1500, '刷新商店');
    done.push('刷新');
  }
  return done;
}

/** 休整期 → 打完本回合 → 回到下一个休整期（或结算） */
export async function playRound({ readyWaitMs = 4000, battleMaxMs = 150_000, covenants = [] } = {}) {
  lastLog.length = 0;
  // 战术决策按「本局在玩什么盟约」挑卡；没给 covenants 就走默认（优先队友增益的左1/中）。
  const chooseTactic = () => pickTactic({ preferList: tacticPreference({ covenants }).order });
  let pre = peek();
  // 2026-11-11 19:26 实测（trace-11-09-05 第 8 回合）：上场时起手只有 50ms，游戏把「轻按+拖」当成一次点击，
  // 弹出干员详情（wz_buydetail），手指还按着 → 「准备就绪」再也点不动，整局就停在这儿。
  // 现在先点一次「点击取消」（拖拽态里那颗红 X，坐标 965,240），再重新认界面。
  if (pre.state === 'wz_buydetail' || pre.state === 'wz_buy' || pre.state === 'wz_shopdetail') {
    await tapAt([965, 240], 900, '取消弹出的卡详情');
    await sleep(600);
    pre = peek();
  }
  // 已经在战斗中：多半是上一轮点完「开始作战」但当时没认出状态，直接等这一场结束，别重复点
  if (pre.state === 'wz_battle' || pre.state === 'wz_warbanner') {
    // 2026-11-14 09:57 实测：休息期结束的过场（wz_warbanner）被当成「不在休整期」→ 整局中止在第 11 回合。
    // 战斗过场和战斗本身一样，只能等它走完。
    const done = await waitFor(['wz_rest', 'wz_settle', 'wz_tactic'], { timeoutMs: battleMaxMs, gapMs: 2000 });
    if (done.state === 'wz_tactic') {
      const tk = await chooseTactic();
      lastLog.unshift('战术决策：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'));
    }
    return { ok: true, state: done.state, log: lastLog.slice() };
  }
  // 只在休整期动手；结算/别的界面都不认识，不盲点（「准备就绪」那个坐标在战斗里是空的）
  if (pre.state !== 'wz_rest' && pre.state !== 'wz_prep') {
    return { ok: false, state: pre.state, log: lastLog.slice(), reason: '不在休整期（现在 ' + pre.state + '），不打' };
  }
  // 「道具补给」三选一可能横在休整期前面：先把它点掉，否则准备就绪永远点不动
  if (await clearItemPanel()) lastLog.unshift('道具补给：已选中间那张');
  await tapAt(POINTS.ready, readyWaitMs, '准备就绪');
  // 确认框出现时机不定：轮询检测「黑影模态」再点确认，别盲点一次就算完
  for (let i = 0; i < 14; i++) {
    await sleep(700);
    if (!(await prepModalVisible())) break;
    await tapAt(POINTS.dialogConfirm, 900, '确认（资金清空提示）');
  }
  let st = peek();
  if (st.state !== 'wz_prep') {
    // 有时确认框没弹，第一次点落在准备页上也不影响；加载到作战准备页要几秒，给足 20 秒
    st = await waitFor(['wz_prep', 'wz_rest', 'wz_battle'], { timeoutMs: 20_000, gapMs: 800 });
  }
  if (st.state === 'wz_rest') {
    // 还是没反应：再点一次「准备就绪」，然后放宽到「进战斗也算成功」
    await tapAt(POINTS.ready, readyWaitMs, '再点一次准备就绪');
    for (let i = 0; i < 14; i++) {
      await sleep(700);
      if (!(await prepModalVisible())) break;
      await tapAt(POINTS.dialogConfirm, 900, '再确认一次（资金清空提示）');
    }
    st = await waitFor(['wz_prep', 'wz_battle', 'wz_rest'], { timeoutMs: 20_000, gapMs: 800 });
  }
  if (st.state === 'wz_rest') return { ok: false, state: 'wz_rest', log: lastLog.slice(), reason: '点了准备就绪还停在休整期' };
  if (st.state === 'wz_battle') {
    // 已经进战斗了（准备页一闪而过没认出来），直接等这场打完
    const done = await waitFor(['wz_rest', 'wz_settle', 'wz_tactic'], { timeoutMs: battleMaxMs, gapMs: 2000 });
    if (done.state === 'wz_tactic') {
      const tk = await chooseTactic();
      lastLog.unshift('战术决策：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'));
    }
    return { ok: true, state: done.state, log: lastLog.slice() };
  }
  await tapAt(POINTS.startBattle, 2500, '开始作战');
  st = await waitFor(['wz_battle'], { timeoutMs: 20_000 });
  if (st.state !== 'wz_battle') return { ok: false, state: st.state, log: lastLog.slice(), reason: '没进到战斗界面' };
  st = await waitFor(['wz_rest', 'wz_settle', 'wz_prep', 'wz_tactic'], { timeoutMs: battleMaxMs, gapMs: 2000 });
  if (st.state === 'wz_tactic') {
    // 打完一回合，进下个休整期之前会插一屏「战术决策 3 选 1」，不选会卡住
    const tk = await chooseTactic();
    lastLog.unshift('战术决策：' + (tk.ok ? '选了第 ' + tk.picked + ' 张' : '没选成（' + tk.reason + '）'));
    if (tk.ok) st = await waitFor(['wz_rest', 'wz_settle', 'wz_prep'], { timeoutMs: 25_000, gapMs: 1000 });
  }
  return { ok: true, state: st.state, log: lastLog.slice() };
}

/**
 * 结算页读数：通过回合 / 卫戍认证 / 用时。
 * 用通用 OCR（names_ocr.py）把整页文字抓下来，再按关键字切 —— 这几块文字排版会随文字长度漂，
 * 固定 ROI 读不稳，不如把原文存进 runs.jsonl，判错了还能回看。
 */
/**
 * 结算页 OCR 原文 → {cleared, passedRounds, cert, duration, text}。纯函数，单测直接喂字符串。
 * 数字纠错规则见下面各行的注释（O→0、竖线→1、全角数字折半）。
 */
export function parseSettleText(textRaw, opts = {}) {
  const text = String(textRaw || '')
  const grab = (re) => { const m = text.match(re); return m ? Number(m[1]) : null }
  // OCR 把数字认错的常见替换：O/o→0、|/l/I→1、〇（表意数字零）→0；全角数字直接折半。
  const num = (raw) => {
    if (raw == null) return null
    const s = String(raw)
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[Oo〇]/g, '0')
      .replace(/[|lI]/g, '1')
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  // 「×100」这种会被 OCR 认成 X|〇O，所以字符类要带上 〇 和全角数字，否则只截到「X|」= 1。
  const certRaw = (text.match(/[xX×]\s*([0-9Oo〇| lI０-９]{1,5})/) || [])[1]
  // 「通过回合」后面那个大号数字经常整块识别不出来（字体太大、描边细）。
  // 通过回合恒比打完的少 1；打通（「模拟完成」）时最后一个回合也算通过，不再减。
  const passed = grab(/通过回合[\s|丨:：]{0,4}(\d{1,2})(?!\d)/)
  const cleared = /模拟完成/.test(text)
  let passedRounds = passed
  if (passedRounds == null && Number.isFinite(opts.roundFallback)) {
    passedRounds = Number(opts.roundFallback) + (cleared ? 1 : 0)
  }
  return {
    cleared,
    passedRounds,
    cert: num(certRaw),
    duration: (text.match(/\d{1,2}时\d{1,2}分\d{1,2}秒/) || [null])[0],
    text: text.slice(0, 600),
  }
}

export async function readSettle(opts = {}) {
  try {
    // adb screencap 偶发挂住，pull 回来 0 字节 —— 换一张重截，最多 3 次。
    let buf = null
    for (let i = 0; i < 3 && !buf; i++) {
      try {
        const b = screenshot()
        if (b && b.length > 1000) buf = b
      } catch { /* 下一轮再说 */ }
      if (!buf) await sleep(800)
    }
    if (!buf) return { ok: false, error: '截图连续 3 次失败' }
    const dir = join(HERE, '..', '.tmp')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const png = join(dir, 'settle-' + Date.now() + '.png')
    const out = png + '.json'
    writeFileSync(png, buf)
    // 2026-11-13：这台机的 python 只装在 C:/Python314（Store 启动器坏），必须走 COOP_OCR_PYTHON/COOPANION_PYTHON；
    // 写死 'python' 在结算页会 spawn 失败 → 结算永远读不出 cleared/passedRounds。
    const py = process.env.COOP_OCR_PYTHON || process.env.COOPANION_PYTHON || 'python'
    spawnSync(py, [join(HERE, '..', 'sidecar', 'names_ocr.py'), out, png], { windowsHide: true, stdio: 'ignore', timeout: 180_000 })
    if (!existsSync(out)) return { ok: false, error: 'names_ocr 没产出' }
    const obj = JSON.parse(readFileSync(out, 'utf8'))
    // names_ocr.py 的输出是 { png 路径: [ {text, score, box}, ... ] }
    const first = Object.values(obj)[0] || []
    const lines = first.map((l) => String(l.text || '')).filter(Boolean)
    const text = lines.join(' ')
    return { ok: true, ...parseSettleText(text, opts), png }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 把一局的战果记进 data/runs.jsonl（「每局结束总结反思」的原始素材）。 */
export function appendRunRecord(rec) {
  try {
    const dir = join(HERE, '..', 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'runs.jsonl'), JSON.stringify(rec) + '\n', { flag: 'a' })
    return true
  } catch (e) {
    return false
  }
}

/** 结算页 → 回大厅 */
export async function leaveSettle() {
  lastLog.length = 0;
  const pre = peek();
  if (pre.state !== 'wz_settle') {
    return { ok: false, state: pre.state, log: lastLog.slice(), reason: '不在结算页（现在 ' + pre.state + '），不点返回主页' };
  }
  // 2026-11-12 01:35 实测：结算页那颗「返回主页」中心在 (1686,1017)，旧的 (1753,1004) 偏右 67px，
  // 有时点不到就一直卡在结算页（后台连打会整晚停在这儿）。改成多点试 + 每点完复核。
  const cands = [[1686, 1017], [1753, 1004], [1600, 1010]];
  for (const pt of cands) {
    await tapAt(pt, 3000, '返回主页 ' + pt.join(','));
    const st = await waitFor(['wz_hall', 'wz_hall_joint'], { timeoutMs: 9_000 });
    if (st.state === 'wz_hall' || st.state === 'wz_hall_joint') {
      return { ok: true, state: st.state, log: lastLog.slice() };
    }
    if (peek().state !== 'wz_settle') break;
  }
  const st2 = peek();
  return { ok: false, state: st2.state, log: lastLog.slice() };
}