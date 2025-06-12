document.addEventListener('DOMContentLoaded', () => {

    // --- 预处理数据，建立搜索索引 (性能优化) ---
    // 此段代码只在页面加载时运行一次
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

    // --- 状态变量 ---
    let currentFilterType = '单选题'; // 默认筛选类型

    // --- 事件监听 ---

    // 分类筛选按钮的点击事件
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilterType = button.dataset.type;
            // 切换分类时，仅当搜索框有内容时才重新触发搜索
            if (searchInput.value.trim() !== '') {
                performSearch();
            }
        });
    });

    // 清空按钮事件
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
    });

    // 键盘导航事件
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();

        const items = document.querySelectorAll('#resultsList li:not(.placeholder)');
        if (items.length === 0) return;

        const currentSelected = document.querySelector('#resultsList li.selected');
        let nextIndex = 0;

        if (currentSelected) {
            const currentIndex = Array.from(items).indexOf(currentSelected);
            if (event.key === 'ArrowDown') {
                nextIndex = (currentIndex < items.length - 1) ? currentIndex + 1 : currentIndex;
            } else { // ArrowUp
                nextIndex = (currentIndex > 0) ? currentIndex - 1 : currentIndex;
            }
        }
        
        const newId = items[nextIndex].dataset.id;
        showDetails(newId);
    });

    // --- 防抖函数 (防止输入时过于频繁地触发搜索) ---
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // --- 核心功能函数 ---

    // 执行搜索
    const performSearch = () => {
        const keyword = searchInput.value.trim().toLowerCase();
        
        // 如果没有关键词，则重置界面并停止执行
        if (!keyword) {
            resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
            detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
            return;
        }

        // 只有在有关键词时，才执行筛选
        const questionsOfType = questionBank.filter(q => q.type === currentFilterType);
        const filteredResults = questionsOfType.filter(q => q.searchableText.includes(keyword));
        
        displayResults(filteredResults);
    };

    // 渲染搜索结果列表
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

    // 显示题目详情
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
                detailsHtml += `<li>${option}</li>`;
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
                const multiChoiceAnswers = options
                    .filter(opt => answer.includes(opt.trim().charAt(0)))
                    .join('<br>');
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
    
    // 初始化页面提示信息，不主动加载任何题目
    resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
    detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';

});