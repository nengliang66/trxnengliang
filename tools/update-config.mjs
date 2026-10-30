#!/usr/bin/env node
/**
 * 一键修改站点配置：收款地址 / 单价 / 域名 / 客服 Telegram。
 *
 * 用法：
 *   node tools/update-config.mjs --address Txxxx...            # 换收款地址
 *   node tools/update-config.mjs --price 0.6                   # 换单价并重算价目表
 *   node tools/update-config.mjs --domain https://trx.foo.com  # 换域名（canonical / sitemap / OG）
 *   node tools/update-config.mjs --telegram @yourhandle        # 换 Telegram 客服
 *   node tools/update-config.mjs --dry                         # 只看会改什么，不写文件
 *
 * 说明：地址与域名会同步替换到所有 HTML；单价会重算首页/价格页的价格表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'assets', 'js', 'config.js');

const argv = process.argv.slice(2);
const opts = { dry: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry') opts.dry = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
}

const configSrc = fs.readFileSync(CONFIG_PATH, 'utf8');
const readField = (name, fallback) => {
  const m = configSrc.match(new RegExp(`${name}:\\s*'([^']*)'`));
  return m ? m[1] : fallback;
};
const readNumber = (name, fallback) => {
  const m = configSrc.match(new RegExp(`${name}:\\s*([0-9.]+)`));
  return m ? Number(m[1]) : fallback;
};

const OLD_ADDR = readField('address');
const OLD_DOMAIN = readField('domain', 'https://your-domain.com');
const OLD_PRICE = readNumber('price', 0.5);
const ENERGY = readNumber('energyPerUnit', 65000);

const NEW_ADDR = opts.address ? String(opts.address).trim() : OLD_ADDR;
const NEW_PRICE = opts.price ? Number(opts.price) : OLD_PRICE;
const NEW_DOMAIN = opts.domain ? String(opts.domain).trim().replace(/\/+$/, '') : OLD_DOMAIN;

const fmt = (n) => {
  const s = Number(n).toFixed(6).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
};
const fmtInt = (n) => Number(n).toLocaleString('en-US');

const htmlFiles = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .map((f) => path.join(ROOT, f));
const textFiles = [
  ...htmlFiles,
  path.join(ROOT, 'sitemap.xml'),
  path.join(ROOT, 'robots.txt')
].filter((f) => fs.existsSync(f));

const report = [];
const leftovers = [];
let changed = 0;

for (const file of textFiles) {
  const before = fs.readFileSync(file, 'utf8');
  let out = before;

  // 1) 域名
  if (NEW_DOMAIN !== OLD_DOMAIN) {
    out = out.split(OLD_DOMAIN).join(NEW_DOMAIN);
  }

  // 2) 收款地址
  if (NEW_ADDR !== OLD_ADDR) {
    out = out.split(OLD_ADDR).join(NEW_ADDR);
  }

  // 3) 单价：先重算价目表（笔数 × 单价 / 笔数 × 能量）
  if (NEW_PRICE !== OLD_PRICE) {
    out = out.replace(
      /<td class="num">(\d+) 笔<\/td><td>[\d,]+<\/td><td><strong class="num">[\d.]+ TRX<\/strong><\/td>/g,
      (_m, units) =>
        `<td class="num">${units} 笔</td><td>${fmtInt(Number(units) * ENERGY)}</td><td><strong class="num">${fmt(Number(units) * NEW_PRICE)} TRX</strong></td>`
    );

    // 已知的单价写法
    out = out.split(`${fmt(OLD_PRICE)} TRX`).join(`${fmt(NEW_PRICE)} TRX`);
    out = out.split(`${fmt(OLD_PRICE)}<small>`).join(`${fmt(NEW_PRICE)}<small>`);
    out = out.split(`>${fmt(OLD_PRICE)}</span>`).join(`>${fmt(NEW_PRICE)}</span>`);
    out = out.split(`"price": "${fmt(OLD_PRICE)}"`).join(`"price": "${fmt(NEW_PRICE)}"`);
  }

  if (out !== before) {
    changed++;
    report.push(path.relative(ROOT, file));
    if (!opts.dry) fs.writeFileSync(file, out, 'utf8');
  }

  if (NEW_PRICE !== OLD_PRICE) {
    out.split('\n').forEach((line, idx) => {
      if (line.includes('priority')) return;
      if (line.includes(`${fmt(OLD_PRICE)} TRX`) || line.includes(`>${fmt(OLD_PRICE)}<`)) {
        leftovers.push(`${path.relative(ROOT, file)}:${idx + 1}  ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

// 4) config.js
let newConfig = configSrc;
if (NEW_ADDR !== OLD_ADDR) newConfig = newConfig.replace(/address:\s*'[^']*'/, `address: '${NEW_ADDR}'`);
if (NEW_PRICE !== OLD_PRICE) newConfig = newConfig.replace(/price:\s*[0-9.]+/, `price: ${NEW_PRICE}`);
if (NEW_DOMAIN !== OLD_DOMAIN) newConfig = newConfig.replace(/domain:\s*'[^']*'/, `domain: '${NEW_DOMAIN}'`);
if (opts.telegram !== undefined) {
  const tg = String(opts.telegram).trim().replace(/^@/, '');
  newConfig = newConfig.replace(/telegram:\s*'[^']*'/, `telegram: '${tg}'`);
}
if (opts.email !== undefined) {
  newConfig = newConfig.replace(/email:\s*'[^']*'/, `email: '${String(opts.email).trim()}'`);
}
if (newConfig !== configSrc) {
  if (!opts.dry) fs.writeFileSync(CONFIG_PATH, newConfig, 'utf8');
  report.push('assets/js/config.js');
}

console.log(opts.dry ? '=== DRY RUN（未写入任何文件）===' : '=== 已更新 ===');
console.log(`地址：${OLD_ADDR}  ->  ${NEW_ADDR}`);
console.log(`单价：${fmt(OLD_PRICE)}  ->  ${fmt(NEW_PRICE)}`);
console.log(`域名：${OLD_DOMAIN}  ->  ${NEW_DOMAIN}`);
console.log(`文件：${report.length ? report.join(', ') : '无改动'}`);

if (leftovers.length) {
  console.warn('\n⚠️  以下位置可能仍写着旧单价，请人工确认：');
  leftovers.forEach((l) => console.warn('   ' + l));
}

if (NEW_ADDR !== OLD_ADDR) {
  console.log('\n⚠️  收款地址已变更，二维码需要重新生成：');
  console.log('   pip install segno pillow && python tools/gen_assets.py');
  console.log('   （tools/gen_assets.py 顶部的 ADDRESS 变量也要同步修改）');
}
