# Portal 移动端适配指南

## 核心原则

**所有新功能必须同时适配 PC 端和移动端**，确保在手机上也能获得良好体验。

---

## 响应式断点

```css
/* 移动端：屏幕宽度 ≤ 768px */
@media (max-width: 768px) {
    /* 移动端样式 */
}

/* PC 端：屏幕宽度 > 768px */
/* 默认样式即为 PC 端 */
```

---

## 移动端设计检查清单

### ✅ 布局 (Layout)

- [ ] **容器宽度**：使用 `max-width` 而非固定 `width`
- [ ] **内边距**：移动端减少 padding（PC: 2rem → 移动: 1.25rem）
- [ ] **网格布局**：多列改为单列 `grid-template-columns: 1fr`
- [ ] **Flex 方向**：横向改为纵向 `flex-direction: column`

```css
/* ❌ 错误 */
.container {
    width: 1200px;
}

/* ✅ 正确 */
.container {
    max-width: 1200px;
    padding: 0 1rem; /* 移动端自动适配 */
}
```

---

### ✅ 字体 (Typography)

- [ ] **标题大小**：移动端缩小 20-30%
- [ ] **正文大小**：保持 14-16px 可读性
- [ ] **行高**：移动端适当增加 `line-height: 1.6-1.8`

```css
/* PC 端 */
.hero h1 {
    font-size: 2.5rem; /* 40px */
}

/* 移动端 */
@media (max-width: 768px) {
    .hero h1 {
        font-size: 1.75rem; /* 28px，缩小 30% */
    }
}
```

---

### ✅ 间距 (Spacing)

- [ ] **Section 间距**：PC 4rem → 移动 2.5rem
- [ ] **卡片间距**：PC 1.5rem → 移动 1rem
- [ ] **按钮间距**：PC 0.75rem → 移动 0.5rem

```css
/* PC 端 */
.section {
    padding: 4rem 0;
}

/* 移动端 */
@media (max-width: 768px) {
    .section {
        padding: 2.5rem 0;
    }
}
```

---

### ✅ 交互元素 (Interactive)

- [ ] **按钮大小**：移动端增大点击区域（最小 44x44px）
- [ ] **输入框**：移动端字体 ≥ 16px（避免 iOS 自动缩放）
- [ ] **下拉菜单**：改为全宽展示
- [ ] **Hover 效果**：移动端禁用或改为 `:active`

```css
/* PC 端 */
.search-btn {
    padding: 1rem 2rem;
}

/* 移动端 */
@media (max-width: 768px) {
    .search-btn {
        width: 100%; /* 全宽按钮 */
        padding: 0.875rem 1.5rem;
        min-height: 44px; /* 最小点击区域 */
    }
}
```

---

### ✅ 搜索框 (Search)

- [ ] **输入框 + 按钮**：横向改为纵向堆叠
- [ ] **预设问题**：改为全宽按钮，纵向排列
- [ ] **字体大小**：≥ 16px（避免 iOS 缩放）

```css
/* PC 端 */
.search-input-wrapper {
    display: flex;
    gap: 0.75rem;
}

/* 移动端 */
@media (max-width: 768px) {
    .search-input-wrapper {
        flex-direction: column; /* 纵向堆叠 */
        gap: 0.5rem;
    }
    
    .search-input-wrapper input {
        font-size: 16px; /* 避免 iOS 自动缩放 */
    }
    
    .search-btn {
        width: 100%; /* 全宽按钮 */
    }
}
```

---

### ✅ 卡片 (Cards)

- [ ] **网格布局**：多列改为单列
- [ ] **内边距**：PC 1.5rem → 移动 1.25rem
- [ ] **圆角**：可适当减小（PC 12px → 移动 8px）

```css
/* PC 端 */
.insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 1.5rem;
}

/* 移动端 */
@media (max-width: 768px) {
    .insights-grid {
        grid-template-columns: 1fr; /* 单列 */
        gap: 1rem;
    }
}
```

---

### ✅ 导航 (Navigation)

- [ ] **横向导航**：改为纵向或汉堡菜单
- [ ] **Tab 切换**：允许横向滚动或改为下拉选择

```css
/* PC 端 */
.nav {
    display: flex;
    gap: 1.5rem;
}

/* 移动端 */
@media (max-width: 768px) {
    .nav {
        flex-direction: column; /* 或保持横向但允许滚动 */
        gap: 0.5rem;
    }
}
```

---

### ✅ 弹窗/面板 (Modals/Panels)

- [ ] **宽度**：移动端占满屏幕宽度（留小边距）
- [ ] **内边距**：减少 padding
- [ ] **关闭按钮**：增大点击区域

```css
/* PC 端 */
.ai-answer-panel {
    padding: 2rem;
    border-radius: 16px;
}

/* 移动端 */
@media (max-width: 768px) {
    .ai-answer-panel {
        padding: 1.25rem;
        border-radius: 12px;
        margin: 0 0.5rem; /* 留小边距 */
    }
}
```

---

### ✅ 表格/列表 (Tables/Lists)

- [ ] **表格**：移动端改为卡片式展示
- [ ] **多列列表**：改为单列
- [ ] **横向滚动**：允许滚动但提示用户

```css
/* 移动端：表格改为卡片 */
@media (max-width: 768px) {
    table {
        display: block;
    }
    
    tr {
        display: block;
        margin-bottom: 1rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1rem;
    }
    
    td {
        display: block;
        text-align: left;
    }
}
```

---

## 测试清单

开发完成后，必须在以下设备/尺寸测试：

### 📱 移动端
- [ ] iPhone SE (375px)
- [ ] iPhone 12/13/14 (390px)
- [ ] iPhone 14 Pro Max (430px)
- [ ] Android 中等屏幕 (360px)

### 💻 PC 端
- [ ] 笔记本 (1366px)
- [ ] 桌面显示器 (1920px)
- [ ] 超宽屏 (2560px)

### 🧪 测试方法
1. Chrome DevTools → Toggle Device Toolbar (Cmd+Shift+M)
2. 选择不同设备预设
3. 检查布局、字体、交互是否正常

---

## 常见问题

### Q1: 为什么输入框在 iPhone 上会自动放大？
**A:** iOS Safari 会自动放大字体 < 16px 的输入框。解决方法：

```css
input, textarea, select {
    font-size: 16px; /* 最小 16px */
}
```

### Q2: 移动端按钮太小，点不准？
**A:** 确保所有可点击元素最小 44x44px：

```css
button, a {
    min-height: 44px;
    min-width: 44px;
}
```

### Q3: 移动端文字太挤？
**A:** 增加行高和段落间距：

```css
@media (max-width: 768px) {
    p {
        line-height: 1.7;
        margin-bottom: 1rem;
    }
}
```

---

## 快速检查命令

```bash
# 搜索所有没有移动端适配的样式
grep -n "display: flex\|display: grid" assets/style.css | \
  grep -v "@media"

# 检查是否有固定宽度
grep -n "width: [0-9]" assets/style.css | \
  grep -v "max-width\|min-width"
```

---

## 记住这句话

> **"移动优先，PC 增强"**  
> 先设计移动端体验，再为 PC 端添加增强功能。

---

## 本项目当前状态

✅ **已适配**：
- Header 导航
- Hero 区域（统计卡片、搜索框）
- AI 搜索（输入框、预设问题、答案面板）
- 市场洞察卡片
- 竞对追踪卡片
- 时间线展示
- 筛选器

⚠️ **需要持续关注**：
- 新增功能必须同步添加移动端样式
- 定期在真机测试

---

**最后更新**: 2026-05-28
