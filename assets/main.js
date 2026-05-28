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
    
    // 确保数据加载完成后再初始化 AI 搜索
    initAISearch();
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

// ==================== AI Search ====================
function initAISearch() {
    const searchInput = document.getElementById('aiSearchInput');
    const searchBtn = document.getElementById('aiSearchBtn');
    const suggestBtns = document.querySelectorAll('.suggest-q');
    
    if (!searchInput || !searchBtn) {
        console.error('AI Search elements not found');
        return;
    }
    
    // 搜索按钮点击
    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            console.log('Searching:', query);
            performAISearch(query);
        }
    });
    
    // 回车搜索
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                console.log('Searching (Enter):', query);
                performAISearch(query);
            }
        }
    });
    
    // 预设问题点击
    suggestBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            console.log('Suggested question clicked:', question);
            searchInput.value = question;
            performAISearch(question);
        });
    });
    
    console.log('AI Search initialized with', competitorData.length, 'competitor items and', intelData.length, 'intel items');
}

function performAISearch(query) {
    // 显示答案面板
    const panel = document.getElementById('aiAnswerPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // 分析问题并生成答案
    const answer = analyzeQuery(query);
    
    // 渲染答案
    renderAIAnswer(answer);
}

function analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // 关键词匹配逻辑
    const keywords = {
        '出单宝': ['出单宝', 'chudanbao'],
        '字节': ['字节', '抖音', 'bytedance', 'douyin'],
        '快手': ['快手', 'kuaishou'],
        '腾讯': ['腾讯', '视频号', 'tencent', 'wechat'],
        '小红书': ['小红书', 'xiaohongshu', 'redbook'],
        '百度': ['百度', 'baidu'],
        '本地生活': ['本地生活', '本地推', '团购'],
        '广告': ['广告', '投放', 'ad'],
        'AI': ['ai', '人工智能', '大模型']
    };
    
    // 找到相关的竞对动态和市场洞察
    let relatedCompetitor = [];
    let relatedIntel = [];
    
    // 搜索竞对数据
    competitorData.forEach(item => {
        const searchText = `${item.title} ${item.sowhat} ${item.company}`.toLowerCase();
        if (Object.values(keywords).some(kws => 
            kws.some(kw => lowerQuery.includes(kw) && searchText.includes(kw))
        )) {
            relatedCompetitor.push(item);
        }
    });
    
    // 搜索市场洞察数据
    intelData.forEach(item => {
        const searchText = `${item.title} ${item.tldr} ${item.sowhat_for_kuaishou}`.toLowerCase();
        if (Object.values(keywords).some(kws => 
            kws.some(kw => lowerQuery.includes(kw) && searchText.includes(kw))
        )) {
            relatedIntel.push(item);
        }
    });
    
    // 生成答案
    return generateAnswer(query, relatedCompetitor, relatedIntel);
}

function generateAnswer(query, competitors, intel) {
    const lowerQuery = query.toLowerCase();
    
    // 根据问题类型生成不同的答案
    let summary = '';
    let analysis = [];
    let sources = [];
    let related = [];
    
    // 出单宝相关问题
    if (lowerQuery.includes('出单宝')) {
        const chudanbao = competitors.find(c => c.title.includes('出单宝'));
        if (chudanbao) {
            summary = `抖音生活服务于2026年5月18日推出「出单宝」智能托管产品，采用"出单全托管+核销才计费"模式，首期定向单体中小商家开放。这是字节在本地生活商家侧的重大产品突破，彻底解决中小商家"不会投、不敢投"的痛点。`;
            
            analysis = [
                {
                    title: '📊 核心机制',
                    points: [
                        '一键托管：AI自动投放，商家零操作门槛',
                        '按核销计费：只有用户到店核销后才扣费，降低商家风险',
                        '首期定向单体中小商家：精准切入快手本地推的核心阵地'
                    ]
                },
                {
                    title: '⚠️ 对快手的影响',
                    points: [
                        '直接竞争：字节切入中小商家市场，这是快手在下沉市场的核心优势',
                        '产品压力：快手本地推是否有同类"零门槛+效果付费"产品？',
                        '时间窗口：需要快速响应，推出对标产品或差异化方案'
                    ]
                },
                {
                    title: '💡 战略建议',
                    points: [
                        '加速推出快手版"托管+按效果付费"产品',
                        '强化中小商家服务能力和运营支持',
                        '利用快手老铁经济优势，打差异化（信任度、复购率）'
                    ]
                }
            ];
            
            sources = chudanbao.sources;
            related = competitors.filter(c => c.company === '字节' && c.id !== chudanbao.id).slice(0, 3);
        }
    }
    // 字节本地生活Q2动作
    else if (lowerQuery.includes('字节') && (lowerQuery.includes('q2') || lowerQuery.includes('动作') || lowerQuery.includes('本地生活'))) {
        const bytedanceItems = competitors.filter(c => c.company === '字节' && c.date >= '2026-04-01');
        
        summary = `字节本地生活在2026年Q2连续出招，形成"抖省省上线→五一团购爆发→出单宝发布"的三步连贯布局。抖省省（3月）主打搜索工具属性切美团大众点评；五一团购同比大涨60%验证本地生活消费回暖；出单宝（5月18日）主打中小商家零门槛托管、按核销计费，精准打击快手本地推的增量市场。`;
        
        analysis = [
            {
                title: '📅 关键时间线',
                points: [
                    '2026-03-05：抖省省独立App上线，主打搜索逻辑',
                    '2026-05-07：五一假期团购增长超60%，酒店/地方菜/丽人消费升温',
                    '2026-05-18：出单宝正式发布，出单全托管+核销才计费'
                ]
            },
            {
                title: '🎯 战略意图',
                points: [
                    '产品矩阵：抖省省（C端搜索）+ 出单宝（B端投放）双轮驱动',
                    '市场下沉：从一二线城市向中小商家渗透',
                    '模式创新：按核销计费降低商家门槛，加速GMV增长'
                ]
            },
            {
                title: '⚡ 快手应对',
                points: [
                    '节假日流量承接能力需要提升（五一数据对比）',
                    '中小商家侧需要更清晰的托管+按效果付费方案',
                    '丽人/美容行业是旺季核心受益赛道，需要重点布局'
                ]
            }
        ];
        
        sources = bytedanceItems.flatMap(item => item.sources).slice(0, 5);
        related = bytedanceItems.slice(0, 4);
    }
    // 腾讯视频号
    else if (lowerQuery.includes('腾讯') || lowerQuery.includes('视频号')) {
        const tencentItem = competitors.find(c => c.company === '腾讯' && c.title.includes('视频号'));
        
        if (tencentItem) {
            summary = `腾讯2026Q1广告收入同比增长20%，视频号+搜一搜成为双核驱动力。视频号广告正式并入腾讯广告统一平台，本地生活服务广告同比增长超40%。搜一搜月活用户突破5亿，本地生活成重要搜索场景。`;
            
            analysis = [
                {
                    title: '📈 增长驱动',
                    points: [
                        '视频号：广告并入统一平台，流量变现效率提升',
                        '搜一搜：月活5亿+，本地生活搜索场景成型',
                        '本地生活广告：同比增长40%+，成为核心增量'
                    ]
                },
                {
                    title: '🔍 对快手的启示',
                    points: [
                        '搜索+短视频：腾讯验证了"搜索+内容"双轮驱动模式',
                        '本地生活：视频号在本地生活广告的高增长值得关注',
                        '平台整合：统一广告平台提升变现效率'
                    ]
                }
            ];
            
            sources = tencentItem.sources;
            related = competitors.filter(c => c.company === '腾讯' || c.title.includes('本地生活')).slice(0, 3);
        }
    }
    // 默认通用答案
    else {
        const allRelated = [...competitors, ...intel].slice(0, 5);
        
        summary = `根据您的问题"${query}"，我在情报库中找到了 ${competitors.length + intel.length} 条相关信息。以下是核心洞察和相关动态。`;
        
        analysis = [
            {
                title: '🔍 相关情报',
                points: allRelated.map(item => `${item.company || item.company?.[0] || '未知'}：${item.title}`)
            }
        ];
        
        sources = allRelated.flatMap(item => item.sources || []).slice(0, 5);
        related = allRelated;
    }
    
    return { summary, analysis, sources, related };
}

function renderAIAnswer(answer) {
    // 渲染摘要
    document.getElementById('answerSummary').textContent = answer.summary;
    
    // 渲染结构化分析
    const analysisHtml = answer.analysis.map(section => `
        <div class="analysis-section">
            <h4>${section.title}</h4>
            <ul>
                ${section.points.map(point => `<li>${point}</li>`).join('')}
            </ul>
        </div>
    `).join('');
    document.getElementById('answerAnalysis').innerHTML = analysisHtml;
    
    // 渲染来源
    const sourcesHtml = `
        <h4>📎 信息来源</h4>
        <div class="source-links">
            ${answer.sources.map(s => `
                <a href="${s.url}" target="_blank" class="source-link">
                    ${s.name}
                </a>
            `).join('')}
        </div>
    `;
    document.getElementById('answerSources').innerHTML = sourcesHtml;
    
    // 渲染相关动态
    const relatedHtml = answer.related.map(item => `
        <div class="related-item">
            <div class="related-item-header">
                <span class="related-item-company">${item.company || item.company?.[0] || '未知'}</span>
                <span class="related-item-date">${item.date}</span>
            </div>
            <div class="related-item-title">${item.title}</div>
        </div>
    `).join('');
    document.getElementById('relatedUpdates').innerHTML = relatedHtml || '<p class="empty-state">暂无相关动态</p>';
}

function closeAIAnswer() {
    document.getElementById('aiAnswerPanel').style.display = 'none';
}
