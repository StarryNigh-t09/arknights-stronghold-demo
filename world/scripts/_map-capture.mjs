import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scanFreeTiles, tapAt, peek } from '../lib/run.js';
import { screenshot } from '../lib/adb.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PY = 'C:/Python314/python.exe';
const st = await peek();
if (!/wz_rest/.test(st.state || '')) { console.log('NOT_REST', st.state); process.exit(0); }
await tapAt([1763, 953], 800, '折叠商店');
await new Promise((r) => setTimeout(r, 600));
const ft = await scanFreeTiles({});
const cells = (ft.tiles || []).map((t) => (Array.isArray(t) ? t : [t.x, t.y])).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
if (!cells.length) { console.log('NO_CELLS', JSON.stringify(ft).slice(0, 300)); process.exit(0); }
mkdirSync(join(ROOT, '.tmp'), { recursive: true });
const shotPath = join(ROOT, '.tmp', 'map-' + Date.now() + '.png');
writeFileSync(shotPath, screenshot());
const r = spawnSync(PY, [join(ROOT, '.tmp', '_mapcell.py'), shotPath, JSON.stringify(cells)], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] });
let parsed = [];
try { parsed = JSON.parse(r.stdout || '[]'); } catch (e) { console.log('PARSE_FAIL'); process.exit(1); }
const kind = (c) => {
  if (!c) return 'off';
  if (c.red > 0.25) return 'gate_red';
  const rr = c.rgb[0], gg = c.rgb[1], bb = c.rgb[2];
  if (gg > rr + 6 && gg > bb + 4) return 'high';
  if (rr > 150 && gg > 125) return 'ground';
  return 'rock';
};
const out = parsed.filter(Boolean).map((c) => ({ x: c.x, y: c.y, kind: kind(c), rgb: c.rgb, red: c.red }));
const file = join(ROOT, 'data', 'maps', 'wz-01-live.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), cells: out, shot: shotPath }, null, 1), 'utf8');
const tally = {};
for (const c of out) tally[c.kind] = (tally[c.kind] || 0) + 1;
console.log('CELLS', out.length, JSON.stringify(tally));