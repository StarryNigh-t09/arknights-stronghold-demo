
import { createTouch } from '../lib/touch.js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const ADB = 'C:/Program Files/Netease/MuMu/nx_main/adb.exe'
const S = '127.0.0.1:16416'
const t = createTouch({ adb: ADB, serial: S })
const shot = () => { execFileSync(ADB, ['-s',S,'shell','screencap','-p','/sdcard/z.png']); execFileSync(ADB, ['-s',S,'pull','/sdcard/z.png','../_probe.png']) }
const cands = [[1470,790],[1480,840],[1520,900],[1560,820],[1450,880],[1500,930],[1580,930]]
for (const [x,y] of cands) {
  t.swipe(x, y, x+60, y+60, { steps: 8, stepMs: 60, holdMs: 200 })
  shot()
  console.log('tried', x, y)
  const yes = process.env.STOP && readFileSync('../_probe.png').length > 0
}
