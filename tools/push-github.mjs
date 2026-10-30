#!/usr/bin/env node
/**
 * 用 GitHub REST API 把当前目录推到一个仓库（无需本机安装 git）。
 *
 * 用法：
 *   set GITHUB_TOKEN=ghp_xxx
 *   node tools/push-github.mjs --repo trx-energy-site --private
 *
 * 可选参数：
 *   --owner <用户名>     默认取 token 对应的登录名
 *   --repo  <仓库名>     默认 trx-energy-site
 *   --branch <分支>      默认 main
 *   --private / --public 默认 private
 *   --message <提交信息>
 *   --dry                只打印将上传的文件
 *
 * Token 权限：classic PAT 勾选 `repo`；fine-grained 需 Contents: RW + Administration: RW（建仓库用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';

const argv = process.argv.slice(2);
const opt = { branch: 'main', repo: 'trx-energy-site', private: true, dry: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry') opt.dry = true;
  else if (a === '--private') opt.private = true;
  else if (a === '--public') opt.private = false;
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
}

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('缺少环境变量 GITHUB_TOKEN');
  process.exit(1);
}

const IGNORE = new Set(['.git', '.tmp', 'node_modules', 'vendor_py', '__pycache__', '.DS_Store']);

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

async function gh(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trx-energy-deploy',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json && json.message ? json.message : text.slice(0, 300);
    const err = new Error(`${method} ${endpoint} -> ${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function main() {
  const files = walk(ROOT);
  console.log(`准备上传 ${files.length} 个文件到 ${opt.owner || '(当前用户)'}/${opt.repo}#${opt.branch}`);
  if (opt.dry) {
    files.forEach((f) => console.log('  ' + f.rel));
    return;
  }

  const me = await gh('GET', '/user');
  const owner = opt.owner || me.login;
  console.log(`已认证：${me.login}`);

  // 1. 建仓库（已存在则复用）
  try {
    await gh('POST', '/user/repos', {
      name: opt.repo,
      private: opt.private,
      description: 'TRX 能量直营官网 — 0.5 TRX/笔，链上转账即下单',
      auto_init: false,
      has_issues: false,
      has_wiki: false
    });
    console.log(`已创建仓库 ${owner}/${opt.repo}`);
  } catch (e) {
    if (e.status === 422) {
      console.log(`仓库已存在，复用 ${owner}/${opt.repo}`);
    } else {
      throw e;
    }
  }

  // 2. 逐个上传 blob
  const tree = [];
  for (const f of files) {
    const content = fs.readFileSync(f.full).toString('base64');
    const blob = await gh('POST', `/repos/${owner}/${opt.repo}/git/blobs`, {
      content,
      encoding: 'base64'
    });
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
  }
  console.log(`已上传 ${tree.length} 个 blob`);

  // 3. 生成 tree / commit / ref
  const newTree = await gh('POST', `/repos/${owner}/${opt.repo}/git/trees`, { tree });

  let parents = [];
  try {
    const ref = await gh('GET', `/repos/${owner}/${opt.repo}/git/ref/heads/${opt.branch}`);
    parents = [ref.object.sha];
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  const commit = await gh('POST', `/repos/${owner}/${opt.repo}/git/commits`, {
    message: opt.message || `deploy: TRX 能量直营 ${new Date().toISOString().slice(0, 10)}`,
    tree: newTree.sha,
    parents
  });

  if (parents.length) {
    await gh('PATCH', `/repos/${owner}/${opt.repo}/git/refs/heads/${opt.branch}`, {
      sha: commit.sha,
      force: true
    });
  } else {
    await gh('POST', `/repos/${owner}/${opt.repo}/git/refs`, {
      ref: `refs/heads/${opt.branch}`,
      sha: commit.sha
    });
  }

  console.log(`\n✅ 推送完成：https://github.com/${owner}/${opt.repo}`);
  console.log(`   commit ${commit.sha.slice(0, 7)} · branch ${opt.branch}`);
  console.log('\n下一步（Cloudflare Pages）：');
  console.log('   Workers & Pages → Create → Pages → Connect to Git → 选择该仓库');
  console.log('   构建命令留空，输出目录填 /');
}

main().catch((e) => {
  console.error('❌ ' + e.message);
  process.exit(1);
});
