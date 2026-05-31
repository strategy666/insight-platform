"""
sync_byte_external_docs.py
==========================
从字节对外文档库 (Kim Doc 表格 fcADdie-9DQzc0MB4sCeBJorF) 拉全部 sheet
转成 portal 用的 feishu_docs.json

用法:
  ENV_PY=/Users/jiayi/.cache/uv/environments-v2/search-5b09892b6507b147/bin/python3.14
  $ENV_PY tools/sync_byte_external_docs.py

或:
  uv run --refresh-package ks_aimate python3 tools/sync_byte_external_docs.py

依赖: ks_aimate (通过 docs-shuttle skill 提供 OBO Token)
"""
import sys, os, urllib.parse, json, re, hashlib
sys.path.insert(0, '/Users/jiayi/.codeflicker/remote-skills/docs-shuttle/scripts')
import _open_skill_core as core

# 配置
DOC_ID = "fcADdie-9DQzc0MB4sCeBJorF"
SOURCE_URL = f"https://docs.corp.kuaishou.com/s/home/{DOC_ID}"
OUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'insight-platform', 'assets', 'data', 'feishu_docs.json')
OUT_FILE = os.path.abspath(OUT_FILE)

# ---- 1. 拉表格全量数据 ----
print(f"📥 [1/3] 从字节对外文档库拉数据 (docId={DOC_ID})...")
core.init_env()
core.set_token(core.resolve_token())

resp = core.request(f"{core.API_BASE}/excel/meta?docId={urllib.parse.quote(DOC_ID)}")
sheets = resp.get("result", {}).get("sheetInfoList", resp.get("result", {}).get("sheetInfos", []))
print(f"   发现 {len(sheets)} 个 sheet")


def safe_request(url):
    try:
        return core.request(url)
    except (SystemExit, Exception):
        return None


all_data = {}
for idx, s in enumerate(sheets):
    name = s.get('sheetName')
    max_row = s.get('maxRowIndex', 200)
    max_col = s.get('maxColumnIndex', 4)
    col_letter = chr(ord('A') + min(max_col, 6))
    sheet_rows = []
    chunk = 50
    for start in range(1, max_row + 2, chunk):
        end = min(start + chunk - 1, max_row + 1)
        rng = f"{idx}!A{start}:{col_letter}{end}"
        url = f"{core.API_BASE}/excel/content?docId={urllib.parse.quote(DOC_ID)}&range={urllib.parse.quote(rng)}"
        r = safe_request(url)
        if not r:
            continue
        for row in r.get("result", {}).get("rows", []):
            cells = {c.get('columnIndex'): c.get('showValue', '') for c in row}
            sheet_rows.append([cells.get(i, '') for i in range(max_col + 1)])
    # 去重 + 去空
    seen, cleaned = set(), []
    for row in sheet_rows:
        key = tuple(row[:3])
        if key in seen or not any(row):
            continue
        seen.add(key)
        cleaned.append(row)
    all_data[name] = cleaned
    print(f"   {name}: {len(cleaned)} rows")

print(f"📊 [2/3] 转换为 feishu_docs.json schema...")


# ---- 2. 字段提取规则 ----
def gen_id(text):
    return 'fs-' + hashlib.md5(text.encode('utf-8')).hexdigest()[:10]


def parse_date(s):
    s = (s or '').strip()
    m = re.match(r'(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?', s)
    if m:
        y, mo = m.group(1), m.group(2).zfill(2)
        d = (m.group(3) or '01').zfill(2)
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
    if re.search(r'激励|返佣|激励政策|奖励', t): dims.append('激励政策')
    if re.search(r'广告|投放|本地推|流量|创意', t): dims.append('广告产品')
    if re.search(r'达人|网红|KOL|职人|主播|蒲公英|聚星', t): dims.append('达人/职人')
    if re.search(r'直播|开播|引流|场观', t): dims.append('直播')
    if re.search(r'商家|入驻|资质|准入', t): dims.append('商家产品')
    if re.search(r'品牌|品宣|节点|大促|活动', t): dims.append('节点策略')
    if re.search(r'数据|经营分|生意经|有数|分析', t): dims.append('数据产品')
    if re.search(r'手册|SOP|攻略|指南|培训|课程', t): dims.append('运营SOP')
    if re.search(r'代理|服务商|商服|加盟', t): dims.append('服务商体系')
    if re.search(r'AI|智能|算法|大模型|Agent', t): dims.append('AI能力')
    return dims if dims else ['其他']


# ---- 3. 转换 ----
items = []
for sheet_name, rows in all_data.items():
    if not rows:
        continue
    for row in rows[1:]:
        category = (row[0] or '').strip() if len(row) > 0 else ''
        date_s = (row[1] or '').strip() if len(row) > 1 else ''
        title = (row[2] or '').strip() if len(row) > 2 else ''
        remark = (row[3] or '').strip() if len(row) > 3 else ''
        if not title:
            continue
        if re.match(r'^\d{4}', category) and not date_s:
            date_s = category
            category = sheet_name
        full_text = f"{title} {category} {remark}"
        comps = detect_competitor(full_text)
        dims = detect_dimensions(full_text)
        items.append({
            'id': gen_id(title + sheet_name),
            'title': title,
            'url': '',
            'source_doc': SOURCE_URL,
            'source_sheet': sheet_name,
            'type': 'doc',
            'category': category or sheet_name,
            'tags': category.split(',') if category else [],
            'sheet': sheet_name,
            'competitors': comps if comps else ['字节'],
            'dimensions': dims,
            'updated_at': parse_date(date_s) or '2025-01-01',
            'updated_at_raw': date_s,
            'summary': remark or f'{sheet_name} - {category}'.strip(' -'),
            'keywords': list(set(comps + dims + (category.split(',') if category else []) + [sheet_name]))
        })

items.sort(key=lambda x: x['updated_at'], reverse=True)

result = {
    '_meta': {
        'version': '2.0',
        'source': '字节对外文档库 (Kim Doc 表格 fcADdie-9DQzc0MB4sCeBJorF)',
        'source_url': SOURCE_URL,
        'last_updated': __import__('datetime').date.today().isoformat(),
        'total_items': len(items),
        'note': '通过 OBO Token + summarize API 自动同步。重新运行 tools/sync_byte_external_docs.py 即可更新。',
        'sheets_covered': list(all_data.keys()),
    },
    'items': items
}

with open(OUT_FILE, 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"✅ [3/3] 写入 {OUT_FILE}")
print(f"   共 {len(items)} 条文档，覆盖 {len(all_data)} 个 sheet")
