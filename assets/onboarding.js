/* ============================================================
 * onboarding.js — 兴趣标签 onboarding（首次 + 月度回访）
 * ============================================================
 * - 首次打开 portal 自动弹出
 * - 之后每 30 天自动再弹出（也可点击 Header 上的 🎯 按钮主动改）
 * - 兴趣 tag 存 localStorage，AI 问答会把它注入 system prompt
 * ============================================================ */
(function() {
    'use strict';

    const LS_KEY = 'insight_user_interests_v1';
    const REMIND_DAYS = 30;

    // ============ 兴趣维度池（与 portal 数据匹配） ============
    const TAG_GROUPS = [
        {
            id: 'company',
            title: '🏢 关注的公司',
            desc: '你最关心哪些竞对/友商的动态？',
            tags: ['字节/抖音', '小红书', '腾讯/微信', '百度', '美团', '阿里/淘宝', '拼多多', 'OpenAI', 'Google', '快手内部']
        },
        {
            id: 'track',
            title: '🛣️ 关注的赛道',
            desc: '你的工作主要聚焦哪些业务赛道？',
            tags: ['本地生活', '电商', 'AI/AIGC', '广告投放', '直播', '短视频', '出海/海外', '社交内容', '搜索', '数据/分析']
        },
        {
            id: 'topic',
            title: '📚 关注的话题',
            desc: '你最希望从 portal 中获取什么类型的信息？',
            tags: ['产品发布动态', '竞对策略复盘', '财报数据', '政策/合规', '行业大盘', '案例拆解', 'AI 技术前沿', '组织/人事', '融资/IPO', '出海打法']
        },
        {
            id: 'role',
            title: '👤 你的角色',
            desc: '帮助我们提供更贴合你工作的内容',
            tags: ['策略分析', '产品经理', '运营', 'BD/商务', '广告优化师', '行业研究', '管理层', '其他']
        }
    ];

    // ============ 读写 ============
    function getInterests() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function saveInterests(data) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
    }

    // ============ 是否需要展示 ============
    function shouldShowOnboarding() {
        const cur = getInterests();
        if (!cur) return { reason: 'first' };
        const days = (Date.now() - (cur.updated || 0)) / 86400000;
        if (days >= REMIND_DAYS) return { reason: 'refresh', days: Math.round(days) };
        return null;
    }

    // ============ 构建 modal ============
    function buildModal(reason) {
        const existing = getInterests();
        const selectedSet = new Set((existing && existing.tags) || []);
        const titleText = reason === 'first'
            ? '👋 欢迎使用商业化洞察 portal'
            : '🎯 月度兴趣更新';
        const subText = reason === 'first'
            ? '花 30 秒告诉我们你关心什么，AI 助手和情报推荐会更精准'
            : `距离上次更新已经 ${reason.days || 30} 天了，更新一下你关注的话题？`;

        const groupsHtml = TAG_GROUPS.map(g => `
            <div class="ob-group">
                <div class="ob-group-head">
                    <h3 class="ob-group-title">${g.title}</h3>
                    <span class="ob-group-desc">${g.desc}</span>
                </div>
                <div class="ob-tag-list" data-group="${g.id}">
                    ${g.tags.map(t => `
                        <button class="ob-tag ${selectedSet.has(t) ? 'active' : ''}" data-tag="${escapeAttr(t)}">${t}</button>
                    `).join('')}
                </div>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.id = 'onboardingModal';
        modal.className = 'ob-modal';
        modal.innerHTML = `
            <div class="ob-overlay"></div>
            <div class="ob-panel">
                <button class="ob-close" title="跳过 (Esc)">✕</button>
                <div class="ob-header">
                    <h2 class="ob-title">${titleText}</h2>
                    <p class="ob-sub">${subText}</p>
                </div>
                <div class="ob-body">
                    ${groupsHtml}
                </div>
                <div class="ob-footer">
                    <div class="ob-count-row">
                        已选 <b id="obSelCount">${selectedSet.size}</b> 个标签
                    </div>
                    <div class="ob-actions">
                        <button class="ob-btn ob-btn-skip">${reason === 'first' ? '暂时跳过' : '保持不变'}</button>
                        <button class="ob-btn ob-btn-primary">保存我的兴趣</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // 事件绑定
        const tagEls = modal.querySelectorAll('.ob-tag');
        const countEl = modal.querySelector('#obSelCount');
        tagEls.forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('active');
                const n = modal.querySelectorAll('.ob-tag.active').length;
                countEl.textContent = n;
            });
        });

        const close = (skipped) => {
            document.body.removeChild(modal);
            document.body.style.overflow = '';
            if (!skipped) {
                // 触发自定义事件，供其他模块（chat widget）刷新
                window.dispatchEvent(new CustomEvent('interests-updated'));
            }
        };
        modal.querySelector('.ob-close').addEventListener('click', () => {
            // 跳过时也写一个 stub，避免反复弹
            if (!getInterests()) saveInterests({ tags: [], updated: Date.now(), skipped: true });
            close(true);
        });
        modal.querySelector('.ob-btn-skip').addEventListener('click', () => {
            if (!getInterests()) saveInterests({ tags: [], updated: Date.now(), skipped: true });
            close(true);
        });
        modal.querySelector('.ob-btn-primary').addEventListener('click', () => {
            const sel = Array.from(modal.querySelectorAll('.ob-tag.active')).map(b => b.dataset.tag);
            saveInterests({ tags: sel, updated: Date.now(), skipped: false });
            // 简短提示
            showToast(`✅ 已保存 ${sel.length} 个兴趣标签，AI 推荐会更聪明`);
            close(false);
        });
        modal.querySelector('.ob-overlay').addEventListener('click', () => {
            if (!getInterests()) saveInterests({ tags: [], updated: Date.now(), skipped: true });
            close(true);
        });
        document.addEventListener('keydown', escHandler);
        function escHandler(e) {
            if (e.key === 'Escape') {
                if (!getInterests()) saveInterests({ tags: [], updated: Date.now(), skipped: true });
                close(true);
                document.removeEventListener('keydown', escHandler);
            }
        }
    }

    // ============ Toast ============
    function showToast(text) {
        const t = document.createElement('div');
        t.className = 'ob-toast';
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => document.body.removeChild(t), 300);
        }, 2200);
    }

    function escapeAttr(s) {
        return String(s).replace(/"/g, '&quot;');
    }

    // ============ 暴露 API ============
    window.openInterestModal = function() {
        const cur = getInterests();
        const reason = cur ? 'refresh' : 'first';
        buildModal(reason);
    };

    window.getUserInterests = function() {
        const cur = getInterests();
        return cur && cur.tags ? cur.tags : [];
    };

    // ============ 自动触发 ============
    function autoTrigger() {
        const check = shouldShowOnboarding();
        if (check) {
            // 延迟 800ms 给页面加载预留时间
            setTimeout(() => buildModal(check.reason), 800);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoTrigger);
    } else {
        autoTrigger();
    }
})();
