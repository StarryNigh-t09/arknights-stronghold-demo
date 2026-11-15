
import { createTouch } from '../lib/touch.js';
const t = await createTouch({ adb: 'C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe', serial: '127.0.0.1:16416', abi: 'x86_64' });
await t.ensure();
console.log('tap1');
await t.tap(980, 674, { holdMs: 120 });
await new Promise(r=>setTimeout(r,1500));
console.log('done');
process.exit(0);
