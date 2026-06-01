# py39 compat
from __future__ import annotations
#!/usr/bin/env python3
"""
日期失真检测脚本 | Date Anti-Hallucination Audit
==================================================
对 intel.json (Tab1) + competitor_updates.json (Tab2) 中 _verification == 'verified' 的条目，
抓取 source URL 的 HTML，从 meta / JSON-LD / time 标签提取**原文真实发布日期**，
与 item.date 对比：

- 差距 ≤ 30 天 → 通过，打 _date_ok: true
- 差距 > 30 天 → 日期失真，打 _date_mismatch: true + _source_date: "YYYY-MM-DD"
- 抓取失败/超时 → 打 _date_unchecked: true（静默，不误判）

策略：
- 每请求超时 8 秒，中间加 0.3 秒间隔避免被反爬
- 优先匹配 schema.org / Open Graph 结构化日期
- 支持 article:published_time / pubdate / datePublished / time[datetime]
- 缓存到 .date_audit_cache.json，重跑跳过已查条目

使用：
    cd insight-platform && python3 scripts/audit_dates.py           # 全量
    cd insight-platform && python3 scripts/audit_dates.py --sample 5 # 试跑 5 条
    cd insight-platform && python3 scripts/audit_dates.py --dry-run  # 不写回 JSON
"""
import json
import re
import sys
import argparse
import time
import html as html_mod
import urllib.request
import urllib.error
from urllib.parse import urlparse
from collections import Counter
from pathlib import Path
from datetime import datetime, timedelta

# ========== 日期提取引擎 ==========

# 常用中文月份映射
CN_MONTH_MAP = {
    '一月': 1, '二月': 2, '三月': 3, '四月': 4,
    '五月': 5, '六月': 6, '七月': 7, '八月': 8,
    '九月': 9, '十月': 10, '十一月': 11, '十二月': 12,
    '1月': 1, '2月': 2, '3月': 3, '4月': 4, '5月': 5, '6月': 6,
    '7月': 7, '8月': 8, '9月': 9, '10月': 10, '11月': 11, '12月': 12,
}
CN2DIGIT = str.maketrans('０１２３４５６７８９', '0123456789')

MAX_DATE_GAP_DAYS = 30  # 超过此天数视为失真


def normalize_text(s: str) -> str:
    """全角数字→半角，去多余空白"""
    return s.translate(CN2DIGIT).strip()


def try_parse_date(s: str) -> datetime | None:
    """尝试各种日期格式 → datetime 对象（只保留日期，忽略时分秒）"""
    if not s:
        return None
    s = normalize_text(s)
    # 截掉 T/Z/+0800 等时间部分
    s_date, _, _ = s.partition('T')
    s_date = s_date.split(' ')[0].strip()

    formats = [
        '%Y-%m-%d',        # 2025-10-15
        '%Y/%m/%d',        # 2025/10/15
        '%Y年%m月%d日',     # 2025年10月15日
        '%m-%d-%Y',        # 10-15-2025
        '%d/%m/%Y',        # 15/10/2025
        '%m/%d/%Y',        # 10/15/2025
        '%B %d, %Y',       # October 15, 2025
        '%b %d, %Y',       # Oct 15, 2025
        '%d %B %Y',        # 15 October 2025
        '%d %b %Y',        # 15 Oct 2025
        '%Y%m%d',          # 20251015
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s_date, fmt)
            if dt.year < 2015 or dt.year > 2035:
                continue
            return dt
        except ValueError:
            continue
    # 中文月日格式: "2025年10月15日" (已覆盖) / "10月15日"
    m = re.match(r'(\d{1,2})月(\d{1,2})日', s_date)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        now = datetime.now()
        dt = datetime(now.year, month, day)
        # 若月份 > 当前月 → 可能是去年同期（年底跨年场景）
        if dt > now:
            dt = datetime(now.year - 1, month, day)
        return dt
    return None


def extract_dates_from_html(html: str) -> list[datetime]:
    """从未经预处理的 HTML 中提取所有候选日期"""
    dates: list[datetime] = []

    # 1) <meta property="article:published_time" content="...">
    for m in re.finditer(r'article:published_time"\s+content="([^"]+)"', html):
        d = try_parse_date(m.group(1))
        if d:
            dates.append(d)

    # 2) <meta name="pubdate" content="...">
    for m in re.finditer(r'name="pubdate"\s+content="([^"]+)"', html):
        d = try_parse_date(m.group(1))
        if d:
            dates.append(d)

    # 3) JSON-LD: "datePublished":"..."
    for block in re.finditer(r'"datePublished"\s*:\s*"([^"]+)"', html):
        d = try_parse_date(block.group(1))
        if d:
            dates.append(d)

    # 4) <time datetime="..."> (通常包裹日期文本)
    for m in re.finditer(r'<time[^>]*datetime="([^"]+)"[^>]*>', html, re.IGNORECASE):
        d = try_parse_date(m.group(1))
        if d:
            dates.append(d)

    # 5) Open Graph: og:article:published_time
    for m in re.finditer(r'property="og:article:published_time"\s+content="([^"]+)"', html):
        d = try_parse_date(m.group(1))
        if d:
            dates.append(d)

    # 6) schema.org itemprop="datePublished"
    for m in re.finditer(r'itemprop="datePublished"\s+content="([^"]+)"', html):
        d = try_parse_date(m.group(1))
        if d:
            dates.append(d)

    return dates


def fetch_and_extract_date(url: str, timeout: int = 8) -> datetime | None:
    """抓取 URL 并从 HTML 中提取发布日期。返回 None 表示失败。"""
    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                              'KuaishouInsightAudit/1.0 (internal quality checker)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            # 只读前 512KB 足够解析 meta 和 head
            raw = resp.read(512 * 1024)
    except Exception:
        return None

    html = raw.decode('utf-8', errors='replace')
    dates = extract_dates_from_html(html)

    if not dates:
        # 兜底：尝试页面文本中匹配 "202X年...月...日" 等模式（只取第一个匹配）
        fallback = re.findall(r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})\s*日?', html)
        for m in fallback[:5]:
            d = try_parse_date(f'{m[0]}-{m[1].zfill(2)}-{m[2].zfill(2)}')
            if d:
                dates.append(d)

    if not dates:
        return None

    # 去掉极端离谱的（2000 年前 / 2030 年后）
    dates = [d for d in dates if 2015 <= d.year <= 2035]
    if not dates:
        return None

    # 取最早日期（文章发布时间通常最早出现）
    dates.sort()
    return dates[0]


# ========== 主流程 ==========

def audit_file(filepath: Path, label: str, *, limit: int = None, dry_run: bool = False,
               cache: dict = None):
    with filepath.open(encoding='utf-8') as f:
        data = json.load(f)
    items = data.get('items', data) if isinstance(data, dict) else data

    stats = Counter()
    checked = 0

    for it in items:
        if it.get('_verification') != 'verified':
            continue
        if limit is not None and checked >= limit:
            break

        item_date_str = (it.get('date') or '').strip()
        if not item_date_str:
            continue

        item_date = try_parse_date(item_date_str)
        if item_date is None:
            continue

        # 取第一个 source URL
        sources = it.get('sources') or []
        if not sources:
            continue
        source_url = sources[0].get('url', '')
        if not source_url or not source_url.startswith('http'):
            continue

        checked += 1
        cache_key = source_url

        # 读缓存
        if cache is not None and cache_key in cache:
            source_date_str = cache[cache_key]
        else:
            source_date = fetch_and_extract_date(source_url)
            source_date_str = source_date.strftime('%Y-%m-%d') if source_date else None
            if cache is not None:
                cache[cache_key] = source_date_str

        if source_date_str is None:
            it['_date_unchecked'] = True
            it.pop('_date_mismatch', None)
            it.pop('_source_date', None)
            it.pop('_date_ok', None)
            stats['unchecked'] += 1
            print(f'  ⚪ unchecked: {it.get("title","")[:55]}')
            continue

        source_dt = try_parse_date(source_date_str)
        if source_dt is None:
            continue

        gap = abs((item_date - source_dt).days)

        if gap <= MAX_DATE_GAP_DAYS:
            it['_date_ok'] = True
            it.pop('_date_mismatch', None)
            it.pop('_source_date', None)
            it.pop('_date_unchecked', None)
            stats['ok'] += 1
            print(f'  ✅ OK (gap={gap}d): {it.get("title","")[:50]}')
        else:
            it['_date_mismatch'] = True
            it['_source_date'] = source_date_str
            it.pop('_date_ok', None)
            it.pop('_date_unchecked', None)
            stats['mismatch'] += 1
            # 自动降级：将 _verification 从 verified 改为 weak（因为日期误导性强）
            it['_verification'] = 'weak'
            print(f'  🚨 MISMATCH! item.date={item_date_str} source.date={source_date_str} gap={gap}d')
            print(f'     → {it.get("title","")[:70]}')
            print(f'     → {source_url[:80]}')
            print(f'     → _verification 已自动降级为 weak\n')

        time.sleep(0.3)  # 避免触发反爬

    print(f'\n=== {label} ===')
    print(f'total verified checked: {checked}')
    for k in ('ok', 'mismatch', 'unchecked'):
        v = stats[k]
        print(f'  {k:12s}: {v:3d}')
    if stats['mismatch'] > 0:
        print(f'  ⚠️ {stats["mismatch"]} 条日期失真，verification 已降级为 weak')

    if not dry_run:
        with filepath.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return stats


def load_date_cache(p: Path) -> dict:
    if p.exists():
        try:
            return json.load(p.open(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_date_cache(p: Path, cache: dict):
    p.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='日期失真检测')
    ap.add_argument('--sample', type=int, default=0, help='试跑前 N 条')
    ap.add_argument('--dry-run', action='store_true', help='只检测不写回 JSON')
    ap.add_argument('--no-cache', action='store_true', help='不使用缓存，强制全量重抓')
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    cache_path = root / 'scripts/.date_audit_cache.json'

    cache = load_date_cache(cache_path) if not args.no_cache else {}
    limit = args.sample if args.sample else None
    total_stats = Counter()

    print(f'🔍 日期失真检测启动 · 缓存 {"共 " + str(len(cache)) + " 条" if cache else "无"} · '
          f'偏差阈值 >{MAX_DATE_GAP_DAYS}天\n')

    s1 = audit_file(root / 'assets/data/intel.json', 'Tab1 intel.json',
                    limit=limit, dry_run=args.dry_run, cache=cache)
    s2 = audit_file(root / 'assets/data/competitor_updates.json', 'Tab2 competitor_updates.json',
                    limit=limit, dry_run=args.dry_run, cache=cache)

    save_date_cache(cache_path, cache)

    total = sum((s1.get('mismatch', 0) + s2.get('mismatch', 0)) for s in (s1, s2) if s)
    total_ok = sum((s.get('ok', 0) if s else 0) for s in (s1, s2))
    total_unchecked = sum((s.get('unchecked', 0) if s else 0) for s in (s1, s2))

    print(f'\n📊 汇总: {total_ok}✅ 日期正确 | {total}🚨 日期失真(已降级) | {total_unchecked}⚪ 未检出')
    print(f'   缓存: {cache_path}')

    if not args.dry_run:
        print(f'\n✅ 检测完成，{total} 条失真条目已降级为 weak')
        print(f'   建议下一步: python3 scripts/audit_sources.py 复查')