// script.js - 最终功能完整版 (修正初始加载逻辑)

document.addEventListener('DOMContentLoaded', () => {

    // --- 预处理数据 ---
    questionBank.forEach(q => {
        const optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
    });

    // --- 获取页面元素 ---
    const searchInput = document.getElementById('searchInput');
    const resultsList = document.getElementById('resultsList');
    const detailsContent = document.getElementById('detailsContent');
    const clearButton = document.getElementById('clearButton');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const header = document.querySelector('.header');

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

    // --- 初始化 ---
    const debouncedSearch = debounce(performSearch, 300);
    searchInput.addEventListener('input', debouncedSearch);
    
    // ▼▼▼ 修改的初始化逻辑 ▼▼▼
    // 初始化页面提示信息，不主动调用 performSearch()
    resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
    detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
});