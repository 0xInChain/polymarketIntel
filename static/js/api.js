/**
 * API 客户端 - 通过本地 Flask 网关调用数据 API.
 * 数据 API 地址与访问令牌由用户在 /settings 页填入, 保存在本地 config.json.
 */

const API_BASE = '/api';
const NOT_CONFIGURED_ERROR = 'not_configured';

async function apiGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const url = `${API_BASE}/${path.replace(/^\//, '')}${qs.toString() ? '?' + qs.toString() : ''}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`非 JSON 响应 (HTTP ${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    if (resp.status === 503 && data && data.error === 'not_configured') {
      const err = new Error(NOT_CONFIGURED_ERROR);
      err.notConfigured = true;
      throw err;
    }
    const msg = (data && (data.error || data.detail || data.message)) || `HTTP ${resp.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

const PolyAPI = {
  stats: () => apiGet('chaindata/polymarket/stats'),
  events: (params) => apiGet('chaindata/polymarket/events', params),
  eventDetail: (eventId) => apiGet(`chaindata/polymarket/events/${eventId}`),
  featuredEvents: () => apiGet('chaindata/polymarket/featured-events'),
  topEvents: (params) => apiGet('chaindata/polymarket/top-events', params),
  topEventBreakdown: (eventId, params) => apiGet(`chaindata/polymarket/top-events/${eventId}/breakdown`, params),
  topHolders: (conditionId, params) => apiGet(`chaindata/polymarket/top-holders/${conditionId}`, params),
  leaderboard: (params) => apiGet('chaindata/polymarket/leaderboard', params),
  activity: (params) => apiGet('chaindata/polymarket/activity', params),
  orderBook: (conditionId) => apiGet(`chaindata/polymarket/order-book/${conditionId}`),
  prices: (params) => apiGet('chaindata/polymarket/prices', params),
  pnlChart: (params) => apiGet('chaindata/polymarket/pnl/chart', params),
  positions: (addr, params) => apiGet(`chaindata/polymarket/positions/${addr}`, params),
  eventPositions: (conditionId, params) => apiGet(`chaindata/polymarket/event-positions/${conditionId}`, params),
  walletBalance: (addr) => apiGet(`chaindata/polymarket/wallet/${addr}/summary/balance`),
  walletPnl: (addr) => apiGet(`chaindata/polymarket/wallet/${addr}/summary/pnl`),
  walletPortfolio: (addr) => apiGet(`chaindata/polymarket/wallet/${addr}/summary/portfolio`),
  walletStats: (addr) => apiGet(`chaindata/polymarket/wallet/${addr}/summary/stats`),
  walletBiggestWin: (addr) => apiGet(`chaindata/polymarket/wallet/${addr}/summary/biggest-win`),
  walletPredictionHistory: (addr, params) => apiGet(`chaindata/polymarket/wallet/${addr}/prediction-history`, params),
  resolveNames: (addresses) => {
    const list = Array.isArray(addresses) ? addresses.join(',') : String(addresses);
    return apiGet('chaindata/polymarket/wallet/resolve-names', { addresses: list });
  },
};

/* ============== 工具方法 ============== */

const fmt = {
  shortAddr(addr, head = 6, tail = 4) {
    if (!addr) return '';
    const s = String(addr);
    if (s.length <= head + tail + 2) return s;
    return s.slice(0, head) + '…' + s.slice(-tail);
  },

  usd(value, opts = {}) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (opts.compact !== false && abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (opts.compact !== false && abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (opts.compact !== false && abs >= 10_000) return (n / 1_000).toFixed(1) + 'K';
    if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  },

  number(value, opts = {}) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: opts.maxFraction ?? 0 });
  },

  pct(value, digits = 1) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return (n * 100).toFixed(digits) + '%';
  },

  price(value) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return (n * 100).toFixed(1) + '¢';
  },

  signed(value) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + fmt.usd(n);
  },

  date(value) {
    if (!value) return '—';
    const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  dateTime(value) {
    if (!value) return '—';
    const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  ago(value) {
    if (!value) return '—';
    const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return Math.max(1, Math.floor(diff)) + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago';
    return fmt.date(value);
  },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v === null || v === undefined) continue;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
    else node.appendChild(c);
  }
  return node;
}

function showToast(msg, type = 'info') {
  const t = el('div', { class: `toast ${type === 'error' ? 'error' : ''}` }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(
    () => showToast('已复制'),
    () => showToast('复制失败', 'error')
  );
}

function pnlClass(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n) || n === 0) return '';
  return n > 0 ? 'pos' : 'neg';
}

function setLoading(container, on = true) {
  if (on) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'loader' }, el('div', { class: 'spinner' })));
  }
}

function emptyState(text, iconName = 'inbox') {
  if (text == null) text = (window.i18n && window.i18n.t('empty')) || 'No data';
  return el(
    'div',
    { class: 'empty-state' },
    el('i', { 'data-lucide': iconName, width: 32, height: 32 }),
    el('div', {}, text)
  );
}

/**
 * 处理列表加载错误: 如果是 not_configured 则在挂载点显示横幅; 否则展示常规错误.
 * 返回 true 表示已处理 (调用方可短路返回).
 */
function handleApiError(err, hostEl) {
  if (err && err.notConfigured) {
    showConfigBanner();
    if (hostEl) {
      hostEl.innerHTML = '';
      hostEl.appendChild(el('div', { class: 'config-banner' },
        el('i', { 'data-lucide': 'settings', width: 18, height: 18 }),
        el('span', {}, (window.i18n && window.i18n.t('not_configured')) || 'Not configured'),
        el('a', { href: '/settings' }, (window.i18n && window.i18n.t('go_to_settings')) || 'Settings')
      ));
      refreshLucide();
    }
    return true;
  }
  return false;
}

/** 顶部全局横幅: 未配置时引导用户到 /settings. 只渲染一次. */
function showConfigBanner() {
  const host = document.getElementById('config-banner-host');
  if (!host || host.dataset.shown === '1') return;
  host.dataset.shown = '1';
  host.appendChild(el('div', { class: 'config-banner' },
    el('i', { 'data-lucide': 'settings', width: 18, height: 18 }),
    el('span', {}, (window.i18n && window.i18n.t('not_configured')) || 'Data API not configured —'),
    el('a', { href: '/settings' }, (window.i18n && window.i18n.t('go_to_settings')) || 'Settings')
  ));
  refreshLucide();
}

function refreshLucide() {
  if (window.lucide) window.lucide.createIcons();
}

/* ============== Custom Select (替代原生 <select> 以保证下拉面板风格统一) ==============
 *  customSelect(current, opts, onChange, options?)
 *    current  : 当前值
 *    opts     : ['volume', 'endDate']  或  [['volume','成交额'], ['endDate','结束']]
 *    onChange : (newValue) => void
 *    options  : { minWidth, placeholder } 可选
 *  返回根 DOM 节点 (`<div class="cs">`).
 */
function customSelect(current, opts, onChange, options = {}) {
  const items = opts.map((o) => {
    const [val, label] = Array.isArray(o) ? o : [o, o];
    return { val: String(val), label: String(label) };
  });

  const root = el('div', { class: 'cs' });
  if (options.minWidth) root.style.minWidth = options.minWidth;

  const valueEl = el('span', { class: 'cs-value' }, '');
  const chevron = el('i', { 'data-lucide': 'chevron-down', class: 'cs-chevron', width: 14, height: 14 });
  const toggle = el('button', { type: 'button', class: 'cs-toggle' }, valueEl, chevron);
  const panel = el('div', { class: 'cs-panel', role: 'listbox' });

  let cur = String(current);

  function syncValue() {
    const found = items.find((i) => i.val === cur);
    valueEl.textContent = found ? found.label : (options.placeholder || cur || '');
  }
  syncValue();

  // 渲染面板选项
  items.forEach((it) => {
    const checkIcon = el('i', { 'data-lucide': 'check', width: 12, height: 12 });
    const optionEl = el('div', {
      class: 'cs-option' + (it.val === cur ? ' active' : ''),
      role: 'option',
      'data-val': it.val,
      onclick: (e) => {
        e.stopPropagation();
        if (it.val !== cur) {
          cur = it.val;
          syncValue();
          panel.querySelectorAll('.cs-option').forEach((o) => {
            o.classList.toggle('active', o.dataset.val === cur);
          });
          onChange(it.val);
        }
        close();
      },
    },
      el('span', { class: 'cs-option-check' }, checkIcon),
      el('span', {}, it.label)
    );
    panel.appendChild(optionEl);
  });

  function open() {
    if (root.classList.contains('open')) return;
    // 同时只能开一个
    document.querySelectorAll('.cs.open').forEach((o) => o.classList.remove('open'));
    root.classList.add('open');
    refreshLucide();
  }
  function close() {
    root.classList.remove('open');
  }
  function toggleOpen() {
    root.classList.contains('open') ? close() : open();
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOpen();
  });
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  root.appendChild(toggle);
  root.appendChild(panel);

  refreshLucide();
  return root;
}

// 全局点击关闭所有打开的下拉
if (typeof document !== 'undefined' && !document._csCloseBound) {
  document._csCloseBound = true;
  document.addEventListener('click', () => {
    document.querySelectorAll('.cs.open').forEach((o) => o.classList.remove('open'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.cs.open').forEach((o) => o.classList.remove('open'));
    }
  });
}

/* ============== NameCache: 批量解析 wallet 显示名 ============== */
const NameCache = {
  cache: {},
  pending: new Set(),
  timer: null,
  lookup(addr) {
    if (!addr) return null;
    return this.cache[addr] || this.cache[String(addr).toLowerCase()] || null;
  },
  request(addr) {
    if (!addr) return;
    if (this.lookup(addr)) { this._apply(addr); return; }
    this.pending.add(addr);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this._flush(), 80);
  },
  async _flush() {
    const batch = [...this.pending];
    this.pending.clear();
    if (!batch.length) return;
    // 单批最多 20 个地址 (数据 API 对大批量响应较慢)
    const chunks = [];
    for (let i = 0; i < batch.length; i += 20) chunks.push(batch.slice(i, i + 20));
    // 并发处理
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const data = await PolyAPI.resolveNames(chunk);
        const wallets = (data && data.wallets) || {};
        for (const [k, v] of Object.entries(wallets)) {
          const name = v && (v.displayName || v.labelName);
          if (name) {
            this.cache[k] = name;
            this.cache[k.toLowerCase()] = name;
          }
        }
        chunk.forEach((a) => this._apply(a));
      } catch (err) {
        // 静默失败，地址保持短地址显示
      }
    }));
  },
  _apply(addr) {
    const name = this.lookup(addr);
    if (!name) return;
    const sel = `[data-resolve-addr="${addr}"], [data-resolve-addr="${String(addr).toLowerCase()}"]`;
    document.querySelectorAll(sel).forEach((node) => {
      if (node.dataset.resolved) return;
      node.textContent = name;
      node.title = addr;
      node.classList.remove('addr');
      node.dataset.resolved = '1';
    });
  },
};

function traderCell(addr) {
  if (!addr) return el('span', { class: 'muted' }, '—');
  const cached = NameCache.lookup(addr);
  const span = el('span', {
    class: 'addr',
    'data-resolve-addr': addr,
    title: addr,
  }, cached || fmt.shortAddr(addr));
  if (cached) {
    span.classList.remove('addr');
    span.dataset.resolved = '1';
  } else {
    setTimeout(() => NameCache.request(addr), 0);
  }
  return span;
}

window.PolyAPI = PolyAPI;
window.fmt = fmt;
window.el = el;
window.showToast = showToast;
window.copyText = copyText;
window.pnlClass = pnlClass;
window.setLoading = setLoading;
window.emptyState = emptyState;
window.refreshLucide = refreshLucide;
window.NameCache = NameCache;
window.traderCell = traderCell;
window.handleApiError = handleApiError;
window.showConfigBanner = showConfigBanner;
