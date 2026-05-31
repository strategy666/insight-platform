"""
build_feishu_db_v3.py
=====================
合并两个数据源：
  - /Users/jiayi/Downloads/byte_external_docs_links.json (browser_agent 抓的 471 条真实 URL+title)
  - /tmp/byte_all.json (OBO 拉的 397 行带分类/日期)

按标题做模糊匹配，生成最终 feishu_docs.json (v3.0)，每条都带真实 URL。
"""
import json, re, hashlib

LINKS_FILE = '/Users/jiayi/Downloads/byte_external_docs_links.json'
META_FILE = '/tmp/byte_all.json'
OUT_FILE = '/Users/jiayi/Desktop/Work/生服/trae/insight-platform/assets/data/feishu_docs.json'

links = json.load(open(LINKS_FILE))
meta_raw = json.load(open(META_FILE))

# meta 表整理：(title -> (category, date, remark, sheet))
meta_lookup = {}
for sheet, rows in meta_raw.items():
    if not rows: continue
    for row in rows[1:]:
        cat = (row[0] or '').strip() if len(row) > 0 else ''
        date_s = (row[1] or '').strip() if len(row) > 1 else ''
        title = (row[2] or '').strip() if len(row) > 2 else ''
        remark = (row[3] or '').strip() if len(row) > 3 else ''
        if not title: continue
        if re.match(r'^\d{4}', cat) and not date_s:
            date_s = cat
            cat = sheet
        meta_lookup[title] = {'category': cat, 'date': date_s, 'remark': remark, 'sheet': sheet}


def parse_date(s):
    s = (s or '').strip()
    m = re.match(r'(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?', s)
    if m:
        y, mo, d = m.group(1), m.group(2).zfill(2), (m.group(3) or '01').zfill(2)
        return f"{y}-{mo}-{d}"
    return ''


def detect_competitor(text):
    cs = []
    t = text or ''
    if re.search(r'抖音|字节|林客|生意经|来客|区域服务商|直营服务商|商服', t): cs.append('字节')
    if re.search(r'巨量', t): cs.append('巨量引擎')
    if re.search(r'快手|磁力|聚星', t): cs.append('快手')
    if re.search(r'美团|大众点评', t): cs.append('美团')
    if re.search(r'小红书|蒲公英|薯队长', t): cs.append('小红书')
    if re.search(r'腾讯|视频号|微信', t): cs.append('腾讯')
    if re.search(r'百度|文心', t): cs.append('百度')
    if re.search(r'淘宝|阿里|天猫', t): cs.append('阿里')
    return cs


def detect_dimensions(text):
    dims = []
    t = text or ''
    if re.search(r'激励|返佣|激励政策|奖励|冲量', t): dims.append('激励政策')
    if re.search(r'广告|投放|本地推|流量|创意|红包', t): dims.append('广告产品')
    if re.search(r'达人|网红|KOL|职人|主播|蒲公英|聚星', t): dims.append('达人/职人')
    if re.search(r'直播|开播|引流|场观', t): dims.append('直播')
    if re.search(r'商家|入驻|资质|准入', t): dims.append('商家产品')
    if re.search(r'品牌|品宣|节点|大促|活动', t): dims.append('节点策略')
    if re.search(r'数据|经营分|生意经|有数|分析', t): dims.append('数据产品')
    if re.search(r'手册|SOP|攻略|指南|培训|课程', t): dims.append('运营SOP')
    if re.search(r'代理|服务商|商服|加盟', t): dims.append('服务商体系')
    if re.search(r'AI|智能|算法|大模型|Agent', t): dims.append('AI能力')
    return dims if dims else ['其他']


def detect_doc_type(url):
    if 'larkoffice' in url or 'feishu.cn' in url:
        if '/sheets/' in url or '/wiki/' in url:
            return 'sheet' if '/sheets/' in url else 'wiki'
        return 'docx'  # 飞书 docx
    if 'docs.corp.kuaishou' in url:
        if '/s/home/' in url or '/t/home/' in url:
            return 'sheet'
        return 'kdoc'
    return 'link'


# 合并
seen_urls = set()
items = []
for L in links:
    base_url = L['url'].split('?')[0]
    if base_url in seen_urls: continue
    seen_urls.add(base_url)
    
    title = L['title']
    sheet = L['sheet_name']
    # 取 meta（标题 fuzzy match）
    meta = meta_lookup.get(title) or {}
    if not meta:
        # 模糊：找 title 前 10 个字符匹配
        prefix = title[:12]
        for mt, mv in meta_lookup.items():
            if prefix and mt.startswith(prefix):
                meta = mv
                break
    
    category = meta.get('category') or sheet
    date_raw = meta.get('date') or ''
    remark = meta.get('remark') or ''
    full_text = f"{title} {category} {sheet} {remark}"
    
    items.append({
        'id': 'fs-' + hashlib.md5(L['url'].encode('utf-8')).hexdigest()[:10],
        'title': title,
        'url': L['url'],  # 🎉 真实 URL
        'source_doc': 'https://docs.corp.kuaishou.com/s/home/fcADdie-9DQzc0MB4sCeBJorF',
        'source_sheet': sheet,
        'sheet': sheet,
        'type': detect_doc_type(L['url']),
        'category': category,
        'tags': category.split(',') if category else [],
        'competitors': detect_competitor(full_text) or ['字节'],
        'dimensions': detect_dimensions(full_text),
        'updated_at': parse_date(date_raw) or '2025-01-01',
        'updated_at_raw': date_raw,
        'row_index': L.get('row_index'),
        'summary': remark or f'{sheet} · {category}'.strip(' ·'),
        'keywords': list(set(
            detect_competitor(full_text) +
            detect_dimensions(full_text) +
            (category.split(',') if category else []) +
            [sheet]
        ))
    })

items.sort(key=lambda x: (x['updated_at'], x['sheet']), reverse=True)

result = {
    '_meta': {
        'version': '3.0',
        'source': '字节生活服务对外文档汇总（fcADdie-9DQzc0MB4sCeBJorF）',
        'source_doc_url': 'https://docs.corp.kuaishou.com/s/home/fcADdie-9DQzc0MB4sCeBJorF',
        'last_updated': __import__('datetime').date.today().isoformat(),
        'total_items': len(items),
        'note': '通过 SSO Cookie 链路抓取 snapshot 富文本中的真实飞书文档 URL；标题/分类/日期通过 OBO summarize 补全',
        'sheets_covered': sorted(set(it['sheet'] for it in items)),
        'pipeline': [
            '1. browser_agent (用户 Chrome SSO) → snapshot JSON → 471 条真实 URL+title',
            '2. docs-shuttle OBO summarize → 397 行 分类/日期/备注 元数据',
            '3. tools/build_feishu_db_v3.py 按 title 模糊匹配合并'
        ]
    },
    'items': items
}

with open(OUT_FILE, 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

# 统计
from collections import Counter
print(f"✅ 写入 {OUT_FILE}")
print(f"   共 {len(items)} 条文档")
print(f"\n按 sheet 分布：")
for k, v in Counter(it['sheet'] for it in items).most_common():
    print(f"  {k}: {v}")
print(f"\n按 type 分布：")
for k, v in Counter(it['type'] for it in items).most_common():
    print(f"  {k}: {v}")
matched_with_date = sum(1 for it in items if it['updated_at_raw'])
print(f"\n匹配到日期: {matched_with_date}/{len(items)}")
matched_with_remark = sum(1 for it in items if it['summary'] and not it['summary'].startswith(it['sheet']))
print(f"匹配到备注: {matched_with_remark}/{len(items)}")
