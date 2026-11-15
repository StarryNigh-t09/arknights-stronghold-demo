
import { deployFromDeck } from '../lib/drive.js';
const r = await deployFromDeck([{ index: 0, name: 'test' }], { facing: 'right' });
console.log(JSON.stringify(r, null, 1));
process.exit(0);
