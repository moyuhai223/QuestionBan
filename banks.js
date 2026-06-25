// banks.js —— 可选题库清单（新增/改名只动这里）
// 新增一个题库：把对应 database.<名>.js 放到同目录，然后在下面加一行。
const QB_BANKS = [
  { id: 'aqsy882',    name: '安全生产月 · 882题', file: 'database.882.bak.js' },
  { id: 'aqzs396',    name: '安全知识 · 396题',   file: 'database.396.bak.js' },
  { id: 'jingsai394', name: '竞赛400校正 · 394题', file: 'database.394.bak.js' },
  { id: 'danxuan150', name: '单选速记 · 150题',   file: 'database.150.bak.js' },
];

// 默认题库（其内容应与 index.html 直接 <script> 载入的 database.js 一致，用于首屏免等待）
const QB_DEFAULT_BANK = 'aqsy882';

// 题库文件内容变动后把这个号 +1，用于绕过浏览器缓存
const QB_BANK_VER = '1';
