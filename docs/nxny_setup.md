# nxny.com 抓取脚本使用指南

## 📝 功能说明

`scripts/fetch_nxny_reports.py` 脚本用于每周自动抓取 nxny.com 行研报告库中与互联网/广告/AI/本地生活相关的报告，并自动加入到 `intel.json` 情报库中。

---

## 🔧 初次配置（只需一次）

### Step 1: 登录 nxny.com 并获取 Cookie

1. 在浏览器打开 https://www.nxny.com
2. 使用账号登录：
   - 账号：jasperyuecui@163.com
   - 密码：Lvxuemeng520!

3. 登录成功后，打开浏览器开发者工具（按 `F12` 或右键"检查"）
4. 切换到 **Network** 标签页
5. 刷新页面（`Cmd+R` 或 `Ctrl+R`）
6. 在 Network 列表中找到任意请求（通常是第一个），点击
7. 在右侧面板找到 **Headers** → **Request Headers** → **Cookie**
8. 复制完整的 Cookie 字符串（类似这样）：

```
PHPSESSID=abc123def456; user_token=xyz789; _ga=GA1.2.123456789.1234567890; ...
```

### Step 2: 保存 Cookie 到本地文件

```bash
# 在终端运行（替换 YOUR_COOKIE_HERE 为实际的 cookie）
echo 'YOUR_COOKIE_HERE' > ~/.nxny_cookie.txt
```

**示例**：

```bash
echo 'PHPSESSID=abc123; user_token=xyz789' > ~/.nxny_cookie.txt
```

### Step 3: 验证 Cookie 文件

```bash
cat ~/.nxny_cookie.txt
```

应该能看到刚才保存的 cookie 字符串。

---

## 🚀 使用方法

### 手动运行抓取（测试）

```bash
cd /Users/jiayi/Desktop/Work/生服/trae/insight-platform
python3 scripts/fetch_nxny_reports.py
```

**预期输出**：

```
🚀 开始抓取 nxny.com 行研报告...
✅ Cookie 已加载
📡 正在抓取报告列表...
📊 共找到 23 篇报告
🔍 过滤后剩余 8 篇相关报告

📥 下载报告: 2026年中国互联网广告市场研究报告
✅ 已保存报告：2026-05-15_2026年中国互联网广告市场研究报告.md

...

📝 正在更新 intel.json...
✅ 已追加 8 条新情报到 intel.json

🎉 完成！共保存 8 篇报告
```

### 加入每周自动任务

编辑 `scripts/daily_sync_and_publish.sh`，加入 nxny 抓取步骤：

```bash
#!/bin/bash
# ... 原有代码 ...

# Step 3: 抓取 nxny.com 行研报告（每周一次）
if [ "$(date +%u)" -eq 1 ]; then  # 仅周一执行
    echo "📡 抓取 nxny.com 行研报告..."
    python3 scripts/fetch_nxny_reports.py >> logs/nxny_sync.log 2>&1
fi

# ... 后续步骤 ...
```

---

## 🔍 工作原理

1. **读取 Cookie**：从 `~/.nxny_cookie.txt` 加载登录凭证
2. **抓取列表**：获取最近 14 天的报告列表
3. **关键词过滤**：只保留包含以下关键词的报告：
   - 互联网、广告、营销、AI、人工智能
   - 本地生活、生活服务、短视频、直播、电商
   - 抖音、快手、小红书、腾讯、字节、Meta、Google、TikTok 等
4. **下载报告**：逐个下载报告详情
5. **保存文件**：报告保存到 `reports/nxny/YYYY-MM-DD_报告标题.md`
6. **更新 JSON**：提取摘要自动加入 `assets/data/intel.json`

---

## 📂 输出文件

### 1. Markdown 报告文件

路径：`reports/nxny/2026-05-15_报告标题.md`

格式示例：

```markdown
---
title: 2026年中国互联网广告市场研究报告
date: 2026-05-15
source: nxny.com
author: 艾瑞咨询
tags: 互联网, 广告, 市场规模
---

# 2026年中国互联网广告市场研究报告

**发布日期**: 2026-05-15  
**来源**: nxny.com  
**作者**: 艾瑞咨询

## 摘要

...

## 核心观点

...
```

### 2. intel.json 条目

自动加入到 `assets/data/intel.json`：

```json
{
  "id": "intel-nxny-12345",
  "date": "2026-05-15",
  "title": "[行研] 2026年中国互联网广告市场研究报告",
  "tldr": "2026年中国互联网广告市场规模达6500亿元，同比增长12%...",
  "priority": "mid",
  "signal": "neutral",
  "tags": ["#行研报告", "#nxny", "#互联网", "#广告"],
  "company": [],
  "tracks": [],
  "metrics": {},
  "takeaway": [...],
  "sowhat_for_kuaishou": "",
  "timeline": [],
  "related_ids": [],
  "sources": [...]
}
```

---

## ⚠️ 常见问题

### Q1: 提示"Cookie 文件不存在"

**原因**：未创建 `~/.nxny_cookie.txt` 文件

**解决**：按照 Step 2 创建文件

### Q2: 提示"登录失败"或"权限不足"

**原因**：Cookie 已过期

**解决**：重新在浏览器登录，获取新的 cookie 并更新文件

### Q3: 抓取列表为空

**原因**：最近 14 天无新增报告，或脚本中的 API 接口需要调整

**解决**：检查 nxny.com 网站结构是否变化，可能需要更新脚本中的 API 地址

### Q4: 如何修改关键词过滤规则？

编辑 `scripts/fetch_nxny_reports.py`，修改 `KEYWORDS` 列表：

```python
KEYWORDS = [
    "互联网", "广告", "营销", "AI", "人工智能",
    # 在这里添加更多关键词
]
```

---

## 📋 下一步

1. ✅ 初次配置：按照上面 Step 1-3 保存 cookie
2. 🧪 测试运行：手动执行一次脚本
3. ⏰ 加入自动任务：编辑 `daily_sync_and_publish.sh`
4. 🔄 定期检查：每月检查一次 cookie 是否过期

---

## 🆘 技术支持

如遇到脚本报错，请查看日志：

```bash
cat logs/nxny_sync.log
```

或手动运行脚本查看详细错误信息。
