/* ===================================================
   Insight Platform - Main JS
   v2.0 — Part1 市场检索 + Part2 竞对分类 tab
   =================================================== */

/* ---------- 通用：展开来源列表 ---------- */
function toggleSources(button) {
    const sourceList = button.nextElementSibling;
    const isVisible = sourceList.style.display !== 'none';
    sourceList.style.display = isVisible ? 'none' : 'flex';
    button.classList.toggle('active', !isVisible);
}

/* ---------- 通用：展开 So What ---------- */
function toggleSoWhat(button) {
    const content = button.nextElementSibling;
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    button.textContent = isVisible ? '💡 So What ▾' : '💡 So What ▴';
    button.classList.toggle('active', !isVisible);
}

/* ============================================================
   Part1：市场信息检索
   - 从 assets/data/intel.json 加载
   - 支持关键词搜索 + 公司/赛道/类型筛选
   ============================================================ */
let intelData = [];
let activeFilters = { company: 'all', industry: 'all', type: 'all', scope: 'all' };
let searchKeyword = '';

async function loadIntelData() {
    try {
        const resp = await fetch('assets/data/intel.json');
        const json = await resp.json();
        intelData = json.items || [];
        renderIntelSummary();
        renderIntel();
    } catch (e) {
        console.error('Failed to load intel.json', e);
    }
}

/* 渲染「本期概要」摘要区（dcap 风格：按公司分组，每条一句话摘要） */
function renderIntelSummary() {
    const summaryEl = document.getElementById('intelSummary');
    if (!summaryEl || intelData.length === 0) return;

    // 按 company 分组
    const grouped = {};
    intelData.forEach(item => {
        (item.company || ['其他']).forEach(c => {
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(item);
        });
    });

    const companyOrder = ['字节','小红书','腾讯','美团','百度','Meta','Google','OpenAI','NVIDIA'];
    const sorted = Object.keys(grouped).sort((a,b) => {
        const ia = companyOrder.indexOf(a); const ib = companyOrder.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    summaryEl.innerHTML = sorted.map(company => {
        const items = grouped[company];
        const rows = items.map(item =>
            `<li><span class="summary-date">${item.date.slice(5)}</span><span class="summary-text">${item.title}</span></li>`
        ).join('');
        return `<div class="summary-group"><div class="summary-company">${company}</div><ul class="summary-list">${rows}</ul></div>`;
    }).join('');
}

function renderIntel() {
    const list = document.getElementById('intelList');
    const empty = document.getElementById('intelEmpty');
    const counter = document.getElementById('intelCount');
    if (!list) return;

    const filtered = intelData.filter(item => {
        const kw = searchKeyword.trim().toLowerCase();
        if (kw) {
            const haystack = [item.title, item.body, item.sowhat, ...(item.company||[]), ...(item.industry||[])].join(' ').toLowerCase();
            if (!haystack.includes(kw)) return false;
        }
        if (activeFilters.company !== 'all' && !(item.company||[]).includes(activeFilters.company)) return false;
        if (activeFilters.industry !== 'all' && !(item.industry||[]).includes(activeFilters.industry)) return false;
        if (activeFilters.type !== 'all' && item.type !== activeFilters.type) return false;
        if (activeFilters.scope !== 'all' && item.scope !== activeFilters.scope) return false;
        return true;
    });

    counter.textContent = filtered.length;

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    list.innerHTML = filtered.map(item => {
        const compTags = (item.company||[]).map(c => `<span class="intel-tag company">${c}</span>`).join('');
        const indTags = (item.industry||[]).map(i => `<span class="intel-tag industry">${i}</span>`).join('');
        const typeTag = item.type ? `<span class="intel-tag type">${item.type}</span>` : '';
        const scopeMap = { '国内': '🇨🇳', '海外': '🌐', '全球': '🌍' };
        const scopeTag = item.scope ? `<span class="intel-tag scope">${(scopeMap[item.scope]||'')} ${item.scope}</span>` : '';
        const sourceItems = (item.sources||[]).map(s =>
            `<div class="source-item"><span class="source-icon">📰</span><a href="${s.url}" target="_blank">${s.name}</a><span class="source-date">${s.date}</span></div>`
        ).join('');
        const timelineHtml = item.timeline ? `<div class="intel-timeline">🕐 ${item.timeline}</div>` : '';
        const srcCount = (item.sources||[]).length;

        return `
        <article class="intel-card">
            <div class="intel-card-meta">
                <span class="intel-date">${item.date}</span>
                <div class="intel-tags">${scopeTag}${compTags}${indTags}${typeTag}</div>
            </div>
            <h3 class="intel-title">${item.title}</h3>
            <p class="intel-body">${item.body}</p>
            ${timelineHtml}
            <div class="intel-sowhat">
                <span class="sowhat-label">💡 So What</span>
                <span class="sowhat-text">${item.sowhat}</span>
            </div>
            <button class="source-toggle" onclick="toggleSources(this)">📋 信息源 (${srcCount})</button>
            <div class="source-list" style="display:none;">${sourceItems}</div>
        </article>`;
    }).join('');
}

/* 搜索框事件 */
function bindSearchEvents() {
    const input = document.getElementById('intelSearchInput');
    if (input) {
        input.addEventListener('input', () => {
            searchKeyword = input.value;
            renderIntel();
        });
    }
    // Hero 快速搜索
    const heroInput = document.getElementById('heroSearchInput');
    if (heroInput) {
        heroInput.addEventListener('keydown', e => { if (e.key === 'Enter') heroSearch(); });
    }
}

function heroSearch() {
    const heroInput = document.getElementById('heroSearchInput');
    if (!heroInput) return;
    const kw = heroInput.value.trim();
    if (!kw) return;
    // 跳转到检索区并触发搜索
    document.getElementById('search').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        const intelInput = document.getElementById('intelSearchInput');
        if (intelInput) {
            intelInput.value = kw;
            searchKeyword = kw;
            renderIntel();
        }
    }, 400);
}

/* 筛选按钮事件 */
function bindFilterEvents() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.filter;
            const filterValue = btn.dataset.value;
            // 同组取消选中
            document.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilters[filterType] = filterValue;
            renderIntel();
        });
    });
}

/* ============================================================
   Part2：竞对公司 tabs（原有逻辑保留）
   ============================================================ */
function bindCompanyTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.target;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(target);
            if (panel) panel.classList.add('active');
        });
    });
}

/* Part2：竞对分类 tabs（产品/政策/案例）*/
function bindCategoryTabs() {
    document.querySelectorAll('.ctab').forEach(ctab => {
        ctab.addEventListener('click', () => {
            const targetId = ctab.dataset.ctarget;
            // 找到同级 ctab
            const parent = ctab.closest('.comp-category-tabs');
            if (!parent) return;
            parent.querySelectorAll('.ctab').forEach(c => c.classList.remove('active'));
            ctab.classList.add('active');

            // 根据 targetId 后缀判断要显示的分类
            const suffix = targetId.split('-').pop(); // all / product / policy / case
            const panel = ctab.closest('.tab-panel');
            if (!panel) return;
            const items = panel.querySelectorAll('.comp-item');
            items.forEach(item => {
                if (suffix === 'all') {
                    item.style.display = '';
                } else {
                    item.style.display = item.dataset.ccat === suffix ? '' : 'none';
                }
            });
        });
    });
}

/* ============================================================
   初始化
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    loadIntelData();
    bindSearchEvents();
    bindFilterEvents();
    bindCompanyTabs();
    bindCategoryTabs();
});
