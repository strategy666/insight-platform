#!/usr/bin/env python3
"""
competitor-tracker agent v2: Faster approach
1. Tavily search (fast, ~1s per query)
2. Filter by date using Tavily's published_date metadata  
3. Only validate top candidates (web_fetch for ~30 items)
4. Write to competitor_updates.json
"""
from __future__ import annotations
import json, re, sys, time, subprocess, urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "assets/data/sources.json"
COMP_FILE = ROOT / "assets/data/competitor_updates.json"
TAVILY = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/tavily-search/scripts/tavily_search.py"

COMPANIES = ['字节','小红书','腾讯','百度','美团','阿里','拼多多']
DIMS = {
    '产品动态': ['产品更新','新功能上线','全量','升级'],
    '准入政策': ['准入','审核规范','广告政策','合规'],
    '行业案例': ['行业方案','营销策略','运营打法'],
}

DATE_PATS = [
    re.compile(r'article:published_time"\s+content="([^"]+)"'),
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"'),
    re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>', re.I),
    re.compile(r'itemprop="datePublished"\s+content="([^"]+)"'),
]
def parse_date(s):
    if not s: return None
    s = s.strip().split('T')[0].split(' ')[0].split('+')[0]
    for fmt in ['%Y-%m-%d','%Y/%m/%d']:
        try:
            dt = datetime.strptime(s, fmt)
            return dt if 2015<=dt.year<=2035 else None
        except: pass
    m = re.match(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', s)
    if m:
        try: return datetime(int(m[1]),int(m[2]),int(m[3]))
        except: pass
    return None

def extract_date_html(html):
    for p in DATE_PATS:
        for m in p.finditer(html):
            d = parse_date(m.group(1))
            if d: return d
    for m in re.finditer(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})\s*日?', html):
        try:
            d = datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
            if 2015<=d.year<=2035: return d
        except: pass
    return None

def fetch_html(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) KInsight/2.0',
            'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(256*1024).decode('utf-8','replace') if r.status==200 else None
    except: return None

def tavily(query, n=5):
    try:
        r = subprocess.run(['uv','run','--refresh-package','ks_aimate',TAVILY,
            '--query',query,'--max-results',str(n),'--format','brave'],
            capture_output=True, text=True, timeout=45)
        if r.returncode==0:
            return json.loads(r.stdout).get('results',[])
    except: pass
    return []

def classify_company(title):
    cmap = {
        '字节':['字节','抖音','巨量','tiktok','douyin','oceanengine','飞书','豆包','seedance'],
        '小红书':['小红书','xiaohongshu','聚光','蒲公英'],
        '腾讯':['腾讯','微信','视频号','朋友圈','tencent'],
        '百度':['百度','文心','爱番番','baidu'],
        '美团':['美团','大众点评','dianping','meituan'],
        '阿里':['阿里','淘宝','天猫','阿里妈妈','万相','alibaba','1688'],
        '拼多多':['拼多多','temu','pinduoduo'],
    }
    tl = title.lower()
    for co, kws in cmap.items():
        if any(k in tl for k in kws): return co
    return '其他'

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--company', type=str, default='')
    ap.add_argument('--per-company', type=int, default=5)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    cutoff = datetime.now() - timedelta(days=14)
    today = datetime.now()
    target = args.company.split(',') if args.company else COMPANIES

    print(f"🎯 competitor-tracker v2 | {cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d}")

    with open(SOURCES_FILE) as f: sources = json.load(f)
    with open(COMP_FILE) as f: comp = json.load(f)

    # Phase 1: Search (fast)
    queries = []
    for co in target:
        for dim, kws in DIMS.items():
            for kw in kws[:2]:
                queries.append((f"{co} {kw} 2026年5月", {'company':co, 'dim':dim}))

    # Channel-specific from Part2
    for sec_key in ['domestic_competitor']:
        for src in sources.get(sec_key,{}).get('sources',[])[:5]:
            tags = src.get('tags',[])
            if tags:
                queries.append((f"{' '.join(tags[:3])} 最新动态 2026年5月", {'company':'', 'dim':''}))

    # Cross-industry
    for ci in sources.get('cross_industry',[]):
        agents = ci.get('agent',[])
        if isinstance(agents,str): agents=[agents]
        if 'competitor-tracker' in agents:
            queries.append((f"{ci.get('name','')} 广告政策 2026", {'company':'','dim':'准入政策'}))

    seen_q = set(); unique_q = []
    for q, m in queries:
        if q not in seen_q: seen_q.add(q); unique_q.append((q,m))
    print(f"   {len(unique_q)} 条搜索查询")

    # Search all
    all_results = []
    for q, meta in unique_q:
        results = tavily(q, n=5)
        for r in results:
            url = r.get('url','')
            title = r.get('title','')
            snippet = r.get('snippet','')
            published = r.get('published_date','') or r.get('publishedDate','')
            if url and title:
                all_results.append({
                    'title': title, 'url': url, 'snippet': snippet,
                    'published_date': published, 'meta': meta
                })
        time.sleep(0.2)

    # Deduplicate by URL
    seen_u = set(); unique = []
    for r in all_results:
        if r['url'] not in seen_u:
            seen_u.add(r['url'])
            unique.append(r)
    print(f"   Tavily: {len(all_results)} raw → {len(unique)} unique")

    # Phase 2: Pre-filter using Tavily's published_date + title date extraction
    # Extract date from title if not in metadata
    candidates = []
    for r in unique:
        # Try Tavily's published date
        pub_date = parse_date(r.get('published_date',''))
        
        # Try extracting from title
        if not pub_date:
            # Look for date patterns in title
            m = re.search(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', r['title'])
            if m:
                try: pub_date = datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
                except: pass
        
        # Try snippet
        if not pub_date:
            m = re.search(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', r.get('snippet',''))
            if m:
                try: pub_date = datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
                except: pass

        r['estimated_date'] = pub_date
        r['company_classified'] = r['meta'].get('company','') or classify_company(r['title'])

        # Only keep if company is target and date looks in range (or unknown)
        if r['company_classified'] in target:
            if pub_date and (pub_date < cutoff or pub_date > today + timedelta(days=7)):
                continue  # Out of window
            candidates.append(r)

    # Sort by estimated date (newest first), prefer items with dates
    candidates.sort(key=lambda x: x.get('estimated_date') or datetime(2000,1,1), reverse=True)

    # Per-company limit for candidates to validate
    per_co = defaultdict(int)
    to_validate = []
    for c in candidates:
        co = c['company_classified']
        if per_co[co] < args.per_company * 3:  # 3x buffer for validation failures
            to_validate.append(c)
            per_co[co] += 1

    print(f"   Pre-filtered: {len(candidates)} candidates → {len(to_validate)} to validate")

    # Phase 3: Validate top candidates only (fetch HTML to confirm date + content)
    items = []
    per_co_final = defaultdict(int)

    for i, r in enumerate(to_validate):
        company = r['company_classified']
        
        # Per-company final limit
        if per_co_final[company] >= args.per_company * 2:
            continue

        # Try to fetch HTML for date validation
        pub_date = r.get('estimated_date')
        verified = False
        
        html = fetch_html(r['url'])
        if html:
            html_date = extract_date_html(html)
            if html_date:
                pub_date = html_date  # Use HTML date as ground truth
                verified = True
            else:
                # No date in HTML - trust title/snippet date if available
                verified = pub_date is not None
        
        # If no HTML at all, skip (SOURCE-FIRST: must be accessible)
        if not html:
            print(f"   ❌ 不可访问: {r['title'][:45]}")
            continue
        
        # Date validation
        if not pub_date:
            print(f"   ⚠️ 无日期: {r['title'][:45]}")
            continue
        
        if pub_date < cutoff:
            print(f"   ⏭️ 超窗口({pub_date:%Y-%m-%d}): {r['title'][:45]}")
            continue

        # Content match
        title_words = [w for w in re.findall(r'[\u4e00-\u9fffA-Za-z]{2,}', r['title'])]
        page_text = re.sub(r'<[^>]+>',' ',html); page_text = re.sub(r'\s+',' ',page_text).lower()
        matched = sum(1 for w in title_words if w.lower() in page_text)
        if title_words and matched/len(title_words) < 0.15:
            print(f"   ❌ 不匹配: {r['title'][:45]}")
            continue

        # Classify dimension
        dim = r['meta'].get('dim','产品动态')
        tl = r['title'].lower()
        if any(k in tl for k in ['准入','审核','政策','合规','资质','处罚','规范','监管']):
            dim = '准入政策'
        elif any(k in tl for k in ['营销','方案','标杆','运营','打法','分账','案例']):
            dim = '行业案例'
        else:
            dim = '产品动态'

        if any(k in tl for k in ['ai','大模型','llm']): dim_detail = 'AI/技术'
        elif any(k in tl for k in ['财报','收入','利润','gmv']): dim_detail = '财报/数据'
        elif any(k in tl for k in ['电商','直播','带货']): dim_detail = '电商/交易'
        else: dim_detail = {'产品动态':'产品/接入','准入政策':'准入/政策','行业案例':'营销/分账'}.get(dim,dim)

        per_co_final[company] += 1
        item = {
            "id": f"comp-{len(items)+700}",
            "date": pub_date.strftime('%Y-%m-%d'),
            "company": company,
            "category": dim,
            "dimension": dim_detail,
            "data_source": "竞媒官方" if any(k in tl for k in ['巨量','腾讯广告','百度营销','聚光']) else "三方媒体",
            "tier": "T1",
            "title": r['title'][:60],
            "body": (r.get('snippet') or r['title'])[:150],
            "sowhat": "",
            "scope": "国内",
            "sources": [{"name": r['title'][:50], "url": r['url'], "date": pub_date.strftime('%Y-%m-%d')}],
            "timeline": [{"date": pub_date.strftime('%Y-%m-%d'), "event": "本次动态"}],
            "_verification": "verified" if verified else "weak",
            "_date_ok": verified,
            "_fetched_by": "competitor_tracker.py",
        }
        items.append(item)
        print(f"   ✅ [{company}|{dim}] [{pub_date:%Y-%m-%d}] {r['title'][:45]}")

    print(f"\n📊 通过校验: {len(items)}/{len(to_validate)}")
    for co in COMPANIES:
        c = sum(1 for i in items if i['company']==co)
        if c: print(f"   {co}: {c} 条")

    if not args.dry_run:
        comp['items'] = items
        comp['_meta'] = {
            "description": "Part2 竞对动态 — competitor-tracker agent v2 (SOURCE-FIRST)",
            "last_updated": today.strftime('%Y-%m-%d'),
            "total_items": len(items),
            "recent_window": f"past 14d (cutoff {cutoff:%Y-%m-%d})",
            "companies_tracked": COMPANIES,
            "source_first": True,
        }
        with open(COMP_FILE,'w',encoding='utf-8') as f:
            json.dump(comp, f, ensure_ascii=False, indent=2)
        print(f"✅ 写入 {COMP_FILE}: {len(items)} 条")
    else:
        print("🔍 dry-run, 未写入")

if __name__=='__main__': main()
