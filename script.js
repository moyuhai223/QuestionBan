// script.js - 最终功能完整版 (修正初始加载逻辑)

document.addEventListener('DOMContentLoaded', () => {

    // --- 模糊匹配助手（用于拍照识别后在题库中找题）---
    // 只保留中文/字母/数字，去掉标点与空格，抵消 OCR 的标点误差
    const normText = (s) => (s || '').toLowerCase().replace(/[^0-9a-z一-鿿]/g, '');
    const bigrams = (s) => {
        const set = new Set();
        if (s.length === 1) set.add(s);
        for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
        return set;
    };
    const dice = (a, b) => {
        if (!a.size || !b.size) return 0;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        return (2 * inter) / (a.size + b.size);
    };

    // 最长公共子串长度（连续命中的字数），顺序敏感、精度高，但对中间错字敏感
    const lcsLen = (a, b) => {
        const m = a.length, n = b.length;
        if (!m || !n) return 0;
        let prev = new Uint16Array(n + 1);
        let cur = new Uint16Array(n + 1);
        let best = 0;
        for (let i = 1; i <= m; i++) {
            const ci = a.charCodeAt(i - 1);
            for (let j = 1; j <= n; j++) {
                cur[j] = (ci === b.charCodeAt(j - 1)) ? prev[j - 1] + 1 : 0;
                if (cur[j] > best) best = cur[j];
            }
            const t = prev; prev = cur; cur = t;
        }
        return best;
    };
    // 三元组（连续3字）集合 + 交集计数：不计位置，OCR 散落错字只丢局部，鲁棒性强
    const trigrams = (s) => {
        const set = new Set();
        if (s.length < 3) { if (s) set.add(s); return set; }
        for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
        return set;
    };
    const interCount = (a, b) => { let c = 0; for (const x of a) if (b.has(x)) c++; return c; };

    // --- 预处理数据 ---
    questionBank.forEach(q => {
        const optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
        q._normStem = normText(q.question);            // 仅题干（主匹配键，排除选项干扰）
        q._norm = normText(q.searchableText);          // 题干+选项（并列时的次判据）
        q._bg = bigrams(q._norm);
        q._stg = trigrams(q._normStem);                // 题干三元组集（抗错字匹配用）
    });

    // 用识别出的文字在【当前选中题型】里精确定位题目。综合评分：
    //   tgHit  = 题干三元组在 OCR 里命中数（主判据，抗散落错字、不计位置）
    //   lcs    = 与题干的最长连续命中（加权提升精度，区分“仅共享开头套话”的沾边题）
    // 题号/选项/单选圈(○)等干扰：○等符号已被 normText 滤除；题号前缀在此剥离；
    // 用“题干自身三元组的命中比例”度量，分母是题干，不受截图里选项/界面文字稀释。
    const matchByText = (ocrText, topN = 8) => {
        const raw = (ocrText || '').replace(/^\s*\d{1,3}\s*[.．、]\s*/, '');  // 去掉考试题号"46."
        const q = normText(raw).slice(0, 240);
        if (q.length < 2) return [];
        const qbg = bigrams(q);
        const qtg = trigrams(q);
        // 阶段1：用便宜的 trigram 命中数粗筛 top-40（真匹配的题干三元组几乎全中，必在其中）
        const rough = questionBank
            .filter(x => x.type === currentFilterType)
            .map(x => ({ x, tgHit: interCount(x._stg, qtg) }))
            .filter(s => s.tgHit > 0)
            .sort((a, b) => b.tgHit - a.tgHit)
            .slice(0, 40);
        // 阶段2：只对候选跑较贵的 LCS，算综合分（排名规则与全量一致）
        const scored = rough
            .map(s => {
                const lcs = lcsLen(q, s.x._normStem);
                return { x: s.x, lcs, score: s.tgHit + 0.3 * lcs, d: dice(qbg, s.x._bg) };
            })
            .filter(s => s.score >= 4)                   // 几乎不相关的直接排除
            .sort((p, n) => (n.score - p.score) || (n.lcs - p.lcs) || (n.d - p.d));
        if (!scored.length) return [];
        // 有明显赢家时收紧：只留与最佳分接近的，丢掉仅共享开头套话的“沾边”题
        const cut = scored[0].score * 0.5;
        return scored.filter(s => s.score >= cut).slice(0, topN).map(s => s.x);
    };

    // --- 获取页面元素 ---
    const searchInput = document.getElementById('searchInput');
    const resultsList = document.getElementById('resultsList');
    const detailsContent = document.getElementById('detailsContent');
    const clearButton = document.getElementById('clearButton');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const header = document.querySelector('.header');
    const ocrBtn = document.getElementById('ocrBtn');
    const ocrFile = document.getElementById('ocrFile');
    const ocrStatus = document.getElementById('ocrStatus');

    // --- 状态变量 ---
    let currentFilterType = '单选题';
    let isDesktopView = false;
    let appMode = 'search';                       // 'search' | 'practice'
    // 练习模式状态
    let practiceList = [], practiceIndex = 0;
    const practiceState = {};                     // id -> { picked, correct }
    let sess = { answered: 0, correct: 0 };
    const WRONG_KEY = 'qb_wrong_v1';
    let wrongSet = new Set();
    try { wrongSet = new Set(JSON.parse(localStorage.getItem(WRONG_KEY) || '[]')); } catch (e) {}

    // --- 事件监听 ---
    toggleViewBtn.addEventListener('click', () => {
        isDesktopView = !isDesktopView;
        if (isDesktopView) {
            viewportMeta.setAttribute('content', 'width=1200');
            toggleViewBtn.innerHTML = '📱';
            toggleViewBtn.title = '切换到移动视图';
        } else {
            viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0');
            toggleViewBtn.innerHTML = '💻';
            toggleViewBtn.title = '切换到桌面视图';
        }
    });

    // 清理浏览器缓存并强制拉取最新版本（不动错题本等本地数据）
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            clearCacheBtn.disabled = true;
            clearCacheBtn.innerHTML = '⏳';
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister()));
                }
                if (window.caches && caches.keys) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                }
            } catch (e) { /* 忽略，继续强制刷新 */ }
            // 加一次性参数绕过缓存，重新拉取最新页面与资源
            location.replace(location.origin + location.pathname + '?_=' + Date.now());
        });
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (header) {
                header.classList.add('hidden');
            }
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilterType = button.dataset.type;
            if (appMode === 'practice') startPractice();   // 练习模式下切题型=换练习范围
            else performSearch();                           // 查询模式下执行搜索
        });
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
        if (header) {
            header.classList.remove('hidden');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const items = document.querySelectorAll('#resultsList li:not(.placeholder)');
        if (items.length === 0) return;
        const currentSelected = document.querySelector('#resultsList li.selected');
        let nextIndex = 0;
        if (currentSelected) {
            const currentIndex = Array.from(items).indexOf(currentSelected);
            if (event.key === 'ArrowDown' && currentIndex < items.length - 1) {
                nextIndex = currentIndex + 1;
            } else if (event.key === 'ArrowUp' && currentIndex > 0) {
                nextIndex = currentIndex - 1;
            } else {
                nextIndex = currentIndex;
            }
        }
        const newId = items[nextIndex].dataset.id;
        showDetails(newId);
    });

    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            setTimeout(() => func.apply(this, args), delay);
        };
    };

    // --- 核心功能函数 ---
    const performSearch = () => {
        const raw = searchInput.value.trim().toLowerCase();

        // 如果没有关键词，则重置界面并停止执行
        if (!raw) {
            resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
            detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
            return;
        }

        // 按空格拆成多个关键词，要求全部命中（AND）；单个词时即普通子串搜索
        const tokens = raw.split(/\s+/).filter(Boolean);
        const questionsOfType = questionBank.filter(q => q.type === currentFilterType);
        const filteredResults = questionsOfType.filter(q =>
            tokens.every(t => q.searchableText.includes(t)));
        displayResults(filteredResults);
    };

    const displayResults = (results) => {
        resultsList.innerHTML = '';
        if (results.length === 0) {
            resultsList.innerHTML = '<li class="placeholder">未找到相关题目。</li>';
            detailsContent.innerHTML = '<p class="placeholder">请尝试其他关键词或分类。</p>';
            return;
        }
        results.forEach(q => {
            const listItem = document.createElement('li');
            listItem.dataset.id = q.id;
            listItem.textContent = `[${q.type}] ${q.question.substring(0, 50)}...`;
            listItem.addEventListener('click', () => showDetails(q.id));
            resultsList.appendChild(listItem);
        });
        if (results.length > 0) {
            showDetails(results[0].id);
        }
    };
    
    const showDetails = (questionId) => {
        const allListItems = document.querySelectorAll('#resultsList li');
        allListItems.forEach(item => item.classList.remove('selected'));
        const currentListItem = document.querySelector(`#resultsList li[data-id='${questionId}']`);
        if (currentListItem) {
            currentListItem.classList.add('selected');
            currentListItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const question = questionBank.find(q => q.id === parseInt(questionId, 10));
        if (!question) return;
        let detailsHtml = `<div class="question-text">${question.question}</div>`;
        if (question.options && question.options.length > 0) {
            detailsHtml += '<ul class="options-list">';
            question.options.forEach(option => {
                const optionLetter = option.trim().charAt(0);
                if (question.answer.includes(optionLetter)) {
                    detailsHtml += `<li class="correct-answer">${option}</li>`;
                } else {
                    detailsHtml += `<li>${option}</li>`;
                }
            });
            detailsHtml += '</ul>';
        }
        let formattedAnswer = '';
        const { type, answer, options } = question;
        switch (type) {
            case '单选题':
                const singleChoiceAnswer = options.find(opt => opt.trim().startsWith(answer));
                formattedAnswer = singleChoiceAnswer || answer;
                break;
            case '多选题':
                const multiChoiceAnswers = options.filter(opt => answer.includes(opt.trim().charAt(0))).join('<br>');
                formattedAnswer = multiChoiceAnswers || answer;
                break;
            case '判断题':
            default:
                formattedAnswer = answer;
                break;
        }
        if (type === '多选题' && formattedAnswer.includes('<br>')) {
            detailsHtml += `<div class="answer"><strong>答案：</strong><br>${formattedAnswer}</div>`;
        } else {
            detailsHtml += `<div class="answer"><strong>答案：</strong> ${formattedAnswer}</div>`;
        }
        detailsContent.innerHTML = detailsHtml;
    };

    // --- 拍照搜题（OCR）：调用服务端 RapidOCR；后端不存在/失败则提示手动搜索 ---
    const setOcrStatus = (msg) => {
        ocrStatus.textContent = msg || '';
        ocrStatus.style.display = msg ? 'block' : 'none';
    };

    // 服务端高精度 OCR（本地 Umi-OCR 或服务器上的 RapidOCR/PaddleOCR）。
    // 浏览器只请求同源的 /umi-ocr：本地由 ocr_server.py 代理，线上由反代到 127.0.0.1:1224。
    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = () => reject(new Error('读图失败'));
        fr.readAsDataURL(blob);
    });
    // 上传前把大照片缩到长边 ≤1600 的 JPEG（自适应质量、体积封顶 ~380KB）：
    // 高像素拍照绝不原图上传，省流量、避免超出反代上限、并加速识别。
    const shrinkForUpload = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const maxSide = 1600;
            const longSide = Math.max(img.naturalWidth, img.naturalHeight) || 1;
            const scale = longSide > maxSide ? maxSide / longSide : 1;
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            const toBlob = (q) => new Promise(r => cv.toBlob(r, 'image/jpeg', q));
            (async () => {
                let blob = await toBlob(0.82);
                if (blob && blob.size > 380 * 1024) blob = await toBlob(0.6);   // 细节多的真照片再压一档
                blob ? resolve(blob) : reject(new Error('压缩失败'));
            })();
        };
        img.onerror = () => reject(new Error('图片读取失败'));
        img.src = URL.createObjectURL(file);
    });
    const umiOcr = async (file) => {
        const blob = await shrinkForUpload(file);
        setOcrStatus('已压缩至约 ' + Math.round(blob.size / 1024) + ' KB，上传识别中…');
        const b64 = await blobToBase64(blob);
        const resp = await fetch('/umi-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: b64 })
        });
        if (!resp.ok) throw new Error('后端 ' + resp.status);
        const j = await resp.json();
        if (j.code === 100) {
            return typeof j.data === 'string'
                ? j.data
                : (Array.isArray(j.data) ? j.data.map(x => x.text).join('\n') : '');
        }
        if (j.code === 101) return '';               // 未识别到文字
        throw new Error('OCR code ' + j.code);
    };

    if (ocrBtn && ocrFile) {
        ocrBtn.addEventListener('click', () => ocrFile.click());

        ocrFile.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            ocrFile.value = '';                       // 允许重复选同一张图
            if (!file) return;
            ocrBtn.disabled = true;
            const manualTip = '请直接在上方输入框手动输入题目关键词搜索。';
            try {
                let text;
                try {
                    setOcrStatus('正在调用服务端 OCR 识别…');
                    text = await umiOcr(file);
                } catch (e) {
                    // 后端不存在 / 调用失败：不再本地识别，提示手动搜索
                    setOcrStatus('⚠️ OCR 服务不可用（' + (e && e.message ? e.message : e) + '）。' + manualTip);
                    displayResults([]);
                    return;
                }
                const shown = normText(text);
                if (shown.length < 4) {
                    setOcrStatus('没识别到足够文字。' + manualTip);
                    displayResults([]);
                    return;
                }
                const matches = matchByText(text, 8);
                if (!matches.length) {
                    setOcrStatus('识别为「' + shown.slice(0, 24) + (shown.length > 24 ? '…' : '') + '」，题库未匹配到。' + manualTip);
                    displayResults([]);
                    return;
                }
                if (header) header.classList.add('hidden');
                setOcrStatus('［服务端OCR］识别：' + shown.slice(0, 46) + (shown.length > 46 ? '…' : '') +
                    '　—— 已跳到答案，绿色为正确项。');
                displayResults(matches);
                // 识别成功后直接滚到答案：优先对准绿色正确项 / 答案框，手机上免去手动下滑
                requestAnimationFrame(() => {
                    const target = document.querySelector('#detailsContent .correct-answer')
                        || document.querySelector('#detailsContent .answer')
                        || document.querySelector('.details-panel');
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            } finally {
                ocrBtn.disabled = false;
            }
        });
    }

    // ===== 练习模式（即时判分）=====
    const searchView = document.getElementById('searchView');
    const practiceView = document.getElementById('practiceView');
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const pProgress = document.getElementById('practiceProgress');
    const pQ = document.getElementById('practiceQ');
    const pOptions = document.getElementById('practiceOptions');
    const pSubmit = document.getElementById('practiceSubmit');
    const pFeedback = document.getElementById('practiceFeedback');
    const pPrev = document.getElementById('practicePrev');
    const pNext = document.getElementById('practiceNext');
    const pRestart = document.getElementById('practiceRestart');
    const pClearWrong = document.getElementById('practiceClearWrong');
    const pShuffle = document.getElementById('practiceShuffle');
    const pWrongOnly = document.getElementById('practiceWrongOnly');

    const saveWrong = () => { try { localStorage.setItem(WRONG_KEY, JSON.stringify([...wrongSet])); } catch (e) {} };
    const shuffleArr = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
    };
    // 题目的可选项：判断题给 √/× 两个；其余取选项首字母
    const optLetters = (q) => q.type === '判断题'
        ? [{ letter: '√', text: '正确（√）' }, { letter: '×', text: '错误（×）' }]
        : q.options.map(o => ({ letter: o.trim().charAt(0), text: o }));

    const startPractice = () => {
        let pool = questionBank.filter(q => q.type === currentFilterType && q.answer);
        if (pWrongOnly.checked) pool = pool.filter(q => wrongSet.has(q.id));
        practiceList = pShuffle.checked ? shuffleArr(pool.slice()) : pool.slice();
        practiceIndex = 0;
        for (const k in practiceState) delete practiceState[k];
        sess = { answered: 0, correct: 0 };
        renderPractice();
    };

    const showFeedback = (q, st) => {
        if (st.correct) {
            pFeedback.textContent = '✓ 回答正确';
            pFeedback.className = 'practice-feedback ok';
        } else {
            pFeedback.textContent = '✗ 回答错误，正确答案：' + q.answer;
            pFeedback.className = 'practice-feedback bad';
        }
    };

    const renderPractice = () => {
        const total = practiceList.length;
        pSubmit.style.display = 'none';
        pFeedback.textContent = ''; pFeedback.className = 'practice-feedback';
        pOptions.innerHTML = '';
        if (!total) {
            pProgress.textContent = '';
            pQ.textContent = pWrongOnly.checked
                ? '错题本里暂时没有「' + currentFilterType + '」，先去做题或取消「只练错题」。'
                : '该题型暂无题目。';
            pPrev.disabled = pNext.disabled = true;
            return;
        }
        const rate = sess.answered ? Math.round(sess.correct / sess.answered * 100) : 0;
        pProgress.textContent = `第 ${practiceIndex + 1} / ${total} 题　已答 ${sess.answered}　正确 ${sess.correct}` +
            (sess.answered ? `（${rate}%）` : '');
        pPrev.disabled = practiceIndex === 0;
        pNext.disabled = practiceIndex === total - 1;

        const q = practiceList[practiceIndex];
        pQ.textContent = q.question;   // 题干原样显示（位置见上方进度条，避免与题干自带题号重复）
        const isMulti = q.type === '多选题';
        const st = practiceState[q.id];                     // 已答状态(锁定)或 undefined
        optLetters(q).forEach(o => {
            const div = document.createElement('div');
            div.dataset.letter = o.letter;
            div.textContent = o.text;
            div.className = 'p-opt';
            if (st) {
                const inAns = q.answer.includes(o.letter);
                const inPick = Array.isArray(st.picked) ? st.picked.includes(o.letter) : st.picked === o.letter;
                if (inAns) div.classList.add('p-correct');
                else if (inPick) div.classList.add('p-wrong');
            } else {
                div.addEventListener('click', () => {
                    if (isMulti) div.classList.toggle('p-sel');
                    else recordAndLock(q, o.letter, o.letter === q.answer);
                });
            }
            pOptions.appendChild(div);
        });
        if (isMulti && !st) pSubmit.style.display = '';
        if (st) showFeedback(q, st);
    };

    function recordAndLock(q, picked, correct) {
        practiceState[q.id] = { picked, correct };
        sess.answered++;
        if (correct) { sess.correct++; wrongSet.delete(q.id); }
        else wrongSet.add(q.id);
        saveWrong();
        renderPractice();
    }

    const submitMulti = () => {
        const q = practiceList[practiceIndex];
        if (!q || practiceState[q.id]) return;
        const picked = [...pOptions.querySelectorAll('.p-sel')].map(d => d.dataset.letter).sort();
        if (!picked.length) { pFeedback.textContent = '请至少选择一个选项'; pFeedback.className = 'practice-feedback bad'; return; }
        const ans = q.answer.split('').sort();
        const correct = picked.length === ans.length && picked.every((l, i) => l === ans[i]);
        recordAndLock(q, picked, correct);
    };

    const setMode = (m) => {
        appMode = m;
        if (m === 'practice') {
            searchView.style.display = 'none';
            practiceView.style.display = 'block';
            modeToggleBtn.innerHTML = '🔍';
            modeToggleBtn.title = '返回查询';
            modeToggleBtn.classList.add('active');
            if (header) header.classList.add('hidden');
            startPractice();
        } else {
            practiceView.style.display = 'none';
            searchView.style.display = '';
            modeToggleBtn.innerHTML = '📝';
            modeToggleBtn.title = '练习 / 查询';
            modeToggleBtn.classList.remove('active');
        }
    };

    if (modeToggleBtn) {
        modeToggleBtn.addEventListener('click', () => setMode(appMode === 'practice' ? 'search' : 'practice'));
        pPrev.addEventListener('click', () => { if (practiceIndex > 0) { practiceIndex--; renderPractice(); } });
        pNext.addEventListener('click', () => { if (practiceIndex < practiceList.length - 1) { practiceIndex++; renderPractice(); } });
        pSubmit.addEventListener('click', submitMulti);
        pRestart.addEventListener('click', startPractice);
        pShuffle.addEventListener('change', startPractice);
        pWrongOnly.addEventListener('change', startPractice);
        pClearWrong.addEventListener('click', () => {
            if (!wrongSet.size) { pFeedback.textContent = '错题本已是空的'; pFeedback.className = 'practice-feedback'; return; }
            if (!confirm('确定清空错题本（共 ' + wrongSet.size + ' 题）？')) return;
            wrongSet.clear(); saveWrong();
            if (pWrongOnly.checked) startPractice();
        });
    }

    // --- 初始化 ---
    const debouncedSearch = debounce(performSearch, 300);
    searchInput.addEventListener('input', debouncedSearch);

    // ▼▼▼ 修改的初始化逻辑 ▼▼▼
    // 初始化页面提示信息，不主动调用 performSearch()
    resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
    detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
});