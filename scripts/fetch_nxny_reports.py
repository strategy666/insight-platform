#!/usr/bin/env python3
"""
nxny.com 行研报告抓取脚本
用途：每周自动抓取 nxny.com 网站上与互联网/广告/AI/本地生活相关的行研报告
使用方法：
  1. 首次运行前，需要手动登录 nxny.com 获取 cookie
  2. 将 cookie 写入 ~/.nxny_cookie.txt 文件
  3. 运行：python3 scripts/fetch_nxny_reports.py

输出：
  - reports/nxny/YYYY-MM-DD_报告标题.md
  - 报告摘要会自动加入 intel.json
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta
from pathlib import Path

# 配置
BASE_URL = "https://www.nxny.com"
COOKIE_FILE = os.path.expanduser("~/.nxny_cookie.txt")
REPORTS_DIR = Path(__file__).parent.parent / "reports" / "nxny"
INTEL_JSON_PATH = Path(__file__).parent.parent / "assets" / "data" / "intel.json"

# 关键词过滤（只抓取相关报告）
KEYWORDS = [
    "互联网", "广告", "营销", "AI", "人工智能", "本地生活", "生活服务",
    "短视频", "直播", "电商", "抖音", "快手", "小红书", "腾讯", "字节",
    "Meta", "Google", "TikTok", "ChatGPT", "OpenAI", "百度", "阿里"
]

def load_cookie():
    """从文件读取 cookie"""
    if not os.path.exists(COOKIE_FILE):
        print(f"❌ Cookie 文件不存在：{COOKIE_FILE}")
        print("\n📝 使用方法：")
        print("1. 在浏览器登录 https://www.nxny.com")
        print("2. 打开开发者工具 (F12) → Network → 刷新页面")
        print("3. 找到任意请求 → Headers → Cookie → 复制完整 cookie 字符串")
        print(f"4. 将 cookie 写入文件：echo 'your_cookie_here' > {COOKIE_FILE}")
        sys.exit(1)
    
    with open(COOKIE_FILE, 'r') as f:
        cookie = f.read().strip()
    
    if not cookie:
        print(f"❌ Cookie 文件为空：{COOKIE_FILE}")
        sys.exit(1)
    
    return cookie

def fetch_reports_list(cookie, page=1, days=14):
    """抓取报告列表"""
    headers = {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    # TODO: 替换为实际的 nxny.com API 接口（需要你提供网站结构）
    # 示例：假设有一个报告列表接口
    url = f"{BASE_URL}/api/reports?page={page}&days={days}"
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"❌ 抓取报告列表失败：{e}")
        return None

def filter_reports(reports):
    """根据关键词过滤报告"""
    filtered = []
    for report in reports:
        title = report.get("title", "")
        summary = report.get("summary", "")
        
        # 检查标题或摘要是否包含关键词
        if any(kw in title or kw in summary for kw in KEYWORDS):
            filtered.append(report)
    
    return filtered

def download_report(report_id, cookie):
    """下载单个报告内容"""
    headers = {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    # TODO: 替换为实际的报告详情接口
    url = f"{BASE_URL}/api/report/{report_id}"
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"❌ 下载报告失败 (ID: {report_id}): {e}")
        return None

def save_report_to_file(report):
    """保存报告为 Markdown 文件"""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    date = report.get("date", datetime.now().strftime("%Y-%m-%d"))
    title = report.get("title", "未命名报告").replace("/", "-")
    filename = f"{date}_{title}.md"
    filepath = REPORTS_DIR / filename
    
    content = f"""---
title: {report.get('title', '未命名')}
date: {date}
source: nxny.com
author: {report.get('author', '未知')}
tags: {', '.join(report.get('tags', []))}
---

# {report.get('title', '未命名')}

**发布日期**: {date}  
**来源**: nxny.com  
**作者**: {report.get('author', '未知')}

## 摘要

{report.get('summary', '暂无摘要')}

## 核心观点

{report.get('key_points', '暂无核心观点')}

## 数据亮点

{report.get('metrics', '暂无数据')}

## 完整报告

{report.get('content', '暂无内容')}

---

**来源链接**: {BASE_URL}/report/{report.get('id')}
"""
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✅ 已保存报告：{filename}")
    return filepath

def extract_intel_from_report(report):
    """从报告中提取情报条目（生成 intel.json 格式）"""
    return {
        "id": f"intel-nxny-{report.get('id')}",
        "date": report.get('date', datetime.now().strftime("%Y-%m-%d")),
        "title": f"[行研] {report.get('title', '未命名')}",
        "tldr": report.get('summary', '')[:100],  # 摘要前100字作为tldr
        "priority": "mid",  # 默认中优先级
        "signal": "neutral",
        "tags": ["#行研报告", "#nxny"] + [f"#{tag}" for tag in report.get('tags', [])],
        "company": [],
        "tracks": [],
        "metrics": {},
        "takeaway": report.get('key_points', '').split('\n')[:3],  # 前3条要点
        "sowhat_for_kuaishou": "",  # 需要人工补充
        "timeline": [],
        "related_ids": [],
        "sources": [{
            "name": f"nxny.com - {report.get('title')}",
            "url": f"{BASE_URL}/report/{report.get('id')}",
            "date": report.get('date', datetime.now().strftime("%Y-%m-%d"))
        }]
    }

def main():
    print("🚀 开始抓取 nxny.com 行研报告...")
    
    # 1. 加载 cookie
    cookie = load_cookie()
    print(f"✅ Cookie 已加载")
    
    # 2. 抓取最近14天的报告列表
    print("📡 正在抓取报告列表...")
    reports_data = fetch_reports_list(cookie, page=1, days=14)
    
    if not reports_data:
        print("❌ 未获取到报告数据")
        sys.exit(1)
    
    reports = reports_data.get("reports", [])
    print(f"📊 共找到 {len(reports)} 篇报告")
    
    # 3. 过滤相关报告
    filtered_reports = filter_reports(reports)
    print(f"🔍 过滤后剩余 {len(filtered_reports)} 篇相关报告")
    
    if not filtered_reports:
        print("✅ 无新增相关报告")
        return
    
    # 4. 下载并保存报告
    saved_count = 0
    intel_items = []
    
    for report_meta in filtered_reports:
        report_id = report_meta.get("id")
        print(f"\n📥 下载报告: {report_meta.get('title')}")
        
        report = download_report(report_id, cookie)
        if not report:
            continue
        
        # 保存为文件
        save_report_to_file(report)
        
        # 提取情报条目
        intel_item = extract_intel_from_report(report)
        intel_items.append(intel_item)
        
        saved_count += 1
        time.sleep(1)  # 防止请求过快
    
    # 5. 更新 intel.json
    if intel_items:
        print(f"\n📝 正在更新 intel.json...")
        with open(INTEL_JSON_PATH, 'r', encoding='utf-8') as f:
            intel_data = json.load(f)
        
        # 追加新条目（去重）
        existing_ids = {item['id'] for item in intel_data['items']}
        new_items = [item for item in intel_items if item['id'] not in existing_ids]
        
        if new_items:
            intel_data['items'].extend(new_items)
            intel_data['_meta']['last_updated'] = datetime.now().strftime("%Y-%m-%d")
            
            with open(INTEL_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(intel_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 已追加 {len(new_items)} 条新情报到 intel.json")
        else:
            print("ℹ️  所有报告已存在于 intel.json 中")
    
    print(f"\n🎉 完成！共保存 {saved_count} 篇报告")

if __name__ == "__main__":
    main()
