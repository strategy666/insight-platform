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

### Step 4：写入格式
```json
{
  "id": "comp-xxx",
  "date": "YYYY-MM-DD",
  "company": "字节|小红书|腾讯|美团|百度|Meta|Google|TikTok",
  "category": "产品动态|政策更新|行业case",
  "title": "简洁标题（30字内）",
  "body": "事件描述（100字内，含前序背景）",
  "sowhat": "竞争视角So What（80字内，结合快手商业化影响）",
  "scope": "国内|海外|全球",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}]
}
```

### Step 5：提交
- 更新 `_meta.last_updated`
- git commit: `chore(competitor): weekly update YYYY-MM-DD`

---

## 💰 Token 预算
- 每周检索 + 整理：200-350 token
- So What 生成（约5条/周）：~250 token
- **合计：≤ 600 token/周**
