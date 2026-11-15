import { screenshot } from '../lib/adb.js';
import fs from 'node:fs';
fs.writeFileSync('../_eqs.png', screenshot());
console.log('ok');
