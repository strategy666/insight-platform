"""
sync_feishu_drive.py
====================
飞书空间扫描器：定期把用户飞书云盘里的对外文档同步进 portal。

数据流：
  浏览器（已登录 my.feishu.cn 的 Chrome）
    → 7 个飞书内部 API（my_space / shared / recent / children / pin）
    → 547 条文档元数据（token/name/type/url/edit_time/sources）
    → 本地接收 server (recv_feishu.py)
    → /Users/jiayi/Downloads/feishu_full_scan.json
    → 本脚本合并入 insight-platform/assets/data/feishu_docs.json

使用方法：
  Step A: 启动本地接收 server
    python3 /tmp/recv_feishu.py  (监听 127.0.0.1:9991)
  Step B: 在已登录飞书的 Chrome 打开 DevTools 跑 console 脚本（见 scan_browser_script.js）
  Step C: 运行本脚本
    python3 sync_feishu_drive.py

主要功能：
- 智能分类：基于 title 和 url 判断 主体（字节/快手/腾讯）、维度
- 过滤策略：可选只保留 bytedance.larkoffice + 公司飞书租户（去掉 my.feishu.cn 个人草稿）
- 合并保护：保留 v3 已有的 sheet/category 元数据（按 token 匹配）
- 输出 schema v4.0
"""
import json
import os
import re
import hashlib
from collections import Counter
from datetime import datetime, date

SCAN_FILE = '/Users/jiayi/Downloads/feishu_full_scan.json'
EXISTING_FILE = '/Users/jiayi/Desktop/Work/生服/trae/insight-platform/assets/data/feishu_docs.json'
OUT_FILE = '/Users/jiayi/Desktop/Work/生服/trae/insight-platform/assets/data/feishu_docs.json'

# ---- 数据来源标签 ----
SOURCE_LABEL = {
    'my_space': '我的空间',
    'my_space_folder': '我的空间-文件夹',
    'shared': '共享给我',
    'shared_child': '共享给我-子文档',
    'recent': '最近浏览',
    'pin': '收藏',
    'my_space_child': '我的空间-子文档',
}

# ---- 类型映射 ----
TYPE_TO_PORTAL = {
    'docx': 'docx', 'doc': 'doc', 'sheet': 'sheet', 'mindnote': 'mindnote',
    'mindnote2': 'mindnote', 'mindmap': 'mindnote', 'bitable': 'bitable',
    'slides': 'slides', 'folder': 'folder', 'wiki': 'wiki',
}

# ---- 域名归属 ----
def classify_owner(url):
    if 'bytedance.larkoffice.com' in url or 'bytedance.feishu.cn' in url: return '字节'
    if 'my.feishu.cn' in url or 'www.feishu.cn' in url: return '个人'
    if 'docs.corp.kuaishou.com' in url or 'kuaishou.com' in url: return '快手'
    return '外部'


# ---- 主体识别（按标题关键词）----
def detect_competitor(name, url):
    cs = []
    n = name or ''
    if 'bytedance.larkoffice' in url or re.search(r'抖音|字节|林客|生意经|来客|区域服务商|直营服务商|商服', n):
        cs.append('字节')
    if re.search(r'巨量', n): cs.append('巨量引擎')
    if re.search(r'快手|磁力|聚星', n): cs.append('快手')
    if re.search(r'美团|大众点评', n): cs.append('美团')
    if re.search(r'小红书|蒲公英|薯队长', n): cs.append('小红书')
    if re.search(r'腾讯|视频号|微信|妙问', n): cs.append('腾讯')
    if re.search(r'百度|文心', n): cs.append('百度')
    if re.search(r'淘宝|阿里|天猫', n): cs.append('阿里')
    if re.search(r'联想|Lenovo', n, re.I): cs.append('联想')
    return cs or [classify_owner(url) if classify_owner(url) != '个人' else '字节']


# ---- 维度识别 ----
def detect_dimensions(name):
    dims = []
    n = name or ''
    if re.search(r'激励|返佣|激励政策|奖励|冲量|考核', n): dims.append('激励政策')
    if re.search(r'广告|投放|本地推|流量|创意|红包|UBL|SDPA|线索', n): dims.append('广告产品')
    if re.search(r'达人|网红|KOL|职人|主播|蒲公英|聚星|MCN', n): dims.append('达人/职人')
    if re.search(r'直播|开播|引流|场观|短直一体', n): dims.append('直播')
    if re.search(r'商家|入驻|资质|准入|经营管理', n): dims.append('商家产品')
    if re.search(r'品牌|品宣|节点|大促|活动|招商', n): dims.append('节点策略')
    if re.search(r'数据|经营分|生意经|有数|分析|监控', n): dims.append('数据产品')
    if re.search(r'手册|SOP|攻略|指南|培训|课程|玩法', n): dims.append('运营SOP')
    if re.search(r'代理|服务商|商服|加盟|区域', n): dims.append('服务商体系')
    if re.search(r'AI|智能|算法|大模型|Agent|LLM', n): dims.append('AI能力')
    if re.search(r'酒店|旅游|餐饮|到店|本地生活|连锁', n): dims.append('行业-本地生活')
    return dims if dims else ['其他']


# ---- 是否对外/可对外 ----
def is_external_doc(name, url):
    n = name or ''
    # 个人随手记不算
    if re.search(r'^\s*(Diary|日记|临时|草稿|test|Test)', n): return False
    # 外部链接默认外部
    if 'bytedance.larkoffice' in url: return True
    if classify_owner(url) == '个人' and not re.search(r'对外|生服|商业化|分析|战分|快手', n):
        return False
    return True


# ---- 主流程 ----
def main():
    if not os.path.exists(SCAN_FILE):
        print(f'❌ 找不到扫描数据 {SCAN_FILE}')
        return
    
    scan = json.load(open(SCAN_FILE))
    raw_files = list(scan['all_files'].values())
    print(f'读入飞书扫描 {len(raw_files)} 条 ({scan.get("fetched_at","")})')
    
    # 读旧库（v3 已有元数据 sheet/category/date）
    existing = {}
    if os.path.exists(EXISTING_FILE):
        try:
            old = json.load(open(EXISTING_FILE))
            for it in old.get('items', []):
                # 按 URL 主体 hash 作为 key（旧库无 token）
                base_url = (it.get('url') or '').split('?')[0]
                m = re.search(r'/(docx|doc|sheets|wiki|slides|file|mindnote|bitable)/(\w+)', base_url)
                if m: existing[m.group(2)] = it
        except Exception as e:
            print(f'读旧库失败: {e}')
    print(f'读入旧库 {len(existing)} 条以做合并补元数据')
    
    # 处理每条
    items = []
    skipped = 0
    today = date.today().isoformat()
    
    for f in raw_files:
        name = f.get('name', '').strip()
        url = f.get('url', '').strip()
        type_name = f.get('type_name', 'doc')
        
        if not url or not name:
            skipped += 1
            continue
        if type_name == 'folder':  # folder 不当文档
            skipped += 1
            continue
        
        # 飞书 token = obj_token
        token = f.get('token') or ''
        
        # 取旧库元数据（按 token 或 name 匹配）
        old_meta = existing.get(token) or {}
        for ex_key, ex_v in existing.items():
            if ex_v.get('title') == name:
                old_meta = ex_v
                break
        
        # 时间戳
        edit_ts = f.get('edit_time') or f.get('activity_time') or f.get('create_time')
        edit_iso = ''
        if edit_ts:
            try:
                edit_iso = datetime.fromtimestamp(int(edit_ts)).strftime('%Y-%m-%d')
            except: pass
        
        # 来源 tag
        sources = f.get('sources') or []
        source_labels = [SOURCE_LABEL.get(s.split(':')[0], s) for s in sources]
        
        # 主体 / 维度
        comps = detect_competitor(name, url)
        dims = detect_dimensions(name)
        
        # 类别（沿用旧库 category，否则用第一个维度）
        category = old_meta.get('category') or (dims[0] if dims else '未分类')
        sheet = old_meta.get('sheet') or old_meta.get('source_sheet') or category
        
        # 摘要
        summary = old_meta.get('summary') or f'{sheet} · {edit_iso}' if edit_iso else sheet
        
        items.append({
            'id': 'fs-' + hashlib.md5(url.encode('utf-8')).hexdigest()[:10],
            'token': token,
            'title': name,
            'url': url,
            'source_doc': '',  # 不再回落汇总 Excel
            'source_sheet': sheet,
            'sheet': sheet,
            'type': TYPE_TO_PORTAL.get(type_name, type_name),
            'category': category,
            'owner': classify_owner(url),
            'tags': [category],
            'competitors': comps,
            'dimensions': dims,
            'updated_at': edit_iso or today,
            'updated_at_raw': edit_iso,
            'summary': summary,
            'keywords': list(set(comps + dims + [category, sheet])),
            'source': '飞书空间扫描',
            'source_channel': source_labels,
            'is_external_visible': is_external_doc(name, url),
            'is_pined': f.get('biz_type') == 'pined',
            'wiki_space_name': f.get('wiki_space_name', ''),
        })
    
    # 排序：edit_time 倒序
    items.sort(key=lambda x: x['updated_at'], reverse=True)
    
    # 统计
    print(f'\n生成 {len(items)} 条 (skipped {skipped})')
    print('\n按主体：')
    for k, v in Counter(it['competitors'][0] for it in items).most_common():
        print(f'  {k}: {v}')
    print('\n按维度（首维度）：')
    for k, v in Counter(it['dimensions'][0] for it in items).most_common():
        print(f'  {k}: {v}')
    print('\n按类型：')
    for k, v in Counter(it['type'] for it in items).most_common():
        print(f'  {k}: {v}')
    print('\n按来源渠道：')
    src_counter = Counter()
    for it in items:
        for s in it['source_channel']: src_counter[s] += 1
    for k, v in src_counter.most_common():
        print(f'  {k}: {v}')
    
    result = {
        '_meta': {
            'version': '4.0',
            'source': '用户飞书空间（my.feishu.cn）全量扫描',
            'pipeline': 'browser_agent SSO 抓飞书 7 个 explorer API → 本地 server 落地 → sync_feishu_drive.py 合并',
            'last_scan': scan.get('fetched_at'),
            'last_updated': today,
            'total_items': len(items),
            'apis_used': [
                '/space/api/explorer/v3/my_space/obj/',
                '/space/api/explorer/v3/my_space/folder/',
                '/space/api/explorer/v2/share/folder/list/',
                '/space/api/explorer/recent/list/',
                '/space/api/explorer/v3/children/list/',
                '/space/api/explorer/v3/pin/list/',
            ],
            'note': '所有 URL 都是用户飞书空间里能直接打开的真实文档；可定期重跑',
        },
        'items': items
    }
    
    with open(OUT_FILE, 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'\n✅ 写入 {OUT_FILE}')


if __name__ == '__main__':
    main()
