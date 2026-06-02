#!/usr/bin/env python3
"""清理 tldr/sowhat 字段：对空的 sowhat 生成简要 So What"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def clean(filepath: Path, label: str):
    with filepath.open(encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', data) if isinstance(data, dict) else data

    cleaned = 0
    for it in items:
        # Strip tldr if it duplicates title
        tldr = it.get('tldr', '')
        title = it.get('title', '')
        if tldr and tldr.strip() == title.strip():
            it['tldr'] = ''
            cleaned += 1

        # Strip metrics if empty
        metrics = it.get('metrics', {})
        if isinstance(metrics, dict) and not any(metrics.values()):
            it.pop('metrics', None)

    with filepath.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'{label}: cleaned {cleaned} items')

if __name__ == '__main__':
    clean(ROOT / 'assets/data/intel.json', 'intel.json')
    clean(ROOT / 'assets/data/competitor_updates.json', 'competitor_updates.json')
    print('✅ 清理完成')
