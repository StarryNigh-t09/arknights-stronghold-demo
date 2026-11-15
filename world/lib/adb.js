/**
 * adb.js — MuMu/ADB 控制层（Node 版）
 *
 * 为什么不用管道：本机沙箱下 spawn 的 stdio 管道会 EPERM（NamedPipe 受限），
 * Python 那边已经踩过（CreatePipe → WinError 5）。这里统一走「重定向到临时文件」，
 * 稳。
 *
 * 坐标：游戏是横屏 1920x1080 逻辑坐标。wm size 会报 1080x1920（竖屏物理值），
 * 那是屏幕没转时的数，别拿它算坐标。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './pyenv.js' // 补齐 APPDATA/TEMP 等：python 侧车靠它找 site-packages

export const DEFAULT_DEVICE = '127.0.0.1:16416';
export const BASE_W = 1920;
export const BASE_H = 1080;

/** 常见的 adb 位置：MuMu NX 新装/老装、再退到 PATH。 */
const ADB_CANDIDATES = [
  'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe',
  'C:\\Program Files\\Netease\\MuMu\\emulator\\adb.exe',
  'C:\\Program Files\\Netease\\MuMuPlayer-12.0\\shell\\adb.exe',
];

let _adbPath = null;
let _device = null;
let cachedSize = null;

/** World 起来时用配置覆盖；传空就回退环境变量 → 自动找 → 约定路径。 */
export function setAdbPath(p) {
  _adbPath = p ? String(p) : null;
}
export function setDevice(d) {
  const next = d ? String(d).trim() : null;
  if (next !== _device) cachedSize = null;   // 换设备（多开换端口）后分辨率得重测
  _device = next;
}
export function currentDevice() {
  return _device || process.env.COOPANION_DEVICE || DEFAULT_DEVICE;
}

export function adbPath() {
  if (_adbPath) return _adbPath;
  if (process.env.COOPANION_ADB) return process.env.COOPANION_ADB;
  const found = ADB_CANDIDATES.find((p) => existsSync(p));
  return found || ADB_CANDIDATES[0];
}

/** 跑一条 adb 命令，返回 { code, out, err }（stdout 是 Buffer） */
export function adb(args, { device = currentDevice(), timeoutMs = 20000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'coop-adb-'));
  const outFile = join(dir, 'out.bin');
  const errFile = join(dir, 'err.txt');
  try {
    const fdOut = openFd(outFile);
    const fdErr = openFd(errFile);
    const t0 = Date.now();
    const r = spawnSync(adbPath(), ['-s', device, ...args], {
      stdio: ['ignore', fdOut, fdErr],
      timeout: timeoutMs,
      windowsHide: true,
    });
    // 性能探针（2026-11-11 14:3x）：排查「切商店一步要 55~78 秒」。只记慢调用，卡在哪个 adb 命令一目了然。
    const ms = Date.now() - t0;
    if (ms > 1500) {
      try {
        appendFileSync(process.env.COOP_PERF_LOG || join(process.cwd(), '_perf.log'),
          new Date().toISOString() + ' adb ' + ms + 'ms ' + args.slice(0, 3).join(' ') + '\n');
      } catch { /* 忽略 */ }
    }
    closeFd(fdOut);
    closeFd(fdErr);
    return {
      code: r.status,
      out: safeRead(outFile),
      err: safeRead(errFile).toString('utf8'),
      error: r.error ? String(r.error.message || r.error) : null,
    };
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 500);
  }
}

function openFd(p) {
  // 延迟 require：只在需要时碰 fs 的底层，便于打包
  const { openSync } = process.getBuiltinModule('node:fs');
  return openSync(p, 'w+');
}
function closeFd(fd) {
  const { closeSync } = process.getBuiltinModule('node:fs');
  try { closeSync(fd); } catch { /* 忽略 */ }
}
function safeRead(p) {
  try { return readFileSync(p); } catch { return Buffer.alloc(0); }
}

/** shell 里跑命令，返回字符串 */
export function sh(cmd, opts) {
  const r = adb(['shell', ...cmd.replace(/^\s*/, '').split(/\s+/).filter(Boolean)], opts);
  return { code: r.code, out: r.out.toString('utf8'), err: r.err };
}

/** 点击（按 1920x1080 逻辑坐标；超出范围按实际分辨率等比缩放） */
export function tap(x, y, opts) {
  const size = screenSize(opts);
  const sx = Math.round((Number(x) / BASE_W) * size.w);
  const sy = Math.round((Number(y) / BASE_H) * size.h);
  return sh('input tap ' + sx + ' ' + sy, opts);
}

export function swipe(x1, y1, x2, y2, ms = 300, opts) {
  const size = screenSize(opts);
  const sx = Math.round((x1 / BASE_W) * size.w), sy = Math.round((y1 / BASE_H) * size.h);
  const ex = Math.round((x2 / BASE_W) * size.w), ey = Math.round((y2 / BASE_H) * size.h);
  return sh('input swipe ' + sx + ' ' + sy + ' ' + ex + ' ' + ey + ' ' + ms, opts);
}

/**
 * 长按拖动：Android 的 `input draganddrop`（先按住再拖，比 swipe 更像手指）。
 * @param {number[]} steps 不用传，内部用一条 shell 串起来
 */
export function dragDrop(x1, y1, x2, y2, ms = 1200, opts) {
  const size = screenSize(opts);
  const sx = Math.round((x1 / BASE_W) * size.w), sy = Math.round((y1 / BASE_H) * size.h);
  const ex = Math.round((x2 / BASE_W) * size.w), ey = Math.round((y2 / BASE_H) * size.h);
  return sh('input draganddrop ' + sx + ' ' + sy + ' ' + ex + ' ' + ey + ' ' + ms, opts);
}

/**
 * 手动拼一条触摸轨迹：DOWN → 按住 holdMs → 若干 MOVE → UP。
 * 游戏里有些拖拽只认「按住一会儿再动」，`input swipe` 一按下就开始滑，会被当成划屏。
 * 整条轨迹放在**一次** adb shell 里跑，避免每次调用 100ms 的启动开销。
 */
export function dragHold(x1, y1, x2, y2, { holdMs = 900, steps = 18, stepMs = 45 } = {}, opts) {
  const size = screenSize(opts);
  const s = (x) => Math.round((x / BASE_W) * size.w);
  const t = (y) => Math.round((y / BASE_H) * size.h);
  const parts = ['input motionevent DOWN ' + s(x1) + ' ' + t(y1)];
  parts.push('sleep ' + (holdMs / 1000));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    parts.push('input motionevent MOVE ' + Math.round(s(x1) + (s(x2) - s(x1)) * k) + ' ' + Math.round(t(y1) + (t(y2) - t(y1)) * k));
    if (stepMs > 0) parts.push('sleep ' + (stepMs / 1000));
  }
  parts.push('input motionevent UP ' + s(x2) + ' ' + t(y2));
  return sh(parts.join('; '), { ...(opts || {}), timeoutMs: 30000 });
}

/**
 * 鼠标源拖拽 —— 卫戍协议真正认的那一种。
 *
 * 实测（2026-11-09）：触摸源（`input swipe` / `input draganddrop` / `input motionevent`）
 * 在这个界面上**完全不生效**，干员纹丝不动；换成 `input mouse motionevent` 之后一次就成。
 * 原因是游戏走的是鼠标输入路径（模拟器里鼠标＝指哪打哪），触摸事件的语义对不上。
 *
 * 用法分两段（主人 2026-11-09 的原话）：
 *   1. 光标放到角色身上 → 按下鼠标 → 拖到目标格 → 松开 = 放置/换位置
 *   2. 再次长按该角色 → 拖向想要的朝向 → 松开 = 改朝向（角色脚下出现橙色箭头）
 *
 * @param {object} o { holdMs=120, steps=24, stepMs=30 } holdMs 是按下到开始移动的停顿
 */
export function mouseDrag(x1, y1, x2, y2, { holdMs = 120, steps = 24, stepMs = 30 } = {}, opts) {
  const size = screenSize(opts);
  const s = (x) => Math.round((x / BASE_W) * size.w);
  const t = (y) => Math.round((y / BASE_H) * size.h);
  const parts = ['input mouse motionevent DOWN ' + s(x1) + ' ' + t(y1)];
  if (holdMs > 0) parts.push('sleep ' + (holdMs / 1000));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    parts.push('input mouse motionevent MOVE ' + Math.round(s(x1) + (s(x2) - s(x1)) * k) + ' ' + Math.round(t(y1) + (t(y2) - t(y1)) * k));
    if (stepMs > 0) parts.push('sleep ' + (stepMs / 1000));
  }
  parts.push('input mouse motionevent UP ' + s(x2) + ' ' + t(y2));
  return sh(parts.join('; '), { ...(opts || {}), timeoutMs: 30000 });
}

/** 长按后往某个方向轻拖一下再松手 ＝ 改朝向。dir: up|down|left|right */
export function mouseFacing(x, y, dir, { holdMs = 900, dist = 130 } = {}, opts) {
  const d = String(dir || 'right').toLowerCase();
  const dx = d === 'left' ? -dist : d === 'right' ? dist : 0;
  const dy = d === 'up' ? -dist : d === 'down' ? dist : 0;
  return mouseDrag(x, y, x + dx, y + dy, { holdMs, steps: 10, stepMs: 50 }, opts);
}

/**
 * 往 /dev/input/event4 直接写二进制事件 —— 2026-11-09 实测，这是**唯一能动**的手势通道。
 *
 * 背景：游戏只认内核 evdev。`input tap` 能用（点按钮、点商店卡都行），但任何拖动
 * （`swipe` / `draganddrop` / `motionevent` / `mouse motionevent`）都不生效 ——
 * 那些走 InputManager 注入，evdev 里一条都没有（主人手动拖的是 event4 上一串 ABS_MT 事件）。
 *
 * 写字节比逐条 `sendevent` 快一个数量级：整段手势一次 `printf > event4`，约 90ms；
 * 用 sendevent 逐条发同一段要约 1.1s。所以这里统一走二进制。
 *
 * 坐标：event4 是**竖屏物理坐标**（1080×1920），横屏逻辑 (X,Y) → px = 宽 − Y、py = X。
 */
const EV_SYN = 0, EV_ABS = 3
const ABS_MT_SLOT = 47, ABS_MT_POSITION_X = 53, ABS_MT_POSITION_Y = 54, ABS_MT_TRACKING_ID = 57
const EV_SIZE = 24            // 64 位内核的 struct input_event

function evEvent(type, code, value) {
  const b = Buffer.alloc(EV_SIZE)
  b.writeUInt16LE(type, 16)
  b.writeUInt16LE(code, 18)
  b.writeInt32LE(value, 20)
  return b
}

function evHexStr(buf) {
  let s = ''
  for (const byte of buf) s += '\\x' + byte.toString(16).padStart(2, '0')
  return s
}

/** 竖屏物理坐标 */
function toEvPoint(x, y, opts) {
  const size = screenSize(opts)
  const pw = size.h, ph = size.w
  return [pw - Math.round((y / BASE_H) * pw), Math.round((x / BASE_W) * ph)]
}

/** 一次写一整段手势；segments 是若干组事件（每条自带 SYN） */
export function evWrite(segments, opts) {
  const buf = Buffer.concat(segments)
  const cmd = "printf '" + evHexStr(buf) + "' > " + evdev()
  return sh(cmd, { ...(opts || {}), timeoutMs: 20000 })
}

/** 点一下（evdev 源） */
export function sePress(x, y, { holdMs = 0 } = {}, opts) {
  const [px, py] = toEvPoint(x, y, opts)
  const parts = [evEvent(EV_ABS, ABS_MT_SLOT, 0), evEvent(EV_ABS, ABS_MT_TRACKING_ID, 1), evEvent(EV_ABS, ABS_MT_POSITION_X, px), evEvent(EV_ABS, ABS_MT_POSITION_Y, py), evEvent(EV_SYN, 0, 0)]
  if (holdMs > 0) {
    // 需要停顿时拆成两次写，中间 sleep
    return sh("printf '" + evHexStr(Buffer.concat(parts)) + "' > " + evdev() + '; sleep ' + (holdMs / 1000) + "; printf '" + evHexStr(Buffer.concat([evEvent(EV_ABS, ABS_MT_TRACKING_ID, -1), evEvent(EV_SYN, 0, 0)])) + "' > " + evdev(), { ...(opts || {}), timeoutMs: 20000 })
  }
  parts.push(evEvent(EV_ABS, ABS_MT_TRACKING_ID, -1), evEvent(EV_SYN, 0, 0))
  return evWrite(parts, opts)
}

/**
 * 拖拽（evdev 源）：按住 → 平滑移动到目标 → 松开。
 * 放新干员上场、把干员挪位置都用它（甲板上的干员拖到格子中心即可）。
 */
export function seDrag(x1, y1, x2, y2, { steps = 8, gapMs = 40 } = {}, opts) {
  const [a, b] = toEvPoint(x1, y1, opts)
  const [c, d] = toEvPoint(x2, y2, opts)
  const point = (i) => [Math.round(a + (c - a) * i / steps), Math.round(b + (d - b) * i / steps)]
  const mv = (i) => { const [x, y] = point(i); return [evEvent(EV_ABS, ABS_MT_POSITION_X, x), evEvent(EV_ABS, ABS_MT_POSITION_Y, y), evEvent(EV_SYN, 0, 0)] }

  // 分块写：一次全写进去会被输入系统合并成一个 MOVE，游戏就当成了「点一下」。
  // 分 3 块、块间在设备侧 sleep，总耗时仍只有两三百毫秒。
  const chunks = []
  chunks.push([evEvent(EV_ABS, ABS_MT_SLOT, 0), evEvent(EV_ABS, ABS_MT_TRACKING_ID, 1), evEvent(EV_ABS, ABS_MT_POSITION_X, a), evEvent(EV_ABS, ABS_MT_POSITION_Y, b), evEvent(EV_SYN, 0, 0), ...mv(1), ...mv(2)])
  chunks.push([...mv(Math.ceil(steps / 2)), ...mv(Math.ceil(steps / 2) + 1)])
  chunks.push([...mv(steps), evEvent(EV_ABS, ABS_MT_TRACKING_ID, -1), evEvent(EV_SYN, 0, 0)])

  const cmd = chunks.map((c2) => "printf '" + evHexStr(Buffer.concat(c2)) + "' > " + evdev()).join('; sleep ' + (gapMs / 1000) + '; ')
  return sh(cmd, { ...(opts || {}), timeoutMs: 20000 })
}

/**
 * 改朝向 —— 两段手势（主人 2026-11-09 22:09 指点）：
 *   1. 在干员身上按一下 → 进入拾取态（格子变绿、左上「点击取消」、脚下显示攻击范围）
 *   2. 从这个位置朝目标方向拖一小段 → 松开 ＝ 朝向改过去，同时退出拾取态
 *
 * 注意：拾取态里点格子**放不下去**，那个状态只用来改朝向；换位置要整段拖。
 */
export async function seFacing(x, y, dir, { dist = 130, steps = 6 } = {}, opts) {
  const d = String(dir || 'right').toLowerCase()
  const dx = d === 'left' ? -dist : d === 'right' ? dist : 0
  const dy = d === 'up' ? -dist : d === 'down' ? dist : 0
  await sePress(x, y, {}, opts)
  await new Promise((r) => setTimeout(r, 350))
  return seDrag(x, y, x + dx, y + dy, { steps }, opts)
}

/** 触摸设备节点，可用环境变量 COOPANION_EVDEV 覆盖 */
export function evdev() {
  return process.env.COOPANION_EVDEV || '/dev/input/event4';
}

export function key(code, opts) {
  return sh('input keyevent ' + Number(code), opts);
}

/** 实际分辨率（横屏）。截图尺寸优先，回退 wm size 并交换宽高 */
export function screenSize(opts) {
  if (cachedSize) return cachedSize;
  const r = sh('wm size', opts);
  const m = /(\d+)x(\d+)/.exec(r.out);
  if (m) {
    let w = Number(m[1]), h = Number(m[2]);
    if (h > w) [w, h] = [h, w];   // wm size 报竖屏，换回横屏
    cachedSize = { w, h };
  } else {
    cachedSize = { w: BASE_W, h: BASE_H };
  }
  return cachedSize;
}

/** 截图，返回 PNG 字节 */
export function screenshot(opts) {
  // 2026-11-11 16:2x 实测：adb screencap 偶发拉回半张图（这次 PIL 报 "broken PNG file (chunk b'\\x00...')"），
  // 以前只校验前两个魔数字节，半张图能过检查，到 python 侧才炸。现在多校验 IEND 结尾并重截，最多 3 次。
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), 'coop-shot-'));
    const host = join(dir, 's.png');
    const remote = '/sdcard/coop_shot.png';
    try {
      sh('screencap -p ' + remote, opts);
      adb(['pull', remote, host], opts);
      const buf = safeRead(host);
      const okHead = buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50;
      // IEND 是 PNG 的最后一节：尾部 16 字节里找得到它才算图完整
      const okTail = okHead && buf.subarray(Math.max(0, buf.length - 16)).includes(Buffer.from('IEND'));
      if (okHead && okTail) return buf;
      lastErr = new Error('截图失败：PNG 不完整（第 ' + (attempt + 1) + ' 次，' + buf.length + ' 字节）');
    } catch (e) {
      lastErr = e;
    } finally {
      const d = dir;
      setTimeout(() => { try { rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 500);
    }
  }
  throw lastErr || new Error('截图失败');
}

/**
 * 1.2 秒内的截图直接复用 —— 只给 trace 步骤图用（2026-11-11 14:0x）。
 * 一次 adb screencap+pull 实测约 1.1s（1920x1080 PNG 2.59MB），一个回合十几次步骤图就是十几秒；
 * 相邻两步往往在同一个画面上，没必要重复抓。
 * ⚠️ 判成败的差帧（diffCell/diffCells）**不能用这个**，必须用 screenshot() 拿新帧。
 */
let _shotBuf = null
let _shotAt = 0
export function screenshotCached(ttlMs = 1200, opts) {
  const now = Date.now()
  if (_shotBuf && now - _shotAt <= ttlMs) return _shotBuf
  const buf = screenshot(opts)
  _shotBuf = buf
  _shotAt = Date.now()
  return buf
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CROP_PY = join(HERE, '..', 'sidecar', 'crop.py');

function pythonBin() {
  return process.env.COOP_OCR_PYTHON || process.env.COOPANION_PYTHON || 'python';
}

/**
 * 只截一块区域，可选缩小 —— 用户 m02001（2026-11-11 15:2x）：
 * 「截小图能减少 token 消耗和解析时间」。
 *
 * 全屏 PNG 是 1920x1080 / 约 2.6MB，模型看图约 1.2k token；
 * 一条顶栏（1920x160 缩一半）只有几十 KB、约 200 token，视觉/OCR 也快得多。
 *
 * @param {number[]} box [x0,y0,x1,y1] 逻辑坐标（1920x1080）
 * @param {{scale?: number, buf?: Buffer, pngPath?: string, tag?: string}} [opts]
 * @returns {{ok: boolean, path?: string, w?: number, h?: number, bytes?: number, error?: string}}
 */
export function screenshotCrop(box, opts = {}) {
  const scale = Number(opts.scale) > 0 ? Number(opts.scale) : 1;
  // run_code 里 process.env 是空的，tmpdir() 会拼出 "undefined\temp" → mkdtemp ENOENT（2026-11-11 15:2x 踩到）。
  // 固定依 TEMP/TMP 环境变量，兜底系统临时目录。
  const tmpBase = process.env.TEMP || process.env.TMP || tmpdir();
  const dir = mkdtempSync(join(tmpBase, 'coop-crop-'));
  const src = opts.pngPath || join(dir, 'full.png');
  const dst = join(dir, (opts.tag ? String(opts.tag).slice(0, 24) : 'crop') + '.png');
  const outJson = join(dir, 'crop.json');
  try {
    if (!opts.pngPath) writeFileSync(src, opts.buf || screenshot(opts));
    const [x0, y0, x1, y1] = (box || [0, 0, BASE_W, BASE_H]).map((v) => Math.round(Number(v)));
    const args = [CROP_PY, src, dst, String(x0), String(y0), String(x1), String(y1)];
    if (scale !== 1) args.push('--scale', String(scale));
    const fdOut = join(dir, 'py.out');
    const fdErr = join(dir, 'py.err');
    const r = spawnSync(pythonBin(), args, { timeout: 60_000, windowsHide: true, encoding: 'utf8' });
    void fdOut; void fdErr;
    if (r.status !== 0) return { ok: false, error: 'crop.py exit ' + r.status + ' out=' + String(r.stdout || '').slice(0, 200) + ' err=' + String(r.stderr || '').slice(0, 300) + ' py=' + pythonBin() };
    let meta = null;
    try { meta = JSON.parse(String(r.stdout || '').trim().split(/\r?\n/).pop()); } catch { meta = null; }
    if (!meta || !meta.ok) return { ok: false, error: 'crop.py 没产出：' + String(r.stdout || '').slice(0, 200) };
    const buf = readFileSync(dst);
    // 保住文件给调用方（模型看图/OCR 要吃路径），临时目录 60s 后清
    const keep = join(tmpBase, 'coop-crop-' + Date.now() + '-' + (opts.tag || 'crop') + '.png');
    writeFileSync(keep, buf);
    void outJson;
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 60_000);
    return { ok: true, path: keep, w: meta.w, h: meta.h, bytes: buf.length, scale };
  } catch (e) {
    return { ok: false, error: 'crop 失败：' + (e && e.message ? e.message : String(e)) };
  } finally {
    // 失败也要清
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 60_000);
  }
}

/** 当前前台包名（用于判断游戏是否在前台） */
export function foregroundApp(opts) {
  const r = sh('dumpsys window | grep mCurrentFocus', opts);
  const m = /u0\s+([\w.]+)\/([\w.$]+)/.exec(r.out);
  return m ? { pkg: m[1], activity: m[2] } : null;
}

export const GAME_PKG = 'com.hypergryph.arknights';

/**
 * 游戏进程已经跑了多少秒（拿不到返回 null）。
 *
 * 为什么要这个：冷启动时 Android 会先显示上一次的任务快照（就是被杀前的画面），
 * 截图拿到的「卫戍大厅」其实是几秒前的旧帧。进程年龄能区分：
 * 年龄很小时屏幕上那个大厅一定是快照，不是真的到了。
 */
export function appAgeSeconds(pkg = GAME_PKG) {
  const r = sh('ps -A -o PID,ETIME,NAME');
  const line = r.out.split(/\r?\n/).find((l) => l.includes(pkg));
  if (!line) return null;
  const m = /(\d+)-(\d+):(\d+):(\d+)|(\d+):(\d+):(\d+)|(\d+):(\d+)/.exec(line);
  if (!m) return null;
  if (m[1]) return Number(m[1]) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  if (m[5]) return Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]);
  return Number(m[8]) * 60 + Number(m[9]);
}
/** 按 MAA 的做法滑：等时距多点（MaaCore 也是逐点 sleep 发出去） */
export async function seSwipe(x1, y1, x2, y2, { points = 20, durationMs = 500 } = {}, opts) {
  const size = screenSize()
  const sx = size.h - Math.round((y1 / 1080) * size.h), sy = Math.round((x1 / 1920) * size.w)
  const ex = size.h - Math.round((y2 / 1080) * size.h), ey = Math.round((x2 / 1920) * size.w)
  // 逐点 spawn 一次 adb shell，每点要 ~180ms，20 点下来手势长达 3.6 秒 —— 真实手指只要 1 秒，
  // 游戏会把这种超慢滑动当「长按」直接忽略（2026-11-10 用 getevent 实测：21559.68→21563.26
  // = 3.58s，正是拖不上场的根因）。改成切 K 块、每块一条 printf、块间只 sleep，整条命令一次 spawn。
  // 一块里塞多个 MOVE 时它们会带同一个内核时间戳，游戏把它当成「一次跳变」→ 退化成单击
  // （2026-11-10 实测：4 块一次的写法拖不出东西，但 sePress 一点就弹详情）。所以每块只放
  // 一个 MOVE，靠块间 sleep 拉开时间戳；整条仍然只 spawn 一次 adb。
  const K = points
  const per = 1
  const gapS = Math.max(0.03, durationMs / K / 1000)
  const blocks = []
  let cur = [evEvent(EV_ABS, ABS_MT_SLOT, 0), evEvent(EV_ABS, ABS_MT_TRACKING_ID, 1),
    evEvent(EV_ABS, ABS_MT_POSITION_X, sx), evEvent(EV_ABS, ABS_MT_POSITION_Y, sy), evEvent(EV_SYN, 0, 0)]
  // 「按下」先单独发一块并停 holdMs 再开始移动：游戏要认出「长按拾取」才允许拖，
  // 按下和第一段移动挤在同一帧里会被判成单击（2026-11-10 实测，按下即拖只弹详情）。
  const holdS = Math.max(0.12, (opts && opts.holdMs ? opts.holdMs : 220) / 1000)
  blocks.push(cur)
  cur = []
  const gapParts = []
  let i = 0
  while (i < points) {
    i += 1
    const t = i / points
    cur.push(evEvent(EV_ABS, ABS_MT_POSITION_X, Math.round(sx + (ex - sx) * t)))
    cur.push(evEvent(EV_ABS, ABS_MT_POSITION_Y, Math.round(sy + (ey - sy) * t)))
    cur.push(evEvent(EV_SYN, 0, 0))
    blocks.push(cur)
    cur = []
  }
  cur.push(evEvent(EV_ABS, ABS_MT_TRACKING_ID, -1))
  cur.push(evEvent(EV_SYN, 0, 0))
  blocks.push(cur)
  const cmd = blocks.map((b, idx) =>
    "printf '" + evHexStr(Buffer.concat(b)) + "' > " + evdev() + (idx === 0 ? "; sleep " + holdS.toFixed(2) : "; sleep " + gapS.toFixed(2))
  ).join("; ")
  await sh(cmd, opts)
}

