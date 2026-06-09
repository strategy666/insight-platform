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

### AI 前沿周报 / 媒体（P2 — 阅读参考级）
- 腾讯研究院AI速递：微信公众号 → 腾讯研究院 → AI速递专栏（每周一推送）
- 机器之心：https://www.jiqizhixin.com/
- 量子位：https://www.qbitai.com/
- 新智元：https://www.aiera.com.cn/
- MIT Technology Review：https://www.technologyreview.com/
- 极客公园 AI 板块：https://www.geekpark.net/

---

## 🏭 行业覆盖范围
参考 https://weekly.dcapapp.com 的分类拓展：
- **商业化/广告**：广告投放、营销技术、效果广告
- **生活服务**：到店、到家、酒旅、外卖
- **AI**：大模型、AI应用、AI广告工具、AI Agent
- **AI 行业全景（P2）**：AI 前沿技术、开源模型、AI 安全/监管、AI 芯片、具身智能 — 阅读参考级，不与快手业务强关联
- **线索广告**：教育、金融、汽车、房产线索
- **医疗**：医美、口腔、男科、妇科
- **本地服务**：生美、招盟、便民服务
- **电商**：内容电商、直播带货
- **科技/硬件**：AI硬件、算力、端侧AI

### 双轨 sowhat_for_kuaishou 逻辑（CRITICAL）
Portal 的设计基因为「快手本地生活战略情报工具 + AI行业全景」双轨制。编写 sowhat_for_kuaishou 时必须区分：

**轨道 A — 竞对/业务相关（深度分析）：**
- 条件：公司/产品与快手本地生活、广告商业化、可灵/Kwai 有直接竞争关系，或事件直接影响快手业务策略
- sowhat 写法：深度竞争分析，结合快手视角，有数据支撑更好
- 示例：美团、字节抖音/豆包、小红书、腾讯视频号/混元、百度、Google/Meta/TikTok Ads、OpenAI Sora/Veo 等

**轨道 B — AI 行业全景追踪（阅读参考级）：**
- 条件：纯 AI 技术/公司动态，与快手核心业务（本地生活、广告商业化、可灵/Kwai）无直接竞争关系
- sowhat 写法：以「本条为AI前沿动态追踪」为固定前缀，简要说明技术意义，最后加「纳入为AI行业全景阅读参考」
- 示例：Anthropic 模型更新、Gemma 量化、学术论文突破、AI安全治理
- **判断标准**：如果不确定属于 A 还是 B，默认用 B

---

## 📋 每周更新 SOP

### Step 1：检索增量
- 时间窗口：过去 14 天
- 检索关键词矩阵：[公司名] × [主题词]
  - 公司：字节/抖音/TikTok、小红书/Rednote、腾讯/微信/视频号、美团、百度、Meta、Google、OpenAI、NVIDIA
  - 主题：商业化、广告、营销、AI、大模型、新功能、财报、政策、组织
- **AI 前沿关键词补充**（P2 阅读参考级）：
  - 公司/机构：OpenAI、Anthropic、Google DeepMind、Meta AI、微软、xAI（Grok）、月之暗面 Kimi、智谱 GLM、百川智能、MiniMax、零一万物、Stability AI、Mistral AI、英伟达
  - 主题：大模型发布/升级、开源模型、推理/Agent、多模态、具身智能、AI 芯片、AI 安全/对齐、AI 政策监管、AI 应用/产品、学术论文/技术突破、AI 版权

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

### Step 4b：双轨 sowhat 逻辑（重要）
对所有新增条目，按以下规则生成 `sowhat_for_kuaishou` 字段：

**轨道 A — 竞对 + 本地生活强相关**（默认）
- 重点分析：对快手本地生活/广告商业化竞争格局的直接影响
- 需要回答：谁在做什么？对快手意味着什么？应如何应对？
- 有数据支撑更佳

**轨道 B — AI 行业全景（P2 阅读参考级）**
- 适用条件：纯 AI 技术/学术进展、海外 AI 公司动态、与快手本地生活/广告业务无直接竞争关系
- 使用固定模板开头："本条为AI前沿动态追踪，与快手本地生活/广告业务直接竞争关系较弱，纳入Portal为AI行业全景阅读参考。"
- 后续可追加1-2句简要背景说明，不必深入竞对分析

### Step 5：提交
- 更新 `_meta.last_updated`
- git commit: `chore(intel): weekly update YYYY-MM-DD`

---

## 💰 Token 预算
- 每周检索 + 整理：300-500 token
- So What 生成（约5条/周）：~300 token
- **合计：≤ 800 token/周**
