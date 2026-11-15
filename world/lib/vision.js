/**
 * vision.js — 界面状态识别（Node 侧薄封装，真正干活的是 sidecar/vision.py）
 *
 * 为什么不在这里做图像处理：Node 没有 PNG 解码器，Pillow 已在机器上。
 * 传文件不传管道（沙箱下管道 EPERM）。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './pyenv.js' // 补齐 APPDATA/TEMP 等：python 侧车靠它找 site-packages

// 发布后 python 在包内 plugin/sidecar/；老布局在仓库根 sidecar/，两个都认
const SIDECAR = (() => {
  const inside = fileURLToPath(new URL('../sidecar/vision.py', import.meta.url));
  // pack-allow-outside: 开发期回退路径，发布包里 inside 一定存在，这行不会生效
  const legacy = fileURLToPath(new URL('../../sidecar/vision.py', import.meta.url));
  const { existsSync } = process.getBuiltinModule('node:fs');
  return existsSync(inside) ? inside : legacy;
})();

function pythonPath() {
  return process.env.COOPANION_PYTHON || 'python';
}

/** 对一张 PNG 做分类，返回 { state, dist, ranking } */
export function classifyFile(pngPath) {
  const dir = mkdtempSync(join(tmpdir(), 'coop-vis-'));
  const outFile = join(dir, 'out.json');
  const errFile = join(dir, 'err.txt');
  try {
    const fdOut = openFd(outFile);
    const fdErr = openFd(errFile);
    const r = spawnSync(pythonPath(), ['-X', 'utf8', SIDECAR, 'classify-file', pngPath], {
      stdio: ['ignore', fdOut, fdErr],
      timeout: 30_000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    closeFd(fdOut);
    closeFd(fdErr);
    const out = safeRead(outFile).toString('utf8').trim();
    const err = safeRead(errFile).toString('utf8').trim();
    if (r.status !== 0 || !out) {
      return { state: 'unknown', dist: 1, ranking: [], error: err || 'vision.py exit ' + r.status };
    }
    const last = out.split(/\r?\n/).filter(Boolean).pop();
    return JSON.parse(last);
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 300);
  }
}

/** 对内存里的 PNG 字节做分类 */
export function classifyBuffer(buf) {
  const dir = mkdtempSync(join(tmpdir(), 'coop-visbuf-'));
  const p = join(dir, 's.png');
  try {
    writeFileSync(p, buf);
    return classifyFile(p);
  } finally {
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 300);
  }
}

function openFd(p) {
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

/** 中文界面名，给人看 */
export const STATE_LABEL = {
  title: '标题页',
  login: '登录页（开始唤醒）',
  hall: '大厅',
  wz_hall: '卫戍协议大厅',
  wz_hall_joint: '卫戍协议大厅（联合模式）',
  wz_runinfo: '开局·确认本局信息（1/3）',
  wz_strategy: '开局·选择策略（2/3）',
  wz_squadsel: '开局·确定自选编队（3/3）',
  wz_warbanner: '作战结束过场',
  wz_tactic: '战术决策（3 选 1）',
  wz_admin: '物资调配处（编队）',
  wz_squad: '自选编队弹窗',
  wz_db: '协议数据库',
  wz_joint: '选择同盟方式',
  wz_diff: '选择模拟难度',
  wz_rest: '对局·休整期',
  wz_prep: '对局·作战准备页',
  wz_battle: '对局·作战中',
  wz_buydetail: '商店卡详情',
  wz_settle: '结算页',
  unknown: '不认识的界面',
};
