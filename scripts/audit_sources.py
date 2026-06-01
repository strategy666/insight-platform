#!/usr/bin/env python3
"""
信源可信度审计脚本
====================
对 intel.json (Tab1) 与 competitor_updates.json (Tab2) 中每条记录的 sources 字段
进行机器审计，给每个 item 打 `_verification` 标签：

  - verified : 至少有一个 source 指向具体文章 URL
               （路径有数字 ID / 长 slug / 多级 path）
  - weak     : 所有 source 都只是网站首页 / 栏目根（无具体出处）
  - broken   : 没有 source 或 source 指向已知失效域（larkoffice/feishu/qingque 等私域）

UI 渲染时基于这个字段：
  - 默认只显示 verified
  - 有「⚠️ 显示待核实信源」开关可临时打开 weak / broken
  - weak / broken 条目显示警告标识

使用方式：
    cd insight-platform && python3 scripts/audit_sources.py

会就地修改两个 JSON 文件并打印审计报告。
"""

import json
import re
import sys
from urllib.parse import urlparse
from collections import Counter
from pathlib import Path


def classify_source(url: str) -> str:
    """对单个 URL 评级"""
    if not url or not url.startswith('http'):
        return 'broken'

    # 已知私域 / 内网失效域
    BROKEN_DOMAINS = [
        'bytedance.larkoffice.com',
        'bytedance.feishu.cn',
        'docs.qingque.cn',
        'docs.corp.kuaishou.com',
        'kdocs.cn',
    ]
    for p in BROKEN_DOMAINS:
        if p in url:
            return 'broken'

    p = urlparse(url)
    path = p.path.strip('/')

    # 无路径 → 首页
    if not path or path in ('index', 'index.html', 'home', 'zh-CN', 'en', 'cn'):
        return 'weak'

    segs = [s for s in path.split('/') if s]

    # 路径含 4 位以上数字 → 通常是文章 ID
    has_digit_id = any(re.search(r'\d{4,}', s) for s in segs)
    if has_digit_id:
        return 'verified'

    # 路径总长 ≥ 25 字符 → 大概率是 slug 文章
    if len(path) >= 25:
        return 'verified'

    # ≥ 3 级路径段，多半是具体页面
    if len(segs) >= 3:
        return 'verified'

    # 1~2 级且都是短词 → 通常是栏目首页（如 /blog, /news, /products/ad）
    if len(segs) <= 2 and all(len(s) <= 15 for s in segs):
        return 'weak'

    return 'weak'


def audit(filepath: Path, label: str):
    with filepath.open(encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', data) if isinstance(data, dict) else data

    stats = Counter()
    for it in items:
        sources = it.get('sources', [])
        if not sources:
            it['_verification'] = 'broken'
            stats['broken'] += 1
            continue
        scores = [classify_source(s.get('url', '')) for s in sources]
        if 'verified' in scores:
            it['_verification'] = 'verified'
            stats['verified'] += 1
        elif 'weak' in scores:
            it['_verification'] = 'weak'
            stats['weak'] += 1
        else:
            it['_verification'] = 'broken'
            stats['broken'] += 1

    print(f'\n=== {label} ===')
    total = len(items)
    print(f'total: {total}')
    for k in ('verified', 'weak', 'broken'):
        v = stats[k]
        pct = 100.0 * v / total if total else 0
        print(f'  {k:8s}: {v:3d}  ({pct:.1f}%)')

    with filepath.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return stats


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    audit(root / 'assets/data/intel.json', 'Tab1 intel.json')
    audit(root / 'assets/data/competitor_updates.json', 'Tab2 competitor_updates.json')
    print('\n✅ 审计完成，每条已打 _verification 标签')
    print('   UI 默认只展示 verified，weak/broken 需点开 ⚠️ 开关查看\n')
