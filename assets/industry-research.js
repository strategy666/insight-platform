// ===========================================
// 行业研究脑图 + 弹窗 + Chatbot 路由
// ===========================================
(function() {
    let INDUSTRY_DB = null;
    let CURRENT_INDUSTRY = null;  // 当前打开的二级行业对象
    let EXPANDED_L1 = new Set();  // 展开的一级行业
    let SEARCH_KEYWORD = '';

    async function loadIndustryDB() {
        if (INDUSTRY_DB) return INDUSTRY_DB;
        try {
            const res = await fetch('assets/data/industry_research.json?v=20260531k&t=' + Date.now());
            INDUSTRY_DB = await res.json();
            window.__INDUSTRY_DB__ = INDUSTRY_DB;  // 暴露供调试
            return INDUSTRY_DB;
        } catch (e) {
            console.error('industry_research.json 加载失败', e);
            const grid = document.getElementById('industryMindmapGrid');
            if (grid) grid.innerHTML = '<div class="mindmap-empty" style="color:#d83a3a">❌ 加载失败: ' + (e.message || e) + '</div>';
            return null;
        }
    }

    function fmtGmv(v) {
        if (!v && v !== 0) return '—';
        if (v >= 10000) return (v / 10000).toFixed(1) + ' 万亿';
        if (v >= 1000) return (v / 1000).toFixed(1) + ' 千亿';
        return v.toFixed(0) + ' 亿';
    }

    function renderMindmap() {
        const grid = document.getElementById('industryMindmapGrid');
        if (!grid || !INDUSTRY_DB) return;
        const cats = INDUSTRY_DB.l1_categories;

        // 顶部 meta
        const totalL1 = document.getElementById('indL1Count');
        const totalL2 = document.getElementById('indL2Count');
        const totalGmv = document.getElementById('indGmvTotal');
        if (totalL1) totalL1.textContent = cats.length;
        if (totalL2) totalL2.textContent = INDUSTRY_DB._meta.l2_count;
        if (totalGmv) totalGmv.textContent = fmtGmv(INDUSTRY_DB._meta.total_gmv_2025);

        // 关键词过滤
        const kw = SEARCH_KEYWORD.trim().toLowerCase();
        const filteredCats = cats.map(cat => {
            if (!kw) return cat;
            // 一级名称命中 → 整组保留并自动展开
            if (cat.name.toLowerCase().includes(kw)) {
                EXPANDED_L1.add(cat.name);
                return cat;
            }
            // 否则过滤二级
            const matchL2 = cat.l2_list.filter(l2 => l2.name.toLowerCase().includes(kw));
            if (matchL2.length === 0) return null;
            EXPANDED_L1.add(cat.name);
            return { ...cat, l2_list: matchL2, l2_count: matchL2.length };
        }).filter(Boolean);

        if (filteredCats.length === 0) {
            grid.innerHTML = '<div class="mindmap-empty">🔎 未找到匹配「' + escapeHtml(kw) + '」的行业</div>';
            return;
        }

        grid.innerHTML = filteredCats.map(cat => {
            const expanded = EXPANDED_L1.has(cat.name) || !!kw;
            const l2html = cat.l2_list.map(l2 => `
                <div class="mm-l2-card" data-l1="${escapeAttr(cat.name)}" data-l2="${escapeAttr(l2.name)}">
                    <div class="mm-l2-name">${escapeHtml(l2.name)}</div>
                    <div class="mm-l2-meta">
                        <span class="mm-gmv">${fmtGmv(l2.gmv_2025)}</span>
                        <span class="mm-cagr ${l2.cagr >= 0 ? 'pos' : 'neg'}">${l2.cagr >= 0 ? '+' : ''}${l2.cagr}%</span>
                    </div>
                </div>
            `).join('');

            return `
                <div class="mm-l1-card ${expanded ? 'expanded' : ''}" style="--l1-color:${cat.color}">
                    <div class="mm-l1-header" data-l1="${escapeAttr(cat.name)}">
                        <span class="mm-l1-dot"></span>
                        <span class="mm-l1-icon">${cat.icon}</span>
                        <span class="mm-l1-name">${escapeHtml(cat.name)}</span>
                        <span class="mm-l1-count">${cat.l2_count}</span>
                        <span class="mm-l1-gmv">${fmtGmv(cat.gmv_2025)}</span>
                        <span class="mm-l1-cagr ${cat.avg_cagr >= 0 ? 'pos' : 'neg'}">${cat.avg_cagr >= 0 ? '+' : ''}${cat.avg_cagr}%</span>
                        <span class="mm-l1-toggle">${expanded ? '▾' : '▸'}</span>
                    </div>
                    <div class="mm-l2-grid">${l2html}</div>
                </div>
            `;
        }).join('');

        // 绑定事件
        grid.querySelectorAll('.mm-l1-header').forEach(h => {
            h.onclick = (e) => {
                const l1 = h.getAttribute('data-l1');
                if (EXPANDED_L1.has(l1)) EXPANDED_L1.delete(l1);
                else EXPANDED_L1.add(l1);
                renderMindmap();
            };
        });
        grid.querySelectorAll('.mm-l2-card').forEach(c => {
            c.onclick = () => {
                const l1 = c.getAttribute('data-l1');
                const l2 = c.getAttribute('data-l2');
                openIndustryDetail(l1, l2);
            };
        });
    }

    function openIndustryDetail(l1, l2) {
        if (!INDUSTRY_DB) return;
        const cat = INDUSTRY_DB.l1_categories.find(c => c.name === l1);
        if (!cat) return;
        const item = cat.l2_list.find(x => x.name === l2);
        if (!item) return;

        CURRENT_INDUSTRY = { l1, l2: item, color: cat.color, icon: cat.icon };

        document.getElementById('idmL1Tag').innerHTML = `${cat.icon} ${escapeHtml(l1)}`;
        document.getElementById('idmL1Tag').style.background = cat.color;
        document.getElementById('idmL2Title').textContent = item.name;
        document.getElementById('idmGmv').textContent = fmtGmv(item.gmv_2025);
        document.getElementById('idmCagr').innerHTML = `<span class="${item.cagr>=0?'pos':'neg'}">${item.cagr>=0?'+':''}${item.cagr}%</span>`;
        document.getElementById('idmGross').textContent = item.gross_margin;
        document.getElementById('idmNet').textContent = item.net_margin;
        document.getElementById('idmOnline').textContent = item.online_rate;
        document.getElementById('idmTrend').textContent = item.online_trend;

        // 渲染 markdown 报告
        document.getElementById('idmReport').innerHTML = simpleMd(item.report_md);
        const nxnyBtn = document.getElementById('idmNxnyLink');
        nxnyBtn.href = 'javascript:void(0)';
        nxnyBtn.onclick = function(e) { e.preventDefault(); if (window.openNxnyModal) window.openNxnyModal(item.name); return false; };
        nxnyBtn.textContent = '📊 嵌入式检索本行业研报';

        // 重置 chatbot
        const body = document.getElementById('idmChatBody');
        document.getElementById('idmChatIndustry').textContent = item.name;
        body.innerHTML = `<div class="chat-bubble bot">
            👋 你正在咨询「<b>${escapeHtml(item.name)}</b>」行业。<br/>
            可以问：「这个行业的快手机会点」「TOP3 玩家是谁」「线下转线上路径」「客户画像是怎样」等
        </div>`;
        document.getElementById('idmChatInput').value = '';

        const sg = document.getElementById('idmChatSuggest');
        const suggests = [
            `${item.name} 头部玩家有哪些`,
            `${item.name} 在快手的商业化机会`,
            `${item.name} 客户画像`,
            `${item.name} 2026 趋势预测`,
        ];
        sg.innerHTML = '<span class="cs-label">试试：</span>' + suggests.map(q =>
            `<button class="cs-pill" onclick="window.__askIndChat(${JSON.stringify(q).replace(/"/g,'&quot;')})">${escapeHtml(q.replace(item.name+' ',''))}</button>`
        ).join('');

        // 显示弹窗
        const modal = document.getElementById('industryDetailModal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeIndustryDetail() {
        const modal = document.getElementById('industryDetailModal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function askIndustryChat() {
        const input = document.getElementById('idmChatInput');
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        appendChatMsg('user', q);
        // 路由：本地 / 联网 AI
        const mode = (typeof window.__getChatMode === 'function') ? window.__getChatMode() : 'local';
        if (mode === 'web' && typeof window.askIndustryChatWeb === 'function') {
            window.askIndustryChatWeb(q, CURRENT_INDUSTRY);
            return;
        }
        // 模拟 AI 回答（基于本地数据 + 模板）
        setTimeout(() => {
            const ans = generateIndustryAnswer(q, CURRENT_INDUSTRY);
            appendChatMsg('bot', ans);
        }, 300);
    }

    function appendChatMsg(role, text) {
        const body = document.getElementById('idmChatBody');
        const div = document.createElement('div');
        div.className = 'chat-bubble ' + role;
        div.innerHTML = role === 'bot' ? text : escapeHtml(text);
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function generateIndustryAnswer(q, ctx) {
        if (!ctx) return '请先选择一个行业';
        const item = ctx.l2;
        const l1 = ctx.l1;
        const ql = q.toLowerCase();

        // 关键词路由
        if (/玩家|品牌|龙头|头部|top|竞争|对手/i.test(q)) {
            return `<b>${item.name} 主要玩家</b><br/>
${extractFromReport(item.report_md, '主要玩家与格局')}`;
        }
        if (/机会|快手|商业化|增长|投放|广告/i.test(q)) {
            return `<b>${item.name} 快手商业化机会</b><br/>
${extractFromReport(item.report_md, '商业化机会（快手生服视角）')}<br/>
关键数据：市场规模 ${fmtGmv(item.gmv_2025)} · CAGR ${item.cagr}% · 线上化率 ${item.online_rate}`;
        }
        if (/趋势|未来|预测|展望|2026|2027|增长率|cagr/i.test(q)) {
            return `<b>${item.name} 趋势预测</b><br/>
- 3 年 CAGR：<b>${item.cagr}%</b>（${item.cagr > 0 ? '正增长' : '负增长/调整期'}）<br/>
- 线上化趋势：<b>${item.online_trend}</b>（当前 ${item.online_rate}）<br/>
- 核心驱动：${extractFromReport(item.report_md, '核心驱动因素').replace(/^- /, '')}`;
        }
        if (/规模|市场|多大|盘子|gmv/i.test(q)) {
            return `<b>${item.name} 市场规模</b><br/>
2025E：<b>${item.gmv_2025} 亿元</b><br/>
2024：${item.gmv_2024} 亿元<br/>
2023：${item.gmv_2023} 亿元<br/>
3 年 CAGR：${item.cagr}%`;
        }
        if (/利润|毛利|净利|盈利/i.test(q)) {
            return `<b>${item.name} 盈利水平</b><br/>
毛利率：<b>${item.gross_margin}</b><br/>
净利率：<b>${item.net_margin}</b><br/>
所属一级（${l1}）整体盈利特征参考`;
        }
        if (/客户|画像|用户|人群/i.test(q)) {
            return `<b>${item.name} 客户画像（一般规律）</b><br/>
- 一级行业：${l1}（${INDUSTRY_DB.l1_categories.find(c=>c.name===l1)?.biz_traits||''}）<br/>
- 线上化率 ${item.online_rate}：${item.online_vs_offline}<br/>
- 建议结合具体业务场景调研细分人群`;
        }
        if (/线下|线上|渠道|转型/i.test(q)) {
            return `<b>${item.name} 线上线下渠道</b><br/>
- 线上化率：<b>${item.online_rate}</b><br/>
- 渠道格局：${item.online_vs_offline}<br/>
- 趋势方向：${item.online_trend}<br/>
${extractFromReport(item.report_md, '商业化机会（快手生服视角）')}`;
        }

        // 默认
        return `<b>${item.name} 行业概览</b><br/>
关于「${escapeHtml(q)}」的问题，建议组合参考：<br/>
- 市场规模 <b>${fmtGmv(item.gmv_2025)}</b>，CAGR <b>${item.cagr}%</b><br/>
- 毛利 ${item.gross_margin}，线上化率 ${item.online_rate}`;
    }

    function extractFromReport(md, sectionTitle) {
        const re = new RegExp('### ' + sectionTitle + '\\n([\\s\\S]*?)(?=\\n###|\\n##|$)');
        const m = md.match(re);
        if (!m) return '（暂无相关章节）';
        return m[1].trim().replace(/\n/g, '<br/>').slice(0, 500);
    }

    function simpleMd(md) {
        // 极简 markdown 渲染（仅支持 ## ### **bold** - list）
        let html = md
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
        // list
        html = html.replace(/(?:^- .+\n?)+/gm, m => {
            const items = m.split('\n').filter(x => x.startsWith('- ')).map(x => '<li>' + x.slice(2) + '</li>').join('');
            return '<ul>' + items + '</ul>';
        });
        // paragraph
        html = html.split(/\n\n+/).map(p => {
            if (p.startsWith('<h') || p.startsWith('<ul')) return p;
            return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
        }).join('');
        return html;
    }

    function escapeHtml(s) {
        return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function filterIndustryMindmap(kw) {
        SEARCH_KEYWORD = kw || '';
        renderMindmap();
    }

    async function initIndustryMindmap() {
        const db = await loadIndustryDB();
        if (!db) return;
        // 默认展开规模最大的前 6 个
        if (EXPANDED_L1.size === 0) {
            db.l1_categories.slice(0, 6).forEach(c => EXPANDED_L1.add(c.name));
        }
        renderMindmap();
        console.log('[industry-research] 渲染完成', db.l1_categories.length, '一级 /', db._meta.l2_count, '二级');
    }

    // 进入 #research tab 自动加载
    function maybeInit() {
        const isRes = location.hash === '#research'
            || document.querySelector('.tab-link[data-tab="research"]')?.classList.contains('active');
        if (isRes && !INDUSTRY_DB) initIndustryMindmap();
    }
    function bootIndustry() {
        maybeInit();
        // 即便不是默认 tab 也提前预加载
        if (!INDUSTRY_DB) setTimeout(initIndustryMindmap, 300);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootIndustry);
    } else {
        // DOM 已就绪（脚本在 body 底部时 readyState 已 interactive/complete）
        bootIndustry();
    }
    document.addEventListener('click', e => {
        if (e.target.closest('.tab-link[data-tab="research"]')) {
            setTimeout(maybeInit, 100);
        }
    });
    // hash 变化也触发
    window.addEventListener('hashchange', () => setTimeout(maybeInit, 100));
    // ESC 关弹窗
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeIndustryDetail();
    });

    // 暴露
    window.openIndustryDetail = openIndustryDetail;
    window.closeIndustryDetail = closeIndustryDetail;
    window.askIndustryChat = askIndustryChat;
    window.filterIndustryMindmap = filterIndustryMindmap;
    window.__askIndChat = function(q) {
        document.getElementById('idmChatInput').value = q;
        askIndustryChat();
    };
})();
