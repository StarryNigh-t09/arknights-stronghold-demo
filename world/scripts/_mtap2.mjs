
import { createTouch } from '../lib/touch.js';
const t = await createTouch({ adb: 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe', serial: '127.0.0.1:16416', abi: 'x86_64' });
await t.ensure();
await t.tap(478, 480, { holdMs: 120 });
await new Promise(r=>setTimeout(r,1200));
await t.tap(980, 674, { holdMs: 700 });
await new Promise(r=>setTimeout(r,1500));
process.exit(0);
