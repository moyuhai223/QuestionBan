// banks.js —— 可选题库清单
// 题库名写在各自题库文件顶部的 `const questionBankName = "..."`（改名只动那一行）。
// 这里只登记“有哪些题库文件、默认是哪个”。新增题库 = 放好 database.<名>.js 后加一行。
const QB_BANKS = [
  { id: 'aqsy882',    file: 'database.882.bak.js' },
  { id: 'aqzs396',    file: 'database.396.bak.js' },
  { id: 'jingsai394', file: 'database.394.bak.js' },
  { id: 'danxuan150', file: 'database.150.bak.js' },
];

// 默认题库（其内容应与 index.html 直接 <script> 载入的 database.js 一致，首屏免等待）
const QB_DEFAULT_BANK = 'aqsy882';

// 题库文件内容变动后把这个号 +1，用于绕过浏览器缓存
const QB_BANK_VER = '2';
