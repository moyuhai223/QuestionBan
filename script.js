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

    // 最长公共子串长度（连续命中的字数），顺序敏感、比 bigram 精确得多
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

    // --- 预处理数据 ---
    questionBank.forEach(q => {
        const optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
        q._normStem = normText(q.question);            // 仅题干（主匹配键，排除选项干扰）
        q._norm = normText(q.searchableText);          // 题干+选项（并列时的次判据）
        q._bg = bigrams(q._norm);
    });

    // 用识别出的文字在【当前选中题型】里精确定位题目。
    // 主判据 = 与“题干”的最长连续公共子串：谁的题干包含 OCR 里最长的一段原文，就是它。
    // 选项、题号、单选圈(○)等干扰: ○等符号已被 normText 滤除；题号前缀在此剥离；
    // 选项不参与主判据(只在题干并列时用题干+选项的连续命中来区分)。
    const matchByText = (ocrText, topN = 8) => {
        const raw = (ocrText || '').replace(/^\s*\d{1,3}\s*[.．、]\s*/, '');  // 去掉考试题号"46."
        const q = normText(raw).slice(0, 240);
        if (q.length < 2) return [];
        const a = bigrams(q);
        const minHit = Math.min(6, Math.max(3, Math.floor(q.length * 0.5)));
        const scored = questionBank
            .filter(x => x.type === currentFilterType)   // 只在当前题型库内匹配
            .map(x => ({
                x,
                lcs: lcsLen(q, x._normStem),             // 主判据：与题干的最长连续命中
                lcsAll: lcsLen(q, x._norm),              // 次判据：与题干+选项的最长连续命中
                d: dice(a, x._bg)
            }))
            .filter(s => s.lcs >= minHit)                // 题干连续命中太短的直接排除
            .sort((p, n) => (n.lcs - p.lcs) || (n.lcsAll - p.lcsAll) || (n.d - p.d));
        if (!scored.length) return [];
        // 有明显赢家时收紧：只保留与最佳命中接近的，丢掉仅共享开头套话的“沾边”题
        const cut = Math.max(minHit, scored[0].lcs * 0.5);
        return scored.filter(s => s.lcs >= cut).slice(0, topN).map(s => s.x);
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

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (header) {
                header.classList.add('hidden');
            }
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilterType = button.dataset.type;
            // 切换分类时，如果搜索框有内容，则立即执行搜索，否则清空
            performSearch();
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
        const keyword = searchInput.value.trim().toLowerCase();
        
        // 如果没有关键词，则重置界面并停止执行
        if (!keyword) {
            resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
            detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
            return;
        }

        const questionsOfType = questionBank.filter(q => q.type === currentFilterType);
        const filteredResults = questionsOfType.filter(q => q.searchableText.includes(keyword));
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

    // --- 拍照搜题（OCR，纯本地：tess/ 下自带引擎与中文模型，零 CDN）---
    const setOcrStatus = (msg) => {
        ocrStatus.textContent = msg || '';
        ocrStatus.style.display = msg ? 'block' : 'none';
    };

    // 图像预处理：放大 + 灰度 + Otsu 自适应二值化，显著提升中文识别率
    const preprocess = (file) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const longSide = Math.max(img.naturalWidth, img.naturalHeight) || 1;
            let scale = 1;
            if (longSide < 1600) scale = Math.min(3, 1600 / longSide);   // 小图放大
            else if (longSide > 2600) scale = 2600 / longSide;           // 巨图缩小
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            const im = ctx.getImageData(0, 0, w, h);
            const d = im.data, n = w * h;
            const gray = new Uint8ClampedArray(n);
            const hist = new Array(256).fill(0);
            for (let i = 0, p = 0; p < n; i += 4, p++) {
                const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
                gray[p] = g; hist[g]++;
            }
            // Otsu 最大类间方差求阈值
            let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
            let sumB = 0, wB = 0, maxVar = -1, thr = 127;
            for (let t = 0; t < 256; t++) {
                wB += hist[t]; if (!wB) continue;
                const wF = n - wB; if (!wF) break;
                sumB += t * hist[t];
                const mB = sumB / wB, mF = (sum - sumB) / wF;
                const between = wB * wF * (mB - mF) * (mB - mF);
                if (between > maxVar) { maxVar = between; thr = t; }
            }
            // 按背景明暗保证输出统一为“白底黑字”
            let blackCount = 0; for (let p = 0; p < n; p++) if (gray[p] < thr) blackCount++;
            const darkBackground = blackCount > n / 2;
            for (let i = 0, p = 0; p < n; i += 4, p++) {
                const isDark = gray[p] < thr;
                const v = darkBackground ? (isDark ? 255 : 0) : (isDark ? 0 : 255);
                d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
            }
            ctx.putImageData(im, 0, 0);
            cv.toBlob((b) => b ? resolve(b) : reject(new Error('图像处理失败')), 'image/png');
        };
        img.onerror = () => reject(new Error('图片读取失败'));
        img.src = URL.createObjectURL(file);
    });

    // 方案一：服务端高精度 OCR（本地 Umi-OCR 或服务器上的 RapidOCR/PaddleOCR）。
    // 浏览器只请求同源的 /umi-ocr：本地由 ocr_server.py 代理，线上由 1Panel 反代到 127.0.0.1:1224。
    // 后端不可达时此调用失败，自动回退到下面的内置 Tesseract。
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

    // 方案二：持久化 Tesseract worker（本地引擎 + 本地中文模型，离线兜底）
    let _ocrWorker = null;
    const tessUrl = (p) => new URL('tess/' + p, location.href).href;   // worker 内需绝对路径
    const getWorker = async () => {
        if (_ocrWorker) return _ocrWorker;
        _ocrWorker = await Tesseract.createWorker('chi_sim', 1, {
            workerPath: tessUrl('worker.min.js'),
            corePath: tessUrl(''),
            langPath: tessUrl(''),
            gzip: true,
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    setOcrStatus('识别中… ' + Math.round((m.progress || 0) * 100) + '%');
                }
            }
        });
        await _ocrWorker.setParameters({ tessedit_pageseg_mode: '6' }); // 视作单一文本块
        return _ocrWorker;
    };

    if (ocrBtn && ocrFile) {
        ocrBtn.addEventListener('click', () => ocrFile.click());

        ocrFile.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            ocrFile.value = '';                       // 允许重复选同一张图
            if (!file) return;
            if (typeof Tesseract === 'undefined') {
                setOcrStatus('⚠️ 识别引擎未能加载（tess/ 文件缺失？）。');
                return;
            }
            ocrBtn.disabled = true;
            let text = '', engine = '';
            try {
                // 1) 优先服务端高精度 OCR（本地 Umi-OCR / 线上 RapidOCR）
                try {
                    setOcrStatus('正在调用服务端 OCR（高精度引擎）…');
                    text = await umiOcr(file);
                    engine = '服务端OCR';
                } catch (e) {
                    // 2) 回退到内置 Tesseract（离线，含图像预处理）
                    setOcrStatus('服务端 OCR 不可用，改用内置离线引擎…（首次约十几秒）');
                    const pre = await preprocess(file);
                    const worker = await getWorker();
                    text = (await worker.recognize(pre)).data.text;
                    engine = '内置Tesseract';
                }
                const shown = normText(text);
                if (shown.length < 4) {
                    setOcrStatus('［' + (engine || 'OCR') + '］没识别到足够文字，换一张更清晰、端正的图再试。');
                    displayResults([]);
                    return;
                }
                const matches = matchByText(text, 8);
                if (header) header.classList.add('hidden');
                setOcrStatus('［' + engine + '］识别：' + shown.slice(0, 46) + (shown.length > 46 ? '…' : '') +
                    '　—— 已跳到答案，绿色为正确项。');
                displayResults(matches);
                if (matches.length) {
                    // 识别成功后直接滚到答案：优先对准绿色正确项 / 答案框，手机上免去手动下滑
                    requestAnimationFrame(() => {
                        const target = document.querySelector('#detailsContent .correct-answer')
                            || document.querySelector('#detailsContent .answer')
                            || document.querySelector('.details-panel');
                        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                }
            } catch (err) {
                setOcrStatus('识别失败：' + (err && err.message ? err.message : err));
            } finally {
                ocrBtn.disabled = false;
            }
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