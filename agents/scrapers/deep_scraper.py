#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用竞媒深度爬虫（CodeFlicker Reader Proxy 后端）
===================================================
解决问题：原 xhs_juguang.py 用 requests 抓 SPA 拿不到渲染内容（用户痛点：
"网站中的任何信息都没有抓取到"）。

核心机制：调用 codeflicker.corp.kuaishou.com 的 puppeteer reader API：
    GET /node/api/reader/json?url=<encoded>
返回：{title, content (markdown), html, originContent, ...}

支持多平台：
  • 小红书聚光（27个行业子规则 SPA）
  • 巨量引擎 Changelog（SPA）
  • 美团广告（SSR）
  • 蒲公英（SPA）

日期识别（3种格式）：
  1. 更新时间：YYYY-MM-DD
  2. 调整时间：YYYY-MM-DD
  3. 独立日期行 YYYY-MM-DD

使用：
    python3 deep_scraper.py --target xhs --days 14
    python3 deep_scraper.py --target oceanengine --days 14
    python3 deep_scraper.py --target all --output ./scrape_all.json
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

# ============ codeflicker reader proxy ============
READER_API = "https://codeflicker.corp.kuaishou.com/node/api/reader/json"

# ============ 日期识别正则（3 种格式） ============
DATE_PATTERNS = [
    (re.compile(r"更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})"), "doc_level"),
    (re.compile(r"调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})"), "section_level"),
    (re.compile(r"发布时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})"), "publish"),
    (re.compile(r"(?:^|\n)\s*(\d{4}年\d{1,2}月\d{1,2}日)\s*", re.M), "cn_standalone"),
    (re.compile(r"(?:^|\n)\s*(\d{4}-\d{1,2}-\d{1,2})\s*(?:\n|$)"), "standalone"),
]

# ============ XHS 聚光 27 个种子 ============
XHS_SEED_DOCS = {
    "7b8f7784f499295fe7a950afe679a523": "物料审核规范根目录",
    "be8301efc43f80ebaa4fd8068307cd1d": "跨境广告内容规范",
    "1794f60d090022444946117a9e6d5a6a": "生活服务行业规则",
    "65dea622e108f4c68bd4bd2479aa5e8a": "法律服务行业规则",
    "6117bf512c8fe1cd9ef71d5d7bbe759f": "母婴行业规则",
    "71c37fc5fe93f0f4dc57d87925850491": "互联网行业规则",
    "e8260d1972e535cc82b1ce13f02ff277": "宠物生活行业规则",
    "9c44232f1fa7bbfaf32ac9970ab51430": "医疗行业规则",
    "1437abc0298b01a96a70cdc44c2f9677": "房地产行业规则",
    "264651226720b74d708571c90b6d7849": "金融行业规则",
    "1c36a1c68aa181fa420af9bf705864ce": "教育行业规则",
    "6e794e2bc37536b6b9207ab9afe1f44c": "食品行业规则",
    "df173c9b71d37e0dc996d37e2ccef246": "时尚行业投放规则",
    "e1e4c4a427c9d64279102ef3d6f72be2": "家居百货投放规则",
    "1b4e9536563a6d915f41a70773e779eb": "商务服务行业",
    "c2e9ab95e10523544d84c19891a43f3d": "户外运动行业",
    "16756bdb73cedfa540ab300770911e2e": "网络工具行业",
    "60bd8fa2d729f8341ef3e945683725dd": "游戏行业",
    "de9d18dad91d52320a4f71d76363f96f": "游戏组件审核规范",
    "bc02f3b463fd7ee3d7c650b6f3768b29": "旅游酒店行业",
    "7d1caa7fec3f67913903b7a2143f0442": "通信行业",
    "6540352e667258ba615bdf6f36ace1a5": "出版传媒行业",
    "fd85631260c47770321522f31cc71b58": "3C及电器行业",
    "763a604c737e5dda6fbb6f32042a12aa": "汽车及用品行业",
}

XHS_BASE = "https://ad.xiaohongshu.com/next_help/docs/"
OE_CHANGELOG = "https://open.oceanengine.com/changelog/1"


def reader_fetch(url: str, timeout: int = 30) -> dict | None:
    """调用 codeflicker reader proxy 拿渲染后内容。"""
    params = urllib.parse.urlencode({"url": url})
    api = f"{READER_API}?{params}"
    try:
        req = urllib.request.Request(api, headers={
            "User-Agent": "Mozilla/5.0 deep_scraper",
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data
    except Exception as e:
        print(f"   ⚠️  reader_fetch failed: {e}", file=sys.stderr)
        return None


def extract_dates(text: str) -> list[tuple[str, str]]:
    """从文本提取所有日期标记，返回 [(YYYY-MM-DD, source_type), ...]"""
    results = []
    for pattern, src_type in DATE_PATTERNS:
        for m in pattern.finditer(text):
            raw = m.group(1)
            # 中文日期归一化
            norm = re.sub(r"年|月", "-", raw).rstrip("日")
            # 补 0
            try:
                d = datetime.strptime(norm, "%Y-%m-%d").date()
                results.append((d.isoformat(), src_type))
            except ValueError:
                continue
    return results


def parse_xhs_doc(content: str, title: str) -> dict:
    """解析聚光帮助中心 doc"""
    dates = extract_dates(content)
    latest = max(dates, key=lambda x: x[0]) if dates else (None, None)
    # 去除左侧目录噪音（前 16 行通常是目录）
    lines = content.split("\n")
    body = "\n".join(lines[16:]) if len(lines) > 20 else content
    return {
        "title": title.replace("聚光帮助中心-", ""),
        "update_date": latest[0],
        "date_source": latest[1],
        "all_dates": [{"date": d, "source": s} for d, s in dates],
        "body_snippet": body[:800],
        "total_chars": len(content),
    }


def parse_oe_changelog(content: str) -> dict:
    """解析巨量引擎 Changelog（首页含最新更新+历史日期列表）"""
    dates = extract_dates(content)
    latest = max(dates, key=lambda x: x[0]) if dates else (None, None)
    return {
        "title": "巨量引擎开放平台 Changelog",
        "update_date": latest[0],
        "all_dates_count": len(dates),
        "latest_5": [d for d, _ in sorted(set([(d, s) for d, s in dates]), reverse=True)[:5]],
        "body_snippet": content[:1000],
        "total_chars": len(content),
    }


def scrape_xhs(days: int = 14) -> dict:
    """抓取 XHS 聚光 24+ 篇文档"""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    print(f"\n🎯 [XHS] 聚光帮助中心：{len(XHS_SEED_DOCS)} 篇 · 截止 ≥ {cutoff}\n")
    results = []
    failed = []
    for i, (h, label) in enumerate(XHS_SEED_DOCS.items(), 1):
        url = XHS_BASE + h
        print(f"  [{i}/{len(XHS_SEED_DOCS)}] {label}", end=" ... ", flush=True)
        data = reader_fetch(url)
        if not data or not data.get("content"):
            print("❌ FAIL")
            failed.append({"hash": h, "label": label, "url": url})
            time.sleep(0.5)
            continue
        parsed = parse_xhs_doc(data["content"], data.get("title", label))
        parsed["hash"] = h
        parsed["url"] = url
        parsed["label"] = label
        ud = parsed["update_date"]
        if ud:
            in_win = ud >= cutoff
            tag = "🔥 HOT" if in_win else "  "
            print(f"{tag}  {ud}  ({parsed['date_source']})")
        else:
            print("   无日期")
        results.append(parsed)
        time.sleep(0.4)
    recent = [r for r in results if r["update_date"] and r["update_date"] >= cutoff]
    return {
        "platform": "xiaohongshu_juguang",
        "visited": len(results),
        "failed": failed,
        "recent_count": len(recent),
        "recent": recent,
        "all_docs": results,
        "cutoff": cutoff,
    }


def scrape_oceanengine(days: int = 14) -> dict:
    """抓取巨量引擎 Changelog 首页（含最新一条详情+历史日期索引）"""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    print(f"\n🎯 [OE] 巨量引擎 Changelog · 截止 ≥ {cutoff}\n")
    data = reader_fetch(OE_CHANGELOG)
    if not data or not data.get("content"):
        return {"platform": "oceanengine", "error": "fetch_failed"}
    parsed = parse_oe_changelog(data["content"])
    parsed["url"] = OE_CHANGELOG
    ud = parsed["update_date"]
    in_win = ud and ud >= cutoff
    tag = "🔥 HOT" if in_win else "🕐 NO_RECENT"
    print(f"  {tag}  latest={ud}  ·  history_dates={parsed['all_dates_count']}")
    print(f"  最近5次: {parsed['latest_5']}")
    return {
        "platform": "oceanengine",
        "latest_date": ud,
        "in_window": bool(in_win),
        "data": parsed,
        "cutoff": cutoff,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["xhs", "oceanengine", "all"], default="all")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--output", type=str, default="./scrape_result.json")
    args = ap.parse_args()

    output = {
        "_meta": {
            "scraped_at": datetime.now().isoformat(),
            "today": date.today().isoformat(),
            "days_window": args.days,
            "scraper": "agents/scrapers/deep_scraper.py",
            "backend": "codeflicker reader proxy (puppeteer)",
        },
        "platforms": {},
    }
    if args.target in ("xhs", "all"):
        output["platforms"]["xiaohongshu_juguang"] = scrape_xhs(args.days)
    if args.target in ("oceanengine", "all"):
        output["platforms"]["oceanengine"] = scrape_oceanengine(args.days)

    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"\n✅ 完成 → {args.output}")

    # 汇总热点
    hot = []
    if "xiaohongshu_juguang" in output["platforms"]:
        for r in output["platforms"]["xiaohongshu_juguang"].get("recent", []):
            hot.append(f"  🔥 [XHS] {r['update_date']} · {r['label']}")
    if "oceanengine" in output["platforms"]:
        oe = output["platforms"]["oceanengine"]
        if oe.get("in_window"):
            hot.append(f"  🔥 [OE] {oe['latest_date']} · Changelog")
    if hot:
        print(f"\n🔥 14天窗口热点：\n" + "\n".join(hot))
    else:
        print("\n🕐 无 14 天窗口内热点")


if __name__ == "__main__":
    main()
