/* eslint-disable no-undef */
/* trader.js - Trader 详情页 (中英双语) */

(function () {
  const t = (k, vars) => (window.i18n ? window.i18n.t(k, vars) : k);
  const root = document.getElementById('trader-app');
  const ADDR = root.dataset.addr;

  const state = {
    pnlPeriod: '30d',
    activeTab: 'activity',
    activity: { offset: 0, limit: 50, items: null },
    positions: { offset: 0, limit: 50, sort: 'value', order: 'desc', status: 'open', items: null },
    pnlChart: null,
  };

  /* ---------- Render skeleton ---------- */
  function renderSkeleton() {
    root.innerHTML = '';
    root.appendChild(el('div', { id: 'config-banner-host' }));
    root.appendChild(headerSkeleton());
    root.appendChild(statsCardsSkeleton());
    root.appendChild(pnlChartSection());
    root.appendChild(tabsSection());
  }

  function headerSkeleton() {
    const wrap = el('div', { class: 'detail-header', id: 'trader-header' });
    wrap.appendChild(el('div', { class: 'detail-avatar' }, 'P'));
    wrap.appendChild(el('div', {},
      el('h1', { class: 'detail-title' }, fmt.shortAddr(ADDR)),
      el('div', { class: 'detail-sub' },
        el('span', { class: 'addr' }, ADDR),
        el('button', { class: 'copy-btn', onclick: () => copyText(ADDR) }, t('copy')),
        el('a', { class: 'copy-btn', href: 'https://polymarket.com/profile/' + ADDR, target: '_blank', rel: 'noopener' }, 'Polymarket'),
        el('a', { class: 'copy-btn', href: 'https://polygonscan.com/address/' + ADDR, target: '_blank', rel: 'noopener' }, 'Polygonscan')
      )
    ));
    return wrap;
  }

  function statsCardsSkeleton() {
    return el('div', { class: 'stats-grid', id: 'trader-stats' });
  }

  function pnlChartSection() {
    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'row', style: { gap: '14px' } },
        el('div', { class: 'section-title' }, t('trader_pnl_title')),
        el('div', { class: 'tab-bar', style: { padding: '2px', margin: 0 } },
          ...['24h', '7d', '30d', 'all'].map((p) => el('button', {
            class: 'tab-btn ' + (p === state.pnlPeriod ? 'active' : ''),
            'data-period': p,
            onclick: () => setPnlPeriod(p),
          }, p.toUpperCase()))
        )
      ),
      el('div', { class: 'muted', id: 'pnl-summary', style: { fontSize: '13px' } }, '—')
    ));
    section.appendChild(el('div', { class: 'chart-wrap', id: 'pnl-chart-wrap' },
      el('canvas', { id: 'pnl-chart' })
    ));
    return section;
  }

  function tabsSection() {
    const wrap = el('div', { id: 'tabs-wrap' });
    wrap.appendChild(el('div', { class: 'tab-bar' },
      el('button', { class: 'tab-btn active', 'data-tab': 'activity', onclick: () => setActiveTab('activity') }, t('trader_tab_activity')),
      el('button', { class: 'tab-btn', 'data-tab': 'positions', onclick: () => setActiveTab('positions') }, t('trader_tab_positions'))
    ));
    wrap.appendChild(el('div', { class: 'section', id: 'tab-content' },
      el('div', { class: 'loader' }, el('div', { class: 'spinner' }))
    ));
    return wrap;
  }

  /* ---------- Header & summaries ---------- */
  async function loadHeaderAndStats() {
    const grid = document.getElementById('trader-stats');
    grid.innerHTML = '';
    const skelKeys = [
      'trader_account_value', 'trader_active_positions', 'trader_total_pnl', 'trader_win_rate',
      'trader_total_volume', 'trader_biggest_win', 'trader_total_roi', 'trader_created',
    ];
    skelKeys.forEach((k) => {
      grid.appendChild(el('div', { class: 'stat-card' },
        el('div', { class: 'stat-label' }, t(k)),
        el('div', { class: 'stat-value' }, el('span', { class: 'skeleton', style: { width: '80%', height: '20px' } }))
      ));
    });

    const results = await Promise.allSettled([
      PolyAPI.walletBalance(ADDR),
      PolyAPI.walletPnl(ADDR),
      PolyAPI.walletPortfolio(ADDR),
      PolyAPI.walletStats(ADDR),
      PolyAPI.walletBiggestWin(ADDR),
      PolyAPI.resolveNames(ADDR).catch(() => null),
    ]);

    // 探测是否有 not_configured
    const firstErr = results.find((r) => r.status === 'rejected' && r.reason && r.reason.notConfigured);
    if (firstErr) {
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

    const [balance, pnl, portfolio, stats, biggest, names] = results.map((r) => r.status === 'fulfilled' ? r.value : null);

    const display = names && names.wallets && names.wallets[ADDR];
    if (display && display.displayName) {
      const header = document.getElementById('trader-header');
      const titleEl = header.querySelector('.detail-title');
      titleEl.textContent = display.displayName;
      const avatar = header.querySelector('.detail-avatar');
      avatar.textContent = (display.displayName.replace(/[^A-Za-z0-9]/g, '')[0] || 'P').toUpperCase();
    }

    const usdc = parseFloat(balance?.usdcBalance || 0);
    const openValue = parseFloat(portfolio?.openPositionValue || 0);
    const accountValue = usdc + openValue;
    const totalPnl = parseFloat(pnl?.totalPnl || 0);
    const totalVol = parseFloat(stats?.totalVolume || 0);
    const totalRoi = totalVol > 0 ? totalPnl / totalVol : null;
    const winRate = pnl?.marketsTotal > 0 ? pnl.marketsWon / pnl.marketsTotal : null;
    const created = stats?.firstActiveAt;
    const daysSince = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86400000) : null;
    const realized = parseFloat(pnl?.realizedPnl || 0);

    const cards = [
      {
        labelKey: 'trader_account_value',
        value: '$' + fmt.usd(accountValue),
        sub: t('trader_account_value_sub', { usdc: fmt.usd(usdc), open: fmt.usd(openValue) }),
      },
      {
        labelKey: 'trader_active_positions',
        value: '$' + fmt.usd(openValue),
        sub: t('trader_account_positions_sub', { pos: portfolio?.openPositions ?? '—', markets: portfolio?.openMarkets ?? '—' }),
      },
      {
        labelKey: 'trader_total_pnl',
        value: fmt.signed(totalPnl) + ' USD',
        cls: pnlClass(totalPnl),
        sub: t('trader_realized_prefix') + ' ' + fmt.signed(realized),
      },
      {
        labelKey: 'trader_win_rate',
        value: winRate !== null ? fmt.pct(winRate, 1) : '—',
        sub: (pnl?.marketsWon ?? '—') + ' / ' + (pnl?.marketsTotal ?? '—'),
      },
      {
        labelKey: 'trader_total_volume',
        value: '$' + fmt.usd(totalVol),
        sub: t('trader_volume_trades_sub', { n: fmt.number(stats?.totalTrades) }),
      },
      {
        labelKey: 'trader_biggest_win',
        value: '$' + fmt.usd(biggest?.biggestWin),
        sub: '',
      },
      {
        labelKey: 'trader_total_roi',
        value: totalRoi !== null ? fmt.pct(totalRoi, 1) : '—',
        cls: pnlClass(totalRoi),
        sub: '',
      },
      {
        labelKey: 'trader_created',
        value: created ? fmt.date(created) : '—',
        sub: daysSince !== null ? t('trader_days_ago', { n: daysSince }) : '',
      },
    ];

    grid.innerHTML = '';
    for (const c of cards) {
      grid.appendChild(el('div', { class: 'stat-card' },
        el('div', { class: 'stat-label' }, t(c.labelKey)),
        el('div', { class: 'stat-value ' + (c.cls || '') }, c.value),
        c.sub ? el('div', { class: 'stat-sub' }, c.sub) : null
      ));
    }
  }

  /* ---------- PnL chart ---------- */
  function setPnlPeriod(p) {
    state.pnlPeriod = p;
    document.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === p));
    loadPnlChart();
  }

  async function loadPnlChart() {
    const summary = document.getElementById('pnl-summary');
    summary.textContent = t('loading');
    try {
      const data = await PolyAPI.pnlChart({ userAddress: ADDR, period: state.pnlPeriod });
      const points = data.points || [];
      const labels = points.map((p) => p.bucket);
      const values = points.map((p) => parseFloat(p.cumulativePnl));

      if (state.pnlChart) state.pnlChart.destroy();

      const ctx = document.getElementById('pnl-chart').getContext('2d');
      const isUp = (values[values.length - 1] || 0) >= (values[0] || 0);
      const lineColor = isUp ? '#00d49b' : '#ef4444';
      const fillColor = isUp ? 'rgba(0, 212, 155, 0.12)' : 'rgba(239, 68, 68, 0.12)';

      state.pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cumulative PnL',
            data: values,
            borderColor: lineColor,
            backgroundColor: fillColor,
            fill: true,
            tension: 0.25,
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
              backgroundColor: '#11141c',
              borderColor: '#2e3346',
              borderWidth: 1,
              titleColor: '#e8eaf0',
              bodyColor: '#e8eaf0',
              callbacks: {
                title: (ctxs) => fmt.dateTime(ctxs[0].label),
                label: (c) => 'PnL: ' + fmt.signed(c.parsed.y) + ' USD',
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: '#5d627a', maxTicksLimit: 6,
                callback: function (v) { return fmt.date(this.getLabelForValue(v)); },
              },
              grid: { color: '#1c212e' },
            },
            y: {
              ticks: { color: '#5d627a', callback: (v) => '$' + fmt.usd(v) },
              grid: { color: '#1c212e' },
            },
          },
        },
      });

      const last = values[values.length - 1];
      summary.innerHTML = '';
      summary.appendChild(el('span', { class: pnlClass(last) }, fmt.signed(last) + ' USD'));
    } catch (err) {
      if (err && err.notConfigured) {
        showConfigBanner();
        summary.textContent = t('not_configured');
        return;
      }
      summary.textContent = t('load_failed') + ': ' + err.message;
    }
  }

  /* ---------- Tabs ---------- */
  function setActiveTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'activity') renderActivity();
    else renderPositions();
  }

  /* ---------- Activity tab ---------- */
  async function renderActivity() {
    const container = document.getElementById('tab-content');
    setLoading(container, true);
    try {
      const data = await PolyAPI.activity({
        userAddresses: ADDR,
        sortBy: 'time',
        sortOrder: 'desc',
        limit: state.activity.limit,
        offset: state.activity.offset,
      });
      const items = data.events || [];
      state.activity.items = items;
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'section-header' },
        el('div', { class: 'section-title' }, t('trader_tab_activity')),
        el('div', { class: 'muted', style: { fontSize: '12px' } }, t('trader_records_count', { n: fmt.number(data.totalCount || items.length) }))
      ));
      if (!items.length) {
        container.appendChild(emptyState(t('trader_no_activity')));
        refreshLucide();
        return;
      }
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', { style: { width: '100px' } }, t('col_time')),
        el('th', {}, t('col_market')),
        el('th', {}, t('col_outcome')),
        el('th', {}, t('col_action')),
        el('th', { class: 'num-right' }, t('col_shares')),
        el('th', { class: 'num-right' }, t('col_price')),
        el('th', { class: 'num-right' }, t('col_usd')),
        el('th', { style: { width: '40px' } }, '')
      )));
      const tbody = el('tbody');
      items.forEach((it) => {
        const dirTag = it.direction === 'buy' ? 'buy' : (it.direction === 'sell' ? 'sell' : '');
        tbody.appendChild(el('tr', {},
          el('td', { class: 'muted', title: fmt.dateTime(it.blockTimestamp) }, fmt.ago(it.blockTimestamp)),
          el('td', {},
            el('a', { href: it.eventId ? '/event/' + it.eventId : '#' },
              el('div', { class: 'event-cell' },
                it.imageUrl ? el('img', { class: 'event-img', src: it.imageUrl, alt: '', onerror: function () { this.style.display = 'none'; } }) : null,
                el('div', { class: 'event-title' }, it.question || '—')
              )
            )
          ),
          el('td', {}, it.outcome ? el('span', { class: 'tag' }, it.outcome) : '—'),
          el('td', {}, dirTag ? el('span', { class: 'tag ' + dirTag }, (it.direction || '').toUpperCase()) : el('span', { class: 'tag' }, it.eventType)),
          el('td', { class: 'num num-right' }, fmt.number(parseFloat(it.size || 0), { maxFraction: 2 })),
          el('td', { class: 'num num-right' }, it.notional && it.size ? fmt.price(parseFloat(it.notional) / parseFloat(it.size)) : '—'),
          el('td', { class: 'num num-right' }, '$' + fmt.usd(it.notional)),
          el('td', {}, it.transactionHash ? el('a', { href: 'https://polygonscan.com/tx/' + it.transactionHash, target: '_blank', rel: 'noopener', title: 'View tx', class: 'muted' }, el('i', { 'data-lucide': 'external-link', width: 14, height: 14 })) : null)
        ));
      });
      table.appendChild(tbody);
      container.appendChild(table);
      container.appendChild(paginationFor(state.activity, renderActivity));
      refreshLucide();
    } catch (err) {
      container.innerHTML = '';
      if (handleApiError(err, container)) return;
      container.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  /* ---------- Positions tab ---------- */
  async function renderPositions() {
    const container = document.getElementById('tab-content');
    setLoading(container, true);
    try {
      const data = await PolyAPI.walletPredictionHistory(ADDR, {
        sort: state.positions.sort,
        order: state.positions.order,
        status: state.positions.status,
        limit: state.positions.limit,
        offset: state.positions.offset,
      });
      const items = (data.markets || []);
      state.positions.items = items;
      container.innerHTML = '';
      const filterRow = el('div', { class: 'filter-bar', style: { padding: '14px 20px', borderBottom: '1px solid var(--border)', margin: 0 } },
        el('div', { class: 'section-title' }, t('trader_tab_positions')),
        el('span', { class: 'filter-label' }, t('pos_status')),
        selectField(state.positions.status, [['open', t('pos_status_open')], ['closed', t('pos_status_closed')]], (v) => { state.positions.status = v; state.positions.offset = 0; renderPositions(); }),
        el('span', { class: 'filter-label' }, t('filter_sort')),
        selectField(state.positions.sort, ['value', 'pnl', 'volume', 'shares', 'trades', 'currentPrice'], (v) => { state.positions.sort = v; renderPositions(); }),
        selectField(state.positions.order, ['desc', 'asc'], (v) => { state.positions.order = v; renderPositions(); }),
        el('div', { class: 'muted', style: { marginLeft: 'auto', fontSize: '12px' } }, t('trader_records_count', { n: fmt.number(data.totalCount || items.length) }))
      );
      container.appendChild(filterRow);

      if (!items.length) {
        container.appendChild(emptyState(t('trader_no_positions')));
        refreshLucide();
        return;
      }
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, t('col_market')),
        el('th', {}, t('col_outcome')),
        el('th', { class: 'num-right' }, t('col_shares_held')),
        el('th', { class: 'num-right' }, t('col_avg_buy_sell')),
        el('th', { class: 'num-right' }, t('col_current')),
        el('th', { class: 'num-right' }, t('col_value')),
        el('th', { class: 'num-right' }, t('col_volume')),
        el('th', { class: 'num-right' }, t('col_pnl')),
        el('th', { class: 'num-right' }, t('col_status'))
      )));
      const tbody = el('tbody');
      items.forEach((m) => {
        const pnl = parseFloat(m.pnl || 0);
        tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/market/' + m.conditionId },
          el('td', {},
            el('div', { class: 'event-cell' },
              m.imageUrl ? el('img', { class: 'event-img', src: m.imageUrl, alt: '', onerror: function () { this.style.display = 'none'; } }) : null,
              el('div', { class: 'event-title' }, m.eventTitle || m.question)
            )
          ),
          el('td', {}, m.outcome ? el('span', { class: 'tag' }, m.outcome) : '—'),
          el('td', { class: 'num num-right' }, fmt.number(parseFloat(m.sharesHeld || 0), { maxFraction: 2 })),
          el('td', { class: 'num num-right muted' },
            (m.avgBuyPrice ? fmt.price(m.avgBuyPrice) : '—'),
            ' / ',
            (m.avgSellPrice ? fmt.price(m.avgSellPrice) : '—')
          ),
          el('td', { class: 'num num-right' }, m.currentPrice ? fmt.price(m.currentPrice) : '—'),
          el('td', { class: 'num num-right' }, '$' + fmt.usd(m.value)),
          el('td', { class: 'num num-right muted' }, '$' + fmt.usd(m.volume)),
          el('td', { class: 'num num-right ' + pnlClass(pnl) }, fmt.signed(pnl)),
          el('td', {}, m.isResolved ? el('span', { class: 'tag closed' }, t('pos_status_closed')) : el('span', { class: 'tag live' }, t('pos_status_open')))
        ));
      });
      table.appendChild(tbody);
      container.appendChild(table);
      container.appendChild(paginationFor(state.positions, renderPositions));
      refreshLucide();
    } catch (err) {
      container.innerHTML = '';
      if (handleApiError(err, container)) return;
      container.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  /* ---------- Helpers ---------- */
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

  /* ---------- Init ---------- */
  function rerenderAll() {
    renderSkeleton();
    refreshLucide();
    loadHeaderAndStats();
    loadPnlChart();
    if (state.activeTab === 'activity') renderActivity();
    else renderPositions();
  }

  function init() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(ADDR)) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'empty-state' }, t('trader_invalid_addr')));
      return;
    }
    rerenderAll();
    document.addEventListener('langchange', rerenderAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
