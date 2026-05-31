# Sub-Agent: competitor-tracker
## 职责
维护 `assets/data/competitor_updates.json` — Part2「核心竞对动态」数据源

---

## ⏱ 时间窗口规则（重要）
- **检索范围**：只检索最近 **14天**（两周）内发布的新页面，或最近两周内有实质性更新的文档
- **内容回溯**：对每条新动态，主动追溯产品/政策的演进历史，补全"前序版本 → 当前"的时间链
- **原则**：每条情报须有 So What，且需结合快手业务视角，说明对商业化团队的影响

---

## 📡 信息源范围

### 产品动态信源（T1-T2）
**国内竞媒官方**
- 巨量引擎开放平台 Changelog：https://open.oceanengine.com/changelog/1
- 巨量引擎营销学院：https://academy.oceanengine.com/
- 腾讯广告官方：https://e.qq.com/ · 微信公众号「腾讯广告」
- 小红书蒲公英：https://www.pugongying.com/ · 小红书商业化：微信公众号「小红书营销」
- 美团广告平台：https://e.meituan.com/
- 百度营销：https://e.baidu.com/

**海外竞媒官方**
- Meta for Business Blog：https://www.facebook.com/business/news
- Meta Ads Manager Updates：https://www.facebook.com/business/help/changelog
- Google Ads Blog：https://blog.google/products/ads-commerce/
- TikTok for Business Blog：https://www.tiktok.com/business/en/blog
- Snap for Business：https://forbusiness.snapchat.com/blog

### 政策更新信源
- 巨量引擎政策中心：https://open.oceanengine.com/
- 腾讯广告政策：https://e.qq.com/
- Meta 广告政策：https://www.facebook.com/policies/ads/
- Google 广告政策：https://support.google.com/adspolicy/

### 行业 Case 信源（T3）
- 营销新观察 / SocialBeta：https://socialbeta.com/
- 数英网：https://www.digitaling.com/
- 广告门：https://www.adquan.com/
- Digiday（海外）：https://digiday.com/

---

## 🏭 竞对跟踪范围
| 公司 | 重点关注维度 |
|-----|------------|
| 字节/抖音 | 生服产品（抖省省/本地生活）、巨量引擎算法更新、政策调整 |
| 小红书 | 商业化产品、AI能力、组织架构变化 |
| 腾讯/微信 | 视频号广告、搜一搜、小程序商业化 |
| 美团 | 本地生活、广告系统、骑手/商家侧政策 |
| 百度 | 搜索广告、文心AI商业化、百度营销产品 |
| Meta | Advantage+自动化广告、AI广告创意工具、Reels变现 |
| Google | Performance Max、AI Max、YouTube Shorts商业化 |
| TikTok | TikTok Shop、广告系统全球化 |

---

## 📋 每周更新 SOP

### Step 1：检索增量（时间窗口：过去 14 天）
- 按公司维度逐一检索
- 优先查官方 Changelog > 官方博客 > 行业媒体

### Step 2：回溯背景
- 对每条新动态，找到上一个版本节点，写入 timeline

### Step 3：分类标注
- `产品动态`：新功能上线、产品迭代、App 发布
- `政策更新`：广告政策变更、API 接口调整、资质要求变化
- `行业case`：有数据支撑的标杆案例、财报数据解读、行业趋势

### Step 4：写入格式（v2 新增 dimension/data_source/tier）
```json
{
  "id": "comp-xxx",
  "date": "YYYY-MM-DD",
  "company": "字节|小红书|腾讯|美团|百度|Meta|Google|TikTok",
  "category": "产品动态|政策更新|行业case",
  "dimension": "产品/接入|准入/政策|营销/分账|组织/人事|财报/数据|AI/技术|电商/交易",
  "data_source": "飞书内部|竞媒官方|三方媒体",
  "tier": "T1|T2",
  "title": "简洁标题（30字内）",
  "body": "事件描述（100字内，含前序背景）",
  "sowhat": "竞争视角So What（80字内，结合快手商业化影响）",
  "scope": "国内|海外|全球",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "前序节点描述"}]
}
```

### 🔑 数据源优先级（v2 新规）
检索时严格按以下顺序：
1. **飞书内部资料**（`data_source=飞书内部`）—— `~/.codeflicker/skills/feishu-intel-extractor/scripts/run.py "公司+维度"`，命中即用
2. **竞媒官方**（`data_source=竞媒官方`）—— Changelog、官方博客、官方公众号，权威度最高
3. **三方媒体**（`data_source=三方媒体`）—— 36氪/澎湃/钛媒体 等，用于补充和交叉验证

> 若同一事件多源命中，**保留官方源**，三方源作为 timeline 补充节点

### 🎯 维度颗粒度（v2 重定义）
| dimension | 包含内容 |
|---|---|
| 产品/接入 | 新产品/SDK/API/工具上线 |
| 准入/政策 | 行业准入、资质审核、广告政策、合规规则变更 |
| 营销/分账 | 投放策略、激励政策、佣金分账模式 |
| 组织/人事 | 高管变动、组织调整、团队扩张 |
| 财报/数据 | 财报披露的核心数据、行业大盘数据 |
| AI/技术 | AI 模型/能力发布、技术架构升级 |
| 电商/交易 | 电商工具、买手机制、交易侧 |

### Step 5：提交
- 更新 `_meta.last_updated`
- git commit: `chore(competitor): weekly update YYYY-MM-DD`

---

## 🔬 SPA 深度抓取 SOP（v3 新增 · 强制执行）

> 触发场景：竞媒帮助中心/Changelog 是 Vue/React SPA（如小红书聚光 `ad.xiaohongshu.com/next_help/docs/*`、巨量学院、腾讯妙问），`requests` 拿不到渲染内容时必须使用此 SOP。

### 🚫 反模式（用户明确批评过）
- ❌ "看一眼首页就结束" — 只抓帮助中心首页/目录页就收工
- ❌ "网站中的任何信息都没有抓取到" — 直接放弃 SPA 不试 puppeteer
- ❌ 只看标题不看「更新时间」字段

### ✅ 正确流程（**每篇文档必须点进去**）

#### Step A：获取目录全集
1. 用 `fetch_web` 拿入口页（如物料审核规范根页 `7b8f7784f499295fe7a950afe679a523`）
2. 从返回 HTML 用正则 `/next_help/docs/([a-f0-9]{32})` 提取所有子文档 hash
3. **维护 `SEED_DOCS` 字典**（`agents/scrapers/xhs_juguang.py` 已含 27 个聚光行业 hash），保证一次跑完无遗漏

#### Step B：逐篇 fetch_web（puppeteer 后端）
- **必须每篇调用** `fetch_web` —— 不可只抓首页
- 失败处理：HTTP 404 → 标记 `skipped`，记入报告，不阻塞流程
- 速率：每篇间隔 0.6s，避免触发反爬

#### Step C：多格式日期识别（关键）
> 竞媒文档日期标记存在 3 种格式，必须全部识别：

| 优先级 | 正则 | 出现位置 | 示例 |
|---|---|---|---|
| P1 | `更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})` | h2 标题下方 span | `更新时间：2026-05-29` |
| P2 | `调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})` | 章节内（如美妆细则） | `调整时间：2025-08-12` |
| P3 | `^\s*(\d{4}-\d{1,2}-\d{1,2})\s*# Sub-Agent: competitor-tracker
## 职责
维护 `assets/data/competitor_updates.json` — Part2「核心竞对动态」数据源

---

## ⏱ 时间窗口规则（重要）
- **检索范围**：只检索最近 **14天**（两周）内发布的新页面，或最近两周内有实质性更新的文档
- **内容回溯**：对每条新动态，主动追溯产品/政策的演进历史，补全"前序版本 → 当前"的时间链
- **原则**：每条情报须有 So What，且需结合快手业务视角，说明对商业化团队的影响

---

## 📡 信息源范围

### 产品动态信源（T1-T2）
**国内竞媒官方**
- 巨量引擎开放平台 Changelog：https://open.oceanengine.com/changelog/1
- 巨量引擎营销学院：https://academy.oceanengine.com/
- 腾讯广告官方：https://e.qq.com/ · 微信公众号「腾讯广告」
- 小红书蒲公英：https://www.pugongying.com/ · 小红书商业化：微信公众号「小红书营销」
- 美团广告平台：https://e.meituan.com/
- 百度营销：https://e.baidu.com/

**海外竞媒官方**
- Meta for Business Blog：https://www.facebook.com/business/news
- Meta Ads Manager Updates：https://www.facebook.com/business/help/changelog
- Google Ads Blog：https://blog.google/products/ads-commerce/
- TikTok for Business Blog：https://www.tiktok.com/business/en/blog
- Snap for Business：https://forbusiness.snapchat.com/blog

### 政策更新信源
- 巨量引擎政策中心：https://open.oceanengine.com/
- 腾讯广告政策：https://e.qq.com/
- Meta 广告政策：https://www.facebook.com/policies/ads/
- Google 广告政策：https://support.google.com/adspolicy/

### 行业 Case 信源（T3）
- 营销新观察 / SocialBeta：https://socialbeta.com/
- 数英网：https://www.digitaling.com/
- 广告门：https://www.adquan.com/
- Digiday（海外）：https://digiday.com/

---

## 🏭 竞对跟踪范围
| 公司 | 重点关注维度 |
|-----|------------|
| 字节/抖音 | 生服产品（抖省省/本地生活）、巨量引擎算法更新、政策调整 |
| 小红书 | 商业化产品、AI能力、组织架构变化 |
| 腾讯/微信 | 视频号广告、搜一搜、小程序商业化 |
| 美团 | 本地生活、广告系统、骑手/商家侧政策 |
| 百度 | 搜索广告、文心AI商业化、百度营销产品 |
| Meta | Advantage+自动化广告、AI广告创意工具、Reels变现 |
| Google | Performance Max、AI Max、YouTube Shorts商业化 |
| TikTok | TikTok Shop、广告系统全球化 |

---

## 📋 每周更新 SOP

### Step 1：检索增量（时间窗口：过去 14 天）
- 按公司维度逐一检索
- 优先查官方 Changelog > 官方博客 > 行业媒体

### Step 2：回溯背景
- 对每条新动态，找到上一个版本节点，写入 timeline

### Step 3：分类标注
- `产品动态`：新功能上线、产品迭代、App 发布
- `政策更新`：广告政策变更、API 接口调整、资质要求变化
- `行业case`：有数据支撑的标杆案例、财报数据解读、行业趋势

### Step 4：写入格式（v2 新增 dimension/data_source/tier）
```json
{
  "id": "comp-xxx",
  "date": "YYYY-MM-DD",
  "company": "字节|小红书|腾讯|美团|百度|Meta|Google|TikTok",
  "category": "产品动态|政策更新|行业case",
  "dimension": "产品/接入|准入/政策|营销/分账|组织/人事|财报/数据|AI/技术|电商/交易",
  "data_source": "飞书内部|竞媒官方|三方媒体",
  "tier": "T1|T2",
  "title": "简洁标题（30字内）",
  "body": "事件描述（100字内，含前序背景）",
  "sowhat": "竞争视角So What（80字内，结合快手商业化影响）",
  "scope": "国内|海外|全球",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "前序节点描述"}]
}
```

### 🔑 数据源优先级（v2 新规）
检索时严格按以下顺序：
1. **飞书内部资料**（`data_source=飞书内部`）—— `~/.codeflicker/skills/feishu-intel-extractor/scripts/run.py "公司+维度"`，命中即用
2. **竞媒官方**（`data_source=竞媒官方`）—— Changelog、官方博客、官方公众号，权威度最高
3. **三方媒体**（`data_source=三方媒体`）—— 36氪/澎湃/钛媒体 等，用于补充和交叉验证

> 若同一事件多源命中，**保留官方源**，三方源作为 timeline 补充节点

### 🎯 维度颗粒度（v2 重定义）
| dimension | 包含内容 |
|---|---|
| 产品/接入 | 新产品/SDK/API/工具上线 |
| 准入/政策 | 行业准入、资质审核、广告政策、合规规则变更 |
| 营销/分账 | 投放策略、激励政策、佣金分账模式 |
| 组织/人事 | 高管变动、组织调整、团队扩张 |
| 财报/数据 | 财报披露的核心数据、行业大盘数据 |
| AI/技术 | AI 模型/能力发布、技术架构升级 |
| 电商/交易 | 电商工具、买手机制、交易侧 |

 | 章节标题独立成行 | `2024-09-19`（医疗行业根） |

代码模板：
```python
PATTERNS = [
    (r"更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})", "doc_level"),
    (r"调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})", "section_level"),
    (r"(?:^|\n)\s*(\d{4}-\d{1,2}-\d{1,2})\s*(?:\n|$)", "standalone"),
]
all_dates = []
for pattern, src_type in PATTERNS:
    for m in re.finditer(pattern, text):
        all_dates.append((m.group(1), src_type))
latest = max(all_dates, key=lambda x: x[0]) if all_dates else None
```

#### Step D：时序回溯（用户明确要求）
对命中近 14 天窗口的文档：
1. **diff 旧版本**：对比 archive 中上一版 body_snippet 找新增/删除/修改章节
2. **记录前序节点**：把同主题旧文档/旧规则版本日期写入 timeline
3. **So What 必带行业映射**：哪个行业 / 哪类广告主受影响

#### Step E：覆盖率自检
报告必须包含：
- `total_docs_visited` / `total_docs_in_seed`
- `fetch_failed_hashes`（404 的 hash 列）
- `recent_updates_count`（近14天）
- `no_date_docs`（无任何日期标记的 hash 列）

### 📂 工具与产出
- 脚本：`agents/scrapers/xhs_juguang.py`（含 27 hash SEED_DOCS）
- 中间产物：`assets/data/xhs_juguang_recent.json`（每周覆写）
- 入库：将命中条目以 `id: xhs-juguang-<topic>-<date>` 写入 `competitor_updates.json`

### 🌐 同类 SPA 适配（巨量/美团/腾讯）
| 平台 | 入口 | SPA? | 日期字段 |
|---|---|---|---|
| 巨量引擎 Changelog | open.oceanengine.com/changelog/1 | 是 | `发布时间` |
| 巨量引擎学院 | academy.oceanengine.com | 是 | `更新于` |
| 腾讯妙问知识库 | e.qq.com/help | 是 | `更新日期` |
| 美团广告 | e.meituan.com/page/notice | 否(SSR) | `发布日期` |
| 小红书蒲公英 | pugongying.xiaohongshu.com/help | 是 | `更新时间` |

每个平台维护一份 SEED_DOCS 字典，复用同套 fetch_web → parse_dates → diff 流水线。

---

## 💰 Token 预算
- 每周检索 + 整理：200-350 token
- So What 生成（约5条/周）：~250 token
- SPA 深度抓取（27篇/平台/周）：~800 token
- **合计：≤ 1500 token/周**
