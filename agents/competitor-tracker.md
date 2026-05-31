# Sub-Agent: competitor-tracker (v4)

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
**国内竞媒官方（SPA 类需走 puppeteer，见下文 SOP）**
- 巨量引擎开放平台 Changelog：https://open.oceanengine.com/changelog/1 · SPA
- 巨量引擎营销学院：https://academy.oceanengine.com/ · SPA
- 腾讯广告官方：https://e.qq.com/ · 微信公众号「腾讯广告」
- 小红书蒲公英：https://www.pugongying.com/ · SPA
- 小红书聚光帮助中心：https://ad.xiaohongshu.com/next_help/docs/* · SPA · ⭐ 27 个行业子规则
- 美团广告平台：https://e.meituan.com/
- 百度营销：https://e.baidu.com/

**海外竞媒官方**
- Meta for Business Blog · Meta Ads Manager Updates · Google Ads Blog · TikTok for Business · Snap for Business

### 政策更新 / 行业 Case 信源
- 巨量引擎政策中心 / 腾讯广告政策 / Meta 广告政策 / Google 广告政策
- 营销新观察 / SocialBeta / 数英网 / 广告门 / Digiday

---

## 🏭 竞对跟踪范围
| 公司 | 重点关注维度 |
|-----|------------|
| 字节/抖音 | 生服产品、巨量引擎算法、政策调整 |
| 小红书 | 聚光物料审核（27行业）、商业化产品、AI能力、组织 |
| 腾讯/微信 | 视频号广告、搜一搜、小程序商业化 |
| 美团 | 本地生活、广告系统、商家政策 |
| 百度 | 搜索广告、文心AI、百度营销 |
| Meta / Google / TikTok | 海外自动化广告、电商化进展 |

---

## 🔬 SPA 深度抓取 SOP（v3 · 强制执行）

### 🚫 反模式（**用户明确批评过 — 不可再犯**）
- ❌ "看一眼首页就结束" — 只抓帮助中心/Changelog 首页或目录页就收工
- ❌ "网站中的任何信息都没有抓取到" — 直接放弃 SPA 不试 puppeteer 渲染
- ❌ 只看 title 不看「更新时间」字段
- ❌ 用 `requests` 抓 Vue/React SPA（返回空 body）

### ✅ 正确流程（**每篇文档必须点进去**）

#### Step A：获取目录全集
1. 用 `fetch_web` 或 `agents/scrapers/deep_scraper.py` 拿入口页（如聚光物料审核根 `7b8f7784f499295fe7a950afe679a523`）
2. 从 HTML 用 `/next_help/docs/([a-f0-9]{32})` 提取所有子 hash
3. **维护 SEED_DOCS 字典**（`agents/scrapers/deep_scraper.py XHS_SEED_DOCS` 已含 24 个聚光行业 hash），保证一次跑完无遗漏

#### Step B：逐篇深度抓取（puppeteer 后端）
- **推荐**：直接跑 `python3 agents/scrapers/deep_scraper.py --target all --days 14 --output assets/data/scrape_result_live.json`
- **后端**：调用 codeflicker reader proxy `https://codeflicker.corp.kuaishou.com/node/api/reader/json?url=...`（真正的 puppeteer 渲染）
- **失败处理**：HTTP 404 → 标记 failed，记入报告，不阻塞流程
- **速率**：每篇间隔 0.4-0.6s，避免触发反爬

#### Step C：多格式日期识别（关键 · v3 实测发现 5 种格式）
| 优先级 | 正则 | 例子 | 来源 |
|---|---|---|---|
| P1 | `更新时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})` | `更新时间：2026-05-29` | 物料审核根 |
| P2 | `调整时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})` | `调整时间：2025-08-12` | 美妆细则 |
| P3 | `发布时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2})` | `发布时间：2026-04-27` | 巨量 Changelog 子页 |
| P4 | `(\d{4}年\d{1,2}月\d{1,2}日)` | `2026年04月27日` | 巨量 Changelog 列表 |
| P5 | `^(\d{4}-\d{1,2}-\d{1,2})$` | `2024-09-19` 独立成行 | 医疗/法律根页 |

**取所有命中日期的最大值作为文档"最近更新时间"**。

#### Step D：时序回溯（用户明确要求）
对命中近 14 天窗口的文档：
1. **diff 旧版本**：对比 `assets/data/scrape_result_live.json` 中上次的 body_snippet
2. **timeline 补充**：把同主题旧文档/旧规则版本日期写入 timeline
3. **So What 必带行业映射**：哪个行业 / 哪类广告主受影响

#### Step E：覆盖率自检（报告必含）
- `total_docs_visited` / `total_docs_in_seed`
- `fetch_failed_hashes`（404 的 hash 列）
- `recent_updates_count`（近14天）
- `no_date_docs`（无任何日期标记的 hash 列，需 diff 兜底）

### 📂 工具与产出
| 文件 | 用途 |
|---|---|
| `agents/scrapers/deep_scraper.py` | **主爬虫**（codeflicker reader proxy 后端），支持 `--target xhs/oceanengine/all` |
| `agents/scrapers/xhs_juguang.py` | 早期 requests 版（已弃用，仅保留正则常量） |
| `assets/data/scrape_result_live.json` | 每周覆写的原始抓取结果 |
| `assets/data/competitor_scrape_status.json` | 跨平台抓取状态总览 |
| `assets/data/competitor_updates.json` | 最终入库的情报（v2 schema） |

### 🌐 同类 SPA 适配
| 平台 | 入口 | SPA? | 日期字段 | 实测 |
|---|---|---|---|---|
| 小红书聚光 | ad.xiaohongshu.com/next_help/docs/* | ✅ | 更新时间 | ✅ 24 篇已收录 |
| 巨量引擎 Changelog | open.oceanengine.com/changelog/1 | ✅ | YYYY年MM月DD日 | ✅ 已收录（244 历史） |
| 蒲公英 | pugongying.com/help | ✅ | 更新时间 | ⏳ |
| 腾讯妙问 | e.qq.com/help | ✅ | 更新日期 | ⏳ |
| 美团广告 | e.meituan.com/page/notice | SSR | 发布日期 | ⏳ |

---

## 📋 每周更新 SOP（v4 总流程）

### Step 1：跑深度爬虫
```bash
cd insight-platform
python3 agents/scrapers/deep_scraper.py --target all --days 14 \
    --output assets/data/scrape_result_live.json
```

### Step 2：把热点入库（依据 scrape_result_live.json `recent` 数组）
对每条命中：
- 分类（产品动态/政策更新/行业case）
- 维度（产品/接入·准入/政策·营销/分账·组织/人事·财报/数据·AI/技术·电商/交易）
- 数据源（飞书内部·竞媒官方·三方媒体），优先级递减
- timeline：补 3-5 个前序节点

### Step 3：写入格式（schema v2）
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
  "sources": [{"name": "来源", "url": "原文链接", "date": "发布日期"}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "前序节点"}]
}
```

### Step 4：更新 _meta 并提交
- `_meta.last_updated = today` / `_meta.total = len(items)`
- git commit: `chore(competitor): weekly update YYYY-MM-DD`

---

## 💰 Token 预算
- 每周深度爬虫（24+1 平台）：~800 token
- 入库 + So What（约 1-5 条/周）：~500 token
- **合计：≤ 1500 token/周**
