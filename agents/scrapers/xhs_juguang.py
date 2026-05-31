#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小红书聚光帮助中心深度抓取脚本
============================================
任务：递归爬取 ad.xiaohongshu.com/next_help/docs 目录下的所有文档，
     提取「更新时间」字段，筛选最近 N 天有更新的文档，并截取正文。

⚠️ 重要：聚光帮助中心是 Vue SPA，requests 拿到的是 SSR 兜底（标题/链接），
   完整正文与「更新时间」字段需 puppeteer 渲染。
   在 codeflicker 环境中应使用 fetch_web 工具串行调用，本脚本作为
   parse_doc 解析器复用（接受已渲染的 HTML 即可）。

用法：
    # A. 本地 requests 模式（只能拿目录/标题，日期可能缺失）
    python3 xhs_juguang.py [--days 14] [--output ./xhs_recent.json]

    # B. codeflicker 模式（推荐）：见 agents/competitor-tracker.md §SPA 深度抓取 SOP
       由 Agent 调用 fetch_web → 把 HTML 喂给 parse_doc → 写入 competitor_updates.json

日期识别（3 种格式）：
    1. 更新时间：YYYY-MM-DD（主格式）
    2. 调整时间：YYYY-MM-DD（章节级，如美妆细则）
    3. 独立日期行 YYYY-MM-DD（如医疗/法律行业根页）
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# 聚光帮助中心入口（任意一篇文档进入即可加载左侧完整目录）
ROOT_URL = "https://ad.xiaohongshu.com/next_help/docs/7b8f7784f499295fe7a950afe679a523"
BASE = "https://ad.xiaohongshu.com"

# 已知一级章节列表（人工梳理，避免 SPA 抓不到目录）
KNOWN_ROOTS = {
    "新手必看": None,  # TODO 待补 hash
    "广告投放": None,
    "投放工具": None,
    "数据查看": None,
    "营销专题": None,
    "相关信息": None,
    "聚光用户登陆投放常见问题": None,
    "广告投放行业相关术语": None,
    "聚光投放平台简介": None,
    "财务管理": None,
    "入驻审核规范": None,
    "物料审核规范": "7b8f7784f499295fe7a950afe679a523",  # ⭐ 已知入口
    "广告投放违规处理规范": None,
    "行业专区（成长品牌）": None,
    "廉洁合作政策": None,
}

# 已知子文档 hash → 标题（从 fetch_web 解析得到）
SEED_DOCS = {
    "7b8f7784f499295fe7a950afe679a523": "物料审核规范",
    "8dc5bd9c45c9a90cb9912f3400d43f92": "内容审核规则总则",
    "be8301efc43f80ebaa4fd8068307cd1d": "跨境广告内容规范",
    "487806c95d01990f787b9e26070a5b75": "美妆行业规则",
    "1794f60d090022444946117a9e6d5a6a": "生活服务行业规则&投放规则",
    "65dea622e108f4c68bd4bd2479aa5e8a": "法律服务行业规则&投放规则",
    "6117bf512c8fe1cd9ef71d5d7bbe759f": "母婴行业规则&投放规则",
    "71c37fc5fe93f0f4dc57d87925850491": "互联网行业规则",
    "e8260d1972e535cc82b1ce13f02ff277": "宠物生活行业规则",
    "9c44232f1fa7bbfaf32ac9970ab51430": "医疗行业规则&投放规则",
    "f3dc3b2109ee60b467484b3aec438268": "生活服务-情感咨询-广告物料投放规则",
    "1437abc0298b01a96a70cdc44c2f9677": "房地产行业规则&投放规则",
    "264651226720b74d708571c90b6d7849": "金融行业规则",
    "1c36a1c68aa181fa420af9bf705864ce": "教育行业规则",
    "6e794e2bc37536b6b9207ab9afe1f44c": "食品行业规则&投放规则",
    "df173c9b71d37e0dc996d37e2ccef246": "时尚行业投放规则",
    "e1e4c4a427c9d64279102ef3d6f72be2": "家居百货投放规则",
    "1b4e9536563a6d915f41a70773e779eb": "商务服务行业投放规则",
    "c2e9ab95e10523544d84c19891a43f3d": "户外运动行业投放规则",
    "16756bdb73cedfa540ab300770911e2e": "网络工具行业投放规则",
    "60bd8fa2d729f8341ef3e945683725dd": "游戏行业投放规则",
    "de9d18dad91d52320a4f71d76363f96f": "游戏组件审核规范",
    "bc02f3b463fd7ee3d7c650b6f3768b29": "旅游酒店行业投放规则",
    "7d1caa7fec3f67913903b7a2143f0442": "通信行业投放规则",
    "6540352e667258ba615bdf6f36ace1a5": "出版传媒行业投放规则",
    "fd85631260c47770321522f31cc71b58": "3C及电器行业规则",
    "763a604c737e5dda6fbb6f32042a12aa": "汽车及用品行业规则",
}

DATE_RE = re.compile(r"更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})")
DATE_RE_ADJUST = re.compile(r"调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})")
# 独立日期行：在 section header（h2/h3）下方紧跟纯日期段落（如医疗/法律页）
DATE_RE_STANDALONE = re.compile(r"(?:^|\n)\s*(\d{4}-\d{1,2}-\d{1,2})\s*(?:\n|$)")
DATE_PATTERNS = [
    (DATE_RE, "doc_level"),
    (DATE_RE_ADJUST, "section_level_adjust"),
    (DATE_RE_STANDALONE, "standalone"),
]
DOC_HASH_RE = re.compile(r"/next_help/docs/([a-f0-9]{32})")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": ROOT_URL,
}


def fetch(url: str, retry: int = 2) -> str | None:
    """获取页面 HTML（注意：SPA 内容由 JS 渲染，requests 拿到的是 SSR 兜底）"""
    for i in range(retry + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.text
            print(f"  ⚠️  HTTP {resp.status_code} for {url[:80]}", file=sys.stderr)
        except Exception as e:
            print(f"  ⚠️  Retry {i+1}: {e}", file=sys.stderr)
            time.sleep(1)
    return None


def discover_links(html: str) -> set[str]:
    """从 HTML 提取所有 /next_help/docs/{hash} 链接"""
    return set(DOC_HASH_RE.findall(html or ""))


def parse_doc(html: str) -> dict:
    """从单篇文档 HTML 抽取标题、更新时间、正文摘要

    日期识别支持 3 种格式：
    1. 更新时间：YYYY-MM-DD（主格式，h2 下方 span）
    2. 调整时间：YYYY-MM-DD（章节级，如美妆细则）
    3. 独立日期行 YYYY-MM-DD（如医疗/法律行业根页）
    返回 update_date = 所有命中日期中的最大值（最近一次更新）
    """
    soup = BeautifulSoup(html, "html.parser")
    # 标题在 h2 / breadcrumb
    title = ""
    h2 = soup.find("h2")
    if h2:
        title = h2.get_text(strip=True)
    # 正文（去掉左侧目录的关键词噪音）
    editor = soup.find(attrs={"id": "sdk-box"})
    body_text = editor.get_text("\n", strip=True) if editor else soup.get_text("\n", strip=True)
    # 多格式日期识别
    all_dates: list[tuple[str, str]] = []
    for pattern, src_type in DATE_PATTERNS:
        for m in pattern.finditer(body_text):
            all_dates.append((m.group(1), src_type))
    update_date = None
    date_source = None
    if all_dates:
        # 取最大日期作为文档最近更新时间
        latest = max(all_dates, key=lambda x: x[0])
        update_date, date_source = latest
    body_snippet = body_text[:600] if body_text else ""
    return {
        "title": title,
        "update_date": update_date,
        "date_source": date_source,
        "all_dates_found": [{"date": d, "source": s} for d, s in all_dates],
        "body_snippet": body_snippet,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14, help="过滤近 N 天")
    ap.add_argument("--output", type=str, default="./xhs_recent.json")
    ap.add_argument("--sleep", type=float, default=0.6, help="每篇请求间隔")
    args = ap.parse_args()

    cutoff = date.today() - timedelta(days=args.days)
    print(f"🎯 抓取目标：小红书聚光帮助中心 · 近 {args.days} 天更新")
    print(f"   截止日期: ≥ {cutoff.isoformat()}\n")

    visited: dict[str, dict] = {}
    queue: list[str] = list(SEED_DOCS.keys())

    while queue:
        h = queue.pop(0)
        if h in visited:
            continue
        url = f"{BASE}/next_help/docs/{h}"
        print(f"📄 [{len(visited)+1}/{len(SEED_DOCS)+len(queue)}] {SEED_DOCS.get(h, h[:8])}")
        html = fetch(url)
        if not html:
            visited[h] = {"url": url, "error": "fetch_failed"}
            continue
        parsed = parse_doc(html)
        parsed["url"] = url
        parsed["hash"] = h
        # 发现新链接，加入队列
        for new_h in discover_links(html):
            if new_h not in visited and new_h not in queue and new_h not in SEED_DOCS:
                queue.append(new_h)
        visited[h] = parsed
        ud = parsed.get("update_date")
        if ud:
            ud_d = datetime.strptime(ud, "%Y-%m-%d").date()
            tag = "🔥 NEW" if ud_d >= cutoff else "  "
            print(f"     {tag}  更新时间: {ud}  ·  标题: {parsed['title'][:30]}")
        else:
            print(f"        无更新时间字段  ·  标题: {parsed.get('title','')[:30]}")
        time.sleep(args.sleep)

    # 输出报告
    recent = []
    for h, info in visited.items():
        ud = info.get("update_date")
        if not ud:
            continue
        try:
            if datetime.strptime(ud, "%Y-%m-%d").date() >= cutoff:
                recent.append(info)
        except ValueError:
            continue
    recent.sort(key=lambda x: x["update_date"], reverse=True)

    out = {
        "meta": {
            "scraped_at": datetime.now().isoformat(),
            "source": ROOT_URL,
            "total_docs_visited": len(visited),
            "recent_docs_count": len(recent),
            "cutoff_date": cutoff.isoformat(),
            "days_window": args.days,
        },
        "recent_updates": recent,
        "all_docs": list(visited.values()),
    }
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n✅ 完成！共访问 {len(visited)} 篇，近 {args.days} 天更新 {len(recent)} 篇")
    print(f"   📂 结果: {args.output}")
    print(f"\n🔥 近 {args.days} 天有更新的文档:")
    for r in recent:
        print(f"   {r['update_date']}  ·  {r['title'][:40]}  ·  {r['url']}")


if __name__ == "__main__":
    main()
