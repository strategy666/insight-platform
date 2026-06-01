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


# ---- 快手主体白名单规则（2026-06-01 新增）----
# 涉及"快手"主体的情报，sources 必须至少包含一个 kuaishou.com / kuaishou.cn 官方域，
# 否则一律降级为 weak（前端不展示），避免第三方信源失真。
KS_OFFICIAL_DOMAINS = ('kuaishou.com', 'kuaishou.cn')


def is_kuaishou_subject(item: dict) -> bool:
    """判断这条 item 是否以快手为主体/涉及快手。
    规则：
    1. company 字段含「快手」
    2. title / headline 明确提到「快手」
    两者满足其一即视为快手相关，必须限定官方源。"""
    companies = item.get('company') or item.get('companies') or []
    if isinstance(companies, str):
        companies = [companies]
    if any('快手' in (c or '') for c in companies):
        return True
    text = ' '.join([item.get('title', ''), item.get('headline', '')])
    if '快手' in text:
        return True
    return False


def has_official_kuaishou_source(sources) -> bool:
    for s in sources or []:
        url = (s.get('url') or '').lower()
        if not url:
            continue
        host = urlparse(url).netloc.lower()
        if any(host == d or host.endswith('.' + d) for d in KS_OFFICIAL_DOMAINS):
            return True
    return False


def audit(filepath: Path, label: str):
    with filepath.open(encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', data) if isinstance(data, dict) else data

    stats = Counter()
    ks_downgraded = 0
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

        # ===== 日期失真强制降级（由 audit_dates.py 此前打标）=====
        # URL 结构合格但原文发布日期与 item.date 差距 >30 天 → 强制降级
        if it.get('_date_mismatch'):
            if it['_verification'] == 'verified':
                stats['verified'] -= 1
                stats['weak'] += 1
            it['_verification'] = 'weak'

        # ===== 快手主体官方源强制规则 =====
        # 涉及快手的情报必须有 kuaishou.com 官方信源；否则降级为 weak（前端不展示）。
        if is_kuaishou_subject(it):
            if has_official_kuaishou_source(sources):
                # 有官方源 → 即使 URL 只是首页（classify_source 判 weak），官方域本身可信，
                # 提升为 verified 以便前端展示
                if it['_verification'] == 'weak':
                    stats['weak'] -= 1
                    stats['verified'] += 1
                it['_verification'] = 'verified'
                it['_ks_official'] = True
            else:
                # 无官方源 → 强制降级隐藏
                if it['_verification'] == 'verified':
                    stats['verified'] -= 1
                    stats['weak'] += 1
                it['_verification'] = 'weak'
                it['_ks_no_official'] = True
                ks_downgraded += 1

    print(f'\n=== {label} ===')
    total = len(items)
    print(f'total: {total}')
    for k in ('verified', 'weak', 'broken'):
        v = stats[k]
        pct = 100.0 * v / total if total else 0
        print(f'  {k:8s}: {v:3d}  ({pct:.1f}%)')
    if ks_downgraded:
        print(f'  🚨 快手主体无官方源被降级: {ks_downgraded}')

    with filepath.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return stats


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    audit(root / 'assets/data/intel.json', 'Tab1 intel.json')
    audit(root / 'assets/data/competitor_updates.json', 'Tab2 competitor_updates.json')
    print('\n✅ 审计完成，每条已打 _verification 标签')
    print('   UI 默认只展示 verified，weak/broken 需点开 ⚠️ 开关查看\n')
