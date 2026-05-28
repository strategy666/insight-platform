// ==================== 全局状态 ====================
let intelData = [];
let competitorData = [];
let currentFilters = {
    priority: 'all',
    signal: 'all',
    track: 'all',
    company: 'all',
    search: ''
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderKeyInsights();
    renderInsightsGrid();
    renderCompetitors();
    initFilters();
    initSearch();
    updateStats();
});

// ==================== 数据加载 ====================
async function loadData() {
    try {
        const [intelResp, compResp] = await Promise.all([
            fetch('assets/data/intel.json'),
            fetch('assets/data/competitor_updates.json')
        ]);
        
        const intelJson = await intelResp.json();
        const compJson = await compResp.json();
        
        intelData = intelJson.items || [];
        competitorData = compJson.items || [];
        
        // 更新最后更新时间
        document.getElementById('lastUpdate').textContent = 
            `更新于 ${intelJson._meta.last_updated}`;
    } catch (err) {
        console.error('加载数据失败:', err);
    }
}

// ==================== 渲染本周关键（Top 3 高优先级） ====================
function renderKeyInsights() {
    const highPriorityItems = intelData
        .filter(item => item.priority === 'high')
        .slice(0, 3);
    
    const html = highPriorityItems.map(item => `
        <div class="key-insight-card" data-signal="${item.signal}">
            <div class="key-card-header">
                <span class="priority-badge priority-${item.priority}">🔴 必看</span>
                <span class="signal-badge signal-${item.signal}">${getSignalIcon(item.signal)}</span>
                <span class="date">${item.date}</span>
            </div>
            <h3>${item.title}</h3>
            <p class="tldr">${item.tldr}</p>
            <div class="key-card-tags">
                ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </div>
    `).join('');
    
    document.getElementById('keyInsights').innerHTML = html || '<p class="empty-state">暂无高优先级情报</p>';
}

// ==================== 渲染情报卡片流 ====================
function renderInsightsGrid() {
    const filtered = filterInsights();
    
    if (filtered.length === 0) {
        document.getElementById('insightsGrid').innerHTML = '<p class="empty-state">暂无匹配情报</p>';
        return;
    }
    
    const html = filtered.map(item => `
        <div class="insight-card" data-id="${item.id}">
            <div class="card-header">
                <div class="card-meta">
                    <span class="priority-badge priority-${item.priority}">${getPriorityIcon(item.priority)}</span>
                    <span class="signal-badge signal-${item.signal}">${getSignalIcon(item.signal)}</span>
                    <span class="date">${item.date}</span>
                </div>
                <div class="card-companies">
                    ${item.company.map(c => `<span class="company-tag">${c}</span>`).join('')}
                </div>
            </div>
            
            <h3 class="card-title">${item.title}</h3>
            <p class="card-tldr">${item.tldr}</p>
            
            <div class="card-tags">
                ${item.tags.slice(0, 5).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            
            <div class="card-metrics">
                ${Object.entries(item.metrics || {}).slice(0, 3).map(([key, val]) => 
                    `<div class="metric"><span class="metric-label">${key}</span><span class="metric-value">${val}</span></div>`
                ).join('')}
            </div>
            
            <div class="card-footer">
                <button class="btn-expand" onclick="toggleDetails('${item.id}')">查看详情</button>
                <span class="source-count">${item.sources.length} 个来源</span>
            </div>
            
            <div class="card-details" id="details-${item.id}" style="display:none;">
                <div class="details-section">
                    <h4>核心要点</h4>
                    <ul>
                        ${item.takeaway.map(t => `<li>${t}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="details-section">
                    <h4>对快手启示</h4>
                    <p>${item.sowhat_for_kuaishou || '待补充'}</p>
                </div>
                
                ${item.timeline && item.timeline.length > 0 ? `
                <div class="details-section">
                    <h4>时间线</h4>
                    <div class="timeline">
                        ${item.timeline.map(t => `
                            <div class="timeline-item">
                                <span class="timeline-date">${t.date}</span>
                                <span class="timeline-event">${t.event}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div class="details-section">
                    <h4>信息来源</h4>
                    <ul class="sources-list">
                        ${item.sources.map(s => `
                            <li><a href="${s.url}" target="_blank">${s.name}</a> <span class="source-date">${s.date}</span></li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('insightsGrid').innerHTML = html;
}

// ==================== 筛选逻辑 ====================
function filterInsights() {
    return intelData.filter(item => {
        // 优先级筛选
        if (currentFilters.priority !== 'all' && item.priority !== currentFilters.priority) {
            return false;
        }
        
        // 信号筛选
        if (currentFilters.signal !== 'all' && item.signal !== currentFilters.signal) {
            return false;
        }
        
        // 赛道筛选
        if (currentFilters.track !== 'all' && !item.tracks.includes(currentFilters.track)) {
            return false;
        }
        
        // 公司筛选
        if (currentFilters.company !== 'all' && !item.company.includes(currentFilters.company)) {
            return false;
        }
        
        // 关键词搜索
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            return item.title.toLowerCase().includes(searchLower) ||
                   item.tldr.toLowerCase().includes(searchLower) ||
                   item.tags.some(tag => tag.toLowerCase().includes(searchLower));
        }
        
        return true;
    });
}

// ==================== 初始化筛选器 ====================
function initFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            const value = e.target.dataset.value;
            
            // 更新按钮状态
            e.target.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // 更新筛选条件
            currentFilters[type] = value;
            
            // 重新渲染
            renderInsightsGrid();
        });
    });
}

// ==================== 初始化搜索 ====================
function initSearch() {
    const searchInput = document.getElementById('globalSearch');
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

// ==================== 渲染竞对追踪 ====================
function renderCompetitors() {
    const companiesMap = {};
    competitorData.forEach(item => {
        if (!companiesMap[item.company]) {
            companiesMap[item.company] = [];
        }
        companiesMap[item.company].push(item);
    });
    
    // 渲染 Tabs
    const tabsHtml = Object.keys(companiesMap).map((company, idx) => `
        <button class="competitor-tab ${idx === 0 ? 'active' : ''}" 
                onclick="switchCompetitor('${company}')">${company}</button>
    `).join('');
    document.getElementById('competitorTabs').innerHTML = tabsHtml;
    
    // 默认显示第一个公司
    if (Object.keys(companiesMap).length > 0) {
        switchCompetitor(Object.keys(companiesMap)[0]);
    }
}

function switchCompetitor(company) {
    // 更新 Tab 状态
    document.querySelectorAll('.competitor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent === company);
    });
    
    // 渲染该公司的动态（按日期降序排列）
    const updates = competitorData
        .filter(item => item.company === company)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const html = updates.map(item => `
        <div class="competitor-card">
            <div class="comp-card-header">
                <span class="comp-category">${item.category}</span>
                <span class="comp-date">${item.date}</span>
            </div>
            <h3>${item.title}</h3>
            <p class="comp-sowhat">${item.sowhat}</p>
            
            ${item.timeline && item.timeline.length > 0 ? `
            <div class="comp-timeline">
                <div class="comp-timeline-header" onclick="toggleTimeline(this)">
                    📅 事件时间线（${item.timeline.length}个节点）<span class="tl-toggle">▶</span>
                </div>
                <div class="comp-timeline-body" style="display:none;">
                    ${item.timeline.map(t => `
                        <div class="comp-tl-item">
                            <span class="comp-tl-date">${t.date}</span>
                            <span class="comp-tl-event">${t.event}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <div class="comp-sources">
                ${item.sources.map(s => `
                    <a href="${s.url}" target="_blank" class="comp-source-link">${s.name}</a>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    document.getElementById('competitorUpdates').innerHTML = html || '<p class="empty-state">暂无动态</p>';
}

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
    document.getElementById('statTotal').textContent = intelData.length;
    document.getElementById('statHigh').textContent = 
        intelData.filter(item => item.priority === 'high').length;
    
    const companies = new Set();
    intelData.forEach(item => item.company.forEach(c => companies.add(c)));
    document.getElementById('statCompanies').textContent = companies.size;
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
