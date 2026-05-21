#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('/Users/jiayi/Desktop/Work/生服/trae/insight-platform')
SRC = ROOT / 'sources.md'
OUT = ROOT / 'assets' / 'source_channels.json'

section = ''
result: dict[str, list[dict[str, str]]] = {}

if not SRC.exists():
    raise SystemExit('sources.md not found')

for raw in SRC.read_text(encoding='utf-8').splitlines():
    line = raw.strip()
    if line.startswith('### '):
        section = line.replace('### ', '').strip()
        result.setdefault(section, [])
        continue
    if not line.startswith('|'):
        continue
    if '---' in line or '渠道 | 链接' in line:
        continue

    cols = [c.strip() for c in line.strip('|').split('|')]
    if len(cols) < 2:
        continue

    name, url = cols[0], cols[1]
    if not name or not url:
        continue

    if not re.match(r'^https?://', url):
        continue

    bucket = result.setdefault(section or 'Uncategorized', [])
    if all(item['url'] != url for item in bucket):
        bucket.append({'name': name, 'url': url})

flat = []
for key, items in result.items():
    for item in items:
        flat.append({'section': key, **item})

payload = {
    'source_of_truth': 'https://docs.corp.kuaishou.com/d/home/fcADd7EE875B_2CtnBVe3du0M',
    'generated_from': 'sources.md',
    'sections': result,
    'flat': flat,
    'total': len(flat),
}

OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'✅ generated {OUT} with {len(flat)} channels')
