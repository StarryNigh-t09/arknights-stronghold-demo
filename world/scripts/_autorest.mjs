import { setTrace, autoRest } from '../lib/drive.js';
const tag = 'autorest-fast-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
setTrace(tag);
const r = await autoRest({});
console.log('RESULT', JSON.stringify({ ok: r && r.ok, placed: r && r.placed, ms: r && r.ms }));
if (r && r.steps) console.log('STEPS\n' + r.steps.join('\n'));
console.log('TRACE ' + tag);
