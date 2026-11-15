/**
 * doctor.js — 装到别人机器上第一件事该跑的自检。
 *
 * 为什么单独做：这插件依赖四样外部的东西（adb、模拟器分辨率、游戏包名、Python+Pillow），
 * 任何一样不对，症状都是「点了没反应」「识别不出来」，很难从现象反推原因。
 * 所以把检查项全列出来、一次跑完，坏哪条写清怎么修。
 */
import { existsSync, readFileSync, mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adb, adbPath, screenSize, foregroundApp, GAME_PKG, DEFAULT_DEVICE, BASE_W, BASE_H } from './adb.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANK = join(HERE, '..', 'assets', 'screens.json');
const EXPECTED_SCREENS = ['title', 'login', 'hall', 'wz_hall', 'wz_admin', 'wz_squad', 'wz_db', 'wz_joint'];

/** Python 探针。走临时文件重定向，不用管道 —— 本机沙箱下 spawn 的管道会 EPERM。 */
function pyProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'coop-doc-'));
  const outFile = join(dir, 'out.txt');
  const errFile = join(dir, 'err.txt');
  try {
    const fdOut = openSync(outFile, 'w');
    const fdErr = openSync(errFile, 'w');
    const r = spawnSync(process.env.COOPANION_PYTHON || 'python', ['-c', 'import PIL; print(PIL.__version__)'], {
      stdio: ['ignore', fdOut, fdErr], timeout: 20000, windowsHide: true,
    });
    closeSync(fdOut);
    closeSync(fdErr);
    const out = readFileSync(outFile, 'utf8').trim();
    return { ok: r.status === 0, detail: out || ('exit ' + r.status) };
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 200);
  }
}

/** 跑全套自检，返回 { ok, checks:[{name,ok,detail,hint?}] } */
export function doctor() {
  const checks = [];
  const add = (name, ok, detail, hint) => checks.push({ name, ok, detail, ...(ok ? {} : { hint }) });

  // 1) adb 可执行文件
  const p = adbPath();
  add('adb 可执行文件', existsSync(p), p, '装 MuMu 自带 adb，或用环境变量 COOPANION_ADB 指过去');

  // 2) 设备连上没
  let devices = '';
  try {
    const r = adb(['devices']);
    devices = String(r.out || '').split('\n').filter((l) => /\tdevice/.test(l)).map((l) => l.split('\t')[0]).join(',');
  } catch (e) {
    devices = '出错：' + e.message;
  }
  const target = process.env.COOPANION_DEVICE || DEFAULT_DEVICE;
  add('模拟器已连接', devices.includes(target), '期望 ' + target + '，实际在线：' + (devices || '无'),
    '模拟器没开 / ADB 端口变了。MuMu 多开时端口会变，用 COOPANION_DEVICE 改');

  // 3) 分辨率（对不上就别往下做了，坐标全废）
  let size = null;
  try { size = screenSize(); } catch (e) { size = null; }
  add('分辨率 1920x1080（横屏逻辑）', Boolean(size) && size.w === BASE_W && size.h === BASE_H,
    size ? size.w + 'x' + size.h : '读不到',
    '把所有坐标当基准的前提就是这个分辨率；模拟器里改成 1920x1080 再试');

  // 4) 游戏装了没
  let pkgs = '';
  try { pkgs = String(adb(['shell', 'pm', 'list', 'packages', GAME_PKG]).out || ''); } catch { pkgs = ''; }
  add('明日方舟已安装', pkgs.includes(GAME_PKG), pkgs.trim() || '没找到 ' + GAME_PKG, '先在模拟器里装好明日方舟客户端');

  // 5) 游戏在前台（只警告，不算失败）
  let fg = '';
  try { fg = (foregroundApp() || {}).pkg || ''; } catch { fg = ''; }
  add('游戏在前台', fg.includes(GAME_PKG), fg || '读不到前台包名',
    '这条不影响判断对错，只是冷启动前提醒一句：不在前台就去点图标或者用 wz_goto');

  // 6) Python + Pillow（界面识别要用）
  const py = pyProbe();
  add('Python + Pillow 可用', py.ok, 'Pillow ' + py.detail,
    'pip install pillow；或用环境变量 COOPANION_PYTHON 指定解释器。缺它只是没界面识别，截图点击照常');

  // 7) 界面模板库完整
  let screens = [];
  try {
    const bank = JSON.parse(readFileSync(BANK, 'utf8'));
    screens = Object.keys(bank.bank || {});
  } catch (e) {
    screens = [];
  }
  const missing = EXPECTED_SCREENS.filter((s) => !screens.includes(s));
  add('界面模板库完整（8 屏）', missing.length === 0, missing.length ? '缺：' + missing.join(',') : screens.join(','),
    'assets/screens.json 不完整，重装插件或重新跑 vision.py build');

  return { ok: checks.every((c) => c.ok), checks };
}
// 直接跑 node lib/doctor.js 也要有输出：README 让人这样查红项，早先它静静退出 0，
// 看着像「都过了」，其实什么都没打印。
if (process.argv[1] && process.argv[1].endsWith('doctor.js')) {
  const r = doctor();
  for (const c of r.checks) {
    console.log((c.ok ? 'OK   ' : 'FAIL ') + c.name + '：' + c.detail);
    if (!c.ok && c.hint) console.log('       修：' + c.hint);
  }
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log('');
  console.log(r.ok ? '全部通过' : '有 ' + bad + ' 项没过');
  process.exitCode = r.ok ? 0 : 1;
}

