/*!
 * TRX 能量直营 — 全站交互
 * 无依赖，原生 JS。所有金额计算都在本地完成，不收集任何用户数据。
 */
(function () {
  'use strict';

  var CFG = window.TRX_CONFIG || {};
  var ADDR = CFG.address || 'TAvzRvSBBQyHYc9hDDxgETQfkXqh555s18';
  var PRICE = typeof CFG.price === 'number' ? CFG.price : 1.8;
  var ENERGY = typeof CFG.energyPerUnit === 'number' ? CFG.energyPerUnit : 65000;
  var MIN = typeof CFG.minUnits === 'number' ? CFG.minUnits : 1;
  var MAX = typeof CFG.maxUnits === 'number' ? CFG.maxUnits : 5000;
  var STORE_KEY = 'trx-energy.address';

  /* ---------------- 基础工具 ---------------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function pad2(s) {
    return s.length < 2 ? '0' + s : s;
  }

  function fmtNumber(n, maxDigits) {
    if (!isFinite(n)) return '0';
    try {
      return new Intl.NumberFormat('zh-CN', {
        maximumFractionDigits: typeof maxDigits === 'number' ? maxDigits : 6,
        minimumFractionDigits: 0
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  function round6(n) {
    return Math.round(n * 1e6) / 1e6;
  }

  /* ---------------- 提示条 ---------------- */

  var toastEl = null;
  var toastTimer = null;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    // 强制回流，保证重复点击时动画可以重播
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1900);
  }

  /* ---------------- 复制 ---------------- */

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text, okMsg) {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () {
          toast(okMsg || '已复制');
        },
        function () {
          toast(legacyCopy(text) ? okMsg || '已复制' : '复制失败，请长按手动复制');
        }
      );
    } else {
      toast(legacyCopy(text) ? okMsg || '已复制' : '复制失败，请长按手动复制');
    }
  }

  function bindCopyButtons() {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-copy');
        var text = '';
        if (kind === 'addr') {
          text = ADDR;
        } else if (kind === 'amount') {
          var amountEl = $('.js-amount');
          text = amountEl ? amountEl.getAttribute('data-value') || amountEl.textContent : '';
        } else {
          text = btn.getAttribute('data-copy-text') || '';
        }
        copyText(text, btn.getAttribute('data-copy-msg') || '已复制');
      });
    });
  }

  /* ---------------- TRON 地址校验 ---------------- */

  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58ToBytes(str) {
    var i, n = 0n;
    for (i = 0; i < str.length; i++) {
      var idx = B58.indexOf(str.charAt(i));
      if (idx < 0) return null;
      n = n * 58n + BigInt(idx);
    }
    var hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    // 前导 '1' 对应前导零字节
    var zeros = 0;
    while (zeros < str.length && str.charAt(zeros) === '1') zeros++;
    var out = new Uint8Array(zeros + hex.length / 2);
    for (i = 0; i < hex.length / 2; i++) {
      out[zeros + i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    return Array.prototype.map
      .call(bytes, function (b) {
        return pad2(b.toString(16));
      })
      .join('');
  }

  function sha256(bytes) {
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve(null);
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  /**
   * 校验 TRON 地址：长度、字符集、版本字节 0x41、双 SHA-256 校验和。
   * 返回 Promise<{ok:boolean, reason:string, hex:string}>。
   */
  function validateAddress(address) {
    var value = String(address || '').trim();
    if (!value) {
      return Promise.resolve({ ok: false, reason: '请输入接收能量的 TRON 地址', hex: '' });
    }
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) {
      return Promise.resolve({
        ok: false,
        reason: '地址格式不正确：应为 T 开头的 34 位 TRON 地址',
        hex: ''
      });
    }
    var bytes = base58ToBytes(value);
    if (!bytes || bytes.length !== 25 || bytes[0] !== 0x41) {
      return Promise.resolve({ ok: false, reason: '地址格式不正确，请核对后重试', hex: '' });
    }
    var hex = bytesToHex(bytes.slice(0, 21));
    var first = bytes.slice(0, 21);
    return sha256(first)
      .then(function (h1) {
        return h1 ? sha256(h1) : null;
      })
      .then(function (h2) {
        if (!h2) return { ok: true, reason: '', hex: hex }; // 无 WebCrypto 时跳过校验和
        for (var i = 0; i < 4; i++) {
          if (h2[i] !== bytes[21 + i]) {
            return { ok: false, reason: '地址校验和不匹配，可能抄错了一两个字符', hex: hex };
          }
        }
        return { ok: true, reason: '', hex: hex };
      });
  }

  /* ---------------- 导航 ---------------- */

  function initNav() {
    var toggle = $('.nav-toggle');
    var nav = $('#siteNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      nav.setAttribute('data-open', open ? 'false' : 'true');
    });

    $$('a', nav).forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.setAttribute('aria-expanded', 'false');
        nav.setAttribute('data-open', 'false');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        toggle.setAttribute('aria-expanded', 'false');
        nav.setAttribute('data-open', 'false');
      }
    });
  }

  function initHeaderScroll() {
    var header = $('.site-header');
    if (!header) return;
    var onScroll = function () {
      header.style.boxShadow = window.scrollY > 8 ? '0 18px 40px -30px rgba(0,0,0,.9)' : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- 滚动淡入 ---------------- */

  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var items = $$('[data-reveal]');
    if (!items.length) return;

    items.forEach(function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i * 55, 260) + 'ms';
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ---------------- 页脚年份 ---------------- */

  function initYear() {
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ---------------- 购买页计算器 ---------------- */

  function initBuyForm() {
    var form = $('#buyForm');
    if (!form) return;

    var addrInput = $('#addr');
    var qtyInput = $('#qty');
    var energyEl = $('#energyOut');
    var unitsEl = $('#unitsOut');
    var addrError = $('#addrError');
    var qtyError = $('#qtyError');
    var linkEl = $('#addrLink');
    var valid = false;

    function setError(el, msg) {
      if (!el) return;
      if (msg) {
        el.textContent = msg;
        el.classList.add('show');
      } else {
        el.textContent = '';
        el.classList.remove('show');
      }
    }

    function currentQty() {
      var raw = parseInt(qtyInput.value, 10);
      if (!isFinite(raw)) return NaN;
      return raw;
    }

    function calc() {
      var qty = currentQty();
      var okQty = isFinite(qty) && qty >= MIN && qty <= MAX;
      var total = okQty ? round6(qty * PRICE) : 0;

      if (!okQty) {
        setError(qtyError, '请输入 ' + MIN + ' – ' + fmtNumber(MAX, 0) + ' 之间的整数笔数');
      } else {
        setError(qtyError, '');
      }

      $$('.js-amount').forEach(function (el) {
        el.textContent = fmtNumber(total, 6);
        el.setAttribute('data-value', String(total));
      });
      if (energyEl) energyEl.textContent = okQty ? fmtNumber(qty * ENERGY, 0) + ' 能量' : '—';
      if (unitsEl) unitsEl.textContent = okQty ? fmtNumber(qty, 0) + ' 笔' : '—';

      $$('.preset').forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(parseInt(btn.getAttribute('data-qty'), 10) === qty));
      });

      return okQty ? total : NaN;
    }

    function checkAddr(showEmpty) {
      return validateAddress(addrInput.value).then(function (res) {
        if (!res.ok && !showEmpty && !String(addrInput.value).trim()) {
          setError(addrError, '');
          addrInput.setAttribute('aria-invalid', 'false');
          valid = false;
          return false;
        }
        setError(addrError, res.ok ? '' : res.reason);
        addrInput.setAttribute('aria-invalid', res.ok ? 'false' : 'true');
        valid = res.ok;
        if (res.ok) {
          try {
            localStorage.setItem(STORE_KEY, addrInput.value.trim());
          } catch (e) {
            /* 隐私模式下忽略 */
          }
        }
        return res.ok;
      });
    }

    // 恢复上次填写的地址
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(saved)) addrInput.value = saved;
    } catch (e) {
      /* ignore */
    }

    addrInput.addEventListener('blur', function () {
      if (addrInput.value.trim()) checkAddr(false);
    });

    addrInput.addEventListener('input', function () {
      valid = false;
      if (addrError && addrError.classList.contains('show')) checkAddr(false);
    });

    qtyInput.addEventListener('input', function () {
      // 只保留数字
      qtyInput.value = qtyInput.value.replace(/[^\d]/g, '');
      calc();
    });

    $$('.preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        qtyInput.value = btn.getAttribute('data-qty');
        calc();
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      Promise.all([checkAddr(true)]).then(function (results) {
        var addrOk = results[0];
        var qtyOk = isFinite(currentQty()) && currentQty() >= MIN && currentQty() <= MAX;
        if (!addrOk || !qtyOk) {
          calc();
          if (!addrOk) addrInput.focus();
          else qtyInput.focus();
          return;
        }
        // 没有后端：引导用户完成转账，并给出复制动作
        var totalEl2 = $('.js-amount');
        var paySection = $('#paySection');
        if (paySection) paySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        copyText(totalEl2 ? totalEl2.getAttribute('data-value') : '', '金额已复制，请粘贴到转账页面');
      });
    });

    // 地址链接
    if (linkEl) linkEl.setAttribute('href', (CFG.explorerAddress || 'https://tronscan.org/#/address/') + ADDR);

    calc();
    if (addrInput.value) checkAddr(false);
  }

  /* ---------------- 联系方式 / 地址占位 ---------------- */

  function initSiteData() {
    $$('[data-addr-text]').forEach(function (el) {
      el.textContent = ADDR;
    });

    $$('[data-addr-short]').forEach(function (el) {
      el.textContent = ADDR.slice(0, 4) + '…' + ADDR.slice(-4);
    });

    var tg = String(CFG.telegram || '').trim();
    if (tg) {
      var handle = tg.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
      var url = 'https://t.me/' + handle;
      $$('[data-tg]').forEach(function (el) {
        el.setAttribute('href', url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.hidden = false;
        if (!el.textContent.trim()) el.textContent = 'Telegram 联系';
      });
      $$('[data-tg-empty]').forEach(function (el) {
        el.hidden = true;
      });
    }

    var mail = String(CFG.email || '').trim();
    if (mail) {
      $$('[data-mail]').forEach(function (el) {
        el.setAttribute('href', 'mailto:' + mail);
        el.hidden = false;
      });
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    initNav();
    initHeaderScroll();
    initReveal();
    initYear();
    initSiteData();
    bindCopyButtons();
    initBuyForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给其他脚本（verify.js 需要复用地址校验）
  window.TRXSite = {
    validateAddress: validateAddress,
    copyText: copyText,
    toast: toast,
    fmtNumber: fmtNumber,
    config: CFG
  };
})();
