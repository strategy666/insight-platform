/**
 * 飞书检索集成模块 (v3)
 * - 前端模糊搜本地 intel/competitor 数据
 * - 关键词联想（70+ 关键词库）
 * - 一键 copy 飞书检索命令到剪贴板
 * - 显示 cli 跑完后的回写指引
 */
(function(){
    'use strict';

    var STATE = {
        keywords: null,        // {companies:[], topics:[], signals:[], tracks:[]}
        intel: [],
        competitorUpdates: [], // 扁平的竞对动态
    };

    // ========== 数据加载 ==========
    function loadAll(){
        // 关键词库
        fetch('assets/data/feishu_keywords.json').then(r=>r.json())
            .then(d => { STATE.keywords = d; })
            .catch(()=>{ STATE.keywords = {companies:[], topics:[], signals:[], tracks:[]}; });

        // intel
        fetch('assets/data/intel.json').then(r=>r.json())
            .then(d => { STATE.intel = d.items || []; })
            .catch(()=>{});

        // competitor_updates
        fetch('assets/data/competitor_updates.json').then(r=>r.json())
            .then(d => {
                var flat = [];
                Object.keys(d.competitors || {}).forEach(function(k){
                    (d.competitors[k].updates || []).forEach(function(u){
                        flat.push(Object.assign({_competitor: d.competitors[k].name || k}, u));
                    });
                });
                STATE.competitorUpdates = flat;
            })
            .catch(()=>{});
    }
    loadAll();

    // ========== 模糊匹配 ==========
    function fuzzyMatch(query, items, fields){
        var q = query.toLowerCase().trim();
        if(!q) return [];
        return items.filter(function(it){
            return fields.some(function(f){
                var v = it[f];
                if(Array.isArray(v)) v = v.join(' ');
                return (v||'').toString().toLowerCase().indexOf(q) >= 0;
            });
        }).slice(0, 8);
    }

    // ========== 关键词联想 ==========
    function suggestKeywords(query){
        if(!STATE.keywords || !query) return [];
        var q = query.toLowerCase();
        var pool = []
            .concat(STATE.keywords.companies || [])
            .concat(STATE.keywords.topics || [])
            .concat(STATE.keywords.signals || []);
        return pool.filter(function(k){
            return k.toLowerCase().indexOf(q) >= 0 && k.toLowerCase() !== q;
        }).slice(0, 6);
    }

    // ========== 渲染搜索结果 ==========
    function renderResultPanel(panelId, query, opts){
        opts = opts || {};
        var panel = document.getElementById(panelId);
        if(!panel) return;

        if(!query || !query.trim()){
            panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';

        var dataset = opts.dataset || 'intel';
        var items, html;

        if(dataset === 'intel'){
            items = fuzzyMatch(query, STATE.intel, ['title','tldr','tags','company','tracks','takeaway','sowhat_for_kuaishou']);
            html = items.map(function(it){
                var tags = (it.tags||[]).slice(0,4).join(' ');
                var prio = it.priority === 'high' ? '🔴' : (it.priority === 'mid' ? '🟡' : '🟢');
                return '<div class="fs-result-item" onclick="document.getElementById(\''+ (opts.scrollTarget||'insightsGrid') +'\').scrollIntoView({behavior:\'smooth\'})">'
                     + '<div class="fs-result-meta">'+ prio +' '+ (it.date||'') +' · '+ (it.tracks||[]).join(' / ') +'</div>'
                     + '<div class="fs-result-title">'+ escapeHtml(it.title) +'</div>'
                     + '<div class="fs-result-desc">'+ escapeHtml(it.tldr||'') +'</div>'
                     + '<div class="fs-result-tags">'+ escapeHtml(tags) +'</div>'
                     + '</div>';
            }).join('');
        } else {
            items = fuzzyMatch(query, STATE.competitorUpdates, ['title','summary','tags','_competitor','category']);
            html = items.map(function(u){
                return '<div class="fs-result-item">'
                     + '<div class="fs-result-meta">'+ (u._competitor||'') +' · '+ (u.date||'') +' · '+ (u.category||'') +'</div>'
                     + '<div class="fs-result-title">'+ escapeHtml(u.title||'') +'</div>'
                     + '<div class="fs-result-desc">'+ escapeHtml(u.summary||'') +'</div>'
                     + '</div>';
            }).join('');
        }

        // 关键词联想
        var sug = suggestKeywords(query);
        var sugHtml = sug.length ? '<div class="fs-suggest"><span class="fs-suggest-label">联想关键词：</span>'
            + sug.map(function(k){
                return '<button class="fs-suggest-btn" onclick="window.feishuSearch.fillInput(\''+ panelId +'\',\''+ escapeAttr(k) +'\')">'+ escapeHtml(k) +'</button>';
            }).join('') + '</div>' : '';

        // 飞书命令
        var feishuCmd = 'python3 ~/.codeflicker/skills/feishu-intel-extractor/scripts/run.py "' + query.replace(/"/g,'\\"') + '"';
        var feishuExport = feishuCmd + ' --export';
        var feishuPortal = feishuCmd + ' --to-portal';

        var head = '<div class="fs-result-head">'
                 + '<div class="fs-result-stat">本地匹配 <b>'+ items.length +'</b> 条 · 数据集：'+ (dataset==='intel'?'市场情报 intel':'竞对动态') +'</div>'
                 + '<button class="fs-close" onclick="window.feishuSearch.close(\''+ panelId +'\')">✕</button>'
                 + '</div>';

        var feishuBox = '<div class="fs-feishu-box">'
                 + '<div class="fs-feishu-title">🛰️ 在飞书全库检索 <span class="fs-feishu-hint">（粘贴到终端运行，自动登录+检索+提取）</span></div>'
                 + '<div class="fs-cmd-row"><code>'+ escapeHtml(feishuCmd) +'</code><button class="fs-copy-btn" onclick="window.feishuSearch.copy(this, \''+ escapeAttr(feishuCmd) +'\')">复制</button></div>'
                 + '<div class="fs-cmd-row"><code>'+ escapeHtml(feishuPortal) +'</code><button class="fs-copy-btn" onclick="window.feishuSearch.copy(this, \''+ escapeAttr(feishuPortal) +'\')">复制 → 直接入库</button></div>'
                 + '</div>';

        panel.innerHTML = head + sugHtml + feishuBox
                        + '<div class="fs-result-list">' + (html || '<div class="fs-empty">本地未命中，但你可以用上面飞书命令搜全库</div>') + '</div>';
    }

    function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function escapeAttr(s){ return (s||'').toString().replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

    // ========== 公共 API ==========
    window.feishuSearch = {
        // 市场洞察 tab 的搜索框
        searchInsight: function(q){
            var panel = ensurePanel('aiSearchInput', 'fs-result-insight');
            renderResultPanel('fs-result-insight', q, {dataset:'intel', scrollTarget:'insightsGrid'});
        },
        // 竞对追踪 tab 的搜索框
        searchCompetitor: function(q){
            var panel = ensurePanel('competitorSearchInput', 'fs-result-competitor');
            renderResultPanel('fs-result-competitor', q, {dataset:'competitor', scrollTarget:'competitorUpdates'});
        },
        copy: function(btn, cmd){
            // 反转义（attr 里有 &quot;）
            cmd = cmd.replace(/&quot;/g,'"');
            navigator.clipboard.writeText(cmd).then(function(){
                var t = btn.textContent;
                btn.textContent = '✓ 已复制';
                btn.classList.add('copied');
                setTimeout(function(){ btn.textContent = t; btn.classList.remove('copied'); }, 1800);
            }).catch(function(){
                // fallback: textarea
                var ta = document.createElement('textarea');
                ta.value = cmd; document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); btn.textContent = '✓ 已复制'; } catch(e){}
                document.body.removeChild(ta);
            });
        },
        close: function(panelId){
            var p = document.getElementById(panelId);
            if(p) p.style.display = 'none';
        },
        fillInput: function(panelId, kw){
            var inputId = panelId === 'fs-result-insight' ? 'aiSearchInput' : 'competitorSearchInput';
            var input = document.getElementById(inputId);
            if(input){
                input.value = kw;
                input.focus();
                if(panelId === 'fs-result-insight') window.feishuSearch.searchInsight(kw);
                else window.feishuSearch.searchCompetitor(kw);
            }
        }
    };

    // 在搜索框下面动态创建结果面板
    function ensurePanel(inputId, panelId){
        var existing = document.getElementById(panelId);
        if(existing) return existing;
        var input = document.getElementById(inputId);
        if(!input) return null;
        var wrap = input.closest('.ai-search-container');
        if(!wrap) return null;
        var panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'fs-result-panel';
        panel.style.display = 'none';
        wrap.appendChild(panel);
        return panel;
    }

    // 替换原占位 searchCompetitor
    window.searchCompetitor = function(q){ window.feishuSearch.searchCompetitor(q); };

    // 增强 askAI：除了原本的 AI 回答，再叠加飞书面板
    var origAskAI = null;
    function hookAskAI(){
        if(typeof window.askAI === 'function' && !window.askAI._fsHooked){
            origAskAI = window.askAI;
            window.askAI = function(q){
                if(!q || !q.trim()) return;
                try { origAskAI(q); } catch(e){}
                window.feishuSearch.searchInsight(q);
            };
            window.askAI._fsHooked = true;
        }
    }
    // 多次尝试 hook（main.js 异步加载）
    setTimeout(hookAskAI, 500);
    setTimeout(hookAskAI, 1500);
    setTimeout(hookAskAI, 3000);

    // 输入时实时联想（debounce 350ms）
    function bindLiveSearch(){
        var input1 = document.getElementById('aiSearchInput');
        var input2 = document.getElementById('competitorSearchInput');
        function bind(input, fn){
            if(!input || input._fsBound) return;
            input._fsBound = true;
            var t;
            input.addEventListener('input', function(e){
                clearTimeout(t);
                var v = e.target.value;
                t = setTimeout(function(){ if(v.trim().length >= 2) fn(v); }, 350);
            });
        }
        bind(input1, window.feishuSearch.searchInsight);
        bind(input2, window.feishuSearch.searchCompetitor);
    }
    document.addEventListener('DOMContentLoaded', bindLiveSearch);
    setTimeout(bindLiveSearch, 1000);

    console.log('[feishuSearch] ready');
})();
