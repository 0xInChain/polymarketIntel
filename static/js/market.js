/* eslint-disable no-undef */
/* market.js - Market 详情页 (按 conditionId, 中英双语) */

(function () {
  const t = (k, vars) => (window.i18n ? window.i18n.t(k, vars) : k);
  const root = document.getElementById('market-app');
  const CID = root.dataset.conditionId;

  const state = {
    pricesRange: '1d',
    pricesInterval: '1h',
    activeOutcomeIdx: 0,
    activeBottomTab: 'holders',
    holders: { offset: 0, limit: 50, outcome: '', items: null },
    positions: { offset: 0, limit: 50, sortBy: 'pnl', sortOrder: 'desc', items: null },
    activity: { offset: 0, limit: 50, items: null },
    priceChart: null,
    metaCache: null,
    bookCache: null,
  };

  function renderSkeleton() {
    root.innerHTML = '';
    root.appendChild(el('div', { id: 'config-banner-host' }));
    root.appendChild(el('div', { class: 'detail-header', id: 'market-header' },
      el('div', { class: 'detail-avatar' }, 'M'),
      el('div', {},
        el('h1', { class: 'detail-title' }, t('market_loading_title')),
        el('div', { class: 'detail-sub' },
          el('span', { class: 'addr addr-compact' }, fmt.shortAddr(CID, 10, 8)),
          el('button', { class: 'copy-btn', onclick: () => copyText(CID) }, t('market_copy_cid'))
        )
      )
    ));
    root.appendChild(el('div', { class: 'stats-grid', id: 'market-stats' }));
    root.appendChild(priceChartSection());
    root.appendChild(el('div', { class: 'grid-2' },
      orderBookSection(),
      bottomSection()
    ));
    refreshLucide();
  }

  function priceChartSection() {
    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'row', style: { gap: '14px' } },
        el('div', { class: 'section-title' }, t('market_price_history')),
        el('div', { class: 'tab-bar', style: { padding: '2px', margin: 0 } },
          ...['1d', '1w', '1m', 'all'].map((p) => el('button', {
            class: 'tab-btn ' + (p === state.pricesRange ? 'active' : ''),
            'data-range': p,
            onclick: () => { state.pricesRange = p; loadPrices(); },
          }, p.toUpperCase()))
        )
      ),
      el('div', { class: 'muted', id: 'price-summary', style: { fontSize: '13px' } }, '—')
    ));
    section.appendChild(el('div', { class: 'chart-wrap', id: 'price-chart-wrap' }, el('canvas', { id: 'price-chart' })));
    return section;
  }

  function orderBookSection() {
    return el('div', { class: 'section' },
      el('div', { class: 'section-header' },
        el('div', { class: 'section-title' }, t('market_order_book')),
        el('div', { class: 'row', id: 'book-side-tabs' })
      ),
      el('div', { id: 'book-content' }, el('div', { class: 'loader' }, el('div', { class: 'spinner' })))
    );
  }

  function bottomSection() {
    return el('div', { class: 'section' },
      el('div', { class: 'section-header' },
        el('div', { class: 'tab-bar', style: { margin: 0 } },
          el('button', { class: 'tab-btn active', 'data-bottom': 'holders', onclick: () => setBottomTab('holders') }, t('market_top_holders')),
          el('button', { class: 'tab-btn', 'data-bottom': 'positions', onclick: () => setBottomTab('positions') }, t('market_positions_pnl')),
          el('button', { class: 'tab-btn', 'data-bottom': 'activity', onclick: () => setBottomTab('activity') }, t('market_recent_activity'))
        )
      ),
      el('div', { id: 'bottom-content' })
    );
  }

  function setBottomTab(tab) {
    state.activeBottomTab = tab;
    document.querySelectorAll('[data-bottom]').forEach((b) => b.classList.toggle('active', b.dataset.bottom === tab));
    if (tab === 'holders') return renderHolders();
    if (tab === 'positions') return renderPositions();
    if (tab === 'activity') return renderActivity();
  }

  /* ---------- Load market meta & header ---------- */
  async function loadHeader() {
    try {
      const data = await PolyAPI.activity({ tokenAddresses: undefined, limit: 1, offset: 0, sortBy: 'time', sortOrder: 'desc', conditionID: CID });
      const ev = (data.events || [])[0];
      if (ev) {
        const header = document.getElementById('market-header');
        const titleEl = header.querySelector('.detail-title');
        titleEl.textContent = ev.question || '(unknown market)';
        if (ev.imageUrl) {
          const avatar = header.querySelector('.detail-avatar');
          avatar.innerHTML = '';
          avatar.appendChild(el('img', { src: ev.imageUrl, alt: '', onerror: function () { this.parentElement.textContent = 'M'; } }));
        }
        if (ev.eventId) {
          const sub = header.querySelector('.detail-sub');
          sub.appendChild(el('a', { class: 'copy-btn', href: '/event/' + ev.eventId }, t('market_view_event', { n: ev.eventId })));
        }
        state.metaCache = ev;
      }
    } catch (err) {
      if (err && err.notConfigured) showConfigBanner();
    }
  }

  async function loadMarketStats() {
    const grid = document.getElementById('market-stats');
    grid.innerHTML = '';
    const skel = ['market_outcomes', 'market_best_bid', 'market_best_ask', 'market_spread', 'market_last_price', 'market_holders_sample'];
    skel.forEach((k) => grid.appendChild(el('div', { class: 'stat-card' }, el('div', { class: 'stat-label' }, t(k)), el('div', { class: 'stat-value' }, el('span', { class: 'skeleton', style: { width: '60%', height: '20px' } })))));

    const results = await Promise.allSettled([
      PolyAPI.orderBook(CID),
      PolyAPI.prices({ conditionID: CID, range: '1d', interval: '1h', limit: 50 }),
      PolyAPI.topHolders(CID, { limit: 1 }),
    ]);
    const firstNotConfigured = results.find((r) => r.status === 'rejected' && r.reason && r.reason.notConfigured);
    if (firstNotConfigured) {
      showConfigBanner();
      grid.innerHTML = '';
      grid.appendChild(el('div', { class: 'config-banner' },
        el('i', { 'data-lucide': 'settings', width: 18, height: 18 }),
        el('span', {}, t('not_configured')),
        el('a', { href: '/settings' }, t('go_to_settings'))
      ));
      refreshLucide();
      return;
    }

    const [book, prices, holders] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
    state.bookCache = book;

    let bestBid = null, bestAsk = null, lastPrice = null;
    if (book && book.sides && book.sides.length) {
      const yes = book.sides[0];
      bestBid = yes.bids?.length ? parseFloat(yes.bids[yes.bids.length - 1].price) : null;
      bestAsk = yes.asks?.length ? parseFloat(yes.asks[yes.asks.length - 1].price) : null;
    }
    if (prices && prices.prices && prices.prices.length) {
      lastPrice = prices.prices[prices.prices.length - 1].price;
    }
    const spread = (bestBid !== null && bestAsk !== null) ? (bestAsk - bestBid) : null;
    const outcomes = book?.sides?.map((s) => s.outcome).filter(Boolean) || [];

    const cards = [
      { labelKey: 'market_outcomes', value: outcomes.length ? outcomes.join(' · ') : '—' },
      { labelKey: 'market_best_bid', value: bestBid !== null ? fmt.price(bestBid) : '—', cls: 'pos' },
      { labelKey: 'market_best_ask', value: bestAsk !== null ? fmt.price(bestAsk) : '—', cls: 'neg' },
      { labelKey: 'market_spread', value: spread !== null ? fmt.price(spread) : '—' },
      { labelKey: 'market_last_price', value: lastPrice !== null ? fmt.price(lastPrice) : '—' },
      { labelKey: 'market_holders_sample', value: holders ? fmt.number((holders.holders || holders.entries || []).length, { maxFraction: 0 }) + '+' : '—' },
    ];
    grid.innerHTML = '';
    for (const c of cards) {
      grid.appendChild(el('div', { class: 'stat-card' },
        el('div', { class: 'stat-label' }, t(c.labelKey)),
        el('div', { class: 'stat-value ' + (c.cls || '') }, c.value)
      ));
    }
    renderOrderBook();
  }

  /* ---------- Price chart ---------- */
  async function loadPrices() {
    const summary = document.getElementById('price-summary');
    summary.textContent = t('loading');
    document.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === state.pricesRange));
    try {
      const interval = state.pricesRange === '1d' ? '1h' : (state.pricesRange === '1w' ? '1h' : '1d');
      const data = await PolyAPI.prices({ conditionID: CID, range: state.pricesRange, interval, limit: 100 });
      const points = data.prices || [];
      const labels = points.map((p) => p.bucketStart);
      const values = points.map((p) => parseFloat(p.price));

      if (state.priceChart) state.priceChart.destroy();
      const ctx = document.getElementById('price-chart').getContext('2d');
      state.priceChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Yes Price',
            data: values,
            borderColor: '#00d49b',
            backgroundColor: 'rgba(0, 212, 155, 0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#11141c', borderColor: '#2e3346', borderWidth: 1,
              titleColor: '#e8eaf0', bodyColor: '#e8eaf0',
              callbacks: {
                title: (ctxs) => fmt.dateTime(ctxs[0].label),
                label: (c) => 'Yes: ' + fmt.price(c.parsed.y),
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#5d627a', maxTicksLimit: 6, callback: function (v) { return fmt.date(this.getLabelForValue(v)); } },
              grid: { color: '#1c212e' },
            },
            y: {
              min: 0, max: 1,
              ticks: { color: '#5d627a', callback: (v) => fmt.price(v) },
              grid: { color: '#1c212e' },
            },
          },
        },
      });
      const last = values[values.length - 1];
      const first = values[0];
      const diff = (last - first);
      summary.innerHTML = '';
      summary.appendChild(el('span', {}, 'Yes: '));
      summary.appendChild(el('span', { style: { color: 'var(--accent)', fontWeight: '600' } }, fmt.price(last)));
      summary.appendChild(el('span', { class: pnlClass(diff), style: { marginLeft: '8px' } },
        (diff >= 0 ? '+' : '') + fmt.price(diff) + ' ' + t('market_diff_in_range')
      ));
    } catch (err) {
      if (err && err.notConfigured) {
        showConfigBanner();
        summary.textContent = t('not_configured');
        return;
      }
      summary.textContent = t('load_failed') + ': ' + err.message;
    }
  }

  /* ---------- Order book ---------- */
  function renderOrderBook() {
    const tabs = document.getElementById('book-side-tabs');
    const content = document.getElementById('book-content');
    tabs.innerHTML = '';
    content.innerHTML = '';
    if (!state.bookCache || !state.bookCache.sides || !state.bookCache.sides.length) {
      content.appendChild(emptyState(t('market_no_book')));
      refreshLucide();
      return;
    }
    state.bookCache.sides.forEach((side, idx) => {
      const btn = el('button', {
        class: 'tab-btn ' + (idx === state.activeOutcomeIdx ? 'active' : ''),
        onclick: () => { state.activeOutcomeIdx = idx; renderOrderBook(); },
      }, side.outcome || t('ob_outcome_n', { n: idx + 1 }));
      tabs.appendChild(btn);
    });

    const side = state.bookCache.sides[state.activeOutcomeIdx];
    const bids = (side.bids || []).slice().sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 12);
    const asks = (side.asks || []).slice().sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 12);

    const grid = el('div', { class: 'book-grid' });
    const bidsBox = el('div', { class: 'book-side bids' }, el('h4', {}, t('ob_bids')));
    bids.forEach((b) => bidsBox.appendChild(el('div', { class: 'book-row' },
      el('span', { class: 'price' }, fmt.price(b.price)),
      el('span', { class: 'muted' }, fmt.number(parseFloat(b.size), { maxFraction: 2 }))
    )));
    if (!bids.length) bidsBox.appendChild(el('div', { class: 'muted', style: { padding: '12px 0' } }, t('ob_no_bids')));

    const asksBox = el('div', { class: 'book-side asks' }, el('h4', {}, t('ob_asks')));
    asks.forEach((a) => asksBox.appendChild(el('div', { class: 'book-row' },
      el('span', { class: 'price' }, fmt.price(a.price)),
      el('span', { class: 'muted' }, fmt.number(parseFloat(a.size), { maxFraction: 2 }))
    )));
    if (!asks.length) asksBox.appendChild(el('div', { class: 'muted', style: { padding: '12px 0' } }, t('ob_no_asks')));

    grid.appendChild(bidsBox);
    grid.appendChild(asksBox);
    content.appendChild(grid);
  }

  /* ---------- Top holders ---------- */
  async function renderHolders() {
    const c = document.getElementById('bottom-content');
    setLoading(c, true);
    try {
      const data = await PolyAPI.topHolders(CID, { limit: state.holders.limit });
      const items = data.holders || data.entries || [];
      state.holders.items = items;
      c.innerHTML = '';
      if (!items.length) { c.appendChild(emptyState(t('market_no_holders'))); refreshLucide(); return; }
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', { style: { width: '60px' } }, t('col_rank')),
        el('th', {}, t('col_holder')),
        el('th', { class: 'num-right' }, t('col_net_position')),
        el('th', { class: 'num-right' }, t('col_net_usdc_flow')),
        el('th', { class: 'num-right' }, t('col_trades')),
        el('th', {}, t('col_outcomes'))
      )));
      const tbody = el('tbody');
      items.forEach((h, idx) => {
        const flow = parseFloat(h.netFlowUsdc || 0);
        tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/trader/' + h.userAddress },
          el('td', {}, el('span', { class: 'rank-badge ' + (idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '') }, idx + 1)),
          el('td', {}, traderCell(h.userAddress)),
          el('td', { class: 'num num-right' }, fmt.number(parseFloat(h.netPosition || 0), { maxFraction: 2 })),
          el('td', { class: 'num num-right ' + pnlClass(flow) }, fmt.signed(flow)),
          el('td', { class: 'num num-right muted' }, fmt.number(h.totalTrades)),
          el('td', { class: 'muted', style: { fontSize: '12px' } }, (h.positions || []).map((p) => p.outcome).filter(Boolean).join(', ') || '—')
        ));
      });
      table.appendChild(tbody);
      c.appendChild(table);
      refreshLucide();
    } catch (err) {
      c.innerHTML = '';
      if (handleApiError(err, c)) return;
      c.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  /* ---------- Positions w/ pnl ---------- */
  async function renderPositions() {
    const c = document.getElementById('bottom-content');
    setLoading(c, true);
    try {
      const data = await PolyAPI.eventPositions(CID, {
        sortBy: state.positions.sortBy,
        sortOrder: state.positions.sortOrder,
        limit: state.positions.limit,
        offset: state.positions.offset,
      });
      const items = data.positions || [];
      state.positions.items = items;
      c.innerHTML = '';
      const filterRow = el('div', { class: 'filter-bar', style: { padding: '14px 20px', borderBottom: '1px solid var(--border)', margin: 0 } },
        el('span', { class: 'filter-label' }, t('filter_sort')),
        selectField(state.positions.sortBy, ['pnl', 'value', 'shares'], (v) => { state.positions.sortBy = v; renderPositions(); }),
        selectField(state.positions.sortOrder, ['desc', 'asc'], (v) => { state.positions.sortOrder = v; renderPositions(); }),
        el('div', { class: 'muted', style: { marginLeft: 'auto', fontSize: '12px' } }, t('market_positions_count', { n: fmt.number(data.totalCount || items.length) }))
      );
      c.appendChild(filterRow);
      if (!items.length) { c.appendChild(emptyState(t('market_no_positions'))); refreshLucide(); return; }
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, t('col_holder')),
        el('th', {}, t('col_outcome')),
        el('th', { class: 'num-right' }, t('col_shares')),
        el('th', { class: 'num-right' }, t('col_price')),
        el('th', { class: 'num-right' }, t('col_value')),
        el('th', { class: 'num-right' }, t('col_pnl')),
        el('th', { class: 'num-right' }, t('col_trades'))
      )));
      const tbody = el('tbody');
      items.forEach((p) => {
        const pnl = parseFloat(p.pnl || 0);
        tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/trader/' + p.userAddress },
          el('td', {}, traderCell(p.userAddress)),
          el('td', {}, p.outcome ? el('span', { class: 'tag' }, p.outcome) : '—'),
          el('td', { class: 'num num-right' }, fmt.number(parseFloat(p.shares || 0), { maxFraction: 2 })),
          el('td', { class: 'num num-right' }, fmt.price(p.price)),
          el('td', { class: 'num num-right' }, '$' + fmt.usd(p.value)),
          el('td', { class: 'num num-right ' + pnlClass(pnl) }, fmt.signed(pnl)),
          el('td', { class: 'num num-right muted' }, fmt.number(p.totalTrades))
        ));
      });
      table.appendChild(tbody);
      c.appendChild(table);
      c.appendChild(paginationFor(state.positions, renderPositions));
      refreshLucide();
    } catch (err) {
      c.innerHTML = '';
      if (handleApiError(err, c)) return;
      c.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  /* ---------- Activity ---------- */
  async function renderActivity() {
    const c = document.getElementById('bottom-content');
    setLoading(c, true);
    try {
      const data = await PolyAPI.activity({
        conditionID: CID,
        sortBy: 'time',
        sortOrder: 'desc',
        limit: state.activity.limit,
        offset: state.activity.offset,
      });
      const items = data.events || [];
      state.activity.items = items;
      c.innerHTML = '';
      if (!items.length) { c.appendChild(emptyState(t('market_no_activity'))); refreshLucide(); return; }
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', { style: { width: '100px' } }, t('col_time')),
        el('th', {}, t('col_trader')),
        el('th', {}, t('col_outcome')),
        el('th', {}, t('col_action')),
        el('th', { class: 'num-right' }, t('col_shares')),
        el('th', { class: 'num-right' }, t('col_price')),
        el('th', { class: 'num-right' }, t('col_usd'))
      )));
      const tbody = el('tbody');
      items.forEach((it) => {
        const dirTag = it.direction === 'buy' ? 'buy' : (it.direction === 'sell' ? 'sell' : '');
        const size = parseFloat(it.size || 0);
        const notional = parseFloat(it.notional || 0);
        tbody.appendChild(el('tr', {},
          el('td', { class: 'muted', title: fmt.dateTime(it.blockTimestamp) }, fmt.ago(it.blockTimestamp)),
          el('td', {}, el('a', { href: '/trader/' + it.userAddress, onclick: (e) => e.stopPropagation() }, traderCell(it.userAddress))),
          el('td', {}, it.outcome ? el('span', { class: 'tag' }, it.outcome) : '—'),
          el('td', {}, dirTag ? el('span', { class: 'tag ' + dirTag }, (it.direction || '').toUpperCase()) : el('span', { class: 'tag' }, it.eventType)),
          el('td', { class: 'num num-right' }, fmt.number(size, { maxFraction: 2 })),
          el('td', { class: 'num num-right' }, size > 0 ? fmt.price(notional / size) : '—'),
          el('td', { class: 'num num-right' }, '$' + fmt.usd(notional))
        ));
      });
      table.appendChild(tbody);
      c.appendChild(table);
      c.appendChild(paginationFor(state.activity, renderActivity));
      refreshLucide();
    } catch (err) {
      c.innerHTML = '';
      if (handleApiError(err, c)) return;
      c.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  function selectField(current, opts, onChange) {
    return customSelect(current, opts, onChange);
  }

  function paginationFor(s, reload) {
    const wrap = el('div', { class: 'pagination' });
    wrap.appendChild(el('div', {}, t('page_x_of', { page: Math.floor(s.offset / s.limit) + 1, size: s.limit })));
    wrap.appendChild(el('div', { class: 'pagination-controls' },
      el('button', { class: 'btn', disabled: s.offset === 0, onclick: () => { s.offset = Math.max(0, s.offset - s.limit); reload(); } }, t('prev_page')),
      el('button', { class: 'btn', disabled: !(s.items && s.items.length >= s.limit), onclick: () => { s.offset += s.limit; reload(); } }, t('next_page'))
    ));
    return wrap;
  }

  function rerenderAll() {
    renderSkeleton();
    loadHeader();
    loadMarketStats();
    loadPrices();
    if (state.activeBottomTab === 'holders') renderHolders();
    else if (state.activeBottomTab === 'positions') renderPositions();
    else renderActivity();
  }

  function init() {
    if (!/^0x[0-9a-fA-F]{40,}$/.test(CID)) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'empty-state' }, t('market_invalid_cid')));
      return;
    }
    rerenderAll();
    document.addEventListener('langchange', rerenderAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
