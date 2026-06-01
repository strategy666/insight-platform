/* ============================================================
 * chat-widget.js — 右下角浮窗 AI 助手
 * ============================================================
 * - 复用 ai-chat.js 中的内置 DeepSeek 配置
 * - 三种能力：
 *   1) 回答市场情报/竞对/行业问题（用 portal 数据 + LLM）
 *   2) 帮助使用 portal（解释功能、跳转 tab）
 *   3) 资料检索（从 intel + competitor + feishu 中找）
 * - 会话记忆：保留最近 8 轮，存 localStorage
 * ============================================================ */
(function() {
    'use strict';

    const LS_HISTORY = 'insight_chat_history_v1';
    const LS_AI_CFG = 'insight_ai_config_v1';
    const MAX_HISTORY = 16; // 8 轮 = 16 条 msg

    // 内置兜底配置（与 ai-chat.js 中 BUILTIN_CFG 保持一致，独立可用，不依赖加载顺序）
    const FALLBACK_CFG = {
        llm_endpoint: 'https://api.deepseek.com/v1',
        llm_key: 'sk-26d4c78e1c6b47db9213a4a8db01b2d4',
        llm_model: 'deepseek-v4-flash'
    };

    // 统一获取配置：优先用 __getAIConfig（ai-chat.js 暴露的） → 再用 localStorage → 再用内置兜底
    function getEffectiveCfg() {
        let cfg = null;
        try {
            if (typeof window.__getAIConfig === 'function') cfg = window.__getAIConfig();
        } catch(e) {}
        if (!cfg || !cfg.llm_key || !cfg.llm_endpoint) {
            // 尝试自己读 localStorage
            try {
                const raw = localStorage.getItem(LS_AI_CFG);
                const stored = raw ? JSON.parse(raw) : {};
                cfg = Object.assign({}, FALLBACK_CFG, stored);
            } catch(e) {
                cfg = Object.assign({}, FALLBACK_CFG);
            }
        }
        // 任意关键字段为空 → 用 fallback 补齐
        ['llm_endpoint','llm_key','llm_model'].forEach(k => {
            if (!cfg[k]) cfg[k] = FALLBACK_CFG[k];
        });
        return cfg;
    }

    let isOpen = false;
    let isLoading = false;
    let history = loadHistory();

    function loadHistory() {
        try {
            const raw = localStorage.getItem(LS_HISTORY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }
    function saveHistory() {
        try { localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(-MAX_HISTORY))); } catch (e) {}
    }

    // ============ 构建 UI ============
    function buildWidget() {
        // 浮窗按钮
        const btn = document.createElement('button');
        btn.id = 'cwLauncher';
        btn.className = 'cw-launcher';
        btn.title = '打开 AI 助手 (Alt+/)';
        btn.innerHTML = '<span class="cw-launcher-icon">💬</span><span class="cw-launcher-dot"></span>';
        btn.addEventListener('click', toggle);
        document.body.appendChild(btn);

        // 主面板
        const panel = document.createElement('div');
        panel.id = 'cwPanel';
        panel.className = 'cw-panel';
        panel.innerHTML = `
            <div class="cw-header">
                <div class="cw-header-left">
                    <span class="cw-avatar">🤖</span>
                    <div class="cw-header-text">
                        <div class="cw-title">portal 小助手</div>
                        <div class="cw-sub">DeepSeek · 实时联动 27 条情报 + 39 条竞对</div>
                    </div>
                </div>
                <div class="cw-header-right">
                    <button class="cw-icon-btn" id="cwReset" title="重置 API 配置（恢复内置 Key）">🔄</button>
                    <button class="cw-icon-btn" id="cwClear" title="清空对话">🗑️</button>
                    <button class="cw-icon-btn" id="cwInterest" title="更新兴趣">🎯</button>
                    <button class="cw-icon-btn" id="cwClose" title="关闭 (Esc)">✕</button>
                </div>
            </div>
            <div class="cw-body" id="cwBody"></div>
            <div class="cw-quick">
                <button class="cw-q" data-q="portal 有哪些功能？怎么用？">portal 怎么用</button>
                <button class="cw-q" data-q="最近一周字节有什么动作？">字节最近动作</button>
                <button class="cw-q" data-q="帮我找飞书里关于巨量本地推的文档">查飞书文档</button>
                <button class="cw-q" data-q="本地生活赛道现在的竞争格局是什么样的？">本地生活格局</button>
            </div>
            <div class="cw-input-wrap">
                <textarea id="cwInput" class="cw-input" placeholder="问 AI 任何问题，回车发送，Shift+回车换行…" rows="1"></textarea>
                <button id="cwSend" class="cw-send" title="发送">➤</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('cwClose').addEventListener('click', close);
        document.getElementById('cwClear').addEventListener('click', clearChat);
        document.getElementById('cwReset').addEventListener('click', resetApiConfig);
        document.getElementById('cwInterest').addEventListener('click', () => {
            if (typeof window.openInterestModal === 'function') window.openInterestModal();
        });
        document.getElementById('cwSend').addEventListener('click', send);
        const input = document.getElementById('cwInput');
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
        input.addEventListener('input', autoSize);
        panel.querySelectorAll('.cw-q').forEach(b => {
            b.addEventListener('click', () => {
                input.value = b.dataset.q;
                send();
            });
        });

        // 快捷键 Alt+/
        document.addEventListener('keydown', e => {
            if (e.altKey && e.key === '/') {
                e.preventDefault();
                toggle();
            } else if (e.key === 'Escape' && isOpen) {
                close();
            }
        });

        // 渲染历史
        renderHistory();
        // 首次给个欢迎
        if (history.length === 0) {
            renderWelcome();
        }
    }

    function autoSize() {
        const input = document.getElementById('cwInput');
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    function renderWelcome() {
        const body = document.getElementById('cwBody');
        const interests = (typeof window.getUserInterests === 'function') ? window.getUserInterests() : [];
        const greeting = interests.length
            ? `你好👋 我注意到你关注 <b>${interests.slice(0, 3).join('、')}</b>${interests.length > 3 ? ` 等 ${interests.length} 个话题` : ''}，有什么想了解的吗？`
            : '你好👋 我是 portal 小助手。可以帮你<b>解读市场情报、检索竞对动态、查飞书文档</b>。试试下面的快速问题，或直接打字提问。';
        body.innerHTML = `
            <div class="cw-msg cw-msg-bot cw-welcome">
                <div class="cw-msg-avatar">🤖</div>
                <div class="cw-msg-content">${greeting}</div>
            </div>
        `;
    }

    function renderHistory() {
        const body = document.getElementById('cwBody');
        body.innerHTML = '';
        history.forEach(m => appendMsg(m.role, m.content, true));
        scrollBottom();
    }

    function appendMsg(role, html, skipSave) {
        const body = document.getElementById('cwBody');
        const div = document.createElement('div');
        div.className = 'cw-msg cw-msg-' + role;
        div.innerHTML = `
            <div class="cw-msg-avatar">${role === 'user' ? '🙋' : '🤖'}</div>
            <div class="cw-msg-content">${html}</div>
        `;
        body.appendChild(div);
        scrollBottom();
        if (!skipSave) {
            history.push({ role, content: html, ts: Date.now() });
            saveHistory();
        }
        return div;
    }

    function scrollBottom() {
        const body = document.getElementById('cwBody');
        if (body) body.scrollTop = body.scrollHeight;
    }

    function toggle() {
        isOpen = !isOpen;
        document.getElementById('cwPanel').classList.toggle('open', isOpen);
        document.getElementById('cwLauncher').classList.toggle('hidden', isOpen);
        if (isOpen) {
            setTimeout(() => {
                const inp = document.getElementById('cwInput');
                if (inp) inp.focus();
            }, 250);
        }
    }
    function close() {
        isOpen = false;
        document.getElementById('cwPanel').classList.remove('open');
        document.getElementById('cwLauncher').classList.remove('hidden');
    }
    function clearChat() {
        if (!confirm('清空与小助手的所有对话？')) return;
        history = [];
        saveHistory();
        renderWelcome();
    }

    function resetApiConfig() {
        if (!confirm('确定重置 API 配置？\n（将清除浏览器中保存的自定义 Key，恢复使用内置 DeepSeek Key）')) return;
        try { localStorage.removeItem(LS_AI_CFG); } catch(e) {}
        appendMsg('bot', '✅ <b>API 配置已重置</b>，内置 DeepSeek Key 已生效，现在可以正常提问了。');
    }

    // ============ 调用 LLM ============
    async function send() {
        if (isLoading) return;
        const input = document.getElementById('cwInput');
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        autoSize();

        appendMsg('user', escapeHtml(q));

        const cfg = getEffectiveCfg();
        if (!cfg || !cfg.llm_endpoint || !cfg.llm_key) {
            appendMsg('bot', '⚠️ <b>API 配置异常</b>。请点击右上角 🔄 <b>重置配置</b> 按钮，或前往「行业研究」Tab 点 ⚙️ 重新配置。');
            return;
        }

        isLoading = true;
        const botDiv = appendMsg('bot', '<span class="cw-typing"><span></span><span></span><span></span></span>', true);
        const contentEl = botDiv.querySelector('.cw-msg-content');

        try {
            const messages = buildMessages(q);
            let acc = '';
            await callLLMStream(messages, cfg, (delta, accNew) => {
                acc = accNew;
                contentEl.innerHTML = renderMd(acc) + '<span class="cw-cursor">▍</span>';
                scrollBottom();
            });
            const finalHtml = renderMd(acc);
            contentEl.innerHTML = finalHtml;
            // 保存到历史
            history.push({ role: 'bot', content: finalHtml, ts: Date.now() });
            saveHistory();
        } catch (e) {
            const msg = e.message || String(e);
            let hint = '';
            if (/401|invalid|unauthor|forbidden|403/i.test(msg)) {
                hint = '<br/><br/>💡 <b>解决方案</b>：点击右上角 🔄 重置配置（恢复内置 DeepSeek Key），或前往 Tab3「行业研究」点 ⚙️ 配置一个有效的 API Key';
            } else if (/network|failed to fetch|cors/i.test(msg)) {
                hint = '<br/><br/>💡 <b>网络异常</b>：可能是 VPN/防火墙拦截了 api.deepseek.com，请检查网络';
            } else {
                hint = '<br/><br/>💡 试试右上角 🔄 重置配置';
            }
            contentEl.innerHTML = '<span style="color:#d83a3a">❌ ' + escapeHtml(msg) + '</span>' + hint;
        } finally {
            isLoading = false;
        }
    }

    function buildMessages(question) {
        const interests = (typeof window.getUserInterests === 'function') ? window.getUserInterests() : [];
        const intel = (window.intelData || []).slice(0, 30).map(it => ({
            d: it.date, c: (it.company||[]).join('/'), t: it.title, w: (it.tldr||'').slice(0,120)
        }));
        const comp = (window.competitorData || []).slice(0, 40).map(it => ({
            d: it.date, c: it.company, t: it.title, w: (it.sowhat||'').slice(0,150), dim: it.dimension
        }));
        // 飞书文档（仅取最相关的，title 含问题关键词）
        const fs = (window.feishuDocs || window.feishuDB || []);
        const qLow = question.toLowerCase();
        const fsHit = fs.filter(d => (d.title||'').toLowerCase().includes(qLow.replace(/[\s?？]/g, '')) ).slice(0, 10).map(d => ({
            t: d.title, u: d.url || '', type: d.type || ''
        }));

        const sysPrompt = `你是「portal 小助手」，一个嵌入在快手生服商业化洞察 portal 右下角的 AI 助手。你的职责：

1. **回答用户问题**：基于 portal 已有的「情报库」「竞对库」「飞书文档库」回答，引用具体数据
2. **帮助使用 portal**：当用户问 portal 怎么用时，介绍：
   - Tab1「商业化洞察周报」：每周关键情报 + 全部动态列表，顶部 AI 问答
   - Tab2「竞对追踪」：9 家公司 39 条动态，按公司/维度/数据源筛选
   - Tab3「行业研究」：36 个一级行业 + 245 个二级行业脑图，点卡片进 AI 问答
   - Tab4「问答助手」：本 widget 同款，全屏体验
   - 右上角 🎯 可以更新兴趣标签
3. **资料检索**：从下方数据库中找相关条目，列出 [日期-公司-标题] 形式，飞书文档给出 URL
4. **风格**：简洁专业，2-5 段，关键观点 **加粗**，必要时用 - 要点列表

${interests.length ? `【用户兴趣标签】（请优先关注这些方向）：${interests.join('、')}\n` : ''}
【情报库 - ${intel.length} 条市场动态】
${JSON.stringify(intel)}

【竞对库 - ${comp.length} 条竞对动态】
${JSON.stringify(comp)}

${fsHit.length ? `【飞书文档相关命中 - ${fsHit.length} 篇】\n${JSON.stringify(fsHit)}` : ''}
`;

        // 拼接历史（最近 6 条）
        const recent = history.slice(-6).filter(m => m.role === 'user' || m.role === 'bot').map(m => ({
            role: m.role === 'bot' ? 'assistant' : 'user',
            content: stripHtml(m.content)
        }));

        return [
            { role: 'system', content: sysPrompt },
            ...recent,
            { role: 'user', content: question }
        ];
    }

    // ============ 复用 ai-chat.js 的流式调用 ============
    async function callLLMStream(messages, cfg, onDelta) {
        const url = cfg.llm_endpoint.replace(/\/$/, '') + '/chat/completions';
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.llm_key
            },
            body: JSON.stringify({
                model: cfg.llm_model || 'deepseek-v4-flash',
                messages,
                stream: true,
                temperature: 0.5
            })
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error('LLM ' + r.status + ': ' + t.slice(0, 200));
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '', acc = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
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

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || '';
    }

    function renderMd(md) {
        let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.+?)\*/g, '<i>$1</i>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^# (.+)$/gm, '<h3>$1</h3>')
            .replace(/^\s*[-•] (.+)$/gm, '<li>$1</li>')
            .replace(/^\s*(\d+)\. (.+)$/gm, '<li><b>$1.</b> $2</li>');
        html = html.replace(/(<li>.*?<\/li>)(?:\s*<li>.*?<\/li>)*/gs, m => '<ul>' + m + '</ul>');
        html = html.split(/\n{2,}/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<div')) return p;
            return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
        }).join('');
        return html;
    }

    // ============ 暴露 API ============
    window.openChatWidget = function() {
        if (!isOpen) toggle();
    };

    // ============ 监听兴趣更新 ============
    window.addEventListener('interests-updated', () => {
        // 重新渲染欢迎（如果当前是空对话）
        if (history.length === 0) renderWelcome();
    });

    // ============ 启动 ============
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildWidget);
    } else {
        buildWidget();
    }
})();
