/* ============================================================
 * ai-chat.js — 行业研究 AI 联网问答 (LLM + Web Search)
 * ============================================================
 * - 支持本地数据 / 联网 AI 两种模式
 * - LLM：兼容 OpenAI 协议（OpenAI / DeepSeek / Moonshot / 通义 / 硅基流动）
 * - Web 搜索：Tavily / SerpAPI / 博查 BoCha
 * - 配置存 localStorage（不上传）
 * ============================================================ */
(function() {
    'use strict';

    const LS_KEY = 'insight_ai_config_v1';
    // 内置默认 key（项目中央配置）— 首次访问自动生效，用户可随时覆盖
    const BUILTIN_CFG = {
        llm_endpoint: 'https://api.deepseek.com/v1',
        llm_key: 'sk-26d4c78e1c6b47db9213a4a8db01b2d4',
        llm_model: 'deepseek-v4-flash',
        search_provider: 'tavily',  // 已内置 Tavily key
        search_key: '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'
    };
    const DEFAULT_CFG = {
        llm_endpoint: '',
        llm_key: '',
        llm_model: '',
        search_provider: 'tavily',
        search_key: '',
        chat_mode: 'web'  // 默认 web 模式，已内置 key
    };

    function getCfg() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            const stored = raw ? JSON.parse(raw) : {};
            // 优先级：user 的 stored 设置 > BUILTIN > DEFAULT
            // 如果 stored 中某字段为空，用 BUILTIN 补全
            const merged = Object.assign({}, DEFAULT_CFG, BUILTIN_CFG, stored);
            // 但允许用户完全清空 key（设为空串时保留用户意愿）
            if (raw && stored.llm_key === '') merged.llm_key = '';
            return merged;
        } catch (e) { return Object.assign({}, DEFAULT_CFG, BUILTIN_CFG); }
    }
    function setCfg(cfg) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
    }

    // ============ Settings UI ============
    window.openAISettings = function() {
        const m = document.getElementById('aiSettingsModal');
        const cfg = getCfg();
        document.getElementById('aisLlmEndpoint').value = cfg.llm_endpoint || '';
        document.getElementById('aisLlmKey').value = cfg.llm_key || '';
        document.getElementById('aisLlmModel').value = cfg.llm_model || '';
        document.getElementById('aisSearchProvider').value = cfg.search_provider || 'tavily';
        document.getElementById('aisSearchKey').value = cfg.search_key || '';
        document.getElementById('aisTestResult').innerHTML = '';
        m.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    };
    window.closeAISettings = function() {
        const m = document.getElementById('aiSettingsModal');
        if (m) m.style.display = 'none';
        document.body.style.overflow = '';
    };
    window.fillLlmPreset = function(p) {
        const presets = {
            openai:      { ep: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
            deepseek:    { ep: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
            'deepseek-pro': { ep: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' },
            moonshot:    { ep: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
            dashscope:   { ep: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
            siliconflow: { ep: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' }
        };
        const p2 = presets[p];
        if (!p2) return;
        document.getElementById('aisLlmEndpoint').value = p2.ep;
        document.getElementById('aisLlmModel').value = p2.model;
    };
    window.saveAISettings = function() {
        const cfg = {
            llm_endpoint: document.getElementById('aisLlmEndpoint').value.trim(),
            llm_key: document.getElementById('aisLlmKey').value.trim(),
            llm_model: document.getElementById('aisLlmModel').value.trim(),
            search_provider: document.getElementById('aisSearchProvider').value,
            search_key: document.getElementById('aisSearchKey').value.trim(),
            chat_mode: getCfg().chat_mode
        };
        setCfg(cfg);
        document.getElementById('aisTestResult').innerHTML = '<span style="color:#2a6f4f">✅ 已保存到本地浏览器</span>';
        setTimeout(window.closeAISettings, 700);
    };
    window.resetAISettings = function() {
        if (!confirm('清空所有 API 配置？')) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        document.getElementById('aisLlmEndpoint').value = '';
        document.getElementById('aisLlmKey').value = '';
        document.getElementById('aisLlmModel').value = '';
        document.getElementById('aisSearchKey').value = '';
        document.getElementById('aisTestResult').innerHTML = '<span style="color:#888">已清空</span>';
    };
    window.testAIConnection = async function() {
        const out = document.getElementById('aisTestResult');
        out.innerHTML = '⏳ 测试中...';
        const cfg = {
            llm_endpoint: document.getElementById('aisLlmEndpoint').value.trim(),
            llm_key: document.getElementById('aisLlmKey').value.trim(),
            llm_model: document.getElementById('aisLlmModel').value.trim(),
            search_provider: document.getElementById('aisSearchProvider').value,
            search_key: document.getElementById('aisSearchKey').value.trim()
        };
        const lines = [];
        // LLM
        if (cfg.llm_endpoint && cfg.llm_key) {
            try {
                const r = await callLLM([{ role: 'user', content: 'ping, reply with one word: pong' }], cfg);
                if (r) lines.push('🤖 LLM ✅ 连通：' + r.slice(0, 60));
                else lines.push('🤖 LLM ⚠️ 返回空');
            } catch (e) {
                lines.push('🤖 LLM ❌ ' + (e.message || e));
            }
        } else {
            lines.push('🤖 LLM ⚠️ 未配置 endpoint/key');
        }
        // Search
        if (cfg.search_provider !== 'none' && cfg.search_key) {
            try {
                const r = await webSearch('快手生活服务', cfg, 2);
                if (r && r.length) lines.push('🌐 搜索 ✅ 返回 ' + r.length + ' 条');
                else lines.push('🌐 搜索 ⚠️ 无结果');
            } catch (e) {
                lines.push('🌐 搜索 ❌ ' + (e.message || e));
            }
        } else if (cfg.search_provider !== 'none') {
            lines.push('🌐 搜索 ⚠️ 未配置 key');
        }
        out.innerHTML = lines.join('<br/>');
    };

    // ============ Mode Switch ============
    window.setChatMode = function(mode) {
        const cfg = getCfg();
        cfg.chat_mode = mode;
        setCfg(cfg);
        document.querySelectorAll('.idm-mode-btn[data-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        const body = document.getElementById('idmChatBody');
        if (body) {
            const div = document.createElement('div');
            div.className = 'chat-bubble system';
            div.innerHTML = mode === 'web'
                ? '🌐 已切换到「联网 AI」模式 — 下一个问题会先 Web 搜索 + 让 LLM 综合回答'
                : '📦 已切换到「本地数据」模式 — 基于行业 JSON 数据快速回答';
            body.appendChild(div);
            body.scrollTop = body.scrollHeight;
        }
    };

    // ============ Web Search ============
    async function webSearch(query, cfg, topN) {
        topN = topN || 5;
        if (!cfg.search_key || cfg.search_provider === 'none') return [];
        const provider = cfg.search_provider;
        if (provider === 'tavily') {
            const r = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: cfg.search_key,
                    query: query,
                    search_depth: 'basic',
                    max_results: topN,
                    include_answer: false
                })
            });
            if (!r.ok) throw new Error('Tavily ' + r.status + ': ' + await r.text());
            const j = await r.json();
            return (j.results || []).map(x => ({
                title: x.title, url: x.url, snippet: x.content || ''
            }));
        }
        if (provider === 'serpapi') {
            const url = 'https://serpapi.com/search.json?engine=google&hl=zh-cn&num=' + topN +
                '&q=' + encodeURIComponent(query) + '&api_key=' + encodeURIComponent(cfg.search_key);
            const r = await fetch(url);
            if (!r.ok) throw new Error('SerpAPI ' + r.status);
            const j = await r.json();
            return (j.organic_results || []).slice(0, topN).map(x => ({
                title: x.title, url: x.link, snippet: x.snippet || ''
            }));
        }
        if (provider === 'bocha') {
            const r = await fetch('https://api.bochaai.com/v1/web-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.search_key
                },
                body: JSON.stringify({ query: query, count: topN, summary: true })
            });
            if (!r.ok) throw new Error('BoCha ' + r.status + ': ' + await r.text());
            const j = await r.json();
            const items = (j.data && j.data.webPages && j.data.webPages.value) || [];
            return items.slice(0, topN).map(x => ({
                title: x.name, url: x.url, snippet: x.summary || x.snippet || ''
            }));
        }
        return [];
    }

    // ============ LLM Call ============
    async function callLLM(messages, cfg) {
        if (!cfg.llm_endpoint || !cfg.llm_key) throw new Error('未配置 LLM');
        const url = cfg.llm_endpoint.replace(/\/$/, '') + '/chat/completions';
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.llm_key
            },
            body: JSON.stringify({
                model: cfg.llm_model || 'gpt-4o-mini',
                messages: messages,
                temperature: 0.4,
                max_tokens: 2000
            })
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error('LLM ' + r.status + ': ' + t.slice(0, 300));
        }
        const j = await r.json();
        return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    }

    // ============ Streaming LLM ============
    async function callLLMStream(messages, cfg, onDelta) {
        if (!cfg.llm_endpoint || !cfg.llm_key) throw new Error('未配置 LLM');
        const url = cfg.llm_endpoint.replace(/\/$/, '') + '/chat/completions';
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.llm_key
            },
            body: JSON.stringify({
                model: cfg.llm_model || 'gpt-4o-mini',
                messages: messages,
                temperature: 0.4,
                max_tokens: 2000,
                stream: true
            })
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error('LLM ' + r.status + ': ' + t.slice(0, 300));
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        let acc = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const t = line.trim();
                if (!t || !t.startsWith('data:')) continue;
                const payload = t.slice(5).trim();
                if (payload === '[DONE]') return acc;
                try {
                    const j = JSON.parse(payload);
                    const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
                    if (d) { acc += d; onDelta(d, acc); }
                } catch (e) {}
            }
        }
        return acc;
    }

    // ============ Web AI Answer Pipeline ============
    window.askIndustryChatWeb = async function(question, ctx) {
        const cfg = getCfg();
        const body = document.getElementById('idmChatBody');
        const item = ctx && ctx.l2;
        const l1 = ctx && ctx.l1;

        if (!cfg.llm_endpoint || !cfg.llm_key) {
            appendBubble(body, 'bot',
                '⚠️ 还未配置 LLM API。点击右上角 ⚙️ 配置 OpenAI / DeepSeek / Moonshot 等任一兼容 OpenAI 协议的 API（DeepSeek 国内便宜推荐）。');
            return;
        }

        // 显示进度气泡
        const progressDiv = document.createElement('div');
        progressDiv.className = 'chat-bubble bot ai-progress';
        progressDiv.innerHTML = '🌐 <b>正在联网检索…</b>';
        body.appendChild(progressDiv);
        body.scrollTop = body.scrollHeight;

        let searchResults = [];
        let searchUsed = false;
        if (cfg.search_provider !== 'none' && cfg.search_key) {
            try {
                const enrichedQ = (item ? (item.name + ' ') : '') + question + ' 2025';
                searchResults = await webSearch(enrichedQ, cfg, 5);
                searchUsed = true;
                progressDiv.innerHTML = '🌐 已检索到 <b>' + searchResults.length + '</b> 条网络结果<br/>🤖 正在生成 AI 综合回答…';
            } catch (e) {
                progressDiv.innerHTML = '⚠️ Web 搜索失败：' + escapeHtml(e.message || String(e)) + '<br/>🤖 改用 LLM 单独回答…';
            }
        } else {
            progressDiv.innerHTML = '🤖 直接调用 LLM（未配置 Web 搜索）…';
        }

        // 构造 prompt
        const ctxBlock = item ? `
当前用户咨询的行业是：「${item.name}」（所属一级：${l1}）
本地参考数据（仅供基础参考，请优先用网络检索结果）：
- 2025E 市场规模：${item.gmv_2025} 亿元
- 3 年 CAGR：${item.cagr}%
- 毛利率：${item.gross_margin}
- 净利率：${item.net_margin}
- 线上化率：${item.online_rate}（趋势 ${item.online_trend}）
` : '';

        const searchBlock = searchResults.length
            ? '\n\n以下是刚刚通过 Web 搜索获取的最新参考资料（请基于这些资料综合回答，并在末尾列出参考来源）：\n' +
              searchResults.map((s, i) => `[${i+1}] ${s.title}\n  URL: ${s.url}\n  ${(s.snippet||'').slice(0,300)}`).join('\n\n')
            : '';

        const sysPrompt = `你是一名专业的互联网战略分析师，专注于本地生活服务、电商、广告投放等领域，服务于快手生服业务团队。
回答风格：
- 数据导向，引用具体数字、玩家、案例
- 分点结构（1. 2. 3.），关键观点加粗（用 **xxx**）
- 末尾用 1-2 句话给出「快手生服视角下的启示」
- 如果使用了 Web 搜索结果，必须在最后列出「参考来源：[1] xxx [2] xxx」
- 禁止编造数据，无依据时说明
${ctxBlock}`;

        const userMsg = question + searchBlock;

        // 真正回答的气泡
        const ansDiv = document.createElement('div');
        ansDiv.className = 'chat-bubble bot';
        ansDiv.innerHTML = '<span class="cursor-blink">▍</span>';
        body.appendChild(ansDiv);

        try {
            await callLLMStream(
                [{ role: 'system', content: sysPrompt }, { role: 'user', content: userMsg }],
                cfg,
                (delta, acc) => {
                    ansDiv.innerHTML = renderMd(acc) + '<span class="cursor-blink">▍</span>';
                    body.scrollTop = body.scrollHeight;
                }
            );
            // 最终
            let finalHtml = ansDiv.innerHTML.replace(/<span class="cursor-blink">▍<\/span>/g, '');
            if (searchUsed && searchResults.length) {
                finalHtml += '<div class="ai-sources"><b>📎 参考来源</b><ol>' +
                    searchResults.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></li>`).join('') +
                    '</ol></div>';
            }
            ansDiv.innerHTML = finalHtml;
            progressDiv.remove();
        } catch (e) {
            ansDiv.innerHTML = '<span style="color:#d83a3a">❌ 调用失败：' + escapeHtml(e.message || String(e)) + '</span><br/><small>请检查 ⚙️ 配置或换一个 LLM 提供商</small>';
            progressDiv.remove();
        }
    };

    function appendBubble(body, role, html) {
        const div = document.createElement('div');
        div.className = 'chat-bubble ' + role;
        div.innerHTML = html;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
        return div;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function renderMd(md) {
        // 极简 markdown
        let html = md
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        html = html
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.+?)\*/g, '<i>$1</i>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[(\d+)\]/g, '<sup class="ref">[$1]</sup>')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^# (.+)$/gm, '<h3>$1</h3>')
            .replace(/^\s*[-•] (.+)$/gm, '<li>$1</li>')
            .replace(/^\s*(\d+)\. (.+)$/gm, '<li><b>$1.</b> $2</li>');
        // 包 list
        html = html.replace(/(<li>.*?<\/li>)(?:\s*<li>.*?<\/li>)*/gs, m => '<ul>' + m + '</ul>');
        // 段落
        html = html.split(/\n{2,}/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<div')) return p;
            return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
        }).join('');
        return html;
    }

    // ============ 暴露接口供 industry-research.js 调用 ============
    window.__getChatMode = () => getCfg().chat_mode || 'local';
    window.__getAIConfig = () => getCfg();

    // ============ Tab1 顶部 AI 问答（复用同一套 LLM） ============
    window.askAIWithLLM = async function(question) {
        const cfg = getCfg();
        const summaryEl = document.getElementById('answerSummary');
        const analysisEl = document.getElementById('answerAnalysis');
        const sourcesEl = document.getElementById('answerSources');
        const relatedEl = document.getElementById('relatedUpdates');
        if (!summaryEl) return;

        if (!cfg.llm_endpoint || !cfg.llm_key) {
            summaryEl.innerHTML = '⚠️ 还未配置 LLM API。点击行业研究 Tab 中的 ⚙️ 配置。';
            return;
        }

        // 构造本地数据上下文（让 LLM 优先用 portal 里已有的 27 条 intel + 39 条 competitor）
        const intel = (window.intelData || []).map(it => ({
            d: it.date, c: (it.company||[]).join('/'), t: it.title, w: it.tldr, s: it.signal, p: it.priority
        }));
        const comp = (window.competitorData || []).map(it => ({
            d: it.date, c: it.company, t: it.title, w: (it.sowhat||'').slice(0, 200), dim: it.dimension
        }));

        summaryEl.innerHTML = '<div class="llm-progress">🤖 <b>正在调用 ' + (cfg.llm_model||'AI') + ' 综合分析…</b> <span class="cursor-blink">▍</span></div>';
        if (analysisEl) analysisEl.innerHTML = '';
        if (sourcesEl) sourcesEl.innerHTML = '';
        if (relatedEl) relatedEl.innerHTML = '';

        const sysPrompt = `你是一名互联网战略分析师，服务于快手生活服务团队。回答问题时严格遵循：
1. **优先**基于下方"本地情报库"和"竞对追踪库"的数据回答，引用具体公司/日期/数据
2. 结合你的常识知识补充背景，但不要编造未在数据中出现的具体数字
3. 输出结构：
   - 开头一段「核心结论」（2-3 句话）
   - 然后 2-4 个【小标题】小节，每个小节 2-4 条要点
   - 末尾一句「📌 对快手生服的启示」
4. 用 markdown，关键观点 **加粗**，要点用 - 开头
5. 回答末尾如有引用 portal 数据，用 [日期-公司-标题] 形式标注

【本地情报库 - 近期市场动态 ${intel.length} 条】
${JSON.stringify(intel.slice(0, 30), null, 0)}

【竞对追踪库 - ${comp.length} 条】
${JSON.stringify(comp.slice(0, 40), null, 0)}`;

        try {
            let acc = '';
            await callLLMStream(
                [{ role: 'system', content: sysPrompt }, { role: 'user', content: question }],
                cfg,
                (delta, accNew) => {
                    acc = accNew;
                    summaryEl.innerHTML = '<div class="llm-answer">' + renderMd(acc) + '<span class="cursor-blink">▍</span></div>';
                }
            );
            summaryEl.innerHTML = '<div class="llm-answer">' + renderMd(acc) + '</div>';
            // 同时找出 portal 内最相关的 3-5 条作为「相关动态」
            if (relatedEl && (window.intelData || window.competitorData)) {
                const qLow = question.toLowerCase();
                const score = (text) => {
                    const t = String(text||'').toLowerCase();
                    let s = 0;
                    qLow.split(/[\s,，。？?]+/).filter(w => w.length >= 2).forEach(w => {
                        if (t.includes(w)) s += w.length;
                    });
                    return s;
                };
                const all = [
                    ...(window.intelData||[]).map(x => ({...x, _kind:'intel', _txt: x.title+' '+x.tldr+' '+(x.company||[]).join(' ')+' '+(x.tags||[]).join(' ')})),
                    ...(window.competitorData||[]).map(x => ({...x, _kind:'comp', _txt: x.title+' '+(x.sowhat||'')+' '+x.company}))
                ].map(x => ({...x, _s: score(x._txt)})).filter(x => x._s > 0).sort((a,b) => b._s - a._s).slice(0, 6);
                if (all.length) {
                    relatedEl.innerHTML = '<h4>📰 portal 中的相关动态</h4>' + all.map(x => `
                        <div class="related-item" onclick="${x._kind==='intel'?'openIntelModal':'switchCompetitor'}('${x.id||x.company}')">
                            <div class="related-item-header">
                                <span class="related-item-company">${Array.isArray(x.company)?x.company.join('/'):x.company}</span>
                                <span class="related-item-date">${x.date}</span>
                            </div>
                            <div class="related-item-title">${x.title}</div>
                        </div>`).join('');
                }
            }
        } catch (e) {
            summaryEl.innerHTML = '<div style="color:#d83a3a">❌ LLM 调用失败：' + escapeHtml(e.message||String(e)) + '</div>';
        }
    };

    // 初始化 mode 按钮
    function syncMode() {
        const m = getCfg().chat_mode || 'local';
        document.querySelectorAll('.idm-mode-btn[data-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === m);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncMode);
    } else {
        syncMode();
    }
})();
