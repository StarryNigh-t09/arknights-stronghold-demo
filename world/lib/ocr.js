// Node-side wrapper around the Python OCR sidecar (world/sidecar/ocr.py).
//
//   import { readState } from './lib/ocr.js'
//   const st = await readState('C:/.../wz_rest_r1.png')
//
// The child process is spawned with stdio ignored and its JSON is handed back
// through a temp file: pipes are avoided on purpose (captured child stdio can
// fail with EPERM under the sandbox).

import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './pyenv.js' // 补齐 APPDATA/TEMP 等：python 侧车靠它找 site-packages

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIDECAR = path.resolve(HERE, '..', 'sidecar', 'ocr.py');

/** Interpreter override, e.g. COOP_OCR_PYTHON=C:\\Python314\\python.exe */
function pythonBin() {
  return process.env.COOP_OCR_PYTHON || 'python';
}

function errText(e) {
  return (e && e.message) ? e.message : String(e);
}

/**
 * Run the OCR sidecar on a screenshot.
 * @param {string} pngPath absolute or cwd-relative path to a 1920x1080 shot
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<object>} {ok, screen, round, money, hp, countdown, shop, ...}
 *                            or {ok:false, error}
 */
export async function readState(pngPath, opts = {}) {
  const _t0 = Date.now();
  try { return await _readState(pngPath, opts); }
  finally {
    // 性能探针（2026-11-11 14:3x）：一次整读实测 5.6s 起，慢的时候到过 20s+，先量出来再优化。
    const _ms = Date.now() - _t0;
    if (_ms > 4000) {
      try {
        const { appendFileSync } = await import('node:fs');
        appendFileSync(process.env.COOP_PERF_LOG || path.join(process.cwd(), '_perf.log'),
          new Date().toISOString() + ' ocr ' + _ms + 'ms ' + (opts.probe ? 'probe' : 'read') + ' ' + path.basename(pngPath) + '\n');
      } catch { /* 忽略 */ }
    }
  }
}

async function _readState(pngPath, opts = {}) {
  const timeoutMs = opts.timeoutMs === undefined ? 120000 : opts.timeoutMs;
  let dir;
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'coop-ocr-'));
  } catch (err) {
    return { ok: false, error: 'temp dir: ' + errText(err) };
  }
  const outFile = path.join(dir, 'out.json');
  const args = [SIDECAR, pngPath, '--json', '--out', outFile];
  if (opts.level) args.push('--level', String(opts.level));
  // 提速（2026-11-11 13:5x）：调用方知道现在该是哪个界面、第几回合时传进来，
  // 省掉 detect_screen 1.7s 与 read_round 1.1s —— 一局 6~8 次 sense，省下来的就是分钟。
  if (opts.expect) args.push('--expect', String(opts.expect));
  if (opts.round !== undefined && opts.round !== null) args.push('--round', String(opts.round));
  // 刷新循环专用轻量模式（2026-11-11 16:0x）：只读商店/金币/免费次数/按钮态，省 ~2s/次
  if (opts.lite) args.push('--lite');
  if (opts.probe) args.push('--probe');

  try {
    // 子进程的 stdout/stderr 落文件再用 fd 传给 spawn，**不能**用 stdio:'ignore'：
    // 2026-11-10 实测 windowsHide + stdio:'ignore' 会让 python.exe 刚起来就退出
    // 0xC0000142（DLL 初始化失败），vision.py 用 fd 重定向一直正常。
    // 顺带把子进程 stderr 留下来，OCR 崩了能看见原因。
    const childOut = path.join(dir, 'child.out');
    const childErr = path.join(dir, 'child.err');
    const fdOut = openSync(childOut, 'w+');
    const fdErr = openSync(childErr, 'w+');
    let outcome;
    try {
      outcome = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(
          pythonBin(),
          args,
          { stdio: ['ignore', fdOut, fdErr], windowsHide: true },
        );
      } catch (err) {
        resolve({ spawnError: err });
        return;
      }
      const timer = setTimeout(() => {
        try { child.kill(); } catch (e) { void e; }
        resolve({ timedOut: true });
      }, timeoutMs);
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ spawnError: err });
      });
      child.on('close', (codeNum) => {
        clearTimeout(timer);
        resolve({ code: codeNum });
      });
      });
    } finally {
      closeSync(fdOut);
      closeSync(fdErr);
    }

    if (outcome.spawnError) {
      const e = outcome.spawnError;
      if (e && e.code === 'ENOENT') {
        return { ok: false, error: 'python not found (' + pythonBin() + ')' };
      }
      return { ok: false, error: 'spawn failed: ' + errText(e) };
    }
    if (outcome.timedOut) {
      return { ok: false, error: 'ocr timed out after ' + timeoutMs + 'ms' };
    }

    let text;
    try {
      text = await readFile(outFile, 'utf8');
    } catch (err) {
      const tail = await readFile(childErr, 'utf8').catch(() => '');
      return {
        ok: false,
        error: 'no output (exit ' + outcome.code + '): ' + errText(err) +
          (tail ? ' | stderr: ' + tail.trim().slice(-400) : ''),
      };
    }
    text = text.replace(/^\uFEFF/, '').trim();
    if (!text) return { ok: false, error: 'empty output (exit ' + outcome.code + ')' };
    try {
      return JSON.parse(text);
    } catch (err) {
      return { ok: false, error: 'bad json: ' + errText(err) };
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 便宜探针：只判「商店展开/折叠」+ 金币，约 2s（整套 readState 约 6s）。
 * 切面板、买完核对成交这类只关心一两个布尔/数字的地方用它。
 */
export async function probeState(pngPath, opts = {}) {
  return readState(pngPath, { ...opts, probe: true, expect: null, round: null });
}

export default { readState, probeState };
