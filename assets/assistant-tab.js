/* ============================================================
 * assistant-tab.js — Tab4 战分助手
 * ============================================================
 * 设计：
 * 1) 权限 Gate：首次进 Tab4 必须申请权限（理由 + 邮箱），通过后才能用
 *    - demo 阶段直接 auto-approve（生产可对接 Lark 审批 API）
 *    - 状态存 localStorage：requested / approved / denied
 * 2) 类 bytedanceleadkb 的对话 UI（区别于前 3 个公开 tab）
 *    - 深色背景 + 红色 confidential 标识
 *    - 数据源标注「🔒 仅限授权人员」
 * 3) 知识源：从 data/internal-kb/*.md 加载（文档需先 SSO pull 下来）
 *    - 注入 DeepSeek system prompt
 *    - 答案明确标注引用的内部文档
 * ============================================================ */
(function() {
    'use strict';

    const LS_AUTH = 'insight_assistant_auth_v1';
    const LS_HIST = 'insight_assistant_chat_v1';

    // 内部知识库索引（手动 ingest 后填入）
    // 每条 = { id, category, title, doc_url, summary, full?, priority? }
    // full 字段如果存在，将作为 LLM context 注入（避免一次性塞超过 token 上限）
    let internalKB = [];
    let kbCategories = [];
    let kbMeta = {};
    let kbFilter = ''; // 侧栏搜索/过滤

    let chatHistory = loadHistory();
    let isLoading = false;

    function loadAuth() {
        try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); }
        catch(e) { return null; }
    }
    function saveAuth(d) {
        try { localStorage.setItem(LS_AUTH, JSON.stringify(d)); } catch(e) {}
    }
    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); }
        catch(e) { return []; }
    }
    function saveHistory() {
        try { localStorage.setItem(LS_HIST, JSON.stringify(chatHistory.slice(-20))); } catch(e) {}
    }

    // ============ 加载内部 KB（如果存在） ============
    async function loadInternalKB() {
        try {
            const r = await fetch('data/internal-kb/index.json?t=' + Date.now());
            if (!r.ok) return;
            const idx = await r.json();
            internalKB = idx.docs || [];
            kbCategories = idx.categories || [];
            kbMeta = idx._meta || {};
            console.log('[Assistant] Loaded internal KB:', internalKB.length, 'docs across', kbCategories.length, 'categories');
            updateKBBadge();
        } catch(e) {
            console.log('[Assistant] No internal KB yet (data/internal-kb/index.json not found)');
        }
    }

    function updateKBBadge() {
        const el = document.getElementById('asKbCount');
        if (el) el.textContent = internalKB.length;
    }

    // ============ 主渲染（根据 auth 状态切换） ============
    function render() {
        const root = document.getElementById('tab-assistant');
        if (!root) return;
        const auth = loadAuth();
        if (!auth || auth.status !== 'approved') {
            root.innerHTML = renderGate(auth);
            bindGate();
        } else {
            root.innerHTML = renderChat(auth);
            bindChat();
            renderHistoryUI();
        }
    }

    // ============ 权限申请 UI ============
    function renderGate(auth) {
        const status = auth && auth.status;
        if (status === 'requested') {
            return `
            <div class="as-shell">
              <div class="as-confidential-banner">🔒 CONFIDENTIAL · 仅限授权人员访问</div>
              <section class="hero hero-sub as-hero-dark">
                <div class="container">
                  <h1>🤖 战分助手</h1>
                  <p class="hero-subtitle">竞对内部访谈 / 战略文档 检索 · 与前三个 Tab 信息隔离</p>
                </div>
              </section>
              <div class="container">
                <div class="as-pending-card">
                    <div class="as-pending-icon">⏳</div>
                    <h2>申请审核中</h2>
                    <p>你的访问申请已提交，预计 1-2 个工作日内审批完成。审批通过后可直接刷新页面使用。</p>
                    <div class="as-meta-row">
                        <span>申请人：${escapeHtml(auth.applicant||'-')}</span>
                        <span>申请时间：${new Date(auth.ts||Date.now()).toLocaleString('zh-CN')}</span>
                    </div>
                    <button class="ob-btn ob-btn-skip" onclick="window.__assistantMockApprove()">🧪 Demo: 模拟审批通过</button>
                </div>
              </div>
            </div>`;
        }
        return `
        <div class="as-shell">
          <div class="as-confidential-banner">🔒 CONFIDENTIAL · 仅限授权人员访问</div>
          <section class="hero hero-sub as-hero-dark">
            <div class="container">
              <h1>🤖 战分助手</h1>
              <p class="hero-subtitle">竞对内部访谈 / 战略文档 检索 · 与前三个 Tab 信息隔离</p>
            </div>
          </section>
          <div class="container">
            <div class="as-gate-card">
              <div class="as-gate-head">
                <div class="as-lock-icon">🔐</div>
                <div>
                  <h2>需要申请访问权限</h2>
                  <p class="as-gate-desc">本 Tab 数据源涉及内部访谈、未公开战略文档，与前三个 Tab 的公开信息严格隔离。</p>
                </div>
              </div>

              <div class="as-rules">
                <h3>📋 访问规则</h3>
                <ul>
                  <li>仅限快手生服业务相关人员申请</li>
                  <li>申请后由数据所有人审批（demo 模式下可一键模拟通过）</li>
                  <li>所有查询有审计日志</li>
                  <li>不得截图/转发/外传内容</li>
                </ul>
              </div>

              <form class="as-form" id="asApplyForm">
                <div class="as-form-row">
                  <label>👤 你的姓名 / 工号 *</label>
                  <input type="text" id="asApplicant" placeholder="例：张三 / zhangsan" required />
                </div>
                <div class="as-form-row">
                  <label>📧 邮箱 *</label>
                  <input type="email" id="asEmail" placeholder="zhangsan@kuaishou.com" required />
                </div>
                <div class="as-form-row">
                  <label>🏢 部门 / 团队 *</label>
                  <input type="text" id="asDept" placeholder="例：生服商业化策略组" required />
                </div>
                <div class="as-form-row">
                  <label>📝 申请理由 *</label>
                  <textarea id="asReason" rows="3" placeholder="说明使用场景，如：调研 xx 行业..." required></textarea>
                </div>
                <div class="as-form-row as-form-check">
                  <label><input type="checkbox" id="asAgree" required /> 我已阅读并同意访问规则</label>
                </div>
                <button type="submit" class="as-btn-primary">提交申请</button>
              </form>
            </div>
          </div>
        </div>`;
    }

    function bindGate() {
        const form = document.getElementById('asApplyForm');
        if (!form) return;
        form.addEventListener('submit', e => {
            e.preventDefault();
            const data = {
                status: 'requested',
                applicant: document.getElementById('asApplicant').value.trim(),
                email: document.getElementById('asEmail').value.trim(),
                dept: document.getElementById('asDept').value.trim(),
                reason: document.getElementById('asReason').value.trim(),
                ts: Date.now()
            };
            if (!document.getElementById('asAgree').checked) {
                alert('请先勾选「同意访问规则」');
                return;
            }
            saveAuth(data);
            // demo 模式下立刻可点击「模拟通过」按钮
            render();
        });
    }

    // demo 用：一键审批通过
    window.__assistantMockApprove = function() {
        const cur = loadAuth() || {};
        saveAuth(Object.assign({}, cur, {
            status: 'approved',
            approvedAt: Date.now(),
            approver: 'demo-auto'
        }));
        render();
    };

    // 撤销权限（用于测试 / 用户主动退出）
    window.__assistantRevoke = function() {
        if (!confirm('确定要撤销访问权限？')) return;
        localStorage.removeItem(LS_AUTH);
        localStorage.removeItem(LS_HIST);
        chatHistory = [];
        render();
    };

    // ============ 对话 UI（类 bytedanceleadkb） ============
    function renderChat(auth) {
        return `
        <div class="as-shell as-approved">
          <div class="as-confidential-banner">
            🔒 CONFIDENTIAL · 已授权 (${escapeHtml(auth.applicant)}) · <a href="#" onclick="window.__assistantRevoke();return false;" class="as-revoke">撤销访问</a>
          </div>
          <section class="hero hero-sub as-hero-dark">
            <div class="container">
              <h1>🤖 战分助手</h1>
              <p class="hero-subtitle">基于内部文档的智能问答 · 当前知识库 <b id="asKbCount">0</b> 篇文档</p>
            </div>
          </section>

          <section class="section" style="background:#f8f9fa">
            <div class="container">
              <div class="as-chat-layout">
                <!-- 左：知识库索引 -->
                <aside class="as-sidebar">
                  <div class="as-sidebar-head">
                    <h3>🗂️ 内部知识库</h3>
                    <span class="as-help" title="文档源由管理员从 docs.corp.kuaishou.com 同步">?</span>
                  </div>
                  <input type="text" id="asKbSearch" class="as-kb-search" placeholder="🔍 过滤文档（如：26年、BP、线索）" />
                  <div id="asKbList" class="as-kb-list"></div>
                </aside>

                <!-- 右：对话主区 -->
                <main class="as-chat-main">
                  <div id="asChatBody" class="as-chat-body"></div>
                  <div class="as-quick-row">
                    <button class="as-quick" data-q="知识库里有哪些文档？按分类列出来">📚 列出所有文档</button>
                    <button class="as-quick" data-q="字节生服 26 年最新的战略重点是什么？">🎯 字节最新战略</button>
                    <button class="as-quick" data-q="字节线索广告 26Q1 的 OKR 和 Q2 规划核心点">📊 26Q1 线索 OKR</button>
                    <button class="as-quick" data-q="对比一下字节 24-26 BP 和 25-27 BP 战略变化">📈 BP 演进对比</button>
                  </div>
                  <div class="as-input-wrap">
                    <textarea id="asInput" class="as-input" rows="1" placeholder="提问内部文档相关问题（回车发送，Shift+回车换行）"></textarea>
                    <button id="asSend" class="as-send">发送 ➤</button>
                  </div>
                </main>
              </div>
            </div>
          </section>
        </div>`;
    }

    function bindChat() {
        loadInternalKB().then(() => {
            renderKBList();
            const sb = document.getElementById('asKbSearch');
            if (sb) sb.addEventListener('input', e => {
                kbFilter = e.target.value.trim().toLowerCase();
                renderKBList();
            });
        });
        const input = document.getElementById('asInput');
        const send = document.getElementById('asSend');
        if (input) {
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
            });
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 140) + 'px';
            });
        }
        if (send) send.addEventListener('click', doSend);
        document.querySelectorAll('.as-quick').forEach(b => {
            b.addEventListener('click', () => {
                document.getElementById('asInput').value = b.dataset.q;
                doSend();
            });
        });
    }

    function renderKBList() {
        const el = document.getElementById('asKbList');
        if (!el) return;
        if (!internalKB.length) {
            el.innerHTML = `
                <div class="as-kb-empty">
                  <div class="as-kb-empty-icon">📭</div>
                  <p>知识库还没有文档</p>
                  <small>请管理员把 docs.corp.kuaishou.com 上的文档 pull 到<br/><code>data/internal-kb/</code> 目录</small>
                </div>`;
            return;
        }
        // 按 category 分组
        const filt = (d) => !kbFilter || ((d.title||'')+(d.summary||'')).toLowerCase().includes(kbFilter);
        const filtered = internalKB.filter(filt);
        const catMap = {};
        kbCategories.forEach(c => { catMap[c.id] = { ...c, items: [] }; });
        catMap['_other'] = { id:'_other', icon:'📄', name:'其他', items: [] };
        filtered.forEach(d => {
            (catMap[d.category] || catMap['_other']).items.push(d);
        });
        const cats = Object.values(catMap).filter(c => c.items.length);
        if (!cats.length) {
            el.innerHTML = '<div class="as-kb-empty"><p style="padding:18px">无匹配文档</p></div>';
            return;
        }
        el.innerHTML = cats.map(c => `
            <div class="as-kb-cat">
              <div class="as-kb-cat-head">${c.icon||'📄'} ${escapeHtml(c.name)} <span class="as-kb-cat-cnt">${c.items.length}</span></div>
              ${c.items.map(d => `
                <div class="as-kb-item ${d.priority==='high'?'is-high':''}" title="${escapeHtml(d.summary||'')}">
                  <div class="as-kb-title">${d.priority==='high'?'🔥 ':''}${escapeHtml(d.title||'未命名')}</div>
                  ${d.doc_url ? `<a class="as-kb-link" href="${escapeHtml(d.doc_url)}" target="_blank" rel="noopener">原文 ↗</a>` : ''}
                </div>
              `).join('')}
            </div>
        `).join('');
    }

    function renderHistoryUI() {
        const body = document.getElementById('asChatBody');
        if (!body) return;
        if (!chatHistory.length) {
            body.innerHTML = `
                <div class="as-msg as-msg-bot">
                  <div class="as-msg-avatar">🤖</div>
                  <div class="as-msg-content">
                    你好👋 我是战分助手。我会基于内部知识库回答你的问题。<br/>
                    <small style="color:#888">所有回答会标注引用的内部文档，请勿外传。</small>
                  </div>
                </div>`;
            return;
        }
        body.innerHTML = chatHistory.map(m => `
            <div class="as-msg as-msg-${m.role}">
              <div class="as-msg-avatar">${m.role==='user'?'🙋':'🤖'}</div>
              <div class="as-msg-content">${m.content}</div>
            </div>
        `).join('');
        body.scrollTop = body.scrollHeight;
    }

    function appendMsg(role, html) {
        chatHistory.push({ role, content: html, ts: Date.now() });
        saveHistory();
        renderHistoryUI();
    }

    async function doSend() {
        if (isLoading) return;
        const inp = document.getElementById('asInput');
        const q = inp.value.trim();
        if (!q) return;
        inp.value = '';
        inp.style.height = 'auto';
        appendMsg('user', escapeHtml(q));

        const cfg = (typeof window.__getAIConfig === 'function') ? window.__getAIConfig() : null;
        if (!cfg || !cfg.llm_key) {
            appendMsg('bot', '⚠️ 尚未配置 LLM。');
            return;
        }

        isLoading = true;
        // 占位流式 bubble
        chatHistory.push({ role: 'bot', content: '<span class="cw-typing"><span></span><span></span><span></span></span>', ts: Date.now() });
        renderHistoryUI();
        const body = document.getElementById('asChatBody');
        const lastBubble = body.lastElementChild.querySelector('.as-msg-content');

        try {
            // 构造 system prompt：注入内部 KB 索引 + 命中的全文
            const sys = buildSystemPrompt(q);
            let acc = '';
            await callLLMStream([
                { role: 'system', content: sys },
                { role: 'user', content: q }
            ], cfg, (delta, accNew) => {
                acc = accNew;
                lastBubble.innerHTML = renderMd(acc) + '<span class="cw-cursor">▍</span>';
                body.scrollTop = body.scrollHeight;
            });
            lastBubble.innerHTML = renderMd(acc);
            // 更新到 history
            chatHistory[chatHistory.length - 1].content = renderMd(acc);
            saveHistory();
        } catch (e) {
            lastBubble.innerHTML = '<span style="color:#d83a3a">❌ ' + escapeHtml(e.message||String(e)) + '</span>';
            chatHistory[chatHistory.length - 1].content = lastBubble.innerHTML;
            saveHistory();
        } finally {
            isLoading = false;
        }
    }

    function buildSystemPrompt(q) {
        // 全索引（title+summary+url），按 category 分组让 LLM 更易理解
        const byCat = {};
        kbCategories.forEach(c => byCat[c.id] = { name: c.name, docs: [] });
        byCat['_other'] = { name: '其他', docs: [] };
        internalKB.forEach(d => {
            (byCat[d.category] || byCat['_other']).docs.push({
                id: d.id, title: d.title, summary: (d.summary||'').slice(0, 200), url: d.doc_url, priority: d.priority
            });
        });
        // 仅含 full 字段的文档才有正文可注入
        const qLow = q.toLowerCase();
        const fulltext = internalKB.filter(d => d.full).filter(d => {
            const t = ((d.title||'') + ' ' + (d.summary||'') + ' ' + (d.full||'')).toLowerCase();
            return qLow.split(/[\s,，。?？]+/).filter(w=>w.length>=2).some(w => t.includes(w));
        }).slice(0, 3);

        const hasFulltext = internalKB.some(d => d.full);

        return `你是「快手生服战分助手」，仅基于下方「内部知识库」回答用户问题。

【知识库元数据】
- 源文档：${kbMeta.source_title || '竞品内部材料导航目录'}
- 文档总数：${internalKB.length}（涵盖字节·生活服务/商业化整体/线索广告 三大类）
- 最后同步：${kbMeta.last_synced || '未知'}
${hasFulltext ? '- 部分文档已注入正文，可直接回答细节' : '- ⚠️ 目前知识库仅含【文档标题 + 摘要 + 原文链接】，未注入文档正文'}

【严格规则】
1. 只用知识库索引中存在的文档（title + summary）回答
2. 当问题涉及具体数据/段落细节 → 如果文档没有 full 字段，要明确说"该问题需要查看原文细节，请点击下方链接查阅：[文档标题](url)"
3. 当问题问"有哪些文档/索引/导航" → 按分类列出文档标题 + 链接
4. 回答末尾必须列出引用的文档：📎 引用文档：[文档标题](url)（可多条）
5. 数据敏感，不要在回答中外推/编造数据；只引用知识库内出现的事实
6. 用 markdown，关键观点 **加粗**，分类小标题用 ### 字节·生活服务

【知识库索引（按分类）】
${Object.entries(byCat).filter(([k,v])=>v.docs.length).map(([k,v])=>`
## ${v.name} (${v.docs.length} 篇)
${v.docs.map(d => `- [${d.title}](${d.url}) — ${d.summary}${d.priority==='high'?' 【高优】':''}`).join('\n')}`).join('\n')}

${fulltext.length ? `\n【与本次问题相关的文档全文】\n${fulltext.map((h,i) => `--- 文档 ${i+1}：${h.title} ---\n${(h.full||'').slice(0, 4000)}\n`).join('\n')}` : ''}
`;
    }

    // ============ 公用工具（复用 chat-widget 同款，独立 closure） ============
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
                messages, stream: true, temperature: 0.3
            })
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error('LLM ' + r.status + ': ' + t.slice(0, 200));
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf='', acc='';
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
                } catch(e) {}
            }
        }
        return acc;
    }
    function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    function renderMd(md) {
        let html = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        html = html
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^\s*[-•] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>)(?:\s*<li>.*?<\/li>)*/gs, m => '<ul>' + m + '</ul>');
        html = html.split(/\n{2,}/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol')) return p;
            return '<p>' + p.replace(/\n/g, '<br/>') + '</p>';
        }).join('');
        return html;
    }

    // ============ Tab 切换时渲染 ============
    function maybeRender() {
        const pane = document.getElementById('tab-assistant');
        if (pane && pane.classList.contains('active')) render();
    }

    // 监听 tab 切换
    document.addEventListener('click', e => {
        const link = e.target.closest('[data-tab="assistant"]');
        if (link) setTimeout(render, 50);
    });
    // 首次加载也可能在 assistant tab
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeRender);
    } else {
        setTimeout(maybeRender, 200);
    }

    // 永远初始化一次（保证刷新到 #assistant 也能起来）
    setTimeout(render, 500);
})();
