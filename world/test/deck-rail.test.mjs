// 2026-11-14 17:5x 真机回归（trace-night-2026-11-14T09-56-23 第 12/13 回合）：
// 整备区站满 9~10 人时，木台亮带被干员身体切得只剩 37 行（945..982），
// bench_rail 的 min_len=60 把它丢掉、只留上方地图木栈道（635..723），
// bottom=723 < 840 → ok=False → 每回合都报「甲板张数不可信」→ 布阵在扫甲板那步就收手（0 上场、掉 10 血）。
// 这条用合成图锁住「木台带很短也要认出来、且取最靠下那条」。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PY = process.env.COOP_OCR_PYTHON || process.env.COOPANION_PYTHON || 'C:/Python314/python.exe'
const SIDECAR = join(HERE, '..', 'sidecar')

function runPy(code) {
  const dir = mkdtempSync(join(process.env.TEMP || process.env.TMP || tmpdir(), 'deckrail-'))
  const f = join(dir, 'p.py')
  writeFileSync(f, code)
  const r = spawnSync(PY, [f], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: SIDECAR } })
  if (r.status !== 0) throw new Error('python 失败: ' + (r.stdout || '') + (r.stderr || ''))
  return (r.stdout || '').trim()
}

test('木台亮带被干员切短（只剩 37 行）也要认出来，并且取最靠下那条', () => {
  const dir = mkdtempSync(join(process.env.TEMP || process.env.TMP || tmpdir(), 'deckrail-img-'))
  const png = join(dir, 'synthetic.png')
  const out = runPy(`
import json, sys
from PIL import Image
im = Image.new('RGB', (1920, 1080), (40, 40, 40))
px = im.load()
WOOD = (200, 160, 100)
for y in range(635, 723):
    for x in range(200, 1700):
        px[x, y] = WOOD
for y in range(945, 982):
    for x in range(200, 1700):
        px[x, y] = WOOD
im.save(sys.argv[1] if len(sys.argv) > 1 else r'${png}')
sys.path.insert(0, r'${SIDECAR}')
import deck
print(json.dumps(deck.bench_rail(r'${png}')))
`)
  const rail = JSON.parse(out)
  assert.equal(rail.ok, true, '木台带只有 37 行也要 ok=true，拿到的是 ' + out)
  assert.equal(rail.top, 945)
  assert.equal(rail.bottom, 982)
})

test('商店把底部盖住（木台没有亮带）时仍然 ok=false，不许拿上方木栈道冒充', () => {
  const dir = mkdtempSync(join(process.env.TEMP || process.env.TMP || tmpdir(), 'deckrail-img2-'))
  const png = join(dir, 'shop-open.png')
  const out = runPy(`
import json, sys
from PIL import Image
im = Image.new('RGB', (1920, 1080), (40, 40, 40))
px = im.load()
WOOD = (200, 160, 100)
for y in range(635, 723):
    for x in range(200, 1700):
        px[x, y] = WOOD
im.save(r'${png}')
sys.path.insert(0, r'${SIDECAR}')
import deck
print(json.dumps(deck.bench_rail(r'${png}')))
`)
  const rail = JSON.parse(out)
  assert.equal(rail.ok, false, '底部没有木台时必须 ok=false，拿到的是 ' + out)
})
