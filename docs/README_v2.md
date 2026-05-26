# 📊 商业化洞察平台 v2.0 使用说明

## 🎯 本次升级核心变化

### 1. **结构重组**（2栏模式）

| 旧版 Part | 新版 Tab | 说明 |
|-----------|----------|------|
| Part1 市场信息检索 | Tab1 市场洞察 | 升级为多维筛选卡片流，包含原Part1+Part3 |
| Part2 竞对信息 | Tab2 竞对追踪 | 保持，UI优化 |
| Part3 行业赛道 | **融入 Tab1** | 作为"赛道筛选器"，不再独立展示 |
| （新增）Part4 信源管理 | Tab3 信源管理 | 56个信源清单 + 健康度监控 |

### 2. **数据结构升级**（intel.json 新增字段）

```json
{
  "id": "intel-007",
  "date": "2026-05-18",
  "title": "百度 Q1 广告收入跌破半壁江山",
  
  // ===== 新增字段 =====
  "tldr": "百度搜索广告同比-22%，AI云收入首次反超广告",  // 1句话摘要
  "priority": "high",                                      // high/mid/low
  "signal": "opportunity",                                 // opportunity/neutral/threat
  "tags": ["#财报", "#AI", "#搜索广告", "#国内"],           // 多维标签
  "tracks": ["AI", "线索广告"],                            // 赛道（原industry）
  "metrics": {                                             // 关键数字（结构化）
    "广告收入": "126亿元",
    "同比": "-22%",
    "AI业务占比": ">50%"
  },
  "takeaway": [                                            // 3条核心要点
    "搜索广告核心盘被AI搜索自我蚕食",
    "AI原生营销服务尚未形成新增量",
    "线索广告主预算可能向短视频迁移"
  ],
  "sowhat_for_kuaishou": "百度走弱释放线索广告主预算...",  // 对快手的启示
  "timeline": [                                            // 结构化时间线（数组）
    {"date": "2025-Q4", "event": "百度搜索广告占比持续下滑"},
    {"date": "2026-05-18", "event": "Q1财报发布"}
  ],
  "related_ids": ["intel-008", "intel-010"],               // 关联条目ID
  
  // ===== 原有字段 =====
  "company": ["百度"],
  "sources": [...]
}
```

### 3. **前端交互升级**

#### 本周关键（自动置顶）
- 自动提取 `priority: high` 的前 3 条
- 大卡片展示，突出 tldr + tags + signal

#### 多维筛选器
- **优先级**：🔴 高 / 🟡 中 / 🟢 低
- **信号**：🟢 机会 / 🟡 中性 / 🔴 威胁
- **赛道**：本地生活 / AI / 线索广告 / 电商 / 出海
- **公司**：字节 / 腾讯 / 小红书 / 百度 / 美团 / OpenAI / Google
- **关键词搜索**：全文检索

#### 卡片流设计（仿 dcapapp）
- 每张卡片显示：tldr + tags + metrics + 优先级/信号 badge
- 默认折叠，点击"查看详情"展开：
  - 核心要点（takeaway）
  - 对快手启示（sowhat_for_kuaishou）
  - 结构化时间线（timeline）
  - 信息来源（sources）

---

## 🚀 快速上手

### 访问地址

**线上地址**：https://strategy666.github.io/insight-platform/

### 首页概览

1. **Hero 看板**：
   - 情报条目数
   - 高优先级数
   - 跟踪公司数
   - 信息源数

2. **本周关键**：自动展示 Top 3 高优先级情报

3. **筛选器**：按优先级/信号/赛道/公司多维筛选

4. **情报卡片流**：瀑布流布局，1屏4-6条

### 使用场景示例

#### 场景1：查看本周高优先级情报

1. 打开首页
2. 直接查看"本周关键"区域的 3 张大卡片
3. 点击"查看详情"展开完整信息

#### 场景2：筛选"本地生活"赛道的所有情报

1. 在筛选器中点击"赛道" → "本地生活"
2. 卡片流自动过滤，只显示该赛道相关情报

#### 场景3：搜索"百度"相关情报

1. 在顶部搜索框输入"百度"
2. 卡片流实时过滤，显示标题/tldr/tags 中包含"百度"的条目

#### 场景4：查看某家竞对的产品动态

1. 切换到"竞对追踪" Tab
2. 点击公司名称 Tab（如"字节"）
3. 查看该公司的时间线动态

---

## 📡 信息源说明

### 56 个信息源分布

| 类别 | 数量 | 用途 |
|------|------|------|
| **Part1 市场信息检索信源** | 25+ | 国内外竞媒官方 + AI大模型公司 + 头部科技公司 |
| **Part2 竞对产品/政策/Case** | 15+ | 产品动态信源 + 政策信源 + 行业Case媒体 |
| **Part3 行业媒体** | 11+ | 国内垂类媒体 + 海外科技媒体 + dcapapp |
| **Part4 赛道专项检索** | 7 | 生活服务/线索广告/医疗/本地服务/AI/电商/科技 |

**查看完整清单**：[sources.md](../sources.md)

### 新增信源：nxny.com 行研报告库

- **网站**：https://www.nxny.com
- **账号**：jasperyuecui@163.com
- **用途**：每周自动抓取互联网/广告/AI相关行研报告
- **配置指南**：[docs/nxny_setup.md](nxny_setup.md)

⚠️ **首次使用前需配置 cookie**，参考 [nxny_setup.md](nxny_setup.md)

---

## 🛠 维护指南

### 每周更新流程

#### 自动更新（推荐）

已配置 GitHub Actions 自动任务，每周一 08:00 自动执行：

```bash
scripts/daily_sync_and_publish.sh
```

**自动流程**：
1. 从 Kim Doc 同步信源清单 (`sources.md`)
2. 执行 sub-agent 抓取最近 14 天情报
3. 抓取 nxny.com 行研报告（如已配置 cookie）
4. 提交到 GitHub 并自动部署

#### 手动更新

```bash
cd /Users/jiayi/Desktop/Work/生服/trae/insight-platform

# 1. 同步信源清单（从 Kim Doc）
bash scripts/sync_sources_from_kim.sh

# 2. 抓取情报（需要你提供新的检索任务描述）
# 或者手动编辑 assets/data/intel.json 和 competitor_updates.json

# 3. （可选）抓取 nxny.com 报告
python3 scripts/fetch_nxny_reports.py

# 4. 提交并部署
git add -A
git commit -m "data: weekly update $(date +%Y-%m-%d)"
git push origin main
```

### 手动补充情报条目

编辑 `assets/data/intel.json`，按以下模板添加：

```json
{
  "id": "intel-xxx",
  "date": "2026-05-26",
  "title": "...",
  "tldr": "一句话摘要（不超过100字）",
  "priority": "high",
  "signal": "opportunity",
  "tags": ["#标签1", "#标签2"],
  "company": ["公司名"],
  "tracks": ["赛道名"],
  "metrics": {
    "关键指标1": "数值",
    "关键指标2": "数值"
  },
  "takeaway": [
    "要点1",
    "要点2",
    "要点3"
  ],
  "sowhat_for_kuaishou": "对快手的启示...",
  "timeline": [
    {"date": "YYYY-MM-DD", "event": "事件描述"}
  ],
  "related_ids": ["intel-xxx"],
  "sources": [
    {"name": "来源名称", "url": "https://...", "date": "YYYY-MM-DD"}
  ]
}
```

**必填字段**：`id`, `date`, `title`, `tldr`, `priority`, `signal`, `tags`, `company`, `tracks`, `sources`

**可选字段**：`metrics`, `takeaway`, `sowhat_for_kuaishou`, `timeline`, `related_ids`

---

## 🎨 优化建议（已实现）

| 优化维度 | 实现方式 |
|----------|----------|
| **结构化**  | 2栏（市场洞察 + 竞对追踪），移除冗余 Part3 |
| **颗粒度**  | 加 tldr/takeaway/metrics/timeline 字段 |
| **多维标签** | tags（财报/产品/政策/AI/出海等） |
| **优先级**  | priority（high/mid/low） + signal（机会/中性/威胁） |
| **信息密度** | 卡片瀑布流，1屏4-6条标题，点击展开详情 |
| **检索**    | 多标签筛选 + 时间范围 + 优先级 + 公司多选 |
| **追溯**    | timeline 结构化（数组），可视化展示 |
| **赛道视图** | 融入筛选器，自动聚合该赛道的所有条目 |
| **情绪标记** | signal（机会/中性/威胁），量化对快手影响 |

---

## 📞 常见问题

### Q1: 如何查看某条情报的完整详情？

点击卡片底部的"查看详情"按钮，会展开：
- 核心要点（takeaway）
- 对快手启示（sowhat_for_kuaishou）
- 时间线（timeline）
- 信息来源（sources）

### Q2: 如何筛选多个条件组合？

筛选器支持多条件叠加，例如：
1. 先选"优先级" → "高"
2. 再选"赛道" → "本地生活"
3. 结果：只显示"高优先级 + 本地生活赛道"的情报

### Q3: 如何查看某个赛道的所有情报？

在"市场洞察" Tab 的筛选器中，点击对应赛道按钮即可。

### Q4: 如何添加新的信息源？

1. 编辑 `sources.md`，按格式添加新信源
2. 同步到 Kim Doc：https://docs.corp.kuaishou.com/d/home/fcAAoE2eWZ9oZFNrZB9qJaYpz
3. 下次自动更新时会生效

### Q5: nxny.com 的报告如何查看原文？

报告原文保存在 `reports/nxny/` 目录下的 Markdown 文件中。

---

## 🔗 相关链接

- **线上地址**：https://strategy666.github.io/insight-platform/
- **GitHub 仓库**：https://github.com/strategy666/insight-platform
- **Kim Doc 信源清单**：https://docs.corp.kuaishou.com/d/home/fcAAoE2eWZ9oZFNrZB9qJaYpz
- **nxny.com 配置指南**：[docs/nxny_setup.md](nxny_setup.md)

---

## 📋 TODO（后续优化）

- [ ] nxny.com 脚本：补充实际的 API 接口地址（需要分析网站结构）
- [ ] 数据可视化：加入趋势图（如"本周新增情报数""高优先级占比"等）
- [ ] 导出功能：支持导出 PDF/Excel 报告
- [ ] 移动端优化：响应式布局进一步优化
- [ ] AI 摘要：对每个赛道生成 AI 周报摘要

---

**更新时间**：2026-05-26  
**版本**：v2.0  
**维护者**：strategy666
