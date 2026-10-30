# TRX 能量直营 · 官网

面向 TRON 能量的直营供货站点：**1.8 TRX / 笔，链上转账即下单**。
纯静态、零依赖、可直接部署到 Cloudflare Pages，无需构建步骤。

- 收款地址：`TAvzRvSBBQyHYc9hDDxgETQfkXqh555s18`（已写入页面并生成二维码）
- 单价：1.8 TRX / 笔，1 笔 = 65,000 能量，有效期 1 小时
- 客服：Telegram [@TRXfastWeb30](https://t.me/TRXfastWeb30)
- 5 个页面 + 404：首页 / 购买 / 价格 / 付款核验 / 代理合作
- 自带 SEO：canonical、OG 卡片、JSON-LD、sitemap、robots、manifest、Google 站点验证

---

## 1. 目录结构

```
.
├── index.html            # 首页（含 google-site-verification）
├── buy-energy.html       # 购买页（地址 + 笔数 + 金额计算 + 收款二维码）
├── pricing.html          # 价格与计价规则
├── verify.html           # 付款核验（输入 TxID 查链上记录，只读）
├── agents.html           # 代理合作（含 Telegram 入口）
├── 404.html
├── assets/
│   ├── css/site.css      # 全站样式（设计系统）
│   ├── js/config.js      # ★ 唯一需要改的配置文件
│   ├── js/site.js        # 导航、复制、金额计算、地址校验
│   ├── js/verify.js      # 付款核验（TronGrid 只读查询）
│   └── img/              # 二维码、favicon、OG 分享图
├── _headers              # Cloudflare Pages 安全头 / 缓存策略
├── _redirects            # 干净 URL 重定向
├── sitemap.xml / robots.txt / site.webmanifest
└── tools/                # 本地工具（不影响线上运行）
    ├── gen_assets.py     # 重新生成二维码 / favicon / 分享图
    ├── update-config.mjs # 命令行改地址 / 单价 / 域名
    ├── qa.py             # 静态自检（死链、重复 ID、meta 长度）
    └── serve.py          # 本地预览（模拟 Pages 的干净 URL）
```

---

## 2. 改价格：用「价格管理器」（推荐）

`TRX-价格管理器.html` 是一个独立的本地网页（在仓库外面，不会被部署），
它直接调用 GitHub API 提交修改，Cloudflare 收到推送后自动重新部署。

**首次使用**

1. GitHub → Settings → Developer settings → Personal access tokens
   - 用 **Fine-grained token**：只选这一个仓库，权限勾 `Contents: Read and write`。
2. 双击打开 `TRX-价格管理器.html`。
3. 填仓库 `用户名/trx-energy-site`、分支 `main`、粘贴 token → **连接并读取**。

**以后改价**

1. 改「单价」→ 下方会实时显示 1 / 5 / 10 / 50 / 100 笔的新总价。
2. 点 **预览更改**，确认受影响文件与行数。
3. 点 **提交到 GitHub**，日志里出现 `✅ 提交成功` 即可，约 1 分钟后线上生效。

管理器会同步更新：首页、价格页、购买页、代理页、SEO 标题与描述、结构化数据、`config.js`。
Telegram 与域名也在同一页修改；**收款地址是只读的**，因为换地址必须同时重做二维码（见 3.1）。

---

## 3. 上线前必须确认的 3 件事

### 3.1 收款地址

已按要求写为 `TAvzRvSBBQyHYc9hDDxgETQfkXqh555s18`。
如需更换，一条命令同时改掉页面、页脚、二维码：

```bash
node tools/update-config.mjs --address T新的地址...
python tools/gen_assets.py           # 重新生成二维码 / 分享图（需 pip install segno pillow）
```

### 3.2 单价与「每笔」口径

`assets/js/config.js` 里 `price` 与 `energyPerUnit` 决定下单页的计算。
页面表格与文案写死为 1.8 TRX / 65,000 能量，改价推荐用管理器，或用命令：

```bash
node tools/update-config.mjs --price 2.2    # 自动重算首页/价格页的档位表
```

> ⚠️ 65,000 能量 / 1 小时 是行业常见口径（约等于 1 次 USDT 转账）。
> 如果你的实际供货标准不同，请同时改 `config.js` 和页面文案。

### 3.3 客服 Telegram

已配置为 `TRXfastWeb30`，代理页的「Telegram 联系」按钮会自动指向 `https://t.me/TRXfastWeb30`。
留空则按钮隐藏，改为下单引导。命令行：`node tools/update-config.mjs --telegram 新账号`

---

## 4. 部署到 Cloudflare Pages

### 方式 A：GitHub 连接（推荐，改完自动发布）

1. 在 GitHub 新建仓库（Public 或 Private 均可），把本目录**里面的内容**推上去（`index.html` 要在仓库根目录）。
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择仓库 → 分支 `main`。
4. 构建配置全部留空：
   - Framework preset：`None`
   - Build command：（空）
   - Build output directory：`/`
5. **Save and Deploy**，拿到 `xxx.pages.dev`。

> `_headers`、`_redirects` 会被 Pages 自动识别，不需要额外配置。

### 方式 B：直接上传（不接 GitHub）

Pages → Create → **Upload assets** → 拖入整个目录。适合先上线验证。

### 方式 C：wrangler CLI

```bash
npx wrangler pages deploy . --project-name trx-energy
```

### 绑定自定义域名

Pages 项目 → **Custom domains** → 添加域名（域名在 Cloudflare 托管时一键完成）。绑定后改全站链接：

```bash
node tools/update-config.mjs --domain https://你的域名.com
```

---

## 5. Google 收录

首页 `<head>` 已加入验证标签：

```html
<meta name="google-site-verification" content="pvaVBHsT4jdTCKgz3gCo0vtW3uDTCIu-MxubmEPdJxM">
```

1. 部署完成后，在 [Google Search Console](https://search.google.com/search-console) 点「验证」。
2. 通过后提交 `https://你的域名/sitemap.xml`。
3. 建议同时提交到 Bing Webmaster Tools（可一键导入 GSC）。

想更快收录：在 Telegram 频道/群、Twitter 发外链；价格页更新会自然触发重新抓取。

---

## 6. 关于「自动发放」——需要你的后端

本仓库是**纯静态前端**：负责展示价格、生成收款二维码、显示订单说明、提供链上核验。
真正的「识别转账 → 委托能量」必须由服务端完成，因为 `DelegateResource` 需要用供货方账户
的私钥签名，私钥不能出现在网页里。

推荐的最小后端流程：

```
1. 轮询/订阅 TronGrid：GET /v1/accounts/{收款地址}/transactions
2. 匹配：to == 收款地址 && amount == 单价 × 笔数 && 区块已确认
3. 幂等：以 txID 去重，写库标记 order(status=paid)
4. 发放：TronWeb / tronpy 调 DelegateResource
   （owner = 供货账户，receiver = 用户地址，balance = 65000 × 笔数，duration = 1h）
5. 回写 txHash，前端/客服可查
6. 异常（金额不符、超时、转错网络）进入人工队列
```

`verify.html` 的核验功能是**只读**的，可以当作客服工具。

---

## 7. SEO 与维护

- 每页都有唯一 `title` / `description` / `canonical` / OG 图。
- 首页有 `Organization` + `Service` + `FAQPage` 结构化数据，价格页有 `Product`。
- 改完内容跑一次自检：

```bash
python tools/qa.py        # 死链、重复 ID、meta 长度、JSON-LD
```

---

## 8. 安全清单

- [x] 全站无第三方脚本、无统计代码，不收集用户数据
- [x] CSP / X-Frame-Options / Referrer-Policy 已配置在 `_headers`
- [x] 收款地址做 Base58Check 校验（抄错一个字符会直接提示）
- [x] 页脚固定展示完整收款地址，便于用户核对
- [x] 价格管理器不在仓库里、不上线，token 只存本机浏览器
- [ ] **私钥永远不要写进前端或仓库**
- [ ] 建议开启 Cloudflare 的 Bot Fight Mode 与速率限制

---

## 9. 免责声明

本站仅提供 TRON 能量委托相关技术服务，不吸收存款、不承诺收益、不构成投资建议。
链上转账不可撤销，请务必核对地址与网络。
