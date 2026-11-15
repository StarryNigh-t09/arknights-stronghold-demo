
import { createTouch } from '../lib/touch.js';
import { spawnSync } from 'node:child_process';
const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe';
const S = '127.0.0.1:16416';
const t = createTouch({ adb: ADB, serial: S, log: () => {} });
const PNG = '../_probe.png';
const py = "from PIL import Image; im=Image.open(r'" + PNG + "').convert('RGB'); n=0\nfor x in range(557,593):\n for y in range(157,193):\n  p=im.getpixel((x,y))\n  if p[0]>150 and p[1]<90 and p[2]<90: n+=1\nprint(n)";
for (let y of [620, 660, 700, 740]) {
  for (let x = 1120; x <= 1420; x += 60) {
    t.tap(x, y, { holdMs: 500 });
    await new Promise(r => setTimeout(r, 700));
    spawnSync(ADB, ['-s', S, 'shell', 'screencap', '-p', '/sdcard/p.png'], { windowsHide: true, stdio: 'ignore' });
    spawnSync(ADB, ['-s', S, 'pull', '/sdcard/p.png', PNG], { windowsHide: true, stdio: 'ignore' });
    const r = spawnSync('python', ['-c', py], { encoding: 'utf8', windowsHide: true });
    const n = parseInt((r.stdout || '0').trim()) || 0;
    console.log('probe', x, y, 'red=' + n);
    if (n > 200) {
      t.tap(575, 175, { holdMs: 120 });
      await new Promise(r2 => setTimeout(r2, 600));
      console.log('HIT', x, y);
      process.exit(0);
    }
  }
}
console.log('NO HIT');
