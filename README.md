# 今天开“卷” - 安全生产知识题库

![项目截图](https://img.shields.io/badge/Project-%E4%BB%8A%E5%A4%A9%E5%BC%80%E2%80%9C%E5%8D%B7%E2%80%9D-blue) ![技术栈](https://img.shields.io/badge/Tech-HTML%2FCSS%2FJS-yellow) ![状态](https://img.shields.io/badge/Status-Completed-brightgreen)

这是一个纯前端、响应式设计的安全生产知识题库Web应用。它能帮助用户在庞大的题库中快速、实时地搜索题目和答案，支持在PC和移动设备上流畅使用。

## ✨ 项目特色 (Features)

* **实时搜索**：无需点击按钮，输入关键词即可实时筛选题目，支持在题干和选项中进行模糊匹配。
* **智能交互**：搜索结果自动显示第一条题目的详情，并在列表中高亮显示，同时提供一键清空功能，操作便捷。
* **多题型支持**：完美支持单选题、多选题、判断题三种常见题型。
* **响应式设计**：界面能够自动适应不同尺寸的屏幕，在电脑、平板和手机上均有良好的用户体验。
* **性能优化**：通过建立前端搜索索引，即使在近千条数据的题库中也能实现毫秒级搜索响应。
* **纯前端实现**：无需后端服务器和数据库，所有文件均可在本地浏览器直接运行，或轻松部署到任何静态网站托管平台。
* **缓存控制**：通过配置，确保用户每次访问都能获取到最新的题库数据，避免缓存问题。

## 🛠️ 技术栈 (Technology Stack)

* **HTML5**
* **CSS3**: 使用 Flexbox进行现代布局，并利用媒体查询 (`@media`) 实现响应式设计。
* **JavaScript (ES6+)**: 实现所有核心交互逻辑，包括数据处理、DOM操作和事件监听。

## 📂 文件结构 (File Structure)
├── index.html         # 主应用页面 \
├── style.css          # 全局样式表 \
├── script.js          # 核心交互逻辑脚本 \
├── database.js        # 题库数据文件 \
└── converter.html     # (可选工具) 用于将PDF/Word文本批量转换为题库JS格式 \
└── export.html        # (可选工具) 用于将题库JS格式批量转换为适合Word文本格式
## 🚀 如何使用 (How to Use)

1.  将项目所有文件下载到本地。
2.  用现代浏览器（如 Chrome, Firefox, Edge）直接打开 `index.html` 文件即可开始使用。

## ✏️ 如何更新题库 (Data Management)

题库的所有数据都存储在 `database.js` 文件中，其核心是一个名为 `questionBank` 的JavaScript数组。

#### 1. 手动添加

您可以直接编辑 `database.js` 文件，按照以下格式在数组中添加新的题目对象：
```javascript
{
    "id": 999, // 确保ID是唯一的，并连续递增
    "type": "单选题", // 或 "多选题", "判断题"
    "question": "这里是题目的文本内容...",
    "options": ["A. 选项一", "B. 选项二", "C. 选项三"], // 判断题此项为空数组 []
    "answer": "A" // 正确答案
}
2. 批量导入
当题目数量巨大时，推荐使用我们创建的 converter.html 工具。

用浏览器打开 converter.html。
将从Word或PDF中复制的全部题目文本粘贴到左侧的输入框。
点击“开始转换”按钮。
将右侧生成的全部代码复制，并整体替换掉 database.js 文件的内容。