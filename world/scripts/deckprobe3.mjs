
import { createTouch } from '../lib/touch.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', S = '127.0.0.1:16416';
const t = createTouch({ adb: ADB, serial: S, log: () => {} });
const PNG = '../_probe.png';
const OUT = '../_probe.txt';
const CHK = '../_chk.py';
const W = { windowsHide: true, stdio: 'ignore' };
const cap = () => { spawnSync(ADB, ['-s', S, 'shell', 'screencap', '-p', '/sdcard/p.png'], W); spawnSync(ADB, ['-s', S, 'pull', '/sdcard/p.png', PNG], W); };
const stat = () => { if (existsSync(OUT)) unlinkSync(OUT); spawnSync('python', [CHK, PNG, OUT], W); return existsSync(OUT) ? parseFloat(readFileSync(OUT, 'utf8')) || 0 : -1; };
cap(); const base = stat(); console.log('baseline', base);
for (const y of [640, 680, 720, 760]) {
  for (let x = 1160; x <= 1400; x += 40) {
    t.tap(x, y, { holdMs: 500 });
    await new Promise(r => setTimeout(r, 600));
    cap(); const v = stat();
    const d = base - v;
    console.log('probe', x, y, 'mean=' + v, 'drop=' + d.toFixed(1));
    if (v > 0 && d > 12) { console.log('HIT', x, y); t.tap(575, 175, { holdMs: 120 }); await new Promise(r => setTimeout(r, 400)); process.exit(0); }
  }
}
console.log('NO HIT');
