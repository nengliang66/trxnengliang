/*!
 * TRX 能量直营 — 站点配置
 * 只需修改这个文件，即可更换收款地址、单价与联系方式。
 * 页面上的文字定价若需同步修改，请运行 tools/update-config.mjs（见 README）。
 */
window.TRX_CONFIG = {
  // 站点域名（用于 canonical / sitemap / 分享卡片，不要带结尾斜杠）
  domain: 'https://your-domain.com',

  // 收款地址（TRON 主网，T 开头 34 位）
  address: 'TAvzRvSBBQyHYc9hDDxgETQfkXqh555s18',

  // 单价：每个「笔」对应的 TRX 数量
  price: 1.8,

  // 每个「笔」对应的能量数量（默认 65,000，约等于 1 次 USDT 转账所需）
  energyPerUnit: 65000,

  // 能量委托有效期
  duration: '1 小时',

  // 单笔最小 / 最大购买笔数
  minUnits: 1,
  maxUnits: 5000,

  // 联系方式（替换成你自己的，留空则隐藏对应入口）
  telegram: 'TRXfastWeb30',
  email: '',

  // 区块浏览器
  explorerAddress: 'https://tronscan.org/#/address/',
  explorerTx: 'https://tronscan.org/#/transaction/'
};
