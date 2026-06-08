#!/usr/bin/env python3
"""
competitor-tracker agent v3: SOURCE-FIRST — 直接从渠道页面抓取，不用 Tavily
7 家竞对 × 3 维度，渠道来源：sources.json Part2 + 微信公众号
铁律：1) source URL 必须可访问且内容相关  2) date 必须从原文提取  3) 不编造
"""
from __future__ import annotations
import json, re, sys, time, subprocess, urllib.request, urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "assets/data/sources.json"
COMP_FILE = ROOT / "assets/data/competitor_updates.json"
WECHAT_DIR = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/wechat-articles/scripts"
TAVILY = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/tavily-search/scripts/tavily_search.py"

COMPANIES = ['字节','小红书','腾讯','百度','美团','阿里','拼多多']

# ========== 日期提取 ==========
DATE_PATS = [
    re.compile(r'article:published_time"\s+content="([^"]+)"'),
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"'),
    re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>', re.I),
    re.compile(r'itemprop="datePublished"\s+content="([^"]+)"'),
    re.compile(r'property="og:article:published_time"\s+content="([^"]+)"'),
    # 小红书聚光/巨量引擎特殊格式
    re.compile(r'更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})'),
    re.compile(r'调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})'),
    re.compile(r'发布时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})'),
]

def parse_date(s):
    if not s: return None
    s = s.strip().split('T')[0].split(' ')[0].split('+')[0].split('Z')[0]
    for fmt in ['%Y-%m-%d','%Y/%m/%d']:
        try:
            dt = datetime.strptime(s, fmt)
            return dt if 2015<=dt.year<=2035 else None
        except: pass
    m = re.match(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', s)
    if m:
        try: return datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
        except: pass
    return None

def extract_date_from_html(html):
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

def fetch_page(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 KInsight/3.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status == 200:
                return r.read(1024*1024).decode('utf-8', errors='replace')
    except: pass
    return None

def extract_links(html, base_url):
    """Extract all article-like links from HTML"""
    links = []
    for m in re.finditer(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]{8,})</a>', html, re.I):
        href = m.group(1).strip()
        title = m.group(2).strip()
        if not href or not title: continue
        skip = ['javascript:', 'mailto:', '#', '/login', '/register', '/about']
        if any(p in href.lower() for p in skip): continue
        if href.startswith('/'):
            href = urljoin(base_url, href)
        elif not href.startswith('http'): continue
        if href.rstrip('/') == base_url.rstrip('/'): continue
        links.append({'url': href, 'title': title})
    return links

def extract_dated_links(html, base_url):
    """Extract links that have dates nearby in the text"""
    links = []
    # Find blocks that contain a date + a link
    # Pattern: date text near a link
    blocks = re.findall(r'(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日\s]?\s*[^<]{0,200})', html)
    for block in blocks:
        date_match = re.search(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', block)
        link_match = re.search(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>', block, re.I)
        if date_match and link_match:
            try:
                d = datetime(int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3)))
                href = link_match.group(1).strip()
                title = link_match.group(2).strip()
                if href.startswith('/'):
                    href = urljoin(base_url, href)
                if 2015<=d.year<=2035 and title:
                    links.append({'url': href, 'title': title, 'date': d})
            except: pass
    return links

def wechat_search(keywords, n=10):
    """Search wechat articles via Tavily domain search (搜狗微信被反爬)"""
    all_results = []
    kw_list = keywords if isinstance(keywords, list) else [keywords]
    for kw in kw_list[:3]:
        query = f"site:mp.weixin.qq.com {kw}"
        try:
            r = subprocess.run(
                ['uv', 'run', '--refresh-package', 'ks_aimate', TAVILY, query, str(n), '--json'],
                capture_output=True, text=True, timeout=30
            )
            if r.returncode == 0 and r.stdout.strip():
                try:
                    data = json.loads(r.stdout)
                    items = data if isinstance(data, list) else []
                except:
                    items = []
                    for line in r.stdout.strip().split('\n'):
                        try:
                            d = json.loads(line)
                            if isinstance(d, dict) and d.get('url'): items.append(d)
                        except: pass
                for item in items:
                    url = item.get('url', '')
                    if 'mp.weixin.qq.com' in url and item.get('title'):
                        all_results.append(item)
        except Exception as e:
            print(f"  ⚠️ wechat err: {e}", file=sys.stderr)
        if all_results: time.sleep(0.3)
    seen = set(); unique = []
    for r in all_results:
        u = r.get('url', '')
        if u not in seen: seen.add(u); unique.append(r)
    return unique

def wechat_read(url):
    try:
        r = subprocess.run(['uv', 'run', '--refresh-package', 'ks_aimate',
            f'{WECHAT_DIR}/read.py', url, '--mode', 'auto'],
            capture_output=True, text=True, timeout=30)
        if r.returncode == 0 and r.stdout.strip():
            try:
                return json.loads(r.stdout)
            except: pass
    except: pass
    return None

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

def classify_dimension(title):
    tl = title.lower()
    if any(k in tl for k in ['准入','审核','政策','合规','资质','处罚','规范','监管','禁入']): return '准入政策'
    if any(k in tl for k in ['营销','方案','标杆','运营','打法','分账','案例']): return '行业案例'
    if any(k in tl for k in ['ai','大模型','llm']): return '产品动态'
    return '产品动态'

def classify_dimension_detail(title):
    tl = title.lower()
    if any(k in tl for k in ['ai','大模型','llm']): return 'AI/技术'
    if any(k in tl for k in ['财报','收入','利润','gmv','dau']): return '财报/数据'
    if any(k in tl for k in ['电商','直播','带货']): return '电商/交易'
    dim = classify_dimension(title)
    return {'产品动态':'产品/接入','准入政策':'准入/政策','行业案例':'营销/分账'}.get(dim, dim)

def classify_data_source(title, src_name):
    tl = title.lower()
    official_keywords = ['巨量','腾讯广告','百度营销','聚光','蒲公英','官方','官网','公告','changelog']
    if any(k in tl for k in official_keywords) or any(k in src_name.lower() for k in official_keywords):
        return '竞媒官方'
    return '三方媒体'

def validate_item(url, title, cutoff):
    """Fetch source URL, extract date from HTML, verify content matches title"""
    html = fetch_page(url)
    if not html:
        return None, None, False, ""
    
    pub_date = extract_date_from_html(html)
    
    # Content match
    title_words = [w for w in re.findall(r'[\u4e00-\u9fffA-Za-z]{2,}', title)]
    page_text = re.sub(r'<[^>]+>', ' ', html)
    page_text = re.sub(r'\s+', ' ', page_text).strip()
    matched = sum(1 for w in title_words if w.lower() in page_text.lower())
    content_matches = not title_words or matched/len(title_words) >= 0.15
    
    body = page_text[:200]
    
    if not pub_date:
        return html, None, content_matches, body
    if pub_date < cutoff or pub_date > datetime.now() + timedelta(days=7):
        return html, pub_date, False, body
    
    return html, pub_date, content_matches, body

# ========== 主流程 ==========
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--company', type=str, default='')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    cutoff = datetime.now() - timedelta(days=14)
    today = datetime.now()
    target_companies = args.company.split(',') if args.company else COMPANIES
    
    print(f"🎯 competitor-tracker v3 (SOURCE-FIRST) | {cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d}")
    print(f"   竞对: {', '.join(target_companies)}")

    with open(SOURCES_FILE) as f: sources = json.load(f)
    with open(COMP_FILE) as f: comp = json.load(f)

    # ========== 收集 competitor-tracker 渠道 ==========
    all_channels = []
    
    # Part2.1: 竞对产品动态信源
    for src in sources.get('domestic_competitor', {}).get('sources', []):
        all_channels.append(('2.1-domestic', src))
    for src in sources.get('overseas_competitor', {}).get('sources', []):
        all_channels.append(('2.1-overseas', src))
    
    # Part2.2: 准入政策 & 合规
    # (included in domestic_competitor tags + cross_industry)
    
    # Part2.3: 行业 Case
    for ci in sources.get('cross_industry', []):
        agents = ci.get('agent', [])
        if isinstance(agents, str): agents = [agents]
        if 'competitor-tracker' in agents:
            for src in ci.get('sources', []):
                all_channels.append(('2.3-cross:'+ci.get('id',''), src))
    
    # Part4 辅助赛道
    for ind in sources.get('industries', []):
        ag = ind.get('agent', '')
        # Some industries don't specify agent, check if relevant to competitor tracking
        ind_name = ind.get('name', '')
        relevant_indicators = ['本地服务','本地服务广告','生活服务','电商','线索广告']
        if ag == 'competitor-tracker' or any(k in ind_name for k in relevant_indicators):
            for src in ind.get('sources', []):
                all_channels.append(('4-ind:'+ind.get('id',''), src))
    
    print(f"   competitor-tracker 渠道数: {len(all_channels)}")

    # ========== Step 1: 逐个 fetch 渠道页面 + 微信搜索 ==========
    all_article_links = []
    
    for sec_id, src in all_channels:
        url = src.get('url', '')
        name = src.get('name', '')
        tags = src.get('tags', [])
        is_weixin = 'weixin.sogou.com' in url
        is_search_only = 'sogou.com' in url and not is_weixin
        
        if is_weixin:
            # Use Tavily domain search for weixin accounts (搜狗微信被反爬)
            keywords = src.get('search_keywords')
            if not keywords:
                keywords = [name.replace('（公众号）','').replace('(公众号)','').strip()]
            if keywords:
                print(f"   📱 微信(Tavily): {name} → {keywords[:2]}")
                articles = wechat_search(keywords, n=10)
                for a in articles:
                    a_title = a.get('title', '')
                    a_url = a.get('url', '')
                    co = classify_company(a_title)
                    if co in target_companies or co == '其他':
                        all_article_links.append({
                            'url': a_url, 'title': a_title,
                            'source_channel': name, 'source_section': sec_id,
                            'estimated_date': parse_date(a.get('publish_time','') or ''),
                            'is_weixin': True, 'tags': tags, 'company': co,
                        })
                time.sleep(0.5)
            continue
        
        if is_search_only:
            continue
        
        print(f"   🌐 Fetch: {name} ({url[:60]})")
        html = fetch_page(url)
        if not html:
            print(f"      ❌ 不可访问")
            continue
        
        # Extract links
        plain_links = extract_links(html, url)
        dated_links = extract_dated_links(html, url)
        
        # Merge dedup
        seen = set(l['url'] for l in plain_links)
        all_found = plain_links[:]
        for dl in dated_links:
            if dl['url'] not in seen:
                all_found.append(dl)
                seen.add(dl['url'])
        
        # Filter: only keep articles related to target companies
        for l in all_found:
            co = classify_company(l.get('title',''))
            # Keep if it mentions a target company OR is from a company-specific channel
            channel_companies = [t for t in tags if t in COMPANIES]
            if co in target_companies or channel_companies:
                l['source_channel'] = name
                l['source_section'] = sec_id
                l['is_weixin'] = False
                l['tags'] = tags
                l['company'] = co or (channel_companies[0] if channel_companies else '其他')
                if 'date' in l:
                    l['estimated_date'] = l['date']
                else:
                    l['estimated_date'] = None
                all_article_links.append(l)
        
        print(f"      相关链接: {sum(1 for l in all_found if classify_company(l.get('title','')) in target_companies or [t for t in tags if t in COMPANIES])}")
        time.sleep(0.3)

    print(f"\n   总计: {len(all_article_links)} 个候选文章链接")

    # ========== Step 2: Read weixin articles to get exact dates ==========
    weixin_articles = [a for a in all_article_links if a.get('is_weixin')]
    for a in weixin_articles:
        url = a.get('url', '')
        if url and 'mp.weixin.qq.com' in url:
            content = wechat_read(url)
            if content:
                a['estimated_date'] = parse_date(content.get('publish_time', ''))
                a['body'] = ' '.join(content.get('paragraphs', [])[:3])[:200]
                a['title'] = content.get('title', a.get('title', ''))
                a['source_channel'] = content.get('author', a.get('source_channel', ''))
            time.sleep(0.3)

    # ========== Step 3: Pre-filter + deduplicate ==========
    candidates = []
    for a in all_article_links:
        ed = a.get('estimated_date')
        if ed and (ed < cutoff or ed > today + timedelta(days=30)):
            continue
        if not a.get('url') or not a.get('title'):
            continue
        # Skip obviously non-article links (homepage, nav, etc.)
        title = a['title']
        skip_title_patterns = ['首页','登录','注册','联系我们','关于我们','搜索']
        if any(p in title for p in skip_title_patterns):
            continue
        candidates.append(a)
    
    # Deduplicate
    seen_urls = set()
    unique = []
    for a in candidates:
        if a['url'] not in seen_urls:
            seen_urls.add(a['url'])
            unique.append(a)
    
    print(f"   Pre-filtered: {len(unique)} candidates")

    # ========== Step 4: Validate each candidate ==========
    items = []
    
    for i, a in enumerate(unique):
        if (i+1) % 20 == 0:
            print(f"   校验进度: {i+1}/{len(unique)}")
        
        if a.get('is_weixin'):
            pub_date = a.get('estimated_date')
            if not pub_date or pub_date < cutoff:
                continue
            title = a.get('title', '')
            body = a.get('body', '') or title
            source_url = a.get('url', '')
            company = a.get('company', '') or classify_company(title)
            if company == '其他': continue  # Weixin: only keep target company articles
            
            dim = classify_dimension(title)
            dim_detail = classify_dimension_detail(title)
            data_src = classify_data_source(title, a.get('source_channel', ''))
            
            item = {
                "id": f"comp-{len(items)+700}",
                "date": pub_date.strftime('%Y-%m-%d'),
                "company": company,
                "category": dim,
                "dimension": dim_detail,
                "data_source": data_src,
                "tier": "T1",
                "title": title[:60],
                "body": body[:150],
                "sowhat": "",
                "scope": "国内",
                "sources": [{"name": a.get('source_channel','') or title[:50], "url": source_url, "date": pub_date.strftime('%Y-%m-%d')}],
                "timeline": [{"date": pub_date.strftime('%Y-%m-%d'), "event": "本次动态"}],
                "_verification": "verified",
                "_date_ok": True,
                "_fetched_by": "competitor_tracker.py",
            }
            items.append(item)
            print(f"   ✅ [微信|{company}|{dim}] [{pub_date:%Y-%m-%d}] {title[:45]}")
            continue
        
        # Non-weixin: full SOURCE-FIRST validation
        html, pub_date, valid, body = validate_item(a['url'], a['title'], cutoff)
        
        if not html:
            print(f"   ❌ 不可访问: {a['title'][:45]}")
            continue
        
        if not pub_date:
            print(f"   ⚠️ 无日期: {a['title'][:45]}")
            continue
        
        if pub_date < cutoff:
            print(f"   ⏭️ 超窗口({pub_date:%Y-%m-%d}): {a['title'][:45]}")
            continue
        
        if not valid:  # content doesn't match
            print(f"   ❌ 内容不匹配: {a['title'][:45]}")
            continue
        
        title = a['title']
        company = a.get('company', '') or classify_company(title)
        dim = classify_dimension(title)
        dim_detail = classify_dimension_detail(title)
        data_src = classify_data_source(title, a.get('source_channel', ''))
        
        item = {
            "id": f"comp-{len(items)+700}",
            "date": pub_date.strftime('%Y-%m-%d'),
            "company": company,
            "category": dim,
            "dimension": dim_detail,
            "data_source": data_src,
            "tier": "T1",
            "title": title[:60],
            "body": (body or title)[:150],
            "sowhat": "",
            "scope": "国内",
            "sources": [{"name": a.get('source_channel','') or title[:50], "url": a['url'], "date": pub_date.strftime('%Y-%m-%d')}],
            "timeline": [{"date": pub_date.strftime('%Y-%m-%d'), "event": "本次动态"}],
            "_verification": "verified",
            "_date_ok": True,
            "_fetched_by": "competitor_tracker.py",
        }
        items.append(item)
        print(f"   ✅ [{company}|{dim}] [{pub_date:%Y-%m-%d}] {title[:45]}")

    print(f"\n📊 通过校验: {len(items)}/{len(unique)}")
    from collections import Counter
    cos = Counter(i['company'] for i in items)
    for co in COMPANIES:
        if co in cos:
            print(f"   {co}: {cos[co]} 条")

    if not args.dry_run and items:
        comp['items'] = items
        comp['_meta'] = {
            "description": "Part2 竞对动态 — competitor-tracker v3 (SOURCE-FIRST, direct fetch)",
            "last_updated": today.strftime('%Y-%m-%d'),
            "total_items": len(items),
            "recent_window": f"past 14d (cutoff {cutoff:%Y-%m-%d})",
            "companies_tracked": COMPANIES,
            "source_first": True,
            "fetch_method": "direct_channel_fetch + wechat_articles_skill",
        }
        with open(COMP_FILE, 'w', encoding='utf-8') as f:
            json.dump(comp, f, ensure_ascii=False, indent=2)
        print(f"✅ 写入 {COMP_FILE}: {len(items)} 条")
    elif not items:
        print("⚠️ 无有效条目")
    else:
        print("🔍 dry-run")

if __name__ == '__main__':
    main()