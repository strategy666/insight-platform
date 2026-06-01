# 信源可信度强制校验系统

> 解决「Tab1 / Tab2 内容幻觉、Source URL 仅指向网站首页而非具体文章」的问题。

## 问题背景

之前 Tab1（信号雷达 / 全部动态）和 Tab2（竞对追踪）中，部分动态的 `sources[].url` 字段指向的只是公司主页或栏目根（如 `https://www.xiaohongshu.com/`），用户点开发现并非具体出处，等同于"幻觉"。

进一步发现：**快手相关动态的第三方信源（雪球/财联社/钛媒体/界面 等）经常和官方口径出入很大，不可信**——所以快手主体的情报，必须以快手官方域为信源，否则一律不展示。

## 解决方案：三级机器审计 + 快手主体特殊规则

### 1️⃣ 数据层：每条自动打 `_verification` 标签

`scripts/audit_sources.py` 扫 `intel.json` + `competitor_updates.json`，按规则评级：

| 等级 | 判定 |
|---|---|
| `verified` | URL 路径含 4+ 位数字 ID / ≥25 字符 slug / ≥3 级路径段 → 大概率是具体文章 |
| `weak` | URL 仅指向首页/栏目根；**或** 涉及"快手"主体但无任何 `kuaishou.com` / `kuaishou.cn` 官方域信源 |
| `broken` | 无 source 或指向已知失效域（lark/feishu/qingque/kdocs 等私域）|

#### 🚨 快手主体白名单规则（2026-06-01 加）

涉及快手的情报（`company` 列表里包含「快手」），`sources` 必须包含至少一个 `kuaishou.com` / `kuaishou.cn` 官方域，否则强制降级为 `weak`，并打 `_ks_no_official: true` 标记。

> 原因：快手相关的第三方报道（雪球/钛媒体/财联社/界面/智通财经 等）经常误报或夸大数据，用户希望仅依赖官方源（财报、磁力官网、官方公众号）。

### 2️⃣ UI 层：永远只展示 verified

- Tab1「📰 全部动态」+ Tab2「🎯 竞对追踪」前端**永久锁定** `_verification === 'verified'` 才展示
- 「仅看已核实信源」开关已删除（commit 4997fef）
- weak / broken 条目对用户完全不可见

### 3️⃣ 自动补 URL：`scripts/enrich_sources.py`

跑 Tavily 搜每条 `_verification != verified` 的标题，挑符合 audit 规则的具体文章页 URL 替换。
- 涉及快手主体时，自动加 `site:kuaishou.com OR site:kuaishou.cn` 限定
- 候选必须通过 `classify_source()` 才算命中
- 内置缓存 `scripts/.enrich_cache.json`，重跑/续跑不浪费 API quota

## 使用方式

### 每次更新数据后必须运行

```bash
cd insight-platform

# 1. 先审计：识别 weak/broken + 快手主体降级
python3 scripts/audit_sources.py

# 2. 自动补具体文章 URL（含快手 site: 限定）
python3 scripts/enrich_sources.py

# 3. 复审
python3 scripts/audit_sources.py
```

### 当前快照（2026-06-01）

| 文件 | 总数 | verified | weak | 备注 |
|---|---|---|---|---|
| Tab1 intel.json | 89 | 79 (88.8%) | 10 (11.2%) | 9 条快手相关无官方源 + 1 条原 weak |
| Tab2 competitor_updates.json | 131 | 128 (97.7%) | 3 (2.3%) | 大众点评/小红书DAU/巨量Changelog |

## 后续优化方向

1. 手补 9 条快手 weak 条目的官方源（磁力官网/财报 PDF/官方公众号文章）
2. 每周 cron HEAD 探测所有 verified URL，404 自动降级 broken
3. `scripts/source_blacklist.txt` 维护已知不靠谱域，audit 时自动降级
4. 同主体 2+ 独立来源才允许 verified（提高门槛）
