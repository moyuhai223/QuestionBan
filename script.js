// script.js - 最终功能完整且性能优化版

document.addEventListener('DOMContentLoaded', () => {

    // ==================================================================
    // ▼▼▼ 新增的优化步骤：预处理数据，建立搜索索引 ▼▼▼
    // 这段代码只在页面加载时运行一次
    // ==================================================================
    questionBank.forEach(q => {
        // 将题干和所有选项合并成一个长字符串，并全部转换为小写
        // 这样后续搜索时，就无需再对每个条目进行重复的大小写转换和拼接
        const optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
    });


    // --- 获取页面元素 ---
    const searchInput = document.getElementById('searchInput');
    const resultsList = document.getElementById('resultsList');
    const detailsContent = document.getElementById('detailsContent');
    const clearButton = document.getElementById('clearButton');

    // --- 事件监听 ---
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
    });

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

        // ==================================================================
        // ▼▼▼ 优化的搜索逻辑 ▼▼▼
        // 直接在预处理好的 searchableText 字段中进行一次搜索即可
        // ==================================================================
        const filteredResults = questionBank.filter(q => 
            q.searchableText.includes(keyword)
        );
        
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
        }

        const question = questionBank.find(q => q.id === questionId);
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
    
    // 初始化页面提示信息
    resultsList.innerHTML = '<li class="placeholder">请输入关键词开始搜索...</li>';
});