#!/usr/bin/env python3
# py39 compat
from __future__ import annotations
"""
竞对情报采集 Agent — SOURCE FIRST 原则
======================================
三阶段日期策略：
  1. Tavily 搜索（time_range=week + 日期关键词）
  2. 尝试抓 HTML 提取 meta 日期（5s 超时）
  3. 从 Tavily content 文本提取日期
  4. 两阶段都失败的 → 跳过（不编造日期）

使用：
  python3 scripts/fetch_intel.py                          # 全量
  python3 scripts/fetch_intel.py --company 字节,小红书     # 指定公司
  python3 scripts/fetch_intel.py --dry-run                # 只搜不写
"""
import json
import re
import sys
import time
import argparse
import html as html_mod
import urllib.request
import urllib.error
from urllib.parse import urlparse
from pathlib import Path
from datetime import datetime, timedelta

# ============================================================
# CONFIG
# ============================================================

TAVILY_KEY = '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'
TAVILY_URL = 'https://api.tavily.com/search'

COMPETITORS = [
    '字节跳动', '小红书', '腾讯', '百度', '美团', '阿里', '拼多多',
]
KS_COMPETITOR = '快手'

SEARCH_TOPICS = [
    '商业化 广告', '本地生活 电商', 'AI 大模型',
]

NOISE_HOSTS = {
    'baidu.com', 'baike.baidu.com', 'zhihu.com',
    'so.com', 'sogou.com', 'bing.com', 'google.com',
}

BROKEN_DOMAINS = [
    'bytedance.larkoffice.com', 'bytedance.feishu.cn',
    'docs.qingque.cn', 'docs.corp.kuaishou.com', 'kdocs.cn',
    'feishu.cn', 'larkoffice.com',
]

ROOT = Path(__file__).resolve().parent.parent
INTEL_PATH = ROOT / 'assets/data/intel.json'
COMP_PATH = ROOT / 'assets/data/competitor_updates.json'

# ============================================================
# Helpers
# ============================================================

def classify_source(url: str) -> str:
    if not url or not url.startswith('http'):
        return 'broken'
    for p in BROKEN_DOMAINS:
        if p in url:
            return 'broken'
    p = urlparse(url)
    path = p.path.strip('/')
    if not path or path in ('index','index.html','home','zh-CN','en','cn'):
        return 'weak'
    segs = [s for s in path.split('/') if s]
    if any(re.search(r'\d{4,}', s) for s in segs):
        return 'verified'
    if len(path) >= 25:
        return 'verified'
    if len(segs) >= 3:
        return 'verified'
    return 'weak'

def is_noise(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return True
    for nh in NOISE_HOSTS:
        if host == nh or host.endswith('.' + nh):
            return True
    if url.endswith('.pdf') or url.endswith('.zip'):
        return True
    return False

def get_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().replace('www.', '')
    except Exception:
        return ''

# ============================================================
# 日期提取 — HTML
# ============================================================

def try_parse_date(s: str):
    if not s:
        return None
    s = s.strip()
    s_date = s.split('T')[0].split(' ')[0]
    formats = [
        '%Y-%m-%d', '%Y/%m/%d', '%Y年%m月%d日',
        '%m-%d-%Y', '%d/%m/%Y', '%m/%d/%Y',
        '%B %d, %Y', '%b %d, %Y', '%Y%m%d',
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s_date, fmt)
            if 2015 <= dt.year <= 2035:
                return dt
        except ValueError:
            continue
    return None

def extract_dates_from_html(html: str):
    dates = []
    patterns = [
        r'article:published_time"\s+content="([^"]+)"',
        r'name="pubdate"\s+content="([^"]+)"',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]*datetime="([^"]+)"',
        r'property="og:article:published_time"\s+content="([^"]+)"',
        r'itemprop="datePublished"\s+content="([^"]+)"',
    ]
    for pat in patterns:
        for m in re.finditer(pat, html):
            d = try_parse_date(m.group(1))
            if d:
                dates.append(d)
    for m in re.finditer(r'(\d{4})年(\d{1,2})月(\d{1,2})日', html):
        try:
            d = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if 2015 <= d.year <= 2035:
                dates.append(d)
        except ValueError:
            pass
    return dates

def fetch_article_date(url: str):
    """抓 HTML 提取 meta 日期。"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read(256 * 1024).decode('utf-8', errors='replace')
    except Exception:
        return None
    dates = extract_dates_from_html(raw)
    if not dates:
        return None
    # 取最新的日期（不是最早的，避免 footer 版权年份干扰）
    dates.sort(reverse=True)
    d = dates[0]
    if d.year < 2025:
        return None  # 正文中提取的老日期
    return d

def fetch_article_title(url: str):
    """抓 HTML 提取 <title>。"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read(256 * 1024).decode('utf-8', errors='replace')
    except Exception:
        return None
    m = re.search(r'<title[^>]*>(.*?)</title>', raw, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    title = html_mod.unescape(m.group(1).strip())
    return title[:120] if title else None

# ============================================================
# 日期提取 — 文本
# ============================================================

def extract_date_from_text(text: str):
    """从内容文本提取日期。"""
    # ISO: 2026-06-01
    m = re.search(r'\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b', text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2020 <= y <= 2035 and 1 <= mo <= 12 and 1 <= d <= 31:
            return f'{y:04d}-{mo:02d}-{d:02d}'
    # YYYY年MM月DD日
    m = re.search(r'(20\d{2})年(\d{1,2})月(\d{1,2})日', text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2020 <= y <= 2035 and 1 <= mo <= 12 and 1 <= d <= 31:
            return f'{y:04d}-{mo:02d}-{d:02d}'
    # YYYY年MM月
    m = re.search(r'(20\d{2})年(\d{1,2})月', text)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        if 2020 <= y <= 2035 and 1 <= mo <= 12:
            return f'{y:04d}-{mo:02d}-01'
    # X月X日
    m = re.search(r'(\d{1,2})月(\d{1,2})日', text)
    if m:
        mo, d = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            now = datetime.now()
            y = now.year
            dt = datetime(y, mo, d)
            if dt > now:
                y -= 1
            return f'{y:04d}-{mo:02d}-{d:02d}'
    return None

# ============================================================
# Tavily
# ============================================================

def tavily_search(query: str, max_results: int = 6):
    body = json.dumps({
        'api_key': TAVILY_KEY,
        'query': query,
        'search_depth': 'advanced',
        'max_results': max_results,
        'include_answer': False,
        'include_raw_content': False,
        'time_range': 'week',
    }).encode('utf-8')
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                TAVILY_URL, data=body,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            return data.get('results', [])
        except Exception:
            if attempt < 2:
                time.sleep(2)
            else:
                pass
    return []

def search_intel(company: str, max_per: int = 10):
    seen = set()
    out = []
    ks = (company == '快手')

    # 用日期关键词构造搜索
    today = datetime.now()
    ym_str = today.strftime('%Y年%m月')

    for topic in SEARCH_TOPICS:
        if len(out) >= max_per:
            break
        if ks:
            q = f'site:kuaishou.com OR site:kuaishou.cn {company} {topic}'
        else:
            q = f'{company} {topic} {ym_str}'

        results = tavily_search(q, max_results=5)
        time.sleep(0.3)

        for r in results:
            u = r.get('url', '')
            if not u or u in seen:
                continue
            seen.add(u)
            if is_noise(u) or classify_source(u) == 'broken':
                continue
            if ks:
                h = get_domain(u)
                if not (h.endswith('kuaishou.com') or h.endswith('kuaishou.cn')):
                    continue
            out.append(r)
            if len(out) >= max_per:
                break
    out.sort(key=lambda x: float(x.get('score', 0)), reverse=True)
    return out

# ============================================================
# 综合校验
# ============================================================

def verify_and_make(r, company):
    url = r.get('url', '')
    title_tavily = (r.get('title') or '').strip()
    content = (r.get('content') or '').strip()
    domain = get_domain(url)
    url_class = classify_source(url)

    # Stage 2: HTML
    dt_html = fetch_article_date(url)
    time.sleep(0.15)

    date_html = None
    if dt_html and dt_html.year >= 2025:
        date_html = dt_html.strftime('%Y-%m-%d')

    # Stage 3: content text
    date_text = extract_date_from_text(content)
    if not date_text:
        date_text = extract_date_from_text(title_tavily)

    # 两条路都失败的 → 跳过
    if not date_html and not date_text:
        return None

    # 选最优：HTML 优先
    if date_html:
        date_str = date_html
        date_ok = True
        date_method = 'html_meta'
    else:
        date_str = date_text
        date_ok = True
        date_method = 'text_extract'

    # 日期校验
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        if dt.year < 2024:
            return None
        if dt > datetime.now() + timedelta(days=1):
            return None  # 未来日期
        cutoff = datetime.now() - timedelta(days=30)
        if dt < cutoff:
            return None
    except ValueError:
        return None

    # 标题
    ht = fetch_article_title(url)
    title = ht if (ht and len(ht) >= 6) else title_tavily
    title = title.split('|')[0].split(' - ')[0].strip()
    title = title.strip('"\'「」『』')

    if len(title) < 10:
        return None

    # priority
    priority = 'mid'
    if float(r.get('score', 0)) >= 0.95:
        priority = 'high'
    if any(w in title for w in ('财报','突破','全量','超','破','首发','重磅','收购')):
        priority = 'high'

    # signal
    signal = 'neutral'
    if any(w in title for w in ('增长','全量','上线','升级','推出','突破')):
        signal = 'opportunity'
    elif any(w in title for w in ('下滑','下跌','关闭','裁','起诉','罚款','亏损')):
        signal = 'threat'

    # tags
    tags = []
    kw_map = {'AI':'#AI','大模型':'#AI','电商':'#电商','GMV':'#电商',
              '本地':'#本地生活','团购':'#本地生活','外卖':'#本地生活',
              '广告':'#广告','投放':'#广告','营销':'#广告','商业化':'#广告'}
    for kw, tag in kw_map.items():
        if kw in title and tag not in tags:
            tags.append(tag)

    # tracks
    tracks = []
    for kw, tk in [('AI','AI'),('大模型','AI'),('电商','电商'),('本地','本地生活'),
                    ('团购','本地生活'),('广告','广告'),('直播','直播')]:
        if kw in title and tk not in tracks:
            tracks.append(tk)

    tldr = content[:150] if content else f'{domain} {date_str} 报道'

    return {
        'id': '',
        'date': date_str,
        'priority': priority,
        'signal': signal,
        'title': title[:120],
        'tldr': tldr,
        'tags': tags[:3],
        'company': [company],
        'tracks': tracks[:2],
        'sources': [{'name': domain, 'url': url}],
        '_verification': url_class,
        '_date_ok': date_ok,
        '_date_method': date_method,
        '_score': round(float(r.get('score', 0)), 4),
        '_fetched_by': 'fetch_intel.py',
    }

def make_comp(item, company):
    t = item['title']
    dim = '产品/接入'
    if any(w in t for w in ('广告','投放','营销','商业化')):
        dim = '广告产品'
    elif any(w in t for w in ('AI','大模型','GPT','智能','模型')):
        dim = 'AI/技术'
    elif any(w in t for w in ('政策','监管','合规','准入','法规')):
        dim = '准入/政策'
    elif any(w in t for w in ('财报','GMV','营收','利润')):
        dim = '财报/行业case'
    elif any(w in t for w in ('电商','交易','下单','支付')):
        dim = '电商/交易'

    ds = '竞媒官方' if any(h in t for h in ('官宣','官方','宣布','发布','上线','推出')) else '三方媒体'
    tier = 'T1' if any(w in t for w in ('全量','财报','超','重磅','收购')) else 'T2'

    return {
        'id': '',
        'date': item['date'],
        'company': company,
        'category': dim,
        'dimension': dim,
        'data_source': ds,
        'tier': tier,
        'title': item['title'],
        'sowhat': f"{item['sources'][0]['name']} {item['date']} 确认",
        'sources': item['sources'],
        '_verification': item['_verification'],
        '_date_ok': item['_date_ok'],
        '_score': item['_score'],
        '_fetched_by': 'fetch_intel.py',
    }

# ============================================================
# MAIN
# ============================================================

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--company', type=str, default='')
    ap.add_argument('--per-company', type=int, default=8)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    companies = [c.strip() for c in args.company.split(',')] if args.company else COMPETITORS + [KS_COMPETITOR]

    print(f'🔍 SOURCE-FIRST 竞对情报采集')
    print(f'   目标: {", ".join(companies)}  每家上限: {args.per_company}')
    print()

    all_intel = []
    all_comp = []
    stats = dict(total=0, html_date=0, text_date=0, deleted=0)

    for company in companies:
        print(f'🏢 {company} →', end=' ', flush=True)
        raw = search_intel(company, max_per=args.per_company)
        kept = 0
        for r in raw:
            item = verify_and_make(r, company)
            if item is None:
                stats['deleted'] += 1
                continue
            stats['total'] += 1
            if item['_date_method'] == 'html_meta':
                stats['html_date'] += 1
            else:
                stats['text_date'] += 1

            item['id'] = f'intel-fetch-{len(all_intel)+1:04d}'
            all_intel.append(item)

            comp = make_comp(item, company)
            comp['id'] = f'comp-fetch-{len(all_comp)+1:04d}'
            all_comp.append(comp)
            kept += 1
        print(f'{kept}/{len(raw)} 条')

    all_intel.sort(key=lambda x: x['date'], reverse=True)
    all_comp.sort(key=lambda x: x['date'], reverse=True)

    verified = sum(1 for i in all_intel if i['_verification'] == 'verified')
    date_ok = sum(1 for i in all_intel if i['_date_ok'])

    print(f'\n{"="*60}')
    print(f'📊 总计: {stats["total"]} 条 (HTML日期:{stats["html_date"]} 文本:{stats["text_date"]} 删除:{stats["deleted"]})')
    print(f'   verified={verified} date_ok={date_ok}')

    if args.dry_run:
        print('\n[DRY RUN]')
        for i in all_intel[:6]:
            print(f'   [{i["date"]}] {i["title"][:60]}  ({i["_date_method"]})')
        return

    # 写入
    cutoff = datetime.now() - timedelta(days=14)
    intel_meta = {
        'description': '市场洞察 — fetch_intel.py SOURCE-FIRST Agent',
        'last_updated': datetime.now().strftime('%Y-%m-%d'),
        'period': f'{cutoff.strftime("%Y-%m-%d")} ~ {datetime.now().strftime("%Y-%m-%d")}',
        'version': '3.0',
        'total_items': len(all_intel),
        'date_stats': dict(html_meta=stats['html_date'], text_extract=stats['text_date']),
        'note': '仅收录日期可验证（HTML meta 或内容明确日期）的条目',
    }
    INTEL_PATH.write_text(json.dumps({'_meta': intel_meta, 'items': all_intel}, ensure_ascii=False, indent=2), encoding='utf-8')

    comp_meta = {
        'description': '竞对更新 — fetch_intel.py SOURCE-FIRST Agent',
        'last_updated': datetime.now().strftime('%Y-%m-%d'),
        'total_items': len(all_comp),
        'dimensions': ['AI/技术','产品/接入','广告产品','准入/政策','电商/交易','财报/行业case'],
        'note': '仅收录日期可验证的条目',
    }
    COMP_PATH.write_text(json.dumps({'_meta': comp_meta, 'items': all_comp}, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f'✅ 已写入 {INTEL_PATH}')
    print(f'✅ 已写入 {COMP_PATH}')

if __name__ == '__main__':
    main()