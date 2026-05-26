# Sub-Agent: search-intel
## 职责
维护 `assets/data/intel.json` — Part1「市场信息检索」数据源

## 信息源范围（来自 Kim Doc fcAAoE2eWZ9oZFNrZB9qJaYpz）
### 竞媒官方
- 字节/抖音：https://www.bytedance.com/zh/ · https://www.douyin.com/
- 巨量引擎：https://www.oceanengine.com/
- 小红书：https://www.xiaohongshu.com/
- 腾讯：https://www.tencent.com/zh-cn/ · 微信公众号
- 美团：https://ir.meituan.com/zh-CN/
- 百度：https://ir.baidu.com/

### 行业媒体（T3）
- 36氪：https://36kr.com/
- 虎嗅：https://www.huxiu.com/
- 晚点LatePost：https://www.latepost.com/
- 澎湃新闻：https://www.thepaper.cn/
- 21经济网：https://www.21jingji.com/
- 新浪财经：https://finance.sina.com.cn/

### 数据平台（T5）
- QuestMobile：https://www.questmobile.com.cn/
- 易观分析：https://www.analysys.cn/
- iResearch：https://www.iresearch.com.cn/

## 每周更新 SOP
1. 从上述信息源检索本周增量内容（关键词：字节/小红书/腾讯/美团/百度 + 商业化/广告/营销/AI）
2. 核验：仅收录有原文链接的公开信息
3. 按以下格式追加到 `items` 数组：
```json
{
  "id": "intel-xxx",
  "date": "YYYY-MM-DD",
  "title": "简洁标题（30字内）",
  "body": "背景事实（100字内，只写已核实内容）",
  "sowhat": "商业视角So What（80字内，结合快手竞争视角）",
  "company": ["字节|小红书|腾讯|美团|百度"],
  "industry": ["生活服务|AI|线索广告|医疗|本地服务"],
  "type": "产品动态|政策更新|财报数据|组织动态",
  "timeline": "事件时间线（可选）",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}]
}
```
4. 更新 `_meta.last_updated`
5. git commit: `chore(intel): weekly update YYYY-MM-DD`

## Token 预算
- 每周更新预计消耗：200-400 token（只检索不生成）
- So What 生成：100-200 token/条
