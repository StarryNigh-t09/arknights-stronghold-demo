
import { createTouch } from '../lib/touch.js';
const t = createTouch({ adb: 'C:/Program Files/Netease/MuMu/nx_main/adb.exe', serial: '127.0.0.1:16416', log: (m) => console.log('[t]', m) });
try { const r = await t.ensure(); console.log('ensure', JSON.stringify(r)); } catch (e) { console.log('ensure ERR', e.message); }
try { const r = await t.tap(1180, 620, { holdMs: 700 }); console.log('tap', JSON.stringify(r)); } catch (e) { console.log('tap ERR', e.message); }
await new Promise(r => setTimeout(r, 900));
