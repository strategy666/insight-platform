#!/usr/bin/env python3
"""
trends_deep.py v1: 深度长文/访谈/学术论文挖掘 agent
定位：覆盖 search-intel 和 competitor-tracker 覆盖不到的三个维度：
  1. 深度访谈/对谈万字实录（Boris Cherny, 汤道生姚顺雨, Altman等）
  2. AI学术论文/竞赛突破（SOTA刷新, ICML/CVPR/NeurIPS等顶会论文解读）
  3. 行业峰会/发布会纪要（腾讯云AI大会, 百度Create, 英伟达GTC等）

策略：Tavily全局搜索 + wechat-articles深度读取 + web_fetch验证
执行节奏：每周 1 次（低频不烧 Tavily 额度），输出 ~10条高价值深度条目
"""
from __future__ import annotations
import json, re, sys, subprocess, urllib.request, time
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
INTEL_FILE = ROOT / "assets/data/intel.json"
TAVILY_PY = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/tavily-search/scripts/tavily_search.py"
WECHAT_DIR = "/data/aime/5bcc70f2-ab1e-4c73-8d6a-d9eb35de3d86/workspace/skills/wechat-articles/scripts"

# ====== 搜索主题定义 ======
DEEP_QUERIES = {
    "访谈/对谈": [
        "AI 访谈 万字实录 对谈",
        "Sam Altman 最新 访谈",
        "Dario Amodei Anthropic 最新 访谈 观点",
        "AI 自进化 递归自我改进 RSI 长文",
        "AI Agent 下半场 对谈 实录",
        "黄仁勋 Jensen Huang 最新 演讲 观点",
    ],
    "学术论文/竞赛": [
        "AI SOTA 刷新 突破 2026",
        "ICML 2026 论文 解读",
        "CVPR 2026 论文 突破",
        "NeurIPS 大模型 论文 解读",
        "开源 大模型 benchmark 超越 GPT",
        "混合专家 MoE 稀疏注意力 论文 2026",
    ],
    "行业峰会": [
        "AI产业应用大会 2026 发布",
        "百度Create 2026 开发者大会",
        "阿里云峰会 2026 发布",
        "苹果WWDC 2026 AI 发布",
        "英伟达GTC 2026 发布",
    ],
    "融资/估值": [
        "AI 独角兽 融资 估值 2026",
        "AI 公司 IPO 上市 2026",
        "大模型 公司 融资 亿美元",
    ],
}

DATE_PATS = [
    re.compile(r'article:published_time"\s+content="([^"]+)"'),
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"'),
    re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>', re.I),
    re.compile(r'发布时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})'),
    re.compile(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', re.I),
]

def tavily_search(query, n=5):
    try:
        r = subprocess.run(
            ['uv', 'run', '--refresh-package', 'ks_aimate', TAVILY_PY, query, str(n), '--json'],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0:
            results = []
            for line in r.stdout.strip().split('\n'):
                try:
                    d = json.loads(line)
                    if d.get('url'): results.append(d)
                except: pass
            if not results:
                try: results = json.loads(r.stdout)
                except: pass
            return results if isinstance(results, list) else []
    except Exception as e:
        print(f"  ⚠️ tavily error: {e}", file=sys.stderr)
    return []

def wechat_search(kws, n=5):
    """Search wechat via Tavily global search (no site: filter support)"""
    all_results = []
    kw_list = kws if isinstance(kws, list) else [kws]
    for kw in kw_list[:3]:
        results = tavily_search(kw, n=n)
        for r in results:
            if r.get('url') and r.get('title'):
                all_results.append(r)
        if all_results:
            time.sleep(0.3)
    seen = set(); unique = []
    for r in all_results:
        u = r.get('url', '')
        if u not in seen: seen.add(u); unique.append(r)
    return unique

def wechat_read(url):
    try:
        r = subprocess.run(
            ['uv', 'run', '--refresh-package', 'ks_aimate',
             f'{WECHAT_DIR}/read.py', url, '--mode', 'auto'],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0:
            try: return json.loads(r.stdout)
            except: pass
    except: pass
    return None

def extract_date(html_or_text):
    for p in DATE_PATS:
        for m in p.finditer(html_or_text):
            g = m.group(1)
            g = g.strip().split('T')[0].split(' ')[0]
            try: dt = datetime.strptime(g, '%Y-%m-%d').date()
            except:
                try: dt = datetime.strptime(g, '%Y/%m/%d').date()
                except: continue
            if datetime(2015,1,1).date() <= dt <= datetime.now().date():
                return dt
    m = re.search(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})', html_or_text)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
            if datetime(2015,1,1).date() <= dt <= datetime.now().date():
                return dt
        except: pass
    return None

def fetch_url(url):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 KInsight/3.0',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read(1024*1024).decode('utf-8', errors='replace')
    except: return None

def classify_topic(title, body=''):
    t = (title + body).lower()
    if any(k in t for k in ['融资','ipo','估值','股','亿','h轮','融资历','投资']): return '融资/估值'
    if any(k in t for k in ['访谈','对谈','万字','实录','对话','专访']): return '访谈/对谈'
    if any(k in t for k in ['paper','arxiv','sota','neural','transformer','注意力','量化','模型','benchmark','开源','算法','训练','论文','icml','aaai','cvpr','nips','会议','收录']): return '学术/技术'
    if any(k in t for k in ['大会','峰会','wwdc','gtc','create','发布']): return '行业峰会'
    return '其他'

def generate_sowhat(title, body, topic):
    body_l = body.lower()
    if '快手' in body_l or '可灵' in body_l: return ""
    if topic == '融资/估值':
        return "AI资本密集度持续攀升，快手需评估自身AI业务估值锚点与融资节奏"
    if topic == '访谈/对谈':
        return "行业领袖观点反映AI竞争范式变化，对快手AI战略规划有参考价值"
    if topic == '学术/技术':
        return "技术突破方向影响快手AI研发路线选择与架构决策"
    if topic == '行业峰会':
        return "竞媒AI产品发布节奏影响快手商业化产品对标策略"
    return ""

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=14)
    ap.add_argument('--dry-run', action='store_true')
    api = ap.parse_args()

    cutoff = datetime.now().date() - timedelta(days=api.days)
    today = datetime.now().date()
    print(f"🎯 trends_deep v1 | {cutoff} ~ {today} | {len(DEEP_QUERIES)} query groups")

    all_candidates = []
    
    # Phase 1: Tavily global search
    for category, queries in DEEP_QUERIES.items():
        print(f"\n📡 {category} ({len(queries)} queries)")
        for q in queries:
            results = tavily_search(q, n=5)
            for r in results:
                r['_deep_category'] = category
                r['_deep_query'] = q
            all_candidates.extend(results)
            print(f"  '{q[:40]}' → {len(results)} results")
            time.sleep(0.3)
    
    # Phase 2: WeChat search for 机器之心/量子位/新智元 (paper discovery)
    print(f"\n📱 WeChat deep search")
    for kw in ['AI 论文解读 SOTA', '大模型 突破 刷新', 'ICML CVPR 论文 解读 2026']:
        articles = wechat_search(kw, n=5)
        for a in articles:
            a['_deep_category'] = '学术/技术'
            a['_deep_query'] = f'wechat:{kw}'
        all_candidates.extend(articles)
        print(f"  wechat:{kw[:30]} → {len(articles)}")
        time.sleep(0.3)

    # Phase 3: Deduplicate by URL
    seen_urls = set()
    unique = []
    for c in all_candidates:
        url = c.get('url', '')
        if not url: continue
        if url in seen_urls: continue
        seen_urls.add(url)
        
        # Filter: only keep candidates with titles containing deep-content signals
        title = c.get('title', '')
        t = title.lower()
        depth_signals = ['万字','实录','全文','深度','复盘','解读','专访','长文','纪要',
                         '观点','思考','对谈','对话','SOTA','刷新','超越','突破',
                         '发布','融资','估值','上市','过会']
        if not any(s in t for s in depth_signals):
            continue
        unique.append(c)

    print(f"\n🔍 Pre-filtered: {len(unique)} deep candidates (from {len(all_candidates)} raw)")

    # Phase 4: Validate and extract
    items = []
    for i, c in enumerate(unique):
        if (i+1) % 10 == 0: print(f"  Validating {i+1}/{len(unique)}…")
        
        url = c.get('url', '')
        title = c.get('title', '')
        is_weixin = 'mp.weixin.qq.com' in url
        
        if is_weixin:
            content = wechat_read(url)
            if not content: continue
            pub_date = extract_date(content.get('publish_time', '') or '')
            paragraphs = content.get('paragraphs', [])
            body_text = ' '.join(paragraphs[:5])[:200]
            author = content.get('author', '')
            if not pub_date: continue
            if pub_date < cutoff: continue
        else:
            html = fetch_url(url)
            if not html: continue
            pub_date = extract_date(html)
            if not pub_date or pub_date < cutoff: continue
            body_text = re.sub(r'<[^>]+>', ' ', html[:30000])
            body_text = re.sub(r'\s+', ' ', body_text).strip()[:200]
            author = ''
        
        topic = c.get('_deep_category', '') or classify_topic(title, body_text)
        sowhat = generate_sowhat(title, body_text, topic)
        
        item = {
            "id": f"intel-deep-{len(items)+800}",
            "date": pub_date.strftime('%Y-%m-%d'),
            "priority": "high" if topic in ('融资/估值', '行业峰会') else "mid",
            "signal": "trend",
            "title": title[:80],
            "body": body_text[:200],
            "sowhat": sowhat,
            "tags": [f"#deep-{topic}"],
            "company": [],
            "industry": ["AI"],
            "type": topic,
            "timeline": f"{pub_date} 本次",
            "scope": "海外" if any(k in url for k in ['openai','anthropic','nvidia','google','microsoft']) else "国内",
            "sources": [
                {"name": author or c.get('source','') or title[:40],
                 "url": url,
                 "date": pub_date.strftime('%Y-%m-%d')}
            ],
            "_verification": "verified",
            "_date_ok": True,
            "_fetched_by": "trends_deep.py",
        }
        items.append(item)
        print(f"  ✅ [{topic}] [{pub_date}] {title[:50]}")

    print(f"\n📊 Validated: {len(items)} deep items")
    
    if not api.dry_run and items:
        with open(INTEL_FILE) as f:
            intel = json.load(f)
        existing = intel.get('items', [])
        seen_titles = {i.get('title','')[:30] for i in existing}
        new = [i for i in items if i.get('title','')[:30] not in seen_titles]
        
        all_items = existing + new
        all_items.sort(key=lambda x: x['date'], reverse=True)
        
        intel['items'] = all_items
        intel['_meta']['total_items'] = len(all_items)
        intel['_meta']['last_updated'] = today.strftime('%Y-%m-%d')
        intel['_meta']['deep_fetch'] = f"trends_deep.py v1: {len(new)} new deep items"
        
        with open(INTEL_FILE, 'w', encoding='utf-8') as f:
            json.dump(intel, f, ensure_ascii=False, indent=2)
        print(f"✅ 写入 {INTEL_FILE}: +{len(new)} deep items (total {len(all_items)})")
    elif not items:
        print("⚠️ No valid deep items found")

if __name__ == '__main__':
    main()