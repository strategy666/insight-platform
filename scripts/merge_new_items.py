#!/usr/bin/env python3
"""合并新整理的竞对动态到 competitor_updates.json"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "data"
COMP = ASSETS / "competitor_updates.json"

def norm(t):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', (t or '').lower())

# Load backup
backup = json.load(open(ASSETS / "competitor_updates_backup_20260611_2230.json"))
old_items = backup.get('items', backup)

# Load curated new items
curated = json.load(open(ASSETS / "competitor_curated_new.json"))

# Merge
merged = list(old_items)
added_count = 0
for ng in curated['items']:
    nt = norm(ng.get('title', ''))
    if not nt or len(nt) < 5:
        continue
    is_dup = False
    for oi in old_items:
        ot = norm(oi.get('title', ''))
        if not ot:
            continue
        sa, sb = set(nt), set(ot)
        sim = len(sa & sb) / min(len(sa), len(sb)) if sa and sb else 0
        if sim >= 0.65 or nt == ot:
            print(f"SKIP DUPE: {ng['title'][:50]} ≈ {oi.get('title','')[:50]} (sim={sim:.3f})")
            is_dup = True
            break
    if not is_dup:
        merged.append(ng)
        added_count += 1
        print(f"ADD: [{ng.get('date')}] {ng.get('company','')} | {ng['title'][:60]}")

merged.sort(key=lambda x: x.get('date', ''), reverse=True)

result = {
    '_meta': {
        'description': '竞对更新 — 人工精选 + 自动化抓取',
        'last_updated': '2026-06-11T22:45:00',
        'total_items': len(merged),
        'new_curated': added_count,
    },
    'items': merged,
}

json.dump(result, open(COMP, 'w'), ensure_ascii=False, indent=2)
print(f"\nDONE: {len(old_items)} old + {added_count} new = {len(merged)} total")