import json, io
p = r'./world/data/runs.jsonl'
rows = [json.loads(l) for l in io.open(p, encoding='utf-8') if l.strip()]
rows[-1]['settle']['passedRounds'] = 13
rows[-1]['settle']['cert'] = 160
rows[-1]['settle']['ocrRaw'] = rows[-1]['settle'].get('text','')[:200]
with io.open(p, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print('rows', len(rows), 'last', rows[-1]['settle'].get('passedRounds'), rows[-1]['settle'].get('cert'))
