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
    const t = document.getElementById('statTotal');
    if (t) t.textContent = intelData.length;
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
    
    // 生成答案
    const answer = generateAnswer(query);
    console.log('[AI Search] Generated answer:', answer);
    
    // 渲染答案
    renderAIAnswer(answer);
    
    // 滚动到答案位置
    setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
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
