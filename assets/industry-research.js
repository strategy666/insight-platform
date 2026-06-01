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

        const modal = document.getElementById('industryDetailModal');
        if (!modal) { console.warn('[industry-research] modal \u4e22\u5931\uff0c\u8df3\u8fc7\u6253\u5f00'); return; }
        // \u9632\u5fa1\u6027\uff1a\u786e\u4fdd modal \u6302\u5728 body \u4e0b\uff08\u9632\u6b62\u88ab tab-pane / transform \u7236\u5143\u7d20\u8c08\u7269\u5316\u5f71\u54cd\uff09
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }

        document.getElementById('idmL1Tag').innerHTML = `${cat.icon} ${escapeHtml(l1)}`;
        document.getElementById('idmL1Tag').style.background = cat.color;
        document.getElementById('idmL2Title').textContent = item.name;
        document.getElementById('idmGmv').textContent = fmtGmv(item.gmv_2025);
        document.getElementById('idmCagr').innerHTML = `<span class="${item.cagr>=0?'pos':'neg'}">${item.cagr>=0?'+':''}${item.cagr}%</span>`;
        document.getElementById('idmGross').textContent = item.gross_margin;
        document.getElementById('idmNet').textContent = item.net_margin;
        document.getElementById('idmOnline').textContent = item.online_rate;
        document.getElementById('idmTrend').textContent = item.online_trend;

        // \u6e32\u67d3 markdown \u62a5\u544a
        document.getElementById('idmReport').innerHTML = simpleMd(item.report_md || '\u6682\u65e0\u62a5\u544a\u5185\u5bb9');
        const nxnyBtn = document.getElementById('idmNxnyLink');
        if (nxnyBtn) { nxnyBtn.style.display = 'none'; }  // \u65e7\u7248 nxny \u68c0\u7d22\u5165\u53e3\u5df2\u5e9f\u5f03

        // \u91cd\u7f6e chatbot
        const body = document.getElementById('idmChatBody');
        body.innerHTML = `<div class="chat-bubble bot">
            \ud83d\udc4b \u4f60\u6b63\u5728\u54a8\u8be2\u300c<b id="idmChatIndustry">${escapeHtml(item.name)}</b>\u300d\u884c\u4e1a\u3002<br/>
            \u53ef\u4ee5\u95ee\uff1a\u300c\u8fd9\u4e2a\u884c\u4e1a\u7684\u5feb\u624b\u673a\u4f1a\u70b9\u300d\u300cTOP3 \u73a9\u5bb6\u662f\u8c01\u300d\u300c\u7ebf\u4e0b\u8f6c\u7ebf\u4e0a\u8def\u5f84\u300d\u300c\u5ba2\u6237\u753b\u50cf\u662f\u600e\u6837\u300d\u7b49<br/>
            <small style="color:#888">\ud83d\udca1 \u8c03\u7528 DeepSeek + Tavily \u8054\u7f51\u68c0\u7d22\uff0c\u5df2\u5185\u7f6e API Key</small>
        </div>`;
        document.getElementById('idmChatInput').value = '';

        const sg = document.getElementById('idmChatSuggest');
        const suggests = [
            `${item.name} \u5934\u90e8\u73a9\u5bb6\u6709\u54ea\u4e9b`,
            `${item.name} \u5728\u5feb\u624b\u7684\u5546\u4e1a\u5316\u673a\u4f1a`,
            `${item.name} \u5ba2\u6237\u753b\u50cf`,
            `${item.name} 2026 \u8d8b\u52bf\u9884\u6d4b`,
        ];
        sg.innerHTML = '<span class="cs-label">\u8bd5\u8bd5\uff1a</span>' + suggests.map(q =>
            `<button class="cs-pill" onclick="window.__askIndChat(${JSON.stringify(q).replace(/"/g,'&quot;')})">${escapeHtml(q.replace(item.name+' ',''))}</button>`
        ).join('');

        // \u663e\u793a\u5f39\u7a97\uff1a\u53cc\u4fdd\u9669 \u2014\u2014 \u540c\u65f6\u8bbe display + class\uff0c\u9632\u6b62\u88ab\u5176\u4ed6 CSS \u8986\u76d6
        modal.style.display = 'flex';
        modal.style.zIndex = '99999';
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function closeIndustryDetail() {
        const modal = document.getElementById('industryDetailModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    function askIndustryChat() {
        const input = document.getElementById('idmChatInput');
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        appendChatMsg('user', q);
        // \u7edf\u4e00\u8d70\u8054\u7f51 AI\uff08\u5185\u7f6e DeepSeek + Tavily key\uff0c\u65e0\u9700\u7528\u6237\u914d\u7f6e\uff09
        if (typeof window.askIndustryChatWeb === 'function') {
            window.askIndustryChatWeb(q, CURRENT_INDUSTRY);
            return;
        }
        // \u6781\u7aef fallback\uff1a\u672c\u5730\u751f\u6210\uff08askIndustryChatWeb \u672a\u52a0\u8f7d\u65f6\uff09
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
        if (!md || typeof md !== 'string') md = '\u6682\u65e0\u62a5\u544a\u5185\u5bb9';
        // \u6781\u7b80 markdown \u6e32\u67d3\uff08\u4ec5\u652f\u6301 ## ### **bold** - list\uff09
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
