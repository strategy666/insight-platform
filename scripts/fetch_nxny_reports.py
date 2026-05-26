#!/usr/bin/env python3
"""
nxny.com 行研报告抓取脚本（关键词过滤版）
只抓取与互联网/AI/科技相关的报告
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

# 配置
BASE_URL = "https://www.nxny.com"
COOKIE_FILE = os.path.expanduser("~/.nxny_cookie.txt")
REPORTS_DIR = Path(__file__).parent.parent / "reports" / "nxny"
INTEL_JSON_PATH = Path(__file__).parent.parent / "assets" / "data" / "intel.json"

# 关键词过滤（只抓取相关报告）
KEYWORDS = [
    # 互联网公司
    "字节", "抖音", "TikTok", "快手", "腾讯", "微信", "视频号", "小红书",
    "阿里", "淘宝", "京东", "拼多多", "美团", "饿了么", "滴滴",
    "百度", "爱奇艺", "B站", "哔哩哔哩", "网易", "搜狐", "新浪",
    
    # AI/科技
    "AI", "人工智能", "大模型", "ChatGPT", "GPT", "OpenAI", "Kimi",
    "豆包", "文心", "Claude", "Gemini", "Llama", "机器学习", "深度学习",
    
    # 互联网广告/营销
    "广告", "营销", "投放", "效果广告", "品牌广告", "程序化", "DSP",
    "信息流", "短视频营销", "直播带货", "种草", "转化", "ROI",
    
    # 赛道
    "本地生活", "生活服务", "O2O", "即时零售", "外卖", "到店到家",
    "线索广告", "教育", "医疗", "金融科技", "Fintech",
    "电商", "社交电商", "内容电商", "直播电商",
    "短视频", "直播", "MCN", "网红经济", "创作者经济",
    
    # 科技
    "互联网", "移动互联网", "数字化", "云计算", "SaaS", "大数据",
    "5G", "物联网", "IoT", "元宇宙", "VR", "AR", "XR"
]

def load_cookie():
    """从文件读取 cookie"""
    if not os.path.exists(COOKIE_FILE):
        print(f"❌ Cookie 文件不存在：{COOKIE_FILE}")
        print(f"\n💡 请先运行：cat ~/.nxny_cookie.txt 确认 cookie 已保存")
        sys.exit(1)
    
    with open(COOKIE_FILE, 'r') as f:
        cookie = f.read().strip()
    
    if not cookie:
        print(f"❌ Cookie 文件为空：{COOKIE_FILE}")
        sys.exit(1)
    
    return cookie

def fetch_category_list(cookie, category="/stype_hy/", page=1):
    """抓取某个分类的报告列表（行业研究/宏观策略）"""
    headers = {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    url = f"{BASE_URL}{category}?page={page}"
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        resp.encoding = 'utf-8'
        return resp.text
    except Exception as e:
        print(f"❌ 抓取列表失败 ({category}): {e}")
        return None

def parse_reports_from_html(html):
    """从 HTML 解析报告列表"""
    soup = BeautifulSoup(html, 'html.parser')
    reports = []
    
    # 找到报告列表（根据网站结构调整选择器）
    # nxny.com 的结构：通常在 <ul class="report-list"> 或类似结构
    for link in soup.find_all('a', href=True):
        href = link.get('href', '')
        title = link.get_text(strip=True)
        
        # 只保留报告详情链接（通常是 /baogao/数字/ 或 /info/数字/）
        if '/baogao/' in href or '/info/' in href:
            reports.append({
                'title': title,
                'url': BASE_URL + href if href.startswith('/') else href,
                'date': datetime.now().strftime("%Y-%m-%d")  # 需要从页面提取
            })
    
    return reports

def filter_reports_by_keywords(reports):
    """根据关键词过滤报告"""
    filtered = []
    for report in reports:
        title = report.get("title", "")
        
        # 检查标题是否包含任何关键词
        if any(kw in title for kw in KEYWORDS):
            filtered.append(report)
            print(f"  ✅ 匹配: {title[:50]}...")
    
    return filtered

def download_report(report_url, cookie):
    """下载单个报告内容"""
    headers = {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    try:
        resp = requests.get(report_url, headers=headers, timeout=10)
        resp.raise_for_status()
        resp.encoding = 'utf-8'
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 提取报告内容（根据实际页面结构调整）
        content = soup.find('div', class_='content') or soup.find('article')
        
        return {
            'html': resp.text,
            'content': content.get_text(strip=True) if content else "",
            'summary': content.get_text(strip=True)[:500] if content else ""
        }
    except Exception as e:
        print(f"❌ 下载报告失败: {e}")
        return None

def save_report_to_file(report):
    """保存报告为 Markdown 文件"""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    date = report.get("date", datetime.now().strftime("%Y-%m-%d"))
    title = report.get("title", "未命名报告").replace("/", "-")[:100]
    filename = f"{date}_{title}.md"
    filepath = REPORTS_DIR / filename
    
    content = f"""---
title: {report.get('title', '未命名')}
date: {date}
source: nxny.com
url: {report.get('url', '')}
---

# {report.get('title', '未命名')}

**发布日期**: {date}  
**来源**: nxny.com (股票报告网)

## 摘要

{report.get('summary', '暂无摘要')}

---

**来源链接**: {report.get('url', '')}
"""
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✅ 已保存报告：{filename}")
    return filepath

def main():
    print("🚀 开始抓取 nxny.com 行研报告（关键词过滤）...")
    
    # 1. 加载 cookie
    cookie = load_cookie()
    print(f"✅ Cookie 已加载")
    
    # 2. 抓取行业研究和宏观策略两个分类
    categories = [
        ("/stype_hy/", "行业研究"),
        ("/stype_hc/", "宏观策略")
    ]
    
    all_reports = []
    
    for cat_path, cat_name in categories:
        print(f"\n📡 正在抓取【{cat_name}】分类...")
        html = fetch_category_list(cookie, cat_path, page=1)
        
        if not html:
            continue
        
        reports = parse_reports_from_html(html)
        print(f"📊 找到 {len(reports)} 篇报告")
        
        # 关键词过滤
        filtered = filter_reports_by_keywords(reports[:20])  # 只看前20条
        all_reports.extend(filtered)
    
    print(f"\n🔍 关键词过滤后剩余 {len(all_reports)} 篇相关报告")
    
    if not all_reports:
        print("✅ 无新增相关报告")
        return
    
    # 3. 保存报告（简化版，只保存元信息）
    saved_count = 0
    for report in all_reports[:5]:  # 最多保存5篇
        save_report_to_file(report)
        saved_count += 1
        time.sleep(1)
    
    print(f"\n🎉 完成！共保存 {saved_count} 篇报告")
    print(f"📁 报告保存位置：{REPORTS_DIR}")

if __name__ == "__main__":
    main()
