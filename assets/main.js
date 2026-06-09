// ==================== 全局状态 ====================
let intelData = [];
let competitorData = [];
let signalsData = { podcasts: [], tweets: [], deals: [] };
let allFlowItems = []; // 统一后的 全部动态 池（news + podcast + tweet + deal）

// 信源可信度强制校验：永远只展示 verified，隐藏 weak / broken（不再提供用户可切换开关）
const showOnlyVerified = true;

let currentFilters = {
    kind: 'all',
    priority: 'all',
    signal: 'all',
    track: 'all',
    company: 'all',
    search: ''
};
let currentCompFilters = {
    company: null,
    dimension: 'all',
    source: 'all'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await loadSignalsRadar(); // 加载后合并进 allFlowItems
    buildAllFlowItems();
    renderKeyInsights();
    renderAINews();
    initDynamicFilters();
    renderInsightsGrid();
    renderCompetitors();
    initFilters();
    initSearch();
    updateStats();
    
    // 确保数据加载完成后再初始化 AI 搜索
    initAISearch();
});

// ==================== 数据加载 ====================
async function loadData() {
    try {
        const cb = '?t=' + Date.now();
        const [intelResp, compResp] = await Promise.all([
            fetch('assets/data/intel.json' + cb),
            fetch('assets/data/competitor_updates.json' + cb)
        ]);
        
        const intelJson = await intelResp.json();
        const compJson = await compResp.json();
        
        intelData = intelJson.items || [];
        competitorData = compJson.items || [];
        window.competitorData = competitorData;  // 暴露给 inline scripts (index.html 内的双源检索)
        window.intelData = intelData;            // 同上：让统一检索能跨 Tab1 全量动态
        
        // 更新最后更新时间
        document.getElementById('lastUpdate').textContent = 
            `更新于 ${intelJson._meta.last_updated}`;
    } catch (err) {
        console.error('加载数据失败:', err);
    }
}

// ==================== 渲染本周关键（最新 3 条高优先级，按日期倒序） ====================
function renderKeyInsights() {
    // 合并 AI 速递 + 高优先级情报：high priority 或 AI 赛道，取近 7 天内 top 6
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const merged = intelData
        .filter(it => it._date_ok !== false)  // 仅展示窗口内条目
        .filter(it => {
            const isHigh = it.priority === 'high';
            const isAI = (it.tracks || []).some(t => /AI|AIGC/i.test(t));
            const ts = new Date(it.date).getTime();
            return (isHigh || isAI) && ts >= sevenDaysAgo;
        })
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6);

    if (merged.length === 0) {
        document.getElementById('keyInsights').innerHTML = '<p class="empty-state">近 7 天暂无高优或0AI 速递情报</p>';
        return;
    }

    const html = merged.map(item => {
        const isHigh = item.priority === 'high';
        const isAI = (item.tracks || []).some(t => /AI|AIGC/i.test(t));
        const badges = [];
        if (isHigh) badges.push('<span class="hot-badge hot-high">🔥 高优</span>');
        if (isAI) badges.push('<span class="hot-badge hot-ai">🤖 AI</span>');
        const sig = item.signal === 'opportunity' ? '<span class="hot-badge hot-opp">🟢 机会</span>'
                  : item.signal === 'threat' ? '<span class="hot-badge hot-thr">🔴 威胁</span>' : '';
        const companies = (item.company || []).slice(0, 2).map(c => `<span class="hot-comp-tag">${c}</span>`).join('');
        return `
        <div class="hot-card" onclick="openIntelModal('${item.id}')">
            <div class="hot-card-head">
                ${badges.join('')}${sig}
                <span class="hot-date">${item.date}</span>
            </div>
            <h3 class="hot-title">${item.title}</h3>
            <p class="hot-tldr">${item.tldr}</p>
            <div class="hot-foot">${companies}<span class="hot-cta">看详情 →</span></div>
        </div>`;
    }).join('');
    document.getElementById('keyInsights').innerHTML = html;
}

// ==================== 渲染情报列表流（合并后的全部动态 = news + podcast + tweet + deal）====================
function renderInsightsGrid() {
    const filtered = filterInsights();
    const meta = document.getElementById('insightsFlowMeta');

    if (meta) {
        meta.innerHTML = `共 ${filtered.length} 条 · 按时间倒序 · 点击查看详情`;
    }

    // 刷新一级类型计数（基于 未被 kind 筛选过滤的原始池，仅按其他维度）
    updateKindCounts();

    if (filtered.length === 0) {
        document.getElementById('insightsGrid').innerHTML = '<p class="empty-state">暂无匹配情报，试试调整筛选</p>';
        return;
    }

    const html = filtered.map(item => renderFlowRow(item)).join('');
    document.getElementById('insightsGrid').innerHTML = html;
}

function renderFlowRow(item) {
    const kind = item._kind || 'news';
    const priCls = item.priority === 'high' ? 'pri-high' : (item.priority === 'mid' ? 'pri-mid' : 'pri-low');
    const dt = new Date(item.date);
    const shortDate = isNaN(dt.getTime()) ? item.date : `${dt.getMonth()+1}/${dt.getDate()}`;
    const weekDay = ['日','一','二','三','四','五','六'][dt.getDay()] || '';
    const kindBadge = ({
        news: '<span class="row-kind row-kind-news">📰 新闻</span>',
        deal: '<span class="row-kind row-kind-deal">💰 交易</span>'
    })[kind] || '';

    if (kind === 'news') {
        const isAI = (item.tracks || []).some(t => /AI|AIGC/i.test(t));
        const sigBadge = item.signal === 'opportunity' ? '<span class="sig-pill sig-opp">机会</span>'
                      : item.signal === 'threat' ? '<span class="sig-pill sig-thr">威胁</span>'
                      : item.signal === 'trend' ? '<span class="sig-pill sig-trend">趋势</span>'
                      : '<span class="sig-pill sig-neu">中性</span>';
        const companyTags = (item.company || []).slice(0, 3).map(c => `<span class="row-tag tag-company">${c}</span>`).join('');
        const trackTags = (item.tracks || []).slice(0, 2).map(t => `<span class="row-tag tag-track">${t}</span>`).join('');
        return `
        <div class="news-row ${priCls}" data-id="${item.id}" onclick="openIntelModal('${item.id}')">
            <div class="news-row-datecol">
                <div class="news-row-date">${shortDate}</div>
                <div class="news-row-week">周${weekDay}</div>
            </div>
            <div class="news-row-main">
                <div class="news-row-headline">
                    ${kindBadge}
                    ${item.priority === 'high' ? '<span class="row-dot dot-high" title="高优先级"></span>' : ''}
                    ${isAI ? '<span class="row-ai-badge">AI</span>' : ''}
                    <span class="news-title">${item.title}</span>
                </div>
                <div class="news-row-tldr">${item.tldr}</div>
                <div class="news-row-meta">
                    ${sigBadge}
                    ${companyTags}
                    ${trackTags}
                </div>
            </div>
            <div class="news-row-aside">
                <span class="row-cta">详情 ›</span>
            </div>
        </div>`;
    }

    // podcast / tweet / deal — 点击跳转原链接
    const raw = item._raw || {};
    const tagsHtml = (item.tags || []).slice(0, 4).map(t => `<span class="row-tag tag-track">${(t||'').replace(/^#/, '')}</span>`).join('');
    let extra = '';
    if (kind === 'podcast') {
        const guests = (raw.guests||[]).join(' · ');
        extra = `<div class="news-row-meta"><span class="row-tag">🎙️ ${raw.show||''}</span>${raw.platform?`<span class="row-tag">${raw.platform}</span>`:''}${guests?`<span class="row-tag">嘉宾：${guests}</span>`:''}${raw.duration?`<span class="row-tag">⏱ ${raw.duration}</span>`:''}${tagsHtml}</div>`;
    } else if (kind === 'tweet') {
        extra = `<div class="news-row-meta"><span class="row-tag">❤️ ${(raw.likes||0).toLocaleString()}</span><span class="row-tag">🔁 ${(raw.retweets||0).toLocaleString()}</span><span class="row-tag">${raw.handle||raw.author||''}</span>${tagsHtml}</div>`;
    } else if (kind === 'deal') {
        const leads = (raw.lead_investors||[]).join(' · ');
        extra = `<div class="news-row-meta"><span class="row-tag">领投：${leads||'—'}</span>${raw.valuation?`<span class="row-tag">估值 ${raw.valuation}</span>`:''}${tagsHtml}</div>`;
    }

    const url = item.url || (raw.url || '');
    const hrefAttr = url ? `href="${url}" target="_blank" rel="noopener"` : 'href="javascript:void(0)"';
    return `
    <a class="news-row ${priCls} news-row-link" ${hrefAttr}>
        <div class="news-row-datecol">
            <div class="news-row-date">${shortDate}</div>
            <div class="news-row-week">周${weekDay}</div>
        </div>
        <div class="news-row-main">
            <div class="news-row-headline">
                ${kindBadge}
                ${item.priority === 'high' ? '<span class="row-dot dot-high" title="高优先级"></span>' : ''}
                <span class="news-title">${item.title}</span>
            </div>
            <div class="news-row-tldr">${item.tldr}</div>
            ${extra}
            ${raw.sowhat ? `<div class="news-row-tldr" style="color:#476;font-style:italic"><strong>So What ·</strong> ${raw.sowhat}</div>` : ''}
        </div>
        <div class="news-row-aside">
            <span class="row-cta">原文 ↗</span>
        </div>
    </a>`;
}

function updateKindCounts() {
    // 计数仅根据 除 kind 之外的筛选状态
    const fakeFilters = Object.assign({}, currentFilters, { kind: 'all' });
    const base = (allFlowItems || []).filter(item => matchesFiltersExceptKind(item, fakeFilters));
    const cnt = { news: 0, deal: 0 };
    base.forEach(it => { if (cnt[it._kind] !== undefined) cnt[it._kind]++; });
    const set = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = n; };
    set('kindCntNews', cnt.news);
    set('kindCntDeal', cnt.deal);
}

function matchesFiltersExceptKind(item, filters) {
    if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (filters.signal !== 'all' && item.signal !== filters.signal) return false;
    if (filters.track !== 'all' && !(item.tracks||[]).includes(filters.track)) return false;
    if (filters.company !== 'all' && !(item.company||[]).includes(filters.company)) return false;
    if (filters.search) {
        const k = filters.search.toLowerCase();
        const txt = (item.title + ' ' + (item.tldr||'') + ' ' + (item.tags||[]).join(' ')).toLowerCase();
        if (!txt.includes(k)) return false;
    }
    // 信源可信度：默认隐藏 weak/broken
    if (showOnlyVerified && (item._verification === 'weak' || item._verification === 'broken')) return false;
    return true;
}

// 切换信源可信度开关（已废弃，仅保留空函数避免主页报错）
window.toggleVerifiedOnly = function() { /* deprecated: 平台已锁定为仅展示已核实信源 */ };

// 列表内实时搜索（仅隐藏/显示已渲染元素，不重新拉取）
window.filterListInline = function(kw) {
    kw = (kw || '').trim().toLowerCase();
    document.querySelectorAll('.news-row').forEach(row => {
        const t = row.textContent.toLowerCase();
        row.style.display = (!kw || t.includes(kw)) ? '' : 'none';
    });
    // 隐藏空日期组
    document.querySelectorAll('.news-date-group').forEach(g => {
        const visible = g.querySelectorAll('.news-row:not([style*="display: none"])').length;
        g.style.display = visible > 0 ? '' : 'none';
    });
};

// ==================== 详情弹窗（加厚）====================
function openIntelModal(id) {
    const item = intelData.find(it => it.id === id);
    if (!item) return;
    const modal = document.getElementById('intelModal');
    const body = document.getElementById('intelModalBody');
    
    const tlHtml = (item.timeline && item.timeline.length > 0) ? `
        <div class="modal-section">
            <h4>📅 事件时间线</h4>
            <div class="modal-timeline">
                ${item.timeline.map(t => `
                    <div class="modal-tl-item">
                        <span class="modal-tl-date">${t.date}</span>
                        <span class="modal-tl-event">${t.event}</span>
                    </div>`).join('')}
            </div>
        </div>` : '';
    
    const metricsHtml = (item.metrics && Object.keys(item.metrics).length > 0) ? `
        <div class="modal-section">
            <h4>📊 关键指标</h4>
            <div class="modal-metrics">
                ${Object.entries(item.metrics).map(([k,v]) => `
                    <div class="modal-metric"><div class="mm-val">${v}</div><div class="mm-lab">${k}</div></div>`).join('')}
            </div>
        </div>` : '';
    
    body.innerHTML = `
        <div class="modal-header">
            <div class="modal-badges">
                <span class="priority-badge priority-${item.priority}">${getPriorityIcon(item.priority)}</span>
                <span class="signal-badge signal-${item.signal}">${getSignalIcon(item.signal)}</span>
                <span class="modal-date">${item.date}</span>
            </div>
            <h2 class="modal-title">${item.title}</h2>
            <p class="modal-tldr">${item.tldr}</p>
            <div class="modal-companies">
                ${(item.company || []).map(c => `<span class="company-tag">${c}</span>`).join('')}
                · ${(item.tracks || []).map(t => `<span class="track-tag">#${t}</span>`).join(' ')}
            </div>
        </div>
        
        ${metricsHtml}
        
        <div class="modal-section">
            <h4>📝 核心要点</h4>
            <ul class="modal-list">
                ${(item.takeaway || []).map(t => `<li>${t}</li>`).join('') || '<li class="empty">待补充</li>'}
            </ul>
        </div>
        
        <div class="modal-section modal-sowhat">
            <h4>💡 对快手启示 (So What)</h4>
            <p>${item.sowhat_for_kuaishou || '待补充分析'}</p>
        </div>
        
        ${tlHtml}
        
        <div class="modal-section">
            <h4>🔗 信息源 (${(item.sources || []).length})</h4>
            <ul class="modal-sources">
                ${(item.sources || []).map(s => `
                    <li>
                        <a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>
                        ${s.date ? `<span class="src-date">${s.date}</span>` : ''}
                    </li>`).join('')}
            </ul>
        </div>
    `;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeIntelModal() {
    document.getElementById('intelModal').style.display = 'none';
    document.body.style.overflow = '';
}
window.openIntelModal = openIntelModal;
window.closeIntelModal = closeIntelModal;

// ==================== AI 速递专区 ====================
function renderAINews() {
    // 已合并入 renderKeyInsights（本周高热情报），此函数保留兼容空实现
    return;
}

// ==================== 动态初始化筛选器 chip ====================
function initDynamicFilters() {
    // 赛道 chip【基于 全部动态池 获取】
    const tracks = new Set();
    (allFlowItems.length ? allFlowItems : intelData).forEach(it => (it.tracks || []).forEach(t => tracks.add(t)));
    const trackOrder = ['本地生活', '电商', 'AI', 'AIGC', '线索广告', '出海'];
    const sortedTracks = Array.from(tracks).sort((a, b) => {
        const ai = trackOrder.indexOf(a), bi = trackOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });
    const trackBox = document.getElementById('trackFilterBtns');
    if (trackBox) {
        trackBox.innerHTML = '<button class="chip active" data-type="track" data-value="all">全部</button>' +
            sortedTracks.map(t => `<button class="chip" data-type="track" data-value="${t}">${t}</button>`).join('');
    }
    // 公司 chip【按出现频次排序，取 Top 10】
    const compCount = {};
    (allFlowItems.length ? allFlowItems : intelData).forEach(it => (it.company || []).forEach(c => { compCount[c] = (compCount[c] || 0) + 1; }));
    const topComps = Object.entries(compCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const compBox = document.getElementById('companyFilterBtns');
    if (compBox) {
        compBox.innerHTML = '<button class="chip active" data-type="company" data-value="all">全部</button>' +
            topComps.map(c => `<button class="chip" data-type="company" data-value="${c}">${c}<sup>${compCount[c]}</sup></button>`).join('');
    }
}

function toggleFilters() {
    const panel = document.getElementById('filtersPanel');
    if (panel) panel.classList.toggle('filters-collapsed');
}
function resetFilters() {
    currentFilters = { kind: 'all', priority: 'all', signal: 'all', track: 'all', company: 'all', search: '' };
    document.querySelectorAll('.filter-pill').forEach(b => {
        if (b.dataset && b.dataset.value === 'all') b.classList.add('active');
        else b.classList.remove('active');
    });
    document.querySelectorAll('.filters-panel .chip').forEach(b => {
        b.classList.toggle('active', b.dataset.value === 'all');
    });
    renderInsightsGrid();
    updateFilterCountBadge();
}
function updateFilterCountBadge() {
    const cnt = ['kind', 'priority', 'signal', 'track', 'company'].filter(k => currentFilters[k] !== 'all').length;
    const badge = document.getElementById('filterCountBadge');
    if (badge) {
        if (cnt === 0) { badge.style.display = 'none'; }
        else { badge.style.display = 'inline-block'; badge.textContent = cnt; }
    }
}
window.toggleFilters = toggleFilters;
window.resetFilters = resetFilters;

// ==================== 筛选逻辑 ====================
function filterInsights() {
    const pool = (allFlowItems && allFlowItems.length) ? allFlowItems : (intelData || []).map(it => Object.assign({}, it, { _kind: 'news' }));
    return pool.filter(item => {
        // 一级：类型筛选 (kind)
        if (currentFilters.kind !== 'all' && item._kind !== currentFilters.kind) return false;
        if (!matchesFiltersExceptKind(item, currentFilters)) return false;
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ==================== 初始化筛选器 ====================
function initFilters() {
    // 事件委托（适用于 chip + filter-btn 两种类名）
    document.querySelectorAll('.filters-panel').forEach(panel => {
        panel.addEventListener('click', e => {
            const btn = e.target.closest('.chip, .filter-btn');
            if (!btn) return;
            const type = btn.dataset.type;
            const value = btn.dataset.value;
            if (!type || !value) return;
            
            // 更新同组状态
            btn.parentElement.querySelectorAll('.chip, .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentFilters[type] = value;
            renderInsightsGrid();
            updateFilterCountBadge();
        });
    });
    // 新版 inline pill 筛选条（filter-pill）
    const inlineBar = document.getElementById('filterChipsInline');
    if (inlineBar) {
        inlineBar.addEventListener('click', e => {
            const btn = e.target.closest('.filter-pill');
            if (!btn || !btn.dataset.type) return;
            const type = btn.dataset.type;
            const value = btn.dataset.value;
            if (!type || !value) return;
            inlineBar.querySelectorAll('.filter-pill[data-type="' + type + '"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilters[type] = value;
            renderInsightsGrid();
            updateFilterCountBadge();
        });
    }
}

// ==================== 初始化搜索 ====================
function initSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return; // hero 改造后该元素可能不存在
    let searchTimer;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentFilters.search = e.target.value.trim();
            renderInsightsGrid();
        }, 300);
    });
}

// ==================== 切换详情 ====================
function toggleDetails(id) {
    const details = document.getElementById(`details-${id}`);
    const btn = event.target;
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        btn.textContent = '收起详情';
    } else {
        details.style.display = 'none';
        btn.textContent = '查看详情';
    }
}

// 竞对筛选栏折叠
function toggleCompFilters() {
    const body = document.getElementById('compFilterBody');
    const icon = document.getElementById('compFilterToggleIcon');
    if (!body || !icon) return;
    const isVisible = body.style.display === 'block';
    body.style.display = isVisible ? 'none' : 'block';
    icon.textContent = isVisible ? '▶' : '▼';
}
window.toggleCompFilters = toggleCompFilters;

// ==================== 渲染竞对追踪（2D 矩阵）====================
function renderCompetitors() {
    // 按信息数量从多到少排序公司
    const companyCounts = {};
    competitorData.forEach(it => {
        companyCounts[it.company] = (companyCounts[it.company] || 0) + 1;
    });
    const companies = Object.keys(companyCounts)
        .filter(c => c && c !== 'undefined' && c !== 'null')
        .sort((a, b) => companyCounts[b] - companyCounts[a]);
    
    // 公司 tabs（第一个加「全部」）
    const tabsHtml = '<button class="chip comp-chip active" onclick="switchCompetitor(\'all\')">全部</button>' + companies.map((c, idx) => {
        const count = companyCounts[c];
        return `<button class="chip comp-chip ${idx === 0 ? '' : ''}" 
                onclick="switchCompetitor('${c}')">${c}<sup>${count}</sup></button>`;
    }).join('');
    const compTabs = document.getElementById('competitorTabs');
    if (compTabs) compTabs.innerHTML = tabsHtml;

    // 统计
    const ctotal = document.getElementById('compTotal');
    const crecent = document.getElementById('compRecent');
    if (ctotal) ctotal.textContent = competitorData.length;
    if (crecent) {
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        crecent.textContent = competitorData.filter(it => new Date(it.date) >= weekAgo).length;
    }
    
    // 确保事件委托只绑定一次
    const dimTabs = document.getElementById('competitorDimTabs');
    if (dimTabs && !dimTabs._bound) {
        dimTabs._bound = true;
        dimTabs.addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            currentCompFilters.dimension = b.dataset.dim;
            dimTabs.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            renderCompetitorList();
            updateCompFilterSummary();
        });
    }
    const srcTabs = document.getElementById('competitorSourceTabs');
    if (srcTabs && !srcTabs._bound) {
        srcTabs._bound = true;
        srcTabs.addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            currentCompFilters.source = b.dataset.source;
            srcTabs.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            renderCompetitorList();
            updateCompFilterSummary();
        });
    }
    
    if (companies.length > 0) switchCompetitor('all');
}

// ==================== Tab2 本期热点 chips ====================
// 从本期动态中提取 Top 6 高频主题关键词，作为搜索快捷入口
function renderCompHotChips() {
    const box = document.getElementById('compHotChips');
    if (!box) return;

    // 候选词库（以业务主题为主，避免意义太弱的功能词）
    const candidates = [
        '出单宝', '本地推', '深转', '达人', '直播', '团购', '闪购', '即时零售',
        'AI经营', '磁力星辰', '区域服务商', '服务商', '激励政策', '补贴',
        '口播', '短剧', '达播', '蓝V', 'V任务', '商单', 'ROI', 'GMV',
        '酒旅', '到店', '到家', '外卖', '线索广告', '大模型', 'LiveOS', '千川', 'Beacon',
        '餐饮', '商品', '商业化', '领券', '生意经', '巨量本地推'
    ];

    // 合并所有动态的 title + sowhat + tags，统计频次
    const text = competitorData.map(it =>
        (it.title || '') + ' ' + (it.sowhat || '') + ' ' + ((it.tags || []).join(' '))
    ).join(' ');

    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const counts = candidates.map(k => ({
        k,
        c: (text.match(new RegExp(escapeRe(k), 'g')) || []).length
    })).filter(x => x.c >= 2).sort((a, b) => b.c - a.c);

    // 取 Top 6
    const top = counts.slice(0, 6);

    if (!top.length) {
        box.innerHTML = '<span class="suggest-label">🔥 本期热点：</span>' +
            '<button class="suggest-q" onclick="document.getElementById(\'competitorSearchInput\').value=\'本地推\';searchCompetitor(\'本地推\')">本地推</button>';
        return;
    }

    box.innerHTML = '<span class="suggest-label">🔥 本期热点：</span>' +
        top.map(x => {
            const safe = x.k.replace(/'/g, "\\'");
            return '<button class="suggest-q" onclick="document.getElementById(\'competitorSearchInput\').value=\'' + safe + '\';searchCompetitor(\'' + safe + '\')" title="本期出现 ' + x.c + ' 次">' + x.k + '<span class="hot-cnt">' + x.c + '</span></button>';
        }).join('');
}

window.renderCompHotChips = renderCompHotChips;

function switchCompetitor(company) {
    currentCompFilters.company = company;
    currentCompFilters.dimension = 'all';
    
    // 更新公司 tabs 高亮
    document.querySelectorAll('#competitorTabs .chip').forEach(t => {
        if (company === 'all') {
            t.classList.toggle('active', t.textContent.trim().startsWith('全部'));
        } else {
            t.classList.toggle('active', t.textContent.startsWith(company));
        }
    });
    
    // 重新计算该公司的维度（全部时显示所有维度）
    let dims;
    if (company === 'all') {
        dims = Array.from(new Set(competitorData.map(it => it.dimension || it.category)));
    } else {
        dims = Array.from(new Set(
            competitorData.filter(it => it.company === company).map(it => it.dimension || it.category)
        ));
    }
    const dimTabs = document.getElementById('competitorDimTabs');
    if (dimTabs) {
        dimTabs.innerHTML = '<button class="chip active" data-dim="all">全部</button>' +
            dims.map(d => `<button class="chip" data-dim="${d}">${d}</button>`).join('');
    }
    renderCompetitorList();
    updateCompFilterSummary();
}

function renderCompetitorList() {
    const { company, dimension, source } = currentCompFilters;
    let updates = competitorData;
    // 仅展示窗口内条目（_date_ok !== false）
    updates = updates.filter(it => it._date_ok !== false);
    if (company !== 'all') updates = updates.filter(it => it.company === company);
    if (dimension !== 'all') updates = updates.filter(it => (it.dimension || it.category) === dimension);
    if (source !== 'all') updates = updates.filter(it => (it.data_source || '三方媒体') === source);

    // 信源可信度：永远仅展示 verified
    updates = updates.filter(it => it._verification === 'verified');

    // 相似内容去重：基于标题相似度+同公司+同日期，避免展示近乎相同的条目
    updates = deduplicateSimilarItems(updates);

    updates.sort((a, b) => new Date(b.date) - new Date(a.date));

    const container = document.getElementById('competitorUpdates');
    if (updates.length === 0) {
        container.innerHTML = '<p class="empty-state">暂无匹配动态，试试其他维度/数据源</p>';
        return;
    }

    const html = updates.map(item => {
        const dt = new Date(item.date);
        const monthDay = isNaN(dt.getTime()) ? item.date : `${dt.getMonth()+1}/${dt.getDate()}`;
        const fullDate = isNaN(dt.getTime()) ? item.date : `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()}`;
        const dimLabel = item.dimension || item.category || '动态';
        const srcLabel = item.data_source === '竞媒官方' ? '官方' :
                         item.data_source === '飞书内部' ? '飞书' : '媒体';
        const isHigh = item.tier === 'T1' || item.priority === 'high';

        // 关键数据指标
        const hasMetrics = item.metrics && Object.keys(item.metrics).length > 0;
        const metricsHtml = hasMetrics ? `
        <div class="cd-metrics">
            ${Object.entries(item.metrics).map(([k,v]) => `<span class="cd-metric"><b>${v}</b><small>${k}</small></span>`).join('')}
        </div>` : '';

        // 时间线
        const hasTimeline = item.timeline && item.timeline.length > 0;
        const timelineHtml = hasTimeline ? `
        <div class="cd-timeline">
            ${item.timeline.map(t => `
                <div class="cd-tl-node">
                    <span class="cd-tl-dot"></span>
                    <span class="cd-tl-date">${t.date}</span>
                    <span class="cd-tl-text">${t.event}</span>
                </div>`).join('')}
        </div>` : '';

        // 来源列表
        const hasSources = item.sources && item.sources.length > 0;

        return `
        <div class="comp-card dcap-card ${isHigh ? 'comp-card-t1' : ''}" data-id="${item.id}">
            <div class="cc-header" onclick="toggleDcapCard(this.closest('.comp-card'))">
                <div class="cc-title-row">
                    <span class="cc-dim-tag cc-dim-${dimLabel.replace(/[\s\/]/g,'')}">${dimLabel}</span>
                    <span class="cc-src-tag">${srcLabel}</span>
                    ${isHigh ? '<span class="cc-t1-dot" title="重要动态"></span>' : ''}
                    <h3 class="cc-title">${item.title}</h3>
                </div>
                <div class="cc-meta-row">
                    <span class="cc-date">${fullDate}</span>
                    <span class="cc-company-tag">${item.company}</span>
                    ${item.tags ? item.tags.slice(0,3).map(t => `<span class="cc-keyword-tag">${(t||'').replace(/^#/,'')}</span>`).join('') : ''}
                    <span class="cc-expand-icon">▸</span>
                </div>
            </div>
            ${hasSources ? `
            <div class="cc-summary-row">
                <p class="cc-summary-text">${item.sowhat ? item.sowhat.slice(0, 120) + '…' : item.title}</p>
            </div>` : ''}
            <div class="cc-detail" style="display:none;">
                <div class="cd-section cd-summary">
                    <div class="cd-section-label">📋 事件分析</div>
                    <p>${item.title || '暂无详情'}</p>
                </div>
                ${hasMetrics ? `
                <div class="cd-section cd-data">
                    <div class="cd-section-label">📊 关键数据</div>
                    ${metricsHtml}
                </div>` : ''}
                ${hasTimeline ? `
                <div class="cd-section cd-history">
                    <div class="cd-section-label">📅 时序回溯</div>
                    ${timelineHtml}
                </div>` : ''}
                <div class="cd-section cd-sowhat">
                    <div class="cd-section-label">💡 对快手 So What</div>
                    <p>${item.sowhat || '暂无分析'}</p>
                </div>
                ${hasSources ? `
                <div class="cd-section cd-sources">
                    <button class="cd-src-toggle" onclick="event.stopPropagation();toggleSourcePanel(this)">🔗 数据来源 (${item.sources.length}) ▾</button>
                    <div class="cd-src-panel" style="display:none;">
                        <ul class="cd-src-list">
                            ${item.sources.map((s, idx) => {
                                const broken = isWeixinUrlBroken(s.url);
                                if (broken) {
                                    return `<li><span class="cd-src-link cd-src-broken" title="公众号链接不完整，无法直接打开">${s.name}</span>${s.date ? `<span class="cd-src-date"> · ${s.date}</span>` : ''} <small style="color:#c0392b">⚠️ 链接不完整</small></li>`;
                                }
                                return `<li><a href="${s.url}" target="_blank" rel="noopener" class="cd-src-link">${s.name}</a>${s.date ? `<span class="cd-src-date"> · ${s.date}</span>` : ''}</li>`;
                            }).join('')}
                        </ul>
                    </div>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    container.innerHTML = html;
}

function isWeixinUrlBroken(url) {
    // 公众号链接必须有 mid/sn/chksm 等参数才是完整可访问的
    if (!url || !url.includes('mp.weixin.qq.com')) return false;
    if (!url.includes('mid=') && !url.includes('sn=') && !url.includes('chksm=')) return true;
    // 如果只有 __biz 参数，缺少其他关键参数也视为无效
    if (url.includes('__biz=') && !url.includes('mid=') && !url.includes('sn=') && !url.includes('chksm=')) return true;
    return false;
}

// 相似内容去重：同公司+同日期，标题编辑距离较近 → 去重保留第一个
function deduplicateSimilarItems(items) {
    if (!items || items.length < 2) return items;
    var result = [];
    var seen = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var isDup = false;
        for (var j = 0; j < seen.length; j++) {
            var s = seen[j];
            if ((s.company || '') !== (item.company || '')) continue;
            if ((s.date || '') !== (item.date || '')) continue;
            var sim = titleSimilarity(s.title || '', item.title || '');
            if (sim > 0.35) { isDup = true; break; }
        }
        if (!isDup) {
            seen.push(item);
            result.push(item);
        }
    }
    return result;
}
function titleSimilarity(a, b) {
    if (!a || !b) return 0;
    // 关键 token：数字、英文词、中文 2-3 gram
    var ts = {};
    function tokens(s, set) {
        // 数字
        var nums = s.match(/\d+/g);
        if (nums) for (var i = 0; i < nums.length; i++) set[nums[i]] = true;
        // 英文词
        var words = s.match(/[A-Za-z]+/g);
        if (words) for (var i = 0; i < words.length; i++) set[words[i]] = true;
        // 中文 2-3 gram
        var cn = s.replace(/[^\u4e00-\u9fff]/g, '');
        for (var i = 0; i < cn.length - 1; i++) set[cn.slice(i, i+2)] = true;
        for (var i = 0; i < cn.length - 2; i++) set[cn.slice(i, i+3)] = true;
    }
    var sa = {}, sb = {};
    tokens(a, sa); tokens(b, sb);
    var keysA = Object.keys(sa), keysB = Object.keys(sb);
    if (keysA.length === 0 || keysB.length === 0) return 0;
    var intersect = 0;
    for (var i = 0; i < keysA.length; i++) {
        if (sb[keysA[i]]) intersect++;
    }
    // symmetric Jaccard: intersection / min(|A|, |B|)
    return intersect / Math.min(keysA.length, keysB.length);
}

// dcap-style 展开/折叠
function toggleDcapCard(card) {
    const detail = card.querySelector('.cc-detail');
    const icon = card.querySelector('.cc-expand-icon');
    const summary = card.querySelector('.cc-summary-row');
    if (!detail) return;
    const isOpen = detail.style.display === 'block';
    detail.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▸' : '▾';
    if (summary) summary.style.display = isOpen ? '' : 'none';
}
window.toggleDcapCard = toggleDcapCard;

// 来源面板切换
function toggleSourcePanel(btn) {
    const panel = btn.nextElementSibling;
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    btn.textContent = btn.textContent.replace(isOpen ? '▴' : '▾', isOpen ? '▾' : '▴');
}
window.toggleSourcePanel = toggleSourcePanel;

// 更新筛选栏摘要
function updateCompFilterSummary() {
    const el = document.getElementById('compFilterSummary');
    if (!el) return;
    const { company, dimension, source } = currentCompFilters;
    el.textContent = `${company === 'all' ? '全部公司' : (company || '')}${dimension !== 'all' ? ' · ' + dimension : ''}${source !== 'all' ? ' · ' + source : ''}`;
}
window.switchCompetitor = switchCompetitor;

function toggleTimeline(header) {
    const body = header.nextElementSibling;
    const toggle = header.querySelector('.tl-toggle');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// ==================== 更新统计数据 ====================
function updateStats() {
    if (!intelData || intelData.length === 0) {
        // 数据没加载到，不要写 0，让 index.html 的兜底 fetch 接管
        console.warn('[updateStats] intelData is empty, skip writing 0');
        return;
    }
    const t = document.getElementById('statTotal');
    const inWindowItems = intelData.filter(it => it._date_ok !== false);
    if (t) t.textContent = inWindowItems.length;
    const h = document.getElementById('statHigh');
    if (h) h.textContent = intelData.filter(item => item.priority === 'high').length;

    const companies = new Set();
    intelData.forEach(item => (item.company || []).forEach(c => companies.add(c)));
    const c = document.getElementById('statCompanies');
    if (c) c.textContent = companies.size;

    // 覆盖赛道
    const tracks = new Set();
    intelData.forEach(item => (item.tracks || []).forEach(t => tracks.add(t)));
    const tk = document.getElementById('statTracks');
    if (tk) tk.textContent = tracks.size;
}

// ==================== 工具函数 ====================
function getPriorityIcon(priority) {
    const icons = {
        high: '🔴',
        mid: '🟡',
        low: '🟢'
    };
    return icons[priority] || '⚪';
}

function getSignalIcon(signal) {
    const icons = {
        opportunity: '🟢 机会',
        neutral: '🟡 中性',
        threat: '🔴 威胁'
    };
    return icons[signal] || '⚪';
}

function showChangeLog() {
    alert('更新日志：\\n\\n2026-05-26 v2.0\\n- 数据结构升级（加入 tldr/priority/signal/tags/metrics/takeaway）\\n- 前端重构为2栏（市场洞察 + 竞对追踪）\\n- 多维筛选（优先级/信号/赛道/公司）\\n- 卡片流设计，仿 dcapapp 风格');
}

// ==================== AI Search ====================
// 全局函数：直接被 HTML onclick 调用（最可靠的方式）
function askAI(query) {
    if (!query) {
        const input = document.getElementById('aiSearchInput');
        if (input) query = input.value.trim();
    }
    
    if (!query || !query.trim()) {
        console.warn('[AI Search] empty query');
        return;
    }
    
    query = query.trim();
    console.log('[AI Search] askAI called with:', query);
    
    // 同步搜索框
    const input = document.getElementById('aiSearchInput');
    if (input && input.value !== query) input.value = query;
    
    // 检查数据
    if (!competitorData || competitorData.length === 0) {
        console.warn('[AI Search] data not loaded yet, waiting...');
        // 数据未加载完，等待后重试
        setTimeout(() => askAI(query), 500);
        return;
    }
    
    performAISearch(query);
}

function initAISearch() {
    // 简化：现在主要靠 onclick，只需要确保数据加载完成的提示
    console.log('[AI Search] initialized | competitor:', competitorData.length, '| intel:', intelData.length);
}

function performAISearch(query) {
    const section = document.getElementById('aiAnswerSection');
    const panel = document.getElementById('aiAnswerPanel');
    if (!section || !panel) {
        console.error('[AI Search] aiAnswerSection or aiAnswerPanel not found');
        alert('搜索功能初始化失败，请刷新页面');
        return;
    }
    
    // 显示section
    section.style.display = 'block';
    
    // 滚动到答案位置
    setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    // ===== 优先：调用 LLM 综合本地数据 + 实时知识回答 =====
    if (typeof window.askAIWithLLM === 'function') {
        try {
            const cfg = (typeof window.__getAIConfig === 'function') ? window.__getAIConfig() : null;
            if (cfg && cfg.llm_key && cfg.llm_endpoint) {
                window.askAIWithLLM(query);
                return;
            }
        } catch(e) { console.warn('[AI Search] LLM mode skipped:', e); }
    }
    
    // Fallback: 本地模板答案
    const answer = generateAnswer(query);
    console.log('[AI Search] Generated answer (local template):', answer);
    renderAIAnswer(answer);
}

// 通用关键词搜索：在所有数据中查找匹配
function searchAllData(query) {
    const lowerQuery = query.toLowerCase();
    
    // 提取查询中的关键词
    const queryKeywords = extractKeywords(lowerQuery);
    
    // 搜索竞对数据
    const matchedCompetitors = competitorData.filter(item => {
        const text = `${item.title || ''} ${item.sowhat || ''} ${item.company || ''} ${item.category || ''}`.toLowerCase();
        return queryKeywords.some(kw => text.includes(kw));
    });
    
    // 搜索市场洞察数据
    const matchedIntel = intelData.filter(item => {
        const companies = Array.isArray(item.company) ? item.company.join(' ') : (item.company || '');
        const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
        const text = `${item.title || ''} ${item.tldr || ''} ${item.sowhat_for_kuaishou || ''} ${companies} ${tags}`.toLowerCase();
        return queryKeywords.some(kw => text.includes(kw));
    });
    
    return { competitors: matchedCompetitors, intel: matchedIntel };
}

// 从查询中提取关键词
function extractKeywords(query) {
    const keywords = [];
    const aliasMap = {
        '出单宝': ['出单宝'],
        '字节': ['字节', '抖音'],
        '抖音': ['抖音', '字节'],
        '快手': ['快手'],
        '腾讯': ['腾讯', '视频号', '微信'],
        '视频号': ['视频号', '腾讯'],
        '小红书': ['小红书'],
        '百度': ['百度'],
        '美团': ['美团'],
        '本地生活': ['本地生活', '本地推', '团购', '出单宝', '抖省省'],
        '本地推': ['本地推', '本地生活'],
        '团购': ['团购', '本地生活'],
        '广告': ['广告', '投放'],
        'ai': ['ai', '人工智能', '大模型', '豆包'],
        '豆包': ['豆包', 'ai'],
        '丽人': ['丽人', '美容', '美甲', '美睫'],
        '增长': ['增长', '上升', '提升'],
        'q1': ['q1', '一季度'],
        'q2': ['q2', '二季度', '5月', '4月']
    };
    
    // 直接添加查询中的所有可能关键词
    Object.keys(aliasMap).forEach(key => {
        if (query.includes(key)) {
            aliasMap[key].forEach(alias => {
                if (!keywords.includes(alias)) keywords.push(alias);
            });
        }
    });
    
    // 如果没匹配到任何关键词，按2-4字切分
    if (keywords.length === 0) {
        for (let len = 4; len >= 2; len--) {
            for (let i = 0; i <= query.length - len; i++) {
                const sub = query.substr(i, len).trim();
                if (sub && !sub.match(/[\s\?\？\!\！\,\，\。\.]/)) {
                    keywords.push(sub);
                }
            }
        }
    }
    
    return keywords;
}

function generateAnswer(query) {
    const lowerQuery = query.toLowerCase();
    
    // 全局搜索匹配数据
    const { competitors: matchedComp, intel: matchedIntel } = searchAllData(query);
    
    console.log('[AI Search] matched competitors:', matchedComp.length, '| matched intel:', matchedIntel.length);
    
    // 答案模板分发
    
    // 模板1：出单宝
    if (lowerQuery.includes('出单宝')) {
        return buildChudanbaoAnswer(matchedComp, matchedIntel);
    }
    
    // 模板2：字节本地生活/Q2/动作
    if ((lowerQuery.includes('字节') || lowerQuery.includes('抖音')) && 
        (lowerQuery.includes('q2') || lowerQuery.includes('动作') || lowerQuery.includes('本地生活'))) {
        return buildBytedanceAnswer(matchedComp, matchedIntel);
    }
    
    // 模板3：腾讯/视频号
    if (lowerQuery.includes('腾讯') || lowerQuery.includes('视频号')) {
        return buildTencentAnswer(matchedComp, matchedIntel);
    }
    
    // 默认：通用答案
    return buildGenericAnswer(query, matchedComp, matchedIntel);
}

function buildChudanbaoAnswer(matchedComp, matchedIntel) {
    const chudanbao = competitorData.find(c => c.title && c.title.includes('出单宝'));
    
    return {
        summary: `🔥 抖音生活服务于 <b>2026年5月18日</b> 推出「出单宝」智能托管产品，采用<b>"出单全托管+核销才计费"</b>模式，首期定向单体中小商家。这是字节继 3 月「抖省省」独立 App、五一团购同比 +60% 之后的第三步关键落子，标志着字节本地生活商家侧产品化能力跃迁。<b>对快手本地推形成精准打击：直击中小商家"不会投、不敢投"痛点，恰是快手下沉市场核心阵地。</b>`,
        analysis: [
            {
                title: '📊 核心机制',
                points: [
                    '一键托管：AI 自动选品/创意/出价，零运营门槛',
                    '按核销计费：用户到店核销才扣费，零投放风险',
                    '首期定向：单体中小商家（连锁不在内）',
                    '产品入口：抖音生活服务商家端集成'
                ]
            },
            {
                title: '⚠️ 对快手影响',
                points: [
                    '直接竞争：切入快手下沉市场核心客群',
                    '产品压力：快手本地推暂无同类零门槛方案',
                    '商家迁移：中小商家可能"两边投"或转移预算',
                    '时间窗口：6-9 月旺季前需快速响应'
                ]
            },
            {
                title: '💡 战略建议',
                points: [
                    '加速推出快手版"托管 + CPA/CPS"产品',
                    '强化中小商家"陪跑"运营服务',
                    '差异化打"老铁信任经济"+ 复购率',
                    '联合 ROI 担保（抖音是核销才扣费，快手可"未达 ROI 退款"）'
                ]
            },
            {
                title: '📈 数据观察点',
                points: [
                    '抖音中小商家月活/GMV 渗透率',
                    '快手本地推中小商家流失率',
                    '出单宝在丽人/餐饮/酒店的 TOP 类目分布',
                    'B 端跟进时间窗：未来 3 个月'
                ]
            }
        ],
        sources: chudanbao ? chudanbao.sources : [],
        related: competitorData.filter(c => 
            c.company === '字节' && (!chudanbao || c.id !== chudanbao.id)
        ).slice(0, 6)
    };
}

function buildBytedanceAnswer(matchedComp, matchedIntel) {
    const bytedanceItems = competitorData
        .filter(c => c.company === '字节')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const sources = [];
    bytedanceItems.slice(0, 3).forEach(item => {
        if (item.sources) sources.push(...item.sources);
    });
    
    return {
        summary: `🚀 字节本地生活 Q2 形成"三步连击"：3月「抖省省」独立 App 上线对标美团点评 → 5月7日五一团购同比 +60% 验证消费回暖 → 5月18日「出单宝」发布完成 B 端商家侧闭环。从 C 端搜索（抖省省）到 B 端投放（出单宝），矩阵化打击快手本地推。Q2 增长引擎从"流量驱动"切换至"工具+效率驱动"，丽人/酒店/地方菜成核心受益赛道。`,
        analysis: [
            {
                title: '📅 关键时间线',
                points: [
                    '3-05：抖省省独立 App 上线（C 端搜索工具）',
                    '5-07：五一团购 +60%、酒店 +75%',
                    '5-18：出单宝发布（B 端零门槛托管）',
                    '5-22：本地推 GMV 同比 +50%（行业数据）'
                ]
            },
            {
                title: '🎯 战略意图',
                points: [
                    'C 端搜索 + B 端投放双轮驱动',
                    '从一二线向单体中小商家渗透',
                    '按核销计费降低商家门槛',
                    '内容→搜索→交易→核销全链路闭环'
                ]
            },
            {
                title: '⚡ 快手应对',
                points: [
                    '补齐节假日 OTA/酒店流量承接',
                    '中小商家侧推托管+CPA 方案',
                    '丽人/美容赛道：6-8 月旺季重点布局',
                    '本地推 C 端搜索入口强化'
                ]
            },
            {
                title: '📊 关键数据',
                points: [
                    '抖音生活 5 月团购 GMV +60%',
                    '出单宝首期定向单体中小商家',
                    '快手本地推同期增速对比待补充',
                    '丽人/酒店节假日 ROI 对比追踪'
                ]
            }
        ],
        sources: sources.slice(0, 6),
        related: bytedanceItems.slice(0, 6)
    };
}

function buildTencentAnswer(matchedComp, matchedIntel) {
    const tencentItems = competitorData.filter(c => c.company === '腾讯');
    const tencentItem = tencentItems[0];
    
    return {
        summary: `📈 腾讯 2026Q1 广告收入同比 +20%，视频号 + 搜一搜双核驱动。视频号广告并入腾讯广告统一平台后，本地生活广告同比 +40%；搜一搜月活 5亿+，本地生活搜索成型。马化腾在财报会强调"AI 技术 + 生态协同"是长期增长引擎，预示 Q2 加大 AI 投放工具与微信小店的本地化整合，对快手生态形成"流量+工具"双重压力。`,
        analysis: [
            {
                title: '📈 增长驱动',
                points: [
                    '视频号广告并入统一平台，变现效率↑',
                    '搜一搜月活 5亿+，本地生活搜索场景成型',
                    '本地生活广告 +40%，成核心增量',
                    '微信小店与视频号联动，闭环加速'
                ]
            },
            {
                title: '🔍 对快手启示',
                points: [
                    '"搜索+内容"双轮驱动模式得到验证',
                    '视频号本地生活广告高增长值得追踪',
                    '统一广告平台提升变现效率',
                    'AI 工具化是 Q2 行业共识'
                ]
            },
            {
                title: '💡 战略建议',
                points: [
                    '强化快手搜索能力建设',
                    '广告产品整合，提升 ROI 效率',
                    '关注视频号本地生活商家迁移趋势',
                    'AI 投放工具加速落地'
                ]
            },
            {
                title: '⚠️ 风险点',
                points: [
                    '微信小店与视频号联动加深平台粘性',
                    '腾讯生态商家可能形成"路径依赖"',
                    '快手老铁电商面临微信关系链分流',
                    '本地生活搜索心智争夺战开启'
                ]
            }
        ],
        sources: tencentItem ? tencentItem.sources : [],
        related: tencentItems.concat(
            competitorData.filter(c => c.title && c.title.includes('本地生活'))
        ).slice(0, 6)
    };
}

function buildGenericAnswer(query, matchedComp, matchedIntel) {
    const totalMatches = matchedComp.length + matchedIntel.length;
    
    if (totalMatches === 0) {
        // 完全没找到匹配数据，返回最新动态
        const latestComp = [...competitorData]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        return {
            summary: `没有找到与"${query}"直接相关的情报。这里展示情报库中最新的 5 条动态，您也可以尝试使用更具体的关键词，例如「出单宝」「字节」「腾讯」等。`,
            analysis: [
                {
                    title: '📰 情报库最新动态',
                    points: latestComp.map(item => `${item.date} | ${item.company}：${item.title}`)
                }
            ],
            sources: latestComp.flatMap(item => item.sources || []).slice(0, 5),
            related: latestComp
        };
    }
    
    // 构建结构化答案
    const allMatched = [...matchedComp, ...matchedIntel].slice(0, 8);
    const points = matchedComp.slice(0, 5).map(item => 
        `[${item.date}] ${item.company}：${item.title}`
    );
    
    if (matchedIntel.length > 0) {
        matchedIntel.slice(0, 3).forEach(item => {
            const company = Array.isArray(item.company) ? item.company.join('/') : item.company;
            points.push(`[${item.date}] ${company}：${item.title}`);
        });
    }
    
    return {
        summary: `根据您的问题"${query}"，在情报库中找到 ${totalMatches} 条相关信息（${matchedComp.length}条竞对动态，${matchedIntel.length}条市场洞察）。以下是核心情报和相关动态。`,
        analysis: [
            {
                title: '🔍 相关情报',
                points: points
            }
        ],
        sources: allMatched.flatMap(item => item.sources || []).slice(0, 6),
        related: allMatched
    };
}

function renderAIAnswer(answer) {
    if (!answer || !answer.summary) {
        console.error('[AI Search] Invalid answer:', answer);
        return;
    }
    
    // 渲染摘要
    const summaryEl = document.getElementById('answerSummary');
    if (summaryEl) summaryEl.innerHTML = answer.summary;
    
    // 渲染结构化分析
    const analysisEl = document.getElementById('answerAnalysis');
    if (analysisEl && answer.analysis) {
        const analysisHtml = answer.analysis.map(section => `
            <div class="analysis-section">
                <h4>${section.title}</h4>
                <ul>
                    ${section.points.map(point => `<li>${point}</li>`).join('')}
                </ul>
            </div>
        `).join('');
        analysisEl.innerHTML = analysisHtml;
    }
    
    // 渲染来源
    const sourcesEl = document.getElementById('answerSources');
    if (sourcesEl) {
        if (answer.sources && answer.sources.length > 0) {
            sourcesEl.innerHTML = `
                <h4>📎 信息来源</h4>
                <div class="source-links">
                    ${answer.sources.map(s => `
                        <a href="${s.url}" target="_blank" class="source-link">
                            ${s.name}
                        </a>
                    `).join('')}
                </div>
            `;
        } else {
            sourcesEl.innerHTML = '';
        }
    }
    
    // 渲染相关动态
    const relatedEl = document.getElementById('relatedUpdates');
    if (relatedEl) {
        if (answer.related && answer.related.length > 0) {
            const relatedHtml = answer.related.map(item => {
                const company = Array.isArray(item.company) ? item.company.join('/') : (item.company || '未知');
                return `
                    <div class="related-item">
                        <div class="related-item-header">
                            <span class="related-item-company">${company}</span>
                            <span class="related-item-date">${item.date}</span>
                        </div>
                        <div class="related-item-title">${item.title}</div>
                    </div>
                `;
            }).join('');
            relatedEl.innerHTML = relatedHtml;
        } else {
            relatedEl.innerHTML = '<p class="empty-state">暂无相关动态</p>';
        }
    }
}

function closeAIAnswer() {
    const section = document.getElementById('aiAnswerSection');
    if (section) section.style.display = 'none';
}

// ==================== 显式暴露到全局，确保HTML onclick能调用 ====================
if (typeof window !== 'undefined') {
    window.askAI = askAI;
    window.closeAIAnswer = closeAIAnswer;
    window.showChangeLog = showChangeLog;
}

// ==================== 📡 信号雷达数据加载（合并进全部动态） ====================
async function loadSignalsRadar() {
    try {
        const r = await fetch('assets/data/signals_radar.json?v=' + Date.now());
        if (!r.ok) throw new Error('signals_radar.json fetch failed');
        const d = await r.json();
        window.__signals = d;
        signalsData = {
            podcasts: d.podcasts || [],
            tweets: d.tweets || [],
            deals: d.deals || []
        };
    } catch (e) {
        console.error('[signals] load failed', e);
        signalsData = { podcasts: [], tweets: [], deals: [] };
    }
}

// 将三类信号统一适配为 flow 列表项（与 intel 同构）
function buildAllFlowItems() {
    const news = (intelData || [])
        .filter(it => it._date_ok !== false)  // 仅展示窗口内条目
        .map(it => Object.assign({}, it, { _kind: 'news' }));

    const mkPodcast = (p) => ({
        id: p.id,
        _kind: 'podcast',
        date: p.date,
        title: p.title,
        tldr: (p.key_points && p.key_points[0]) || (p.sowhat || '').slice(0, 120) || ((p.show||'') + (p.guests ? ' · 嘉宾：' + p.guests.join('/') : '')),
        company: extractCompaniesFromTags(p.tags),
        tracks: extractTracksFromTags(p.tags),
        priority: p.priority || 'mid',
        signal: 'neutral',
        tags: p.tags || [],
        url: p.url,
        _raw: p
    });
    const mkTweet = (t) => ({
        id: t.id,
        _kind: 'tweet',
        date: t.date,
        title: (t.handle || t.author || '推特') + '：' + (t.content || '').slice(0, 60) + ((t.content||'').length > 60 ? '…' : ''),
        tldr: t.content || '',
        company: extractCompaniesFromTags(t.tags),
        tracks: extractTracksFromTags(t.tags),
        priority: t.priority || 'mid',
        signal: 'neutral',
        tags: t.tags || [],
        url: t.url,
        _raw: t
    });
    const mkDeal = (d) => ({
        id: d.id,
        _kind: 'deal',
        date: d.date,
        title: (d.company || '') + ' · ' + (d.round || '') + ' ' + (d.amount || ''),
        tldr: '领投：' + ((d.lead_investors||[]).join(' · ') || '—') + (d.valuation ? ' · 估值 ' + d.valuation : ''),
        company: d.company ? [d.company] : [],
        tracks: extractTracksFromTags(d.tags),
        priority: d.priority || 'mid',
        signal: 'opportunity',
        tags: d.tags || [],
        url: d.url,
        _raw: d
    });

    const podcasts = (signalsData.podcasts || []).map(mkPodcast);
    const tweets = (signalsData.tweets || []).map(mkTweet);
    const deals = (signalsData.deals || []).map(mkDeal);

    // ===== 打 _verification（podcast/tweet/deal 也要受信源规则约束）=====
    [podcasts, tweets, deals].forEach(arr => {
        arr.forEach(it => {
            if (it._verification) return; // 已有则跳过
            const isKs = isKuaishouSubject(it);
            const hasOff = isKs && hasOfficialKuaishouUrl(it.url);
            it._verification = (isKs && !hasOff) ? 'weak' : 'verified';
        });
    });

    allFlowItems = [].concat(news, podcasts, tweets, deals);
    window.allFlowItems = allFlowItems;
}

// ---- 快手主体+官方源判定（前端，与 audit_sources.py 保持同规则）----
function isKuaishouSubject(item) {
    const cs = item.company || [];
    if (cs.some(c => (c || '').includes('快手'))) return true;
    const txt = (item.title || '') + (item.headline || '');
    return txt.includes('快手');
}
function hasOfficialKuaishouUrl(url) {
    if (!url) return false;
    const host = (function parse(u){try{return new URL(u).hostname}catch(e){return ''}})(url);
    return host.endsWith('kuaishou.com') || host.endsWith('kuaishou.cn');
}

// 从 tags 中提取常见公司名
function extractCompaniesFromTags(tags) {
    if (!tags) return [];
    const known = ['快手','字节','抖音','腾讯','微信','达摩','黑马','老鸦','小红书','百度','美团','阿里','淘宝','拼多多','OpenAI','Google','Meta','Anthropic','TikTok','Snap','Snapchat','淘天','Apple','Amazon'];
    const found = [];
    tags.forEach(t => {
        const tt = (t||'').replace(/^#/, '');
        known.forEach(k => { if (tt.includes(k) && !found.includes(k)) found.push(k); });
    });
    return found.slice(0, 3);
}
function extractTracksFromTags(tags) {
    if (!tags) return [];
    const known = ['AI','AIGC','本地生活','本地服务','电商','线索广告','广告','出海','社交','直播','短视频','服务业','理人行业','医美','口腔','外卖','酒旅'];
    const found = [];
    tags.forEach(t => {
        const tt = (t||'').replace(/^#/, '');
        known.forEach(k => { if (tt.includes(k) && !found.includes(k)) found.push(k); });
    });
    return found.slice(0, 3);
}

function priChip(p) {
    const map = { high: '🔴 高', mid: '🟡 中', low: '⚪ 低' };
    return `<span class="signal-pri ${p||'low'}">${map[p]||'低'}</span>`;
}

// 信号雷达 已合并进 全部动态，不再独立渲染。以下函数保留供调试或外部调用。
function renderSignalPane() { /* deprecated - merged into allFlowItems */ }

// 启动加载（信号雷达 已被合并进 DOMContentLoaded 主流程，不再独立启动）
if (typeof window !== 'undefined') {
    window.loadSignalsRadar = loadSignalsRadar;
}
