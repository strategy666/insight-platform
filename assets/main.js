/* =====================================================
   Insight Platform - JS 交互
   功能：① 竞对 Tab 切换  ② 报告库搜索  ③ 数字动效
   ===================================================== */

// ---------- ① 竞对 Tab 切换 ----------
(function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');

            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const panel = document.getElementById(target);
            if (panel) panel.classList.add('active');
        });
    });
})();

// ---------- ② 报告库搜索 ----------
(function initReportSearch() {
    const input = document.getElementById('reportSearch');
    const list = document.getElementById('reportList');
    const count = document.getElementById('reportCount');
    const empty = document.getElementById('reportEmpty');
    const end = document.getElementById('reportEnd');
    if (!input || !list) return;

    const items = list.querySelectorAll('.report-item');

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        let visible = 0;

        items.forEach(item => {
            const text = (
                item.textContent + ' ' +
                (item.getAttribute('data-keywords') || '')
            ).toLowerCase();

            const match = !q || text.includes(q);
            item.style.display = match ? '' : 'none';
            if (match) visible++;
        });

        if (count) count.textContent = visible;
        if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
        if (end) end.style.display = visible === 0 ? 'none' : 'block';
    });
})();

// ---------- ③ Hero 数字滚动动效 ----------
(function initStatAnimation() {
    const nums = document.querySelectorAll('.stat .num');
    nums.forEach(el => {
        const target = parseInt(el.textContent, 10);
        if (isNaN(target)) return;
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 30));
        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = current;
        }, 30);
    });
})();

// ---------- ④ 自动更新"最近更新"日期 ----------
(function initLastUpdate() {
    const el = document.getElementById('lastUpdate');
    if (!el) return;
    // 这里不动态用 today，因为发布日期由维护者决定。如需自动今天，取消下面注释：
    // const d = new Date();
    // el.textContent = `最近更新：${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
})();

// ---------- ⑤ 信息源展开/折叠 ----------
function toggleSources(button) {
    const sourceList = button.nextElementSibling;
    const isVisible = sourceList.style.display !== 'none';
    
    if (isVisible) {
        sourceList.style.display = 'none';
        button.classList.remove('active');
    } else {
        sourceList.style.display = 'flex';
        button.classList.add('active');
    }
}
