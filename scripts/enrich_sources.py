#!/usr/bin/env python3
"""
逐条补「具体文章 URL」工具
=============================
对 intel.json (Tab1) + competitor_updates.json (Tab2) 中标记为 weak / broken 的条目，
用 Tavily 搜索 API 找到具体文章页 URL（路径含数字 ID / 长 slug / ≥3 级 path），
替换原来只指向首页的 URL。

策略：
  1. 读 audit_sources.py 已经打好的 _verification 字段
  2. 对 weak / broken 条目：用 title (+ company) 作 query 跑 Tavily
  3. 候选 URL 经 classify_source() 过滤，只保留 verified
  4. 命中则把 sources[0].url + name 替换为新 URL（保留 sources 数组结构）
  5. 命中 source 优先选与原 host 同域名的；其次按 Tavily score 排序
  6. 全程缓存结果到 .enrich_cache.json，避免重复请求

使用：
    cd insight-platform && python3 scripts/enrich_sources.py
    cd insight-platform && python3 scripts/enrich_sources.py --limit 5  # 试跑
    cd insight-platform && python3 scripts/enrich_sources.py --dry-run   # 不写回

依赖：
    Tavily key 从 audit_sources.py 同级硬编码（生服平台已内置）
"""
import json
import re
import sys
import time
import argparse
import urllib.request
import urllib.error
from urllib.parse import urlparse
from collections import Counter
from pathlib import Path

# ---- 与 audit_sources.py 保持一致的分级逻辑 ----
BROKEN_DOMAINS = [
    'bytedance.larkoffice.com',
    'bytedance.feishu.cn',
    'docs.qingque.cn',
    'docs.corp.kuaishou.com',
    'kdocs.cn',
    'feishu.cn',
    'larkoffice.com',
]


def classify_source(url: str) -> str:
    if not url or not url.startswith('http'):
        return 'broken'
    for p in BROKEN_DOMAINS:
        if p in url:
            return 'broken'
    p = urlparse(url)
    path = p.path.strip('/')
    if not path or path in ('index', 'index.html', 'home', 'zh-CN', 'en', 'cn'):
        return 'weak'
    segs = [s for s in path.split('/') if s]
    has_digit_id = any(re.search(r'\d{4,}', s) for s in segs)
    if has_digit_id:
        return 'verified'
    if len(path) >= 25:
        return 'verified'
    if len(segs) >= 3:
        return 'verified'
    if len(segs) <= 2 and all(len(s) <= 15 for s in segs):
        return 'weak'
    return 'weak'


# ---- Tavily ----
TAVILY_KEY = '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'
TAVILY_URL = 'https://api.tavily.com/search'

# 已知不好用 / 杂质源（搜索结果如果只命中这些，不算找到具体文章）
NOISE_HOSTS = {
    'baidu.com',
    'baike.baidu.com',
    'zhihu.com/topic',
    'so.com',
    'sogou.com',
    'bing.com',
    'google.com',
}


def is_noise(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return any(host == h or host.endswith('.' + h) for h in NOISE_HOSTS)


def tavily_search(query: str, max_results: int = 6, timeout: int = 12):
    body = json.dumps({
        'api_key': TAVILY_KEY,
        'query': query,
        'search_depth': 'basic',
        'max_results': max_results,
        'include_answer': False,
        'include_raw_content': False,
    }).encode('utf-8')
    req = urllib.request.Request(
        TAVILY_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('results', [])
    except urllib.error.HTTPError as e:
        print(f'    [tavily HTTP {e.code}] {query[:50]}', file=sys.stderr)
        return []
    except Exception as e:
        print(f'    [tavily ERR] {type(e).__name__}: {e}', file=sys.stderr)
        return []


def pick_best(results, prefer_host: str = None, *, ks_only: bool = False):
    """从 Tavily 候选中挑出最佳 verified 文章 URL。
    ks_only=True 时只接受 kuaishou.com / kuaishou.cn 官方域。"""
    if not results:
        return None
    candidates = []
    for r in results:
        url = r.get('url') or ''
        if not url or is_noise(url):
            continue
        if classify_source(url) != 'verified':
            continue
        host = urlparse(url).netloc.lower()
        if ks_only and not (host.endswith('kuaishou.com') or host.endswith('kuaishou.cn')):
            continue
        score = float(r.get('score', 0))
        same_host_bonus = 0
        if prefer_host and (host == prefer_host or host.endswith('.' + prefer_host)):
            same_host_bonus = 1.0
        candidates.append((score + same_host_bonus, r))
    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    return candidates[0][1]


def is_kuaishou_subject(item: dict) -> bool:
    """判断这条 item 是否以快手为主体/涉及快手（同 audit_sources.py 规则）。"""
    companies = item.get('company') or []
    if isinstance(companies, str):
        companies = [companies]
    if any('快手' in (c or '') for c in companies):
        return True
    text_fields = [item.get('title', ''), item.get('headline', ''), item.get('summary', ''), item.get('tldr', '')]
    if any('快手' in (t or '') for t in text_fields):
        return True
    return False



# ---- 缓存 ----
def load_cache(p: Path):
    if p.exists():
        try:
            return json.load(p.open(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_cache(p: Path, cache):
    p.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')


# ---- 主流程 ----
def enrich_file(filepath: Path, cache, *, limit=None, dry_run=False):
    with filepath.open(encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', data) if isinstance(data, dict) else data

    upgraded = 0
    no_match = 0
    skipped = 0
    processed = 0

    for it in items:
        verif = it.get('_verification', 'weak')
        if verif == 'verified':
            skipped += 1
            continue
        if limit is not None and processed >= limit:
            break
        processed += 1

        title = it.get('title') or it.get('summary') or ''
        company = (it.get('company') or [None])[0] if it.get('company') else None
        ks_subject = is_kuaishou_subject(it)
        # 取原 source 域名作 prefer_host
        prefer_host = None
        if it.get('sources'):
            old_url = it['sources'][0].get('url', '')
            if old_url:
                prefer_host = urlparse(old_url).netloc.lower()

        # query：标题 + 公司名（如果不在标题里）；快手主体加官方域 site:
        q = title.strip()
        if company and company not in q:
            q = f'{company} {q}'
        if ks_subject:
            q = f'site:kuaishou.com OR site:kuaishou.cn {q}'
        # 过长截断
        q = q[:140]

        cache_key = ('KS|' if ks_subject else '') + q
        if cache_key in cache:
            r = cache[cache_key]
        else:
            results = tavily_search(q, max_results=8)
            best = pick_best(results, prefer_host=prefer_host, ks_only=ks_subject)
            r = {
                'q': q,
                'ks_only': ks_subject,
                'best': {
                    'url': best.get('url'),
                    'title': best.get('title'),
                } if best else None,
                'ts': int(time.time()),
            }
            cache[cache_key] = r
            time.sleep(0.6)  # 限速

        best = r.get('best')
        if not best:
            no_match += 1
            tag = '🚨 KS 无官方源' if ks_subject else '❌ no_match'
            print(f'  {tag}: {title[:60]}')
            continue

        # 替换 sources[0]
        old_sources = it.get('sources') or []
        new_source = {
            'name': best.get('title') or (old_sources[0].get('name') if old_sources else 'web'),
            'url': best['url'],
        }
        if old_sources:
            it['sources'][0] = new_source
        else:
            it['sources'] = [new_source]
        # 重新跑分级
        it['_verification'] = 'verified'
        upgraded += 1
        print(f'  ✅ {title[:55]}')
        print(f'      → {best["url"]}')

    if not dry_run:
        with filepath.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return {
        'total': len(items),
        'processed': processed,
        'upgraded': upgraded,
        'no_match': no_match,
        'skipped_already_verified': skipped,
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=None, help='每个文件最多处理几条（试跑用）')
    ap.add_argument('--dry-run', action='store_true', help='只搜不写回')
    ap.add_argument('--only', choices=('intel', 'comp', 'both'), default='both')
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    cache_path = root / 'scripts/.enrich_cache.json'
    cache = load_cache(cache_path)

    targets = []
    if args.only in ('intel', 'both'):
        targets.append(('Tab1 intel.json', root / 'assets/data/intel.json'))
    if args.only in ('comp', 'both'):
        targets.append(('Tab2 competitor_updates.json', root / 'assets/data/competitor_updates.json'))

    grand = Counter()
    for label, fp in targets:
        print(f'\n=== {label} ===')
        st = enrich_file(fp, cache, limit=args.limit, dry_run=args.dry_run)
        for k, v in st.items():
            grand[k] += v
        print(f'  小计: 处理 {st["processed"]}  升级 {st["upgraded"]}  未命中 {st["no_match"]}')
        save_cache(cache_path, cache)  # 每个文件后落盘

    print('\n=== 总计 ===')
    print(f'  总条目: {grand["total"]}')
    print(f'  本次处理: {grand["processed"]}')
    print(f'  ✅ 已补成 verified: {grand["upgraded"]}')
    print(f'  ❌ 未找到具体文章: {grand["no_match"]}')
    if not args.dry_run:
        print('\n建议下一步：python3 scripts/audit_sources.py  重新审计校验')
