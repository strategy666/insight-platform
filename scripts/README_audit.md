# 信源可信度强制校验系统

> 解决「Tab1 / Tab2 内容幻觉、Source URL 仅指向网站首页而非具体文章」的问题。

## 问题背景

之前 Tab1（信号雷达 / 全部动态）和 Tab2（竞对追踪）中，部分动态的 `sources[].url` 字段指向的只是公司主页或栏目根（如 `https://www.xiaohongshu.com/`），用户点开发现并非具体出处，等同于"幻觉"。

## 解决方案：三级核实机制

### 1️⃣ 数据层：每条 item 打 `_verification` 标签

执行 `python3 scripts/audit_sources.py`：

| 等级 | 条件 |
|---|---|
| `verified` | 至少一个 source URL 指向具体文章（路径含 4 位以上数字 ID、或 ≥ 25 字符 slug、或 ≥ 3 级路径段） |
| `weak` | 所有 source 都只是网站首页 / 单段栏目根 |
| `broken` | 无 source / 已知失效域（lark wiki / 内网飞书等） |

#### 当前数据状态

| 数据集 | 总条目 | verified | weak | broken |
|---|---|---|---|---|
| Tab1 (intel.json) | 89 | 19 (21.3%) | 70 (78.7%) | 0 |
| Tab2 (competitor_updates.json) | 131 | 37 (28.2%) | 94 (71.8%) | 0 |

> ⚠️ 当前 weak 占比偏高，是因为很多动态原本就没有公开新闻链接（来自飞书内部文档或行业共识），后续可逐步用真实文章 URL 替换。

### 2️⃣ UI 层：默认隐藏 weak/broken

- Tab1「全部动态」头部 + Tab2「竞对动态矩阵」头部，各加一个 `✅ 仅看已核实信源` 复选框（**默认开启**）
- 复选框状态保存到 `localStorage`（key: `insight_only_verified`）
- 取消勾选 → 临时显示所有动态（含 weak）
- 显示后每条 item 加 `✅` / `⚠️` / `❌` 角标，鼠标悬停显示 tooltip

### 3️⃣ 视觉层：weak/broken 视觉降权

- weak item：左侧 3px 黄色边 + 浅黄渐变背景 + ⚠️ 角标
- broken item：左侧 3px 红色边 + 浅红渐变背景 + ❌ 角标

## 使用方式

### 每次更新数据后必须运行：

```bash
cd insight-platform
python3 scripts/audit_sources.py
```

### CI 集成（可选）

可在 `pre-commit` hook 中加入：

```bash
python3 scripts/audit_sources.py
git add assets/data/intel.json assets/data/competitor_updates.json
```

## 后续优化方向

1. **逐条核实并升级到 verified**：weak 条目的 sources 替换为具体新闻文章 URL（搜公司+主题关键词，找到具体文章页）
2. **broken 检测自动化**：每周 cron 用 HEAD 请求探测所有 source URL，404 / 403 / redirect-to-login 自动降级为 broken
3. **来源多样化要求**：单一来源不强制，但同一条动态有 2+ 独立来源（如官方公告 + 36kr 报道）才允许 verified
4. **黑名单机制**：`scripts/source_blacklist.txt` 维护已知失效或不可信的域名，audit 时自动降级
