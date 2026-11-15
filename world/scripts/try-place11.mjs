
import { placeUnit } from '../lib/run.js';
const r = await placeUnit({ from: [1386, 699], to: [1000, 600], facing: 'right' });
console.log(JSON.stringify(r));
