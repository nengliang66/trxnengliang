/*!
 * TRX 能量直营 — 付款核验
 * 通过 TronGrid 公共节点只读查询链上交易，判断是否向收款地址转入正确金额。
 * 不上传、不保存任何数据。
 */
(function () {
  'use strict';

  var CFG = window.TRX_CONFIG || {};
  var ADDR = CFG.address || '';
  var PRICE = typeof CFG.price === 'number' ? CFG.price : 1.8;
  var API = 'https://api.trongrid.io';
  var CONTRACT = 'TransferContract';

  function $(sel) {
    return document.querySelector(sel);
  }

  function fmt(n, d) {
    try {
      return new Intl.NumberFormat('zh-CN', {
        maximumFractionDigits: typeof d === 'number' ? d : 6
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  function short(hex) {
    if (!hex) return '—';
    return hex.length > 18 ? hex.slice(0, 8) + '…' + hex.slice(-8) : hex;
  }

  function apiGet(path) {
    return fetch(API + path, { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function apiPost(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function setState(state, title, rows, foot) {
    var box = $('#result');
    var head = $('#resultTitle');
    var badge = $('#resultBadge');
    var list = $('#resultRows');
    var footEl = $('#resultFoot');
    if (!box) return;

    box.classList.add('show');
    if (head) head.textContent = title;

    if (badge) {
      badge.className = 'badge ' + (state === 'ok' ? 'badge-ok' : state === 'warn' ? 'badge-warn' : 'badge-bad');
      badge.textContent = state === 'ok' ? '匹配' : state === 'warn' ? '需人工确认' : '不匹配';
    }

    if (list) {
      list.innerHTML = '';
      (rows || []).forEach(function (row) {
        var wrap = document.createElement('div');
        var dt = document.createElement('dt');
        var dd = document.createElement('dd');
        dt.textContent = row[0];
        dd.textContent = row[1];
        if (row[2]) dd.classList.add(row[2]);
        wrap.appendChild(dt);
        wrap.appendChild(dd);
        list.appendChild(wrap);
      });
    }

    if (footEl) {
      footEl.textContent = foot || '';
      footEl.style.display = foot ? '' : 'none';
    }

    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hexToBase58(hex41) {
    // 仅用于展示时的地址转换（TRON Base58Check）
    var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var bytes = [];
    for (var i = 0; i < hex41.length; i += 2) bytes.push(parseInt(hex41.substr(i, 2), 16));

    // 追加校验和需要 SHA-256；WebCrypto 为异步，这里只做无校验展示
    var n = 0n;
    for (var j = 0; j < bytes.length; j++) n = n * 256n + BigInt(bytes[j]);
    var out = '';
    while (n > 0n) {
      out = B58[Number(n % 58n)] + out;
      n = n / 58n;
    }
    for (var k = 0; k < bytes.length && bytes[k] === 0; k++) out = '1' + out;
    return out;
  }

  function hexToBase58Check(hex41) {
    var raw = hex41;
    var bytes = [];
    for (var i = 0; i < raw.length; i += 2) bytes.push(parseInt(raw.substr(i, 2), 16));
    var payload = new Uint8Array(bytes);

    if (!window.crypto || !window.crypto.subtle) {
      return Promise.resolve(hexToBase58(hex41));
    }
    return window.crypto.subtle
      .digest('SHA-256', payload)
      .then(function (h1) {
        return window.crypto.subtle.digest('SHA-256', h1);
      })
      .then(function (h2) {
        var check = new Uint8Array(h2).slice(0, 4);
        var full = new Uint8Array(payload.length + 4);
        full.set(payload, 0);
        full.set(check, payload.length);
        return hexToBase58(
          Array.prototype.map
            .call(full, function (b) {
              return (b < 16 ? '0' : '') + b.toString(16);
            })
            .join('')
        );
      });
  }

  function checksumNote() {
    return '本页仅做链上核验，不会自动发放能量；如显示「匹配」，请把交易哈希发给客服加速处理。';
  }

  function run(txid) {
    var submit = $('#verifyBtn');
    if (submit) {
      submit.disabled = true;
      submit.textContent = '查询中…';
    }

    Promise.all([
      apiGet('/wallet/gettransactionbyid?value=' + encodeURIComponent(txid)),
      apiGet('/wallet/gettransactioninfobyid?value=' + encodeURIComponent(txid)),
      apiPost('/wallet/getnowblock', {})
    ])
      .then(function (res) {
        var tx = res[0] || {};
        var info = res[1] || {};
        var head = res[2] || {};

        if (!tx || !tx.txID) {
          setState('bad', '没有找到这笔交易', [['交易哈希', txid]], '请确认哈希复制完整，且交易已广播到 TRON 主网。');
          return;
        }

        var contract = (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) || {};
        var type = contract.type || '';
        var value = (contract.parameter && contract.parameter.value) || {};
        var ret = (tx.ret && tx.ret[0]) || {};
        var blockNumber = info.blockNumber || (tx.blockNumber || 0);
        var headNumber = (head.block_header && head.block_header.raw_data && head.block_header.raw_data.number) || 0;
        var confirmations = blockNumber && headNumber ? Math.max(headNumber - blockNumber + 1, 0) : 0;

        if (type !== CONTRACT) {
          setState(
            'bad',
            '这不是一笔 TRX 转账',
            [
              ['交易类型', type || '未知'],
              ['交易哈希', txid]
            ],
            '合约调用、TRC20 转账等不会进入自动履约流程，请联系客服人工处理。'
          );
          return;
        }

        var sun = Number(value.amount || 0);
        var amount = sun / 1e6;
        var toHex = String(value.to_address || '');
        var fromHex = String(value.owner_address || '');
        var targetHex = String($('#targetHex') ? $('#targetHex').value : '');

        var units = PRICE > 0 ? amount / PRICE : 0;
        var unitsRounded = Math.round(units * 1e6) / 1e6;
        var unitsExact = Math.abs(unitsRounded - Math.round(unitsRounded)) < 1e-6;

        Promise.all([hexToBase58Check(fromHex), hexToBase58Check(toHex)]).then(function (addrs) {
          var fromAddr = addrs[0];
          var toAddr = addrs[1];
          var addressOk = targetHex ? toHex.toLowerCase() === targetHex.toLowerCase() : true;
          var success = (ret.contractRet || 'SUCCESS') === 'SUCCESS';

          var rows = [
            ['收款地址', toAddr],
            ['付款地址', fromAddr],
            ['金额', fmt(amount, 6) + ' TRX'],
            ['对应笔数', unitsExact ? fmt(unitsRounded, 0) + ' 笔' : '约 ' + fmt(unitsRounded, 2) + ' 笔（非整数）'],
            ['区块 / 确认数', (blockNumber ? fmt(blockNumber, 0) : '待打包') + (confirmations ? ' · ' + fmt(confirmations, 0) + ' 确认' : '')],
            ['执行结果', success ? '成功' : '失败（' + (ret.contractRet || '未知') + '）']
          ];

          var state = 'ok';
          var title = '付款已匹配';

          if (!addressOk) {
            state = 'bad';
            title = '收款地址不匹配';
          } else if (!success) {
            state = 'bad';
            title = '交易执行失败';
          } else if (!confirmations) {
            state = 'warn';
            title = '交易尚未确认';
          } else if (!unitsExact || amount <= 0) {
            state = 'warn';
            title = '金额与笔数不完全匹配';
          }

          setState(state, title, rows, checksumNote() + ' 交易哈希：' + txid);
        });
      })
      .catch(function (err) {
        setState(
          'bad',
          '查询失败',
          [['原因', String(err && err.message ? err.message : err)]],
          '可能是网络波动或公共节点限流，请稍后重试，或直接在 Tronscan 打开该交易查看。'
        );
      })
      .then(function () {
        if (submit) {
          submit.disabled = false;
          submit.textContent = '核验付款';
        }
      });
  }

  function init() {
    var form = $('#verifyForm');
    var input = $('#txid');
    var targetHexEl = $('#targetHex');
    if (!form || !input) return;

    // 预计算收款地址 hex41，用于比对
    if (window.TRXSite && window.TRXSite.validateAddress) {
      window.TRXSite.validateAddress(ADDR).then(function (res) {
        if (res.ok && targetHexEl) targetHexEl.value = res.hex;
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var txid = input.value.trim().replace(/^0x/, '');
      input.value = txid;

      if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
        var err = $('#txidError');
        if (err) err.classList.add('show');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      var err2 = $('#txidError');
      if (err2) err2.classList.remove('show');
      input.setAttribute('aria-invalid', 'false');
      run(txid);
    });

    // 支持 ?txid= 直接查询
    try {
      var param = new URLSearchParams(window.location.search).get('txid');
      if (param && /^[0-9a-fA-F]{64}$/.test(param)) {
        input.value = param;
        run(param);
      }
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
