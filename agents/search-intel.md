# Sub-Agent: search-intel
## 职责
维护 `assets/data/intel.json` — Part1「市场信息检索」数据源

---

## ⏱ 时间窗口规则（重要）
- **检索范围**：只检索最近 **14天**（两周）内发布的新页面，或最近两周内有实质性更新的文档
- **内容回溯**：对每条增量事件，主动检索该事件的前序信息，补全时间线背景（如：两周内发布了某新功能，则回溯该产品/功能的历史版本节点）
- **目标**：情报条目需有时间序列感，读者能从单条内容了解"从哪来 → 发生了什么 → 对我们意味着什么"

---

## 📡 信息源范围

### 国内竞媒官方（T1）
- 字节/抖音：https://www.bytedance.com/zh/ · https://www.douyin.com/
- 巨量引擎：https://www.oceanengine.com/ · 开放平台 changelog：https://open.oceanengine.com/changelog/1
- 小红书：https://www.xiaohongshu.com/
- 腾讯广告：https://e.qq.com/ · 腾讯投资者关系：https://www.tencent.com/zh-cn/investors.html
- 美团：https://ir.meituan.com/zh-CN/ · 美团广告：https://e.meituan.com/
- 百度营销：https://e.baidu.com/ · 百度投资者关系：https://ir.baidu.com/

### 海外竞媒官方（T1）
- Meta / Facebook Ads：https://www.facebook.com/business/news · Meta IR：https://investor.fb.com/
- Google Ads / YouTube：https://ads.google.com/intl/zh-CN/home/resources/ · Google IR：https://abc.xyz/investor/
- TikTok for Business：https://www.tiktok.com/business/en/ · ByteDance Global：https://www.bytedance.com/en/
- X (Twitter) Ads：https://business.twitter.com/en/blog.html
- Snap Ads：https://forbusiness.snapchat.com/blog
- Pinterest Ads：https://business.pinterest.com/en/blog/

### 国内外 AI 大模型公司（T1-T2）
- OpenAI：https://openai.com/blog · https://openai.com/news/
- Anthropic：https://www.anthropic.com/news
- Google DeepMind：https://deepmind.google/discover/blog/
- 百度文心：https://wenxin.baidu.com/ · 飞桨：https://www.paddlepaddle.org.cn/
- 阿里通义：https://tongyi.aliyun.com/ · 阿里云AI：https://www.aliyun.com/
- 字节豆包：https://www.doubao.com/
- 腾讯混元：https://hunyuan.tencent.com/
- 讯飞星火：https://xinghuo.xfyun.cn/
- 月之暗面 Kimi：https://kimi.moonshot.cn/
- 智谱 GLM：https://zhipuai.cn/
- Mistral AI：https://mistral.ai/news/
- xAI (Grok)：https://x.ai/blog

### 头部科技公司（T1）
- 英伟达 NVIDIA：https://www.nvidia.com/en-us/about-nvidia/investor-relations/ · NVIDIA Blog：https://blogs.nvidia.com/
- 特斯拉：https://ir.tesla.com/ · Tesla AI：https://www.tesla.com/AI
- Apple：https://www.apple.com/newsroom/
- Microsoft：https://news.microsoft.com/ · Azure AI：https://azure.microsoft.com/en-us/blog/
- Amazon AWS：https://aws.amazon.com/blogs/aws/
- Salesforce：https://www.salesforce.com/news/

### 行业媒体—国内（T3）
- 36氪：https://36kr.com/
- 虎嗅：https://www.huxiu.com/
- 晚点LatePost：https://www.latepost.com/
- 澎湃新闻：https://www.thepaper.cn/
- 21经济网：https://www.21jingji.com/
- 新浪财经：https://finance.sina.com.cn/
- 界面新闻：https://www.jiemian.com/
- 钛媒体：https://www.tmtpost.com/

### 行业媒体—海外（T3）
- TechCrunch：https://techcrunch.com/
- The Verge：https://www.theverge.com/
- Wired：https://www.wired.com/
- Bloomberg Technology：https://www.bloomberg.com/technology
- Financial Times Tech：https://www.ft.com/technology
- Marketing Week：https://www.marketingweek.com/
- Digiday：https://digiday.com/

### 数据平台（T5）
- QuestMobile：https://www.questmobile.com.cn/
- 易观分析：https://www.analysys.cn/
- iResearch：https://www.iresearch.com.cn/
- Sensor Tower：https://sensortower.com/blog
- App Annie / data.ai：https://www.data.ai/en/insights/

---

## 🏭 行业覆盖范围
参考 https://weekly.dcapapp.com 的分类拓展：
- **商业化/广告**：广告投放、营销技术、效果广告
- **生活服务**：到店、到家、酒旅、外卖
- **AI**：大模型、AI应用、AI广告工具、AI Agent
- **线索广告**：教育、金融、汽车、房产线索
- **医疗**：医美、口腔、男科、妇科
- **本地服务**：生美、招盟、便民服务
- **电商**：内容电商、直播带货
- **科技/硬件**：AI硬件、算力、端侧AI

---

## 📋 每周更新 SOP

### Step 1：检索增量
- 时间窗口：过去 14 天
- 检索关键词矩阵：[公司名] × [主题词]
  - 公司：字节/抖音/TikTok、小红书/Rednote、腾讯/微信/视频号、美团、百度、Meta、Google、OpenAI、NVIDIA
  - 主题：商业化、广告、营销、AI、大模型、新功能、财报、政策、组织

### Step 2：回溯背景
- 对每条增量，检索该产品/事件的历史节点（最多3条前序事件）
- 写入 `timeline` 字段，格式：`"YYYY-MM 事件A → YYYY-MM 事件B → YYYY-MM-DD 本次事件"`

### Step 3：核验
- 仅收录有原文链接的公开信息
- 不收录未经证实的传言、单一来源的爆料（需至少2家媒体交叉验证）

### Step 4：写入格式
```json
{
  "id": "intel-xxx",
  "date": "YYYY-MM-DD",
  "title": "简洁标题（30字内）",
  "body": "背景事实（150字内，含前序背景+本次增量）",
  "sowhat": "商业视角So What（100字内，结合快手竞争视角，有数据支撑更好）",
  "company": ["字节|小红书|腾讯|美团|百度|Meta|Google|OpenAI|NVIDIA"],
  "industry": ["生活服务|AI|线索广告|医疗|本地服务|电商|科技"],
  "type": "产品动态|政策更新|财报数据|组织动态|技术发布|行业数据",
  "timeline": "2025-XX 前序背景 → 2026-XX 事件演进 → 2026-MM-DD 本次",
  "scope": "国内|海外|全球",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}]
}
```

### Step 5：提交
- 更新 `_meta.last_updated`
- git commit: `chore(intel): weekly update YYYY-MM-DD`

---

## 💰 Token 预算
- 每周检索 + 整理：300-500 token
- So What 生成（约5条/周）：~300 token
- **合计：≤ 800 token/周**
