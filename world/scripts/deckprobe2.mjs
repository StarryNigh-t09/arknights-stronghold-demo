
import { createTouch } from '../lib/touch.js';
import { spawnSync } from 'node:child_process';
const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', S = '127.0.0.1:16416';
const t = createTouch({ adb: ADB, serial: S, log: () => {} });
const PNG = '../_probe.png';
const cap = () => { spawnSync(ADB, ['-s', S, 'shell', 'screencap', '-p', '/sdcard/p.png'], { windowsHide: true, stdio: 'ignore' }); spawnSync(ADB, ['-s', S, 'pull', '/sdcard/p.png', PNG], { windowsHide: true, stdio: 'ignore' }); };
const stat = () => {
  const py = "from PIL import Image; im=Image.open(r'" + PNG + "').convert('RGB'); s=0; n=0\nfor x in range(0,600,6):\n for y in range(160,900,6):\n  p=im.getpixel((x,y)); s+=p[0]+p[1]+p[2]; n+=1\nprint(round(s/n/3,1))";
  const r = spawnSync('python', ['-c', py], { encoding: 'utf8', windowsHide: true });
  return parseFloat((r.stdout || '0').trim()) || 0;
};
cap(); const base = stat(); console.log('baseline', base);
for (const y of [660, 700, 740]) {
  for (const x of [1240, 1270, 1300, 1330, 1360]) {
    t.tap(x, y, { holdMs: 500 });
    await new Promise(r => setTimeout(r, 650));
    cap(); const v = stat();
    const d = base - v;
    console.log('probe', x, y, 'mean=' + v, 'drop=' + d.toFixed(1));
    if (d > 12) {
      console.log('HIT', x, y);
      t.tap(575, 175, { holdMs: 120 });
      await new Promise(r => setTimeout(r, 500));
      process.exit(0);
    }
    t.tap(575, 175, { holdMs: 100 });
    await new Promise(r => setTimeout(r, 350));
  }
}
console.log('NO HIT');
