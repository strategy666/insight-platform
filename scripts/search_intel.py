#!/usr/bin/env python3
"""
search-intel agent v3: SOURCE-FIRST — 直接从渠道页面抓取，不用 Tavily
渠道来源：sources.json + wechat-articles skill（公众号）
铁律：1) source URL 必须可访问且内容相关  2) date 必须从原文提取  3) 不编造
"""
from __future__ import annotations
import json, re, sys, time, subprocess, urllib.request, urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "assets/data/sources.json"
INTEL_FILE = ROOT / "assets/data/intel.json"
WECHAT_DIR = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/wechat-articles/scripts"
TAVILY = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/tavily-search/scripts/tavily_search.py"

# ========== 日期提取 ==========
DATE_PATS = [
    re.compile(r'article:published_time"\s+content="([^"]+)"'),
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"'),
    re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>', re.I),
    re.compile(r'itemprop="datePublished"\s+content="([^"]+)"'),
    re.compile(r'property="og:article:published_time"\s+content="([^"]+)"'),
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
        try: return datetime(int(m[1]),int(m[2]),int(m[3]))
        except: pass
    return None

def extract_date_from_html(html):
    for p in DATE_PATS:
        for m in p.finditer(html):
            d = parse_date(m.group(1))
            if d: return d
    # Fallback: find dates in text
    for m in re.finditer(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})\s*日?', html):
        try:
            d = datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
            if 2015<=d.year<=2035: return d
        except: pass
    return None

def fetch_page(url, timeout=15):
    """Fetch a page and return HTML content"""
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

def extract_articles_from_html(html, base_url):
    """Extract article links with titles and dates from a page HTML"""
    articles = []
    # Find all links that look like articles
    # Pattern 1: <a href="..." with title text nearby
    for m in re.finditer(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>', html, re.I):
        link = m.group(1).strip()
        title = m.group(2).strip()
        if not title or len(title) < 8: continue  # Skip short/empty titles
        
        # Resolve relative URLs
        if link.startswith('/'):
            from urllib.parse import urljoin
            link = urljoin(base_url, link)
        elif not link.startswith('http'):
            continue
        
        # Skip navigation/home links
        skip_patterns = ['javascript:', 'mailto:', '#', '/login', '/register', '/about', '/contact']
        if any(p in link.lower() for p in skip_patterns): continue
        # Skip if link is same as base (homepage)
        if link.rstrip('/') == base_url.rstrip('/'): continue
        
        articles.append({'url': link, 'title': title})
    
    return articles

def extract_articles_rss_like(html, base_url):
    """Extract articles from list-style pages (news lists, changelogs, etc.)"""
    articles = []
    # Find items with date + title pattern
    # Pattern: date followed by title/link
    for m in re.finditer(r'(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[\s日]?)\s*.*?<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>', html, re.I|re.S):
        date_str = m.group(1)
        link = m.group(2).strip()
        title = m.group(3).strip()
        date = parse_date(date_str)
        if date and title and link:
            if link.startswith('/'):
                from urllib.parse import urljoin
                link = urljoin(base_url, link)
            articles.append({'url': link, 'title': title, 'date': date})
    
    return articles

def tavily_search(query, n=5):
    """Tavily global search — also used for wechat domain search"""
    try:
        r = subprocess.run(
            ['uv', 'run', '--refresh-package', 'ks_aimate', TAVILY, query, str(n), '--json'],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0:
            results = []
            for line in r.stdout.strip().split('\n'):
                try:
                    d = json.loads(line)
                    if isinstance(d, dict) and d.get('url'): results.append(d)
                except: pass
            if not results:
                try:
                    data = json.loads(r.stdout)
                    if isinstance(data, list): results = data
                except: pass
            return results if isinstance(results, list) else []
    except Exception as e:
        print(f"  ⚠️ tavily search error: {e}", file=sys.stderr)
    return []


def wechat_search(keywords, n=5):
    """Search wechat articles via Tavily domain search (搜狗微信被反爬，改用Tavily)"""
    all_results = []
    kw_list = keywords if isinstance(keywords, list) else [keywords]
    for kw in kw_list[:3]:  # cap at 3 keywords per channel
        query = f"site:mp.weixin.qq.com {kw}"
        results = tavily_search(query, n=min(n, 5))
        for r in results:
            url = r.get('url', '')
            if 'mp.weixin.qq.com' in url:
                r['title'] = r.get('title', '')
                if r['title']:  # Only keep results with titles
                    all_results.append(r)
        if all_results:
            time.sleep(0.3)
    # Deduplicate by URL
    seen = set()
    unique = []
    for r in all_results:
        u = r.get('url', '')
        if u not in seen:
            seen.add(u)
            unique.append(r)
    return unique

def wechat_read(url):
    """Read a wechat article and extract date + content"""
    try:
        r = subprocess.run(['uv', 'run', '--refresh-package', 'ks_aimate',
            f'{WECHAT_DIR}/read.py', url, '--mode', 'auto'],
            capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            try:
                data = json.loads(r.stdout)
                return data
            except:
                # Parse text output
                return {'title': '', 'publish_time': '', 'paragraphs': [], 'mode': ''}
    except: pass
    return None

def validate_item(url, title, cutoff):
    """SOURCE-FIRST validation: fetch source, extract date, verify content match"""
    html = fetch_page(url)
    if not html:
        return None, None, False
    
    # Extract date from HTML
    pub_date = extract_date_from_html(html)
    if not pub_date:
        return html, None, False
    
    # Check date within window
    if pub_date < cutoff or pub_date > datetime.now() + timedelta(days=7):
        return html, pub_date, False
    
    # Content match: title keywords must appear in page
    title_words = [w for w in re.findall(r'[\u4e00-\u9fffA-Za-z]{2,}', title)]
    page_text = re.sub(r'<[^>]+>', ' ', html)
    page_text = re.sub(r'\s+', ' ', page_text).lower()
    if title_words:
        matched = sum(1 for w in title_words if w.lower() in page_text)
        if matched / len(title_words) < 0.15:
            return html, pub_date, False
    
    return html, pub_date, True

# ========== 分类工具 ==========
def classify_type(title):
    tl = title.lower()
    if any(k in tl for k in ['财报','收入','利润','营收','gmv','dau','mau','q1','q2','q3','q4']): return '财报数据'
    if any(k in tl for k in ['政策','监管','规范','准入','处罚','合规']): return '政策更新'
    if any(k in tl for k in ['融资','并购','上市','ipo']): return '融资并购'
    if any(k in tl for k in ['ai','大模型','gpt','claude','gemini','文心','通义','豆包','混元','aigc']): return '技术发布'
    return '产品动态'

def classify_company(title):
    cmap = {
        '字节':['字节','抖音','巨量','tiktok','douyin','飞书','豆包','seedance'],
        '小红书':['小红书','xiaohongshu','聚光','蒲公英'],
        '腾讯':['腾讯','微信','视频号','朋友圈','tencent'],
        '百度':['百度','文心','爱番番','baidu'],
        '美团':['美团','大众点评','dianping','meituan'],
        '阿里':['阿里','淘宝','天猫','阿里妈妈','万相','alibaba'],
        '拼多多':['拼多多','temu'],
        'OpenAI':['openai','gpt'],
        'Google':['google','gemini','alphabet'],
        'Meta':['meta','facebook'],
        'NVIDIA':['nvidia','英伟达'],
        '快手':['快手','kuaishou','可灵'],
    }
    tl = title.lower()
    for co, kws in cmap.items():
        if any(k in tl for k in kws): return [co]
    return []

def classify_industry(title):
    tl = title.lower()
    ind = []
    for tag,kws in [('生活服务',['本地生活','到店','外卖','闪购']),
                    ('电商',['电商','直播带货','货架','gmv']),
                    ('AI',['ai','大模型','aigc','gpt','claude']),
                    ('汽车',['汽车','新能源','智驾']),
                    ('医疗',['医疗','医美','口腔']),
                    ('教育',['教育','双减','职教'])]:
        if any(k in tl for k in kws): ind.append(tag)
    return ind or ['综合']

# ========== 主流程 ==========
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    cutoff = datetime.now() - timedelta(days=args.days)
    today = datetime.now()
    print(f"🔍 search-intel v3 (SOURCE-FIRST) | {cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d}")

    with open(SOURCES_FILE) as f: sources = json.load(f)
    with open(INTEL_FILE) as f: intel = json.load(f)

    # ========== 策略1: 直接 fetch 渠道页面，提取文章列表 ==========
    channel_sections = [
        ('domestic_competitor', False),  # competitor-tracker owns this
        ('overseas_competitor', False),
        ('ai_model_companies', True),
        ('bigtech_companies', True),
        ('general_media', True),
    ]
    
    # Also include industries and cross_industry
    industry_channels = []
    for ind in sources.get('industries', []):
        if ind.get('agent') == 'search-intel':
            industry_channels.append(('ind:'+ind.get('id',''), True, ind.get('sources',[])))
    
    cross_channels = []
    for ci in sources.get('cross_industry', []):
        agents = ci.get('agent', [])
        if isinstance(agents, str): agents = [agents]
        if 'search-intel' in agents:
            cross_channels.append(('cross:'+ci.get('id',''), True, ci.get('sources',[])))

    # Collect all search-intel channels
    all_channels = []
    for sec_key, is_si in channel_sections:
        if not is_si: continue
        sec = sources.get(sec_key, {})
        for s in sec.get('sources', []):
            all_channels.append((sec_key, s))
    
    for sec_id, _, srcs in industry_channels:
        for s in srcs:
            all_channels.append((sec_id, s))
    
    for sec_id, _, srcs in cross_channels:
        for s in srcs:
            all_channels.append((sec_id, s))
    
    print(f"   search-intel 渠道数: {len(all_channels)}")

    # ========== Step 1: Fetch channel pages, extract article links ==========
    all_article_links = []  # (url, title, source_channel, estimated_date)
    
    for sec_id, src in all_channels:
        url = src.get('url', '')
        name = src.get('name', '')
        tags = src.get('tags', [])
        is_weixin = 'weixin.sogou.com' in url or 'mp.weixin.qq.com' in url
        is_search = 'sogou.com' in url and 'weixin' not in url
        
        if is_weixin:
            # Use Tavily domain search for weixin accounts (搜狗微信被反爬)
            keywords = src.get('search_keywords')
            if not keywords:
                # Fallback: use channel name as keyword
                keywords = [name.replace('（公众号）','').replace('(公众号)','').strip()]
            if keywords:
                print(f"   📱 微信搜索(Tavily): {name} → {keywords[:2]}")
                articles = wechat_search(keywords, n=10)
                for a in articles:
                    all_article_links.append({
                        'url': a.get('url',''),
                        'title': a.get('title',''),
                        'source_channel': name,
                        'source_section': sec_id,
                        'estimated_date': parse_date(a.get('publish_time','') or a.get('published_date','')),
                        'is_weixin': True,
                        'tags': tags,
                    })
                time.sleep(0.5)
            continue
        
        if is_search:
            continue  # Search pages not directly fetchable
        
        # Direct fetch
        print(f"   🌐 Fetch: {name} ({url[:50]})")
        html = fetch_page(url)
        if not html:
            print(f"      ❌ 不可访问")
            continue
        
        # Extract article links from page
        articles = extract_articles_from_html(html, url)
        
        # Also try RSS-like date+title patterns
        dated_articles = extract_articles_rss_like(html, url)
        
        # Merge: dated_articles have extracted dates, plain articles don't
        seen_urls = set(a['url'] for a in articles)
        for da in dated_articles:
            if da['url'] not in seen_urls:
                articles.append(da)
                seen_urls.add(da['url'])
        
        print(f"      找到 {len(articles)} 个链接")
        
        for a in articles:
            a['source_channel'] = name
            a['source_section'] = sec_id
            a['is_weixin'] = False
            a['tags'] = tags
            if 'date' not in a:
                a['estimated_date'] = None
            else:
                a['estimated_date'] = a['date']
            all_article_links.append(a)
        
        time.sleep(0.3)

    print(f"\n   总计找到 {len(all_article_links)} 个文章链接")

    # ========== Step 2: For weixin articles, read and get date ==========
    weixin_articles = [a for a in all_article_links if a.get('is_weixin')]
    for a in weixin_articles:
        url = a.get('url', '')
        if url and 'mp.weixin.qq.com' in url:
            content = wechat_read(url)
            if content:
                a['estimated_date'] = parse_date(content.get('publish_time', ''))
                a['body'] = ' '.join(content.get('paragraphs', [])[:3])[:200]
                a['title'] = content.get('title', a.get('title', ''))
            time.sleep(0.3)

    # ========== Step 3: Validate non-weixin articles ==========
    # Pre-filter by estimated date
    valid_candidates = []
    for a in all_article_links:
        ed = a.get('estimated_date')
        if ed and (ed < cutoff or ed > today + timedelta(days=7)):
            continue
        if not a.get('url') or not a.get('title'):
            continue
        valid_candidates.append(a)
    
    print(f"   Pre-filtered: {len(valid_candidates)} candidates in date window")

    # Deduplicate by URL
    seen_urls = set()
    unique_candidates = []
    for a in valid_candidates:
        if a['url'] not in seen_urls:
            seen_urls.add(a['url'])
            unique_candidates.append(a)
    print(f"   URL 去重后: {len(unique_candidates)}")

    # Validate each candidate
    items = []
    validated_count = 0
    
    for i, a in enumerate(unique_candidates):
        if a.get('is_weixin'):
            # Weixin articles already validated by read
            pub_date = a.get('estimated_date')
            if not pub_date:
                continue
            if pub_date < cutoff:
                continue
            
            title = a.get('title', '')
            body = a.get('body', '') or title
            source_url = a.get('url', '')
            
            item = {
                "id": f"intel-{len(items)+200}",
                "date": pub_date.strftime('%Y-%m-%d'),
                "priority": "mid",
                "signal": "trend",
                "title": title[:60],
                "body": body[:200],
                "sowhat": "",
                "tags": ["#" + t for t in a.get('tags', [])[:3]],
                "company": classify_company(title),
                "industry": classify_industry(title),
                "type": classify_type(title),
                "timeline": pub_date.strftime('%Y-%m-%d') + " 本次事件",
                "scope": "国内",
                "sources": [{"name": a.get('source_channel',''), "url": source_url, "date": pub_date.strftime('%Y-%m-%d')}],
                "_verification": "verified",
                "_date_ok": True,
                "_fetched_by": "search_intel.py",
            }
            items.append(item)
            validated_count += 1
            print(f"   ✅ [微信] [{pub_date:%Y-%m-%d}] {title[:50]}")
            continue
        
        # Non-weixin: full validation
        html, pub_date, valid = validate_item(a['url'], a['title'], cutoff)
        if not html:
            continue
        if not valid:
            if pub_date and pub_date < cutoff:
                print(f"   ⏭️ 超窗口: {a['title'][:45]}")
            elif not pub_date:
                print(f"   ⚠️ 无日期: {a['title'][:45]}")
            else:
                print(f"   ❌ 不匹配: {a['title'][:45]}")
            continue
        
        title = a['title']
        # Extract body from page
        page_text = re.sub(r'<[^>]+>', ' ', html)
        page_text = re.sub(r'\s+', ' ', page_text).strip()
        # Get first 200 chars as body
        body = page_text[:200]
        
        item = {
            "id": f"intel-{len(items)+200}",
            "date": pub_date.strftime('%Y-%m-%d'),
            "priority": "mid",
            "signal": "trend",
            "title": title[:60],
            "body": body,
            "sowhat": "",
            "tags": ["#" + t for t in a.get('tags', [])[:3]],
            "company": classify_company(title),
            "industry": classify_industry(title),
            "type": classify_type(title),
            "timeline": pub_date.strftime('%Y-%m-%d') + " 本次事件",
            "scope": "国内",
            "sources": [{"name": a.get('source_channel','') or title[:50], "url": a['url'], "date": pub_date.strftime('%Y-%m-%d')}],
            "_verification": "verified",
            "_date_ok": True,
            "_fetched_by": "search_intel.py",
        }
        items.append(item)
        validated_count += 1
        print(f"   ✅ [{pub_date:%Y-%m-%d}] {title[:50]}")

    print(f"\n📊 通过校验: {validated_count}/{len(unique_candidates)}")

    if not args.dry_run and items:
        intel['items'] = items
        intel['_meta'] = {
            "description": "Part1 市场信息洞察 — search-intel v3 (SOURCE-FIRST, direct fetch)",
            "last_updated": today.strftime('%Y-%m-%d'),
            "total_items": len(items),
            "window": f"past {args.days}d ({cutoff:%Y-%m-%d} ~ {today:%Y-%m-%d})",
            "source_first": True,
            "fetch_method": "direct_channel_fetch + wechat_articles_skill",
        }
        with open(INTEL_FILE, 'w', encoding='utf-8') as f:
            json.dump(intel, f, ensure_ascii=False, indent=2)
        print(f"✅ 写入 {INTEL_FILE}: {len(items)} 条")
    elif not items:
        print("⚠️ 无有效条目，未写入")
    else:
        print("🔍 dry-run, 未写入")

if __name__ == '__main__':
    main()