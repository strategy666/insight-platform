# Sub-Agent: competitor-tracker
## 职责
维护 `assets/data/competitor_updates.json` — Part2「核心竞对动态」数据源

## 信息源范围（来自 Kim Doc fcAAoE2eWZ9oZFNrZB9qJaYpz）
### 产品动态信源（T1-T2）
- 巨量引擎开放平台 Changelog：https://open.oceanengine.com/changelog/1
- 腾讯广告官方公众号：微信搜索「腾讯广告」
- 小红书商业化官方：微信搜索「小红书营销」
- 美团广告平台：https://e.meituan.com/
- 百度营销：https://e.baidu.com/

### 政策更新信源
- 巨量引擎政策：https://open.oceanengine.com/
- 腾讯广告政策：https://e.qq.com/
- 小红书蒲公英：https://www.pugongying.com/

### 行业 Case 信源（T3）
- 营销新观察 / SocialBeta：https://socialbeta.com/
- 数英网：https://www.digitaling.com/
- 36氪商业：https://36kr.com/business

## 每周更新 SOP
1. 按公司维度检索（字节/小红书/腾讯/美团/百度）
2. 按类别分类标注：产品动态 / 政策更新 / 行业Case
3. 核验后追加到 `items` 数组：
```json
{
  "id": "comp-xxx",
  "date": "YYYY-MM-DD",
  "company": "字节|小红书|腾讯|美团|百度",
  "category": "产品动态|政策更新|行业case",
  "title": "简洁标题（30字内）",
  "sowhat": "竞争视角So What（60字内）",
  "sources": [{"name": "来源名称", "url": "原文链接", "date": "发布日期"}]
}
```
4. 更新 `_meta.last_updated`
5. git commit: `chore(competitor): weekly update YYYY-MM-DD`

## Token 预算
- 每周更新预计消耗：150-300 token
- 两个 agent 合计每周 ≤ 600 token（含检索 + So What 生成）
