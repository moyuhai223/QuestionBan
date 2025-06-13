// script.js - 修正答案显示后的 IE8 兼容版

window.onload = function() {

    // ========== 兼容性辅助函数 ==========
    function addEvent(element, type, handler) {
        if (element.addEventListener) {
            element.addEventListener(type, handler, false);
        } else if (element.attachEvent) {
            element.attachEvent('on' + type, handler);
        } else {
            element['on' + type] = handler;
        }
    }
    function trim(str) {
        return str.replace(/^\s+|\s+$/g, '');
    }
    function hasClass(ele, cls) {
        return new RegExp('(\\s|^)' + cls + '(\\s|$)').test(ele.className);
    }
    function addClass(ele, cls) {
        if (!hasClass(ele, cls)) {
            if (ele.className == '') {
                ele.className = cls;
            } else {
                ele.className += ' ' + cls;
            }
        }
    }
    function removeClass(ele, cls) {
        if (hasClass(ele, cls)) {
            var reg = new RegExp('(\\s|^)' + cls + '(\\s|$)');
            ele.className = ele.className.replace(reg, ' ');
            ele.className = trim(ele.className);
        }
    }

    // --- 预处理数据 ---
    for (var i = 0; i < questionBank.length; i++) {
        var q = questionBank[i];
        var optionsText = q.options.join(' ');
        q.searchableText = (q.question + ' ' + optionsText).toLowerCase();
    }

    // --- 获取页面元素 ---
    var searchInput = document.getElementById('searchInput');
    var resultsList = document.getElementById('resultsList');
    var detailsContent = document.getElementById('detailsContent');
    var clearButton = document.getElementById('clearButton');
    var filterButtonsContainer = document.getElementById('category-filter');
    var filterButtons = filterButtonsContainer.getElementsByTagName('button');
    var header = document.getElementsByTagName('div')[1]; 

    // --- 状态变量 ---
    var currentFilterType = '单选题';

    // --- 事件监听 ---
    for (var i = 0; i < filterButtons.length; i++) {
        addEvent(filterButtons[i], 'click', (function(index) {
            return function() {
                if (header && hasClass(header, 'header')) {
                    addClass(header, 'hidden');
                }
                for (var j = 0; j < filterButtons.length; j++) {
                    removeClass(filterButtons[j], 'active');
                }
                addClass(filterButtons[index], 'active');
                currentFilterType = filterButtons[index].getAttribute('data-type');
                performSearch(); 
            };
        })(i));
    }
    
    addEvent(clearButton, 'click', function() {
        searchInput.value = '';
        performSearch();
        try { searchInput.focus(); } catch (e) {}
        if (header && hasClass(header, 'header')) {
            removeClass(header, 'hidden');
        }
    });

    addEvent(searchInput, 'keyup', function() {
        performSearch();
    });

    addEvent(document, 'keydown', function(e) {
        var event = e || window.event;
        if (event.keyCode !== 38 && event.keyCode !== 40) return;
        if (event.preventDefault) { event.preventDefault(); } else { event.returnValue = false; }
        var items = resultsList.getElementsByTagName('li');
        if (items.length === 0 || hasClass(items[0], 'placeholder')) return;
        var currentSelectedIndex = -1;
        for (var i = 0; i < items.length; i++) {
            if (hasClass(items[i], 'selected')) {
                currentSelectedIndex = i;
                break;
            }
        }
        var nextIndex = 0;
        if (currentSelectedIndex !== -1) {
            if (event.keyCode === 40) { // Down
                nextIndex = (currentSelectedIndex < items.length - 1) ? currentSelectedIndex + 1 : currentSelectedIndex;
            } else if (event.keyCode === 38) { // Up
                nextIndex = (currentSelectedIndex > 0) ? currentSelectedIndex - 1 : 0;
            }
        }
        var newId = items[nextIndex].getAttribute('data-id');
        showDetails(newId);
    });

    // --- 核心功能函数 ---
    function performSearch() {
        var keyword = trim(searchInput.value).toLowerCase();
        if (keyword === '') {
            resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
            detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
            return;
        }
        var questionsOfType = [];
        for (var i = 0; i < questionBank.length; i++) {
            if (questionBank[i].type === currentFilterType) {
                questionsOfType.push(questionBank[i]);
            }
        }
        var filteredResults = [];
        for (var i = 0; i < questionsOfType.length; i++) {
            if (questionsOfType[i].searchableText.indexOf(keyword) !== -1) {
                filteredResults.push(questionsOfType[i]);
            }
        }
        displayResults(filteredResults);
    }

    function displayResults(results) {
        resultsList.innerHTML = '';
        if (results.length === 0) {
            resultsList.innerHTML = '<li class="placeholder">未找到相关题目。</li>';
            detailsContent.innerHTML = '<p class="placeholder">请尝试其他关键词或分类。</p>';
            return;
        }
        for (var i = 0; i < results.length; i++) {
            var q = results[i];
            var listItem = document.createElement('li');
            listItem.setAttribute('data-id', q.id);
            listItem.innerHTML = '[' + q.type + '] ' + q.question.substring(0, 50) + '...';
            addEvent(listItem, 'click', (function(id) {
                return function() { showDetails(id); };
            })(q.id));
            resultsList.appendChild(listItem);
        }
        if (results.length > 0) {
            showDetails(results[0].id);
        }
    }

    function showDetails(questionId) {
        var allListItems = resultsList.getElementsByTagName('li');
        for (var i = 0; i < allListItems.length; i++) {
            removeClass(allListItems[i], 'selected');
            if (allListItems[i].getAttribute('data-id') == questionId) {
                addClass(allListItems[i], 'selected');
            }
        }
        var question = null;
        for (var i = 0; i < questionBank.length; i++) {
            if (questionBank[i].id == questionId) {
                question = questionBank[i];
                break;
            }
        }
        if (!question) return;
        detailsContent.innerHTML = '';
        var questionTextDiv = document.createElement('div');
        questionTextDiv.className = 'question-text';
        questionTextDiv.innerHTML = question.question;
        detailsContent.appendChild(questionTextDiv);
        if (question.options && question.options.length > 0) {
            var optionsUl = document.createElement('ul');
            optionsUl.className = 'options-list';
            for (var i = 0; i < question.options.length; i++) {
                var optionText = question.options[i];
                var optionLi = document.createElement('li');
                optionLi.innerHTML = optionText;
                var optionLetter = trim(optionText).charAt(0);
                if (question.answer.indexOf(optionLetter) !== -1) {
                    addClass(optionLi, 'correct-answer');
                }
                addEvent(optionLi, 'click', function() {
                    var siblings = optionsUl.getElementsByTagName('li');
                    for (var j = 0; j < siblings.length; j++) {
                        removeClass(siblings[j], 'user-selected');
                    }
                    addClass(this, 'user-selected');
                });
                optionsUl.appendChild(optionLi);
            }
            detailsContent.appendChild(optionsUl);
        }

        // ▼▼▼ 修改的核心逻辑区域 ▼▼▼
        var formattedAnswer = '';
        var answer = question.answer;
        var options = question.options;
        var type = question.type;

        if (type === '单选题') {
            for (var i = 0; i < options.length; i++) {
                if (trim(options[i]).substring(0, 1) === answer) {
                    formattedAnswer = options[i];
                    break;
                }
            }
            if (formattedAnswer === '') { formattedAnswer = answer; } // 备用
        } else if (type === '多选题') {
            var correctOptions = [];
            for (var i = 0; i < options.length; i++) {
                var optionLetter = trim(options[i]).substring(0, 1);
                if (answer.indexOf(optionLetter) !== -1) {
                    correctOptions.push(options[i]);
                }
            }
            if (correctOptions.length > 0) {
                formattedAnswer = correctOptions.join('<br>');
            } else {
                formattedAnswer = answer; // 备用
            }
        } else { // 判断题
            formattedAnswer = answer;
        }

        var answerDiv = document.createElement('div');
        answerDiv.className = 'answer';
        if (type === '多选题' && formattedAnswer.indexOf('<br>') !== -1) {
            answerDiv.innerHTML = '<strong>答案：</strong><br>' + formattedAnswer;
        } else {
            answerDiv.innerHTML = '<strong>答案：</strong> ' + formattedAnswer;
        }
        detailsContent.appendChild(answerDiv);
        // ▲▲▲ 修改结束 ▲▲▲
    }

    // --- 初始化 ---
    resultsList.innerHTML = '<li class="placeholder">请在上方输入关键词开始搜索...</li>';
    detailsContent.innerHTML = '<p class="placeholder">输入关键词后，结果将在此显示。</p>';
};