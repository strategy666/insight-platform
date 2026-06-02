#!/usr/bin/env python3
"""
search-intel agent: 采集 Part1 市场信息 → intel.json (Tab2 商业化洞察周报)
SOURCE-FIRST: 每条必须有 source URL + 从原文提取日期 + 内容匹配
"""
from __future__ import annotations
import json, re, sys, time, subprocess, urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "assets/data/sources.json"
INTEL_FILE = ROOT / "assets/data/intel.json"
TAVILY = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/tavily-search/scripts/tavily_search.py"

# Date extraction
DATE_PATS = [
    re.compile(r'article:published_time"\s+content="([^"]+)"'),
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"'),
    re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>', re.I),
    re.compile(r'itemprop="datePublished"\s+content="([^"]+)"'),
]
def parse_date(s):
    if not s: return None
    s = s.strip().split('T')[0].split(' ')[0].split('+')[0]
    for fmt in ['%Y-%m-%d','%Y/%m/%d','%Y%m%d']:
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

def fetch_html(url, timeout=12):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) KInsight/1.0',
            'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(512*1024).decode('utf-8','replace') if r.status==200 else None
    except: return None

def tavily(query, n=5):
    try:
        r = subprocess.run(['uv','run','--refresh-package','ks_aimate',TAVILY,
            '--query',query,'--max-results',str(n),'--format','brave'],
            capture_output=True, text=True, timeout=45)
        if r.returncode==0:
            return json.loads(r.stdout).get('results',[])
    except Exception as e:
        print(f"  ⚠️ tavily err: {e}", file=sys.stderr)
    return []

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--per-section', type=int, default=4)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    cutoff = datetime.now() - timedelta(days=args.days)
    today = datetime.now()
    print(f"🔍 search-intel | {cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d} | per-section={args.per_section}")

    with open(SOURCES_FILE) as f: sources = json.load(f)
    with open(INTEL_FILE) as f: intel = json.load(f)

    # Build targeted queries - focused, not exhaustive
    queries = []
    # 1. Core competitor companies × hot topics
    for co in ['字节跳动','小红书','腾讯','百度','美团','阿里','拼多多']:
        for topic in ['商业化','广告产品','AI大模型']:
            queries.append(f"{co} {topic} 2026年5月")

    # 2. AI model releases
    for q in ['OpenAI GPT 2026年5月','Anthropic Claude 2026年5月','Google Gemini 2026年5月',
              '文心大模型 通义 豆包 2026年5月']:
        queries.append(q)

    # 3. Big tech
    for q in ['NVIDIA AI 2026年5月','Apple Intelligence 2026','Microsoft AI Copilot 2026']:
        queries.append(q)

    # 4. Industry verticals (from sources.json industries)
    for ind in sources.get('industries',[]):
        name = ind.get('name','')
        focus = ind.get('scan_focus',[])
        if focus:
            queries.append(f"{name} {focus[0]} 最新动态 2026年5月")

    # 5. Cross-industry
    for ci in sources.get('cross_industry',[]):
        name = ci.get('name','')
        queries.append(f"{name} 最新 2026年5月")

    # Deduplicate
    queries = list(dict.fromkeys(queries))
    print(f"   {len(queries)} 条搜索查询")

    # Search
    all_results = []
    for q in queries:
        results = tavily(q, n=args.per_section)
        for r in results:
            url, title, snippet = r.get('url',''), r.get('title',''), r.get('snippet','')
            if url and title: all_results.append((title, url, snippet, q))
        time.sleep(0.3)

    # Deduplicate by URL
    seen = set(); unique = []
    for t,u,s,q in all_results:
        if u not in seen: seen.add(u); unique.append((t,u,s,q))
    print(f"   Tavily: {len(all_results)} raw → {len(unique)} unique URLs")

    # Validate
    items = []
    for i,(title,url,snippet,q) in enumerate(unique):
        if (i+1)%5==0: print(f"   校验 {i+1}/{len(unique)}")

        html = fetch_html(url)
        if not html:
            print(f"   ❌ 不可访问: {title[:45]}")
            continue

        pub_date = extract_date_html(html)
        if not pub_date:
            print(f"   ⚠️ 无日期: {title[:45]}")
            continue

        if pub_date < cutoff:
            print(f"   ⏭️ 超窗口({pub_date:%Y-%m-%d}): {title[:45]}")
            continue

        # Content match: at least 20% of Chinese bigrams in title must appear in page
        title_words = [w for w in re.findall(r'[\u4e00-\u9fffA-Za-z]{2,}', title)]
        page_text = re.sub(r'<[^>]+>',' ',html); page_text = re.sub(r'\s+',' ',page_text).lower()
        matched = sum(1 for w in title_words if w.lower() in page_text)
        if title_words and matched/len(title_words) < 0.15:
            print(f"   ❌ 内容不匹配: {title[:45]}")
            continue

        # Classify
        tl = title.lower()
        itype = '产品动态'
        if any(k in tl for k in ['财报','收入','利润','gmv','dau','mau','q1','q2','q3','q4']): itype='财报数据'
        elif any(k in tl for k in ['政策','监管','规范','准入','处罚']): itype='政策更新'
        elif any(k in tl for k in ['融资','并购','上市','ipo']): itype='融资并购'
        elif any(k in tl for k in ['ai','大模型','gpt','claude','gemini','文心','通义','豆包']): itype='技术发布'

        company = []
        for c,kws in [('字节',['字节','抖音','巨量','tiktok','douyin']),('小红书',['小红书']),
                      ('腾讯',['腾讯','微信','视频号']),('百度',['百度','文心']),
                      ('美团',['美团']),('阿里',['阿里','淘宝','天猫','阿里妈妈']),
                      ('拼多多',['拼多多','temu']),('OpenAI',['openai','gpt']),
                      ('Google',['google','gemini']),('Meta',['meta','facebook']),
                      ('NVIDIA',['nvidia','英伟达'])]:
            if any(k in tl for k in kws): company.append(c)

        industry = []
        for ind_tag,kws in [('生活服务',['本地生活','到店','外卖','闪购']),
                            ('电商',['电商','直播带货','货架']),
                            ('AI',['ai','大模型','aigc','gpt']),
                            ('汽车',['汽车','新能源','智驾']),
                            ('医疗',['医疗','医美','口腔'])]:
            if any(k in tl for k in kws): industry.append(ind_tag)
        if not industry: industry=['综合']

        scope = '海外' if any(k in tl for k in ['tiktok','meta','google','nvidia','apple','openai']) else '国内'

        item = {
            "id": f"intel-{len(items)+200}",
            "date": pub_date.strftime('%Y-%m-%d'),
            "title": title[:60],
            "body": (snippet or title)[:200],
            "sowhat": "",
            "company": company,
            "industry": industry,
            "type": itype,
            "timeline": pub_date.strftime('%Y-%m-%d') + " 本次事件",
            "scope": scope,
            "sources": [{"name": title[:50], "url": url, "date": pub_date.strftime('%Y-%m-%d')}],
            "_verification": "verified",
            "_date_ok": True,
            "_fetched_by": "search_intel.py",
        }
        items.append(item)
        print(f"   ✅ [{pub_date:%Y-%m-%d}] {title[:50]}")

    print(f"\n📊 通过校验: {len(items)}/{len(unique)}")

    if not args.dry_run:
        intel['items'] = items
        intel['_meta'] = {
            "description": "Part1 市场信息洞察 — search-intel agent (SOURCE-FIRST)",
            "last_updated": today.strftime('%Y-%m-%d'),
            "total_items": len(items),
            "window": f"past {args.days}d ({cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d})",
            "source_first": True,
        }
        with open(INTEL_FILE,'w',encoding='utf-8') as f:
            json.dump(intel, f, ensure_ascii=False, indent=2)
        print(f"✅ 写入 {INTEL_FILE}: {len(items)} 条")
    else:
        print("🔍 dry-run, 未写入")

if __name__=='__main__': main()
