// script.js - 最终功能完整版 (包含性能优化、清空、键盘导航)

document.addEventListener('DOMContentLoaded', () => {

    // --- 预处理数据，建立搜索索引 (性能优化) ---
    questionBank.forEach(q => {
        const optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
    });

    // --- 获取页面元素 ---
    const searchInput = document.getElementById('searchInput');
    const resultsList = document.getElementById('resultsList');
    const detailsContent = document.getElementById('detailsContent');
    const clearButton = document.getElementById('clearButton');

    // --- 事件监听 ---

    // 清空按钮事件
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
    });

    // 键盘导航事件
    document.addEventListener('keydown', (event) => {
        // 只处理上下方向键
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
            return;
        }

        // 阻止方向键的默认行为（如滚动整个页面）
        event.preventDefault();

        const items = document.querySelectorAll('#resultsList li:not(.placeholder)');
        if (items.length === 0) {
            return; 
        }

        const currentSelected = document.querySelector('#resultsList li.selected');
        let nextIndex = 0; // 默认目标是第一个

        if (currentSelected) {
            const currentIndex = Array.from(items).indexOf(currentSelected);
            if (event.key === 'ArrowDown') {
                // 如果当前索引不是最后一个，则索引+1
                if (currentIndex < items.length - 1) {
                    nextIndex = currentIndex + 1;
                } else {
                    nextIndex = currentIndex; // 保持在最后一个
                }
            } else { // ArrowUp
                // 如果当前索引不是第一个，则索引-1
                if (currentIndex > 0) {
                    nextIndex = currentIndex - 1;
                } else {
                    nextIndex = currentIndex; // 保持在第一个
                }
            }
        }
        
        const newId = items[nextIndex].dataset.id;
        showDetails(newId);
    });

    // --- 防抖函数 ---
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    // --- 核心功能函数 ---
    const performSearch = () => {
        const keyword = searchInput.value.trim().toLowerCase();
        if (!keyword) {
            resultsList.innerHTML = '<li class="placeholder">请输入关键词开始搜索...</li>';
            detailsContent.innerHTML = '<p class="placeholder">请从左侧搜索结果中点击一个题目以查看详情。</p>';
            const selectedItem = document.querySelector('#resultsList li.selected');
            if (selectedItem) {
                selectedItem.classList.remove('selected');
            }
            return;
        }
        
        const filteredResults = questionBank.filter(q => q.searchableText.includes(keyword));
        displayResults(filteredResults);
    };

    const displayResults = (results) => {
        resultsList.innerHTML = '';
        if (results.length === 0) {
            resultsList.innerHTML = '<li class="placeholder">未找到相关题目。</li>';
            detailsContent.innerHTML = '<p class="placeholder">请重新输入关键词。</p>';
            return;
        }
        results.forEach(q => {
            const listItem = document.createElement('li');
            listItem.dataset.id = q.id;
            listItem.textContent = `[${q.type}] ${q.question.substring(0, 50)}...`;
            listItem.addEventListener('click', () => {
                showDetails(q.id);
            });
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
            // 自动滚动到可视区域
            currentListItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
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

    // --- 初始化事件绑定 ---
    const debouncedSearch = debounce(performSearch, 300);
    searchInput.addEventListener('input', debouncedSearch);
    
    resultsList.innerHTML = '<li class="placeholder">请输入关键词开始搜索...</li>';
});