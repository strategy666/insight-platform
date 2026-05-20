# 📊 商业化洞察平台 (Insight Platform)

> 互联网商业化战略分析师团队 - 市场&竞对一手信息洞察平台

---

## 🎯 平台简介

本平台是一个**双周更新**的市场/竞对洞察网站，旨在让团队和老板们结构化消化外部信息：

- 🔥 **今日洞察**：每期 3 条最重要事件 + So What 解读
- 🎯 **核心竞对动态**：字节 / 小红书 / 腾讯 / 美团 / 百度
- 📈 **重点行业赛道**：生活服务 / 线索广告 / 医疗 / 本地服务 / AI
- 📄 **行研报告库**：历史报告归档+全文检索

---

## 🛠 技术栈

- **纯静态网页**：HTML + CSS + 原生 JS（无任何依赖）
- **托管**：GitHub Pages（免费、永久公开链接）
- **更新方式**：编辑 `index.html` 后 git push

---

## 📁 目录结构

```
insight-platform/
├── index.html            # 主页（所有板块都在这里）
├── assets/
│   ├── style.css         # 样式
│   └── main.js           # 交互（Tab/搜索/动效）
├── reports/              # 历史报告原文（PDF/MD），可选
├── issues/               # 历史期次归档（每期一份），可选
└── README.md             # 本文档
```

---

## 🚀 本地预览

直接双击 `index.html` 即可在浏览器打开。

或在终端运行：

```bash
cd insight-platform
open index.html
```

---

## 🌐 部署到 GitHub Pages（首次发布步骤）

### Step 1: 注册 GitHub 账号
访问 https://github.com 注册（如已有跳过）。

### Step 2: 配置本地 Git
```bash
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的注册邮箱"
```

### Step 3: 在 GitHub 创建仓库
- 仓库名建议：`insight-platform`
- 设为 **Public**（GitHub Pages 免费版需要 Public）
- 不勾选 README / .gitignore（本地已有）

### Step 4: 推送代码
```bash
cd insight-platform
git init
git add .
git commit -m "feat: initial commit - insight platform v1.0"
git branch -M main
git remote add origin https://github.com/<你的用户名>/insight-platform.git
git push -u origin main
```

### Step 5: 开启 GitHub Pages
1. 进入仓库 → Settings → Pages
2. Source 选 **Deploy from a branch**
3. Branch 选 **main**，Folder 选 **/ (root)**
4. 点 Save

约 1 分钟后，访问：
```
https://<你的用户名>.github.io/insight-platform/
```

---

## ✏️ 日常更新流程

每期更新只需要：

1. 编辑 `index.html` 中对应板块（今日洞察/竞对/行业/报告库）
2. 提交：
   ```bash
   git add .
   git commit -m "update: 2026 W21"
   git push
   ```
3. 等 1 分钟，网站自动更新

未来会接入 AI 自动更新（参考"AI引力场"案例）。

---

## 📝 内容字段规范

### 今日洞察卡片
- 标签（赛道/竞对）
- 标题（一句话核心信息）
- 日期 + 信息源
- 正文（3-5 句事实）
- **So What 解读**（关键，给老板看的）

### 竞对动态条目
- 日期（MM-DD）
- 事件标题
- 信息源

### 行业赛道卡片
- 图标 + 名称 + 简介
- 3 条要点
- 状态标签（如：竞争白热化、监管收紧、规模化阶段）

### 报告库条目
- 标题 / 日期 / 字数 / 作者
- 摘要（2-3 句）
- 标签（用于搜索）

---

## 🔗 参考资料

- 实现参考：https://ailiuliuliu.github.io/ad-insight-platform/
- 内部案例：[AI引力场 | AI驱动商业化洞察平台](https://docs.corp.kuaishou.com/k/home/VUG94yCySbmA/fcACqRI5zAM_4KFk5l_iYPmrV)
- 周刊参考：https://weekly.dcapapp.com

---

维护：战略分析组 · zhangjiayi
