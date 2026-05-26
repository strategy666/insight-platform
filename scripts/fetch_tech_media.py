#!/usr/bin/env python3
"""
36氪/钛媒体/虎嗅 深度抓取脚本
从首页进入文章列表，抓取最近文章的完整内容
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta
from pathlib import Path
from bs4 import BeautifulSoup

# 配置
REPORTS_DIR = Path(__file__).parent.parent / "reports" / "tech_media"
INTEL_JSON_PATH = Path(__file__).parent.parent / "assets" / "data" / "intel.json"

# 媒体配置
MEDIA_SOURCES = [
    {
        "name": "36氪",
        "base_url": "https://36kr.com",
        "api_url": "https://gateway.36kr.com/api/mis/nav/home/page/feed",
        "keywords": ["广告", "营销", "AI", "本地生活", "抖音", "快手", "字节", "腾讯"]
    },
    {
        "name": "钛媒体",
        "base_url": "https://www.tmtpost.com",
        "list_url": "https://www.tmtpost.com/channel/7",
        "keywords": ["广告", "营销", "AI", "本地生活", "互联网"]
    },
    {
        "name": "虎嗅",
        "base_url": "https://www.huxiu.com",
        "api_url": "https://www.huxiu.com/v2_api/info/infoList",
        "keywords": ["广告", "营销", "AI", "本地生活"]
    }
]

# 关键词
KEYWORDS = [
    "字节", "抖音", "TikTok", "快手", "腾讯", "小红书", "美团", "百度",
    "广告", "营销", "投放", "AI", "人工智能", "大模型",
    "本地生活", "生活服务", "线索广告", "电商", "短视频"
]

def fetch_36kr_articles(days=7):
    """抓取36氪最近N天的文章"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    articles = []
    
    try:
        # 36氪的 API（需要根据实际情况调整）
        params = {
            "partner_id": "web",
            "timestamp": int(time.time() * 1000),
            "param": json.dumps({"pageSize": 20, "pageNo": 1})
        }
        
        resp = requests.get(MEDIA_SOURCES[0]["api_url"], params=params, headers=headers, timeout=10)
        data = resp.json()
        
        for item in data.get("data", {}).get("itemList", []):
            title = item.get("widgetTitle", "")
            url = f"https://36kr.com/p/{item.get('itemId')}"
            date = item.get("publishTime", "")
            
            # 关键词过滤
            if any(kw in title for kw in KEYWORDS):
                articles.append({
                    "source": "36氪",
                    "title": title,
                    "url": url,
                    "date": date
                })
    except Exception as e:
        print(f"❌ 36氪抓取失败: {e}")
    
    return articles

def fetch_tmtpost_articles(days=7):
    """抓取钛媒体最近N天的文章"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    articles = []
    
    try:
        resp = requests.get(MEDIA_SOURCES[1]["list_url"], headers=headers, timeout=10)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 找文章列表（根据实际页面结构调整）
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            title = link.get_text(strip=True)
            
            # 钛媒体文章链接格式：/文章ID.html
            if href.startswith('/') and title and any(kw in title for kw in KEYWORDS):
                articles.append({
                    "source": "钛媒体",
                    "title": title,
                    "url": MEDIA_SOURCES[1]["base_url"] + href,
                    "date": datetime.now().strftime("%Y-%m-%d")
                })
    except Exception as e:
        print(f"❌ 钛媒体抓取失败: {e}")
    
    return articles[:10]  # 最多10条

def fetch_article_content(url):
    """抓取文章完整内容"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 尝试找到文章内容（通用选择器）
        content_div = (
            soup.find('article') or
            soup.find('div', class_='article-content') or
            soup.find('div', class_='content') or
            soup.find('div', id='content')
        )
        
        if content_div:
            # 提取前500字作为摘要
            text = content_div.get_text(strip=True)
            return {
                "summary": text[:500],
                "full_text": text
            }
    except Exception as e:
        print(f"  ⚠️  抓取内容失败: {e}")
    
    return {"summary": "", "full_text": ""}

def save_article_to_file(article):
    """保存文章为 Markdown 文件"""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    date = article.get("date", datetime.now().strftime("%Y-%m-%d"))
    source = article.get("source", "未知")
    title = article.get("title", "未命名").replace("/", "-")[:100]
    filename = f"{date}_{source}_{title}.md"
    filepath = REPORTS_DIR / filename
    
    content = f"""---
title: {article.get('title', '未命名')}
date: {date}
source: {source}
url: {article.get('url', '')}
---

# {article.get('title', '未命名')}

**发布日期**: {date}  
**来源**: {source}

## 摘要

{article.get('summary', '暂无摘要')}

---

**来源链接**: {article.get('url', '')}
"""
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return filepath

def main():
    print("🚀 开始深度抓取行业媒体文章...")
    
    all_articles = []
    
    # 1. 36氪
    print("\n📡 正在抓取【36氪】...")
    articles_36kr = fetch_36kr_articles(days=7)
    print(f"✅ 找到 {len(articles_36kr)} 篇相关文章")
    all_articles.extend(articles_36kr)
    
    # 2. 钛媒体
    print("\n📡 正在抓取【钛媒体】...")
    articles_tmtpost = fetch_tmtpost_articles(days=7)
    print(f"✅ 找到 {len(articles_tmtpost)} 篇相关文章")
    all_articles.extend(articles_tmtpost)
    
    print(f"\n📊 共找到 {len(all_articles)} 篇相关文章")
    
    if not all_articles:
        print("✅ 无新增文章")
        return
    
    # 3. 抓取文章内容并保存
    saved_count = 0
    for article in all_articles[:10]:  # 最多保存10篇
        print(f"\n📥 下载: {article['title'][:50]}...")
        
        # 抓取完整内容
        content = fetch_article_content(article['url'])
        article.update(content)
        
        # 保存文件
        save_article_to_file(article)
        saved_count += 1
        time.sleep(2)  # 防止请求过快
    
    print(f"\n🎉 完成！共保存 {saved_count} 篇文章")
    print(f"📁 文章保存位置：{REPORTS_DIR}")

if __name__ == "__main__":
    main()
