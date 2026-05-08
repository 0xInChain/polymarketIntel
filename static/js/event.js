/* eslint-disable no-undef */
/* event.js - Event 详情页 (按 eventId, 中英双语)
 *
 * 结构参考 intel.arkm.com 官方事件页:
 *   1. 事件头 (avatar + title + #id + status tags + description)
 *   2. 事件级统计卡片网格
 *   3. 子市场列表 (可点击选中)
 *   4. 当前子市场: 价格走势图 + Timeline (左右 2:1 grid)
 *   5. 当前子市场: 订单簿 + Activity/Holders/Positions tabs (左右 1:1 grid)
 *   6. 事件级 Top Traders
 *
 * URL 支持 ?market=<conditionId> 深链到特定子市场.
 */

(function () {
  const t = (k, vars) => (window.i18n ? window.i18n.t(k, vars) : k);
  const root = document.getElementById('event-app');
  const EVENT_ID = root.dataset.eventId;

  /* ---------------- State ---------------- */
  const state = {
    ev: null,
    markets: [],
    selectedCid: null,           // 当前选中子市场的 conditionId
    pricesRange: '1d',
    priceChart: null,
    bookCache: null,
    activeBottomTab: 'activity',
    holders: { offset: 0, limit: 20, items: null },
    positions: { offset: 0, limit: 20, sortBy: 'pnl', sortOrder: 'desc', items: null },
    activity: { offset: 0, limit: 20, items: null },
    topTradersPeriod: '1w',
    countdownTimer: null,
  };

  /* ---------------- Skeleton & Layout ---------------- */
  function renderSkeleton() {
    root.innerHTML = '';
    root.appendChild(el('div', { id: 'config-banner-host' }));
    root.appendChild(el('div', { class: 'detail-header', id: 'event-header' },
      el('div', { class: 'detail-avatar' }, 'E'),
      el('div', {},
        el('h1', { class: 'detail-title' }, t('event_loading_title')),
        el('div', { class: 'detail-sub muted' }, '#' + EVENT_ID)
      )
    ));
    root.appendChild(el('div', { class: 'stats-grid', id: 'event-stats' }));
    root.appendChild(el('div', { class: 'section' },
      el('div', { class: 'section-header' },
        el('div', { class: 'section-title' }, t('event_markets_title')),
        el('div', { id: 'market-switch-wrap' })
      ),
      el('div', { id: 'markets-list' }, el('div', { class: 'loader' }, el('div', { class: 'spinner' })))
    ));

    // 图 + Timeline (2:1)
    root.appendChild(el('div', { class: 'grid-event-main' },
      priceChartSection(),
      timelineSection()
    ));

    // Activity 左宽 + 订单簿右窄 (2:1) — 匹配 Arkham 官方比例, 避免活动表被挤压
    root.appendChild(el('div', { class: 'grid-event-main' },
      bottomSection(),
      orderBookSection()
    ));

    // 事件级 Top Traders (全宽) — 仅当 API 返回非空时才可见
    root.appendChild(el('div', { class: 'section', id: 'top-traders-section', style: { display: 'none' } },
      el('div', { class: 'section-header' },
        el('div', { class: 'section-title' }, t('event_top_traders')),
        el('div', { class: 'tab-bar', style: { padding: '2px', margin: 0 } },
          ...['1d', '1w', '1m', 'all'].map((p) => el('button', {
            class: 'tab-btn ' + (p === state.topTradersPeriod ? 'active' : ''),
            'data-period': p,
            onclick: (e) => { state.topTradersPeriod = p; loadTopTraders(p, e.target); },
          }, p.toUpperCase()))
        )
      ),
      el('div', { id: 'top-traders-content' })
    ));

    refreshLucide();
  }

  function priceChartSection() {
    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'row', style: { gap: '14px', alignItems: 'center' } },
        el('div', { class: 'section-title' }, t('market_price_history')),
        el('div', { class: 'tab-bar', style: { padding: '2px', margin: 0 } },
          ...['1d', '1w', '1m', 'all'].map((p) => el('button', {
            class: 'tab-btn ' + (p === state.pricesRange ? 'active' : ''),
            'data-range': p,
            onclick: () => { state.pricesRange = p; loadPrices(); },
          }, p.toUpperCase()))
        )
      ),
      el('div', { id: 'price-headline' })
    ));
    section.appendChild(el('div', { class: 'chart-wrap', id: 'price-chart-wrap' }, el('canvas', { id: 'price-chart' })));
    return section;
  }

  function timelineSection() {
    return el('div', { class: 'section timeline-card' },
      el('div', { class: 'timeline-tabs' },
        el('button', { class: 'tab-btn active', 'data-tlt': 'timeline' }, t('event_timeline')),
        el('button', { class: 'tab-btn', 'data-tlt': 'rules', onclick: (e) => toggleTimelineTab('rules', e.target) }, t('event_rules'))
      ),
      el('div', { class: 'timeline-body', id: 'timeline-body' })
    );
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
    return el('div', { class: 'section event-bottom' },
      el('div', { class: 'section-header' },
        el('div', { class: 'tab-bar', style: { margin: 0 } },
          el('button', { class: 'tab-btn active', 'data-bottom': 'activity', onclick: () => setBottomTab('activity') }, t('market_recent_activity')),
          el('button', { class: 'tab-btn', 'data-bottom': 'holders', onclick: () => setBottomTab('holders') }, t('market_top_holders')),
          el('button', { class: 'tab-btn', 'data-bottom': 'positions', onclick: () => setBottomTab('positions') }, t('market_positions_pnl'))
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

  function toggleTimelineTab(which, btn) {
    document.querySelectorAll('[data-tlt]').forEach((b) => b.classList.toggle('active', b === btn));
    renderTimelineBody(which);
  }

  /* ---------------- Data ---------------- */
  async function loadEvent() {
    try {
      const data = await PolyAPI.eventDetail(EVENT_ID);
      state.ev = data.event || data;
      state.markets = data.markets || [];

      // 选中子市场: 优先 URL 参数, 否则取第一个
      const urlMarket = new URLSearchParams(location.search).get('market');
      if (urlMarket && state.markets.some((m) => m.conditionId === urlMarket)) {
        state.selectedCid = urlMarket;
      } else if (state.markets.length) {
        state.selectedCid = state.markets[0].conditionId;
      }

      renderHeader(state.ev);
      renderStats(state.ev, state.markets);
      renderMarkets(state.markets);
      renderMarketSwitch();
      renderTimelineBody('timeline');
      startCountdown();
      if (state.selectedCid) {
        loadPrices();
        loadOrderBook();
        renderActivity();
      } else {
        fillEmptyMarketSections();
      }
    } catch (err) {
      if (handleApiError(err, root)) return;
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  function fillEmptyMarketSections() {
    const p = document.getElementById('price-chart-wrap');
    if (p) { p.innerHTML = ''; p.appendChild(emptyState(t('event_no_markets'))); }
    const b = document.getElementById('book-content');
    if (b) { b.innerHTML = ''; b.appendChild(emptyState(t('market_no_book'))); }
    const c = document.getElementById('bottom-content');
    if (c) { c.innerHTML = ''; c.appendChild(emptyState(t('market_no_activity'))); }
    refreshLucide();
  }

  /* ---------------- Renderers ---------------- */
  function renderHeader(ev) {
    const header = document.getElementById('event-header');
    header.innerHTML = '';
    const avatar = el('div', { class: 'detail-avatar' });
    if (ev.imageUrl) avatar.appendChild(el('img', { src: ev.imageUrl, alt: '' }));
    else avatar.textContent = (ev.title || 'E')[0];
    header.appendChild(avatar);

    const sub = el('div', { class: 'detail-sub' },
      el('span', { class: 'muted' }, '#' + EVENT_ID)
    );
    if (ev.endDate) sub.appendChild(el('span', { class: 'muted' }, '· ' + t('event_ends_prefix') + ' ' + fmt.date(ev.endDate)));
    if (ev.live) sub.appendChild(el('span', { class: 'tag live' }, 'LIVE'));
    if (ev.closed) sub.appendChild(el('span', { class: 'tag closed' }, 'CLOSED'));
    if (ev.ended) sub.appendChild(el('span', { class: 'tag closed' }, 'ENDED'));

    const right = el('div', {},
      el('h1', { class: 'detail-title' }, ev.title || t('generic_no_title')),
      sub
    );
    if (ev.description) {
      right.appendChild(el('div', { class: 'event-desc muted' }, ev.description));
    }
    header.appendChild(right);
  }

  function renderStats(ev, markets) {
    const grid = document.getElementById('event-stats');
    grid.innerHTML = '';
    const cards = [
      { labelKey: 'event_stat_markets', value: ev.marketCount || markets.length },
      { labelKey: 'event_stat_volume_24h', value: '$' + fmt.usd(ev.volume24hUsdc) },
      { labelKey: 'event_stat_active', value: ev.active ? t('yes') : t('no'), cls: ev.active ? 'pos' : '' },
      { labelKey: 'event_stat_restricted', value: ev.restricted ? t('yes') : t('no') },
      { labelKey: 'event_stat_start', value: ev.startTime ? fmt.date(ev.startTime) : '—' },
      { labelKey: 'event_stat_end', value: ev.endDate ? fmt.date(ev.endDate) : '—' },
    ];
    cards.forEach((c) => grid.appendChild(el('div', { class: 'stat-card' },
      el('div', { class: 'stat-label' }, t(c.labelKey)),
      el('div', { class: 'stat-value ' + (c.cls || '') }, c.value)
    )));
  }

  function renderMarkets(markets) {
    const list = document.getElementById('markets-list');
    list.innerHTML = '';
    if (!markets.length) { list.appendChild(emptyState(t('event_no_markets'))); refreshLucide(); return; }
    markets.forEach((m) => {
      const isSelected = m.conditionId === state.selectedCid;
      const card = el('div', {
        class: 'market-card' + (isSelected ? ' selected' : ''),
        'data-cid': m.conditionId,
        onclick: () => selectMarket(m.conditionId),
      });
      if (m.imageUrl) card.appendChild(el('img', { class: 'event-img', src: m.imageUrl, alt: '', onerror: function () { this.style.display = 'none'; } }));
      const body = el('div', { class: 'market-card-body' });
      body.appendChild(el('div', { class: 'market-card-title' }, m.question || m.groupItemTitle || t('generic_no_question')));
      const meta = el('div', { class: 'market-card-meta' });
      if (m.endDate) meta.appendChild(el('span', {}, t('event_ends_prefix') + ' ' + fmt.date(m.endDate)));
      if (m.volumeUsdc) meta.appendChild(el('span', {}, 'Vol $' + fmt.usd(m.volumeUsdc)));
      if (m.resolved) meta.appendChild(el('span', { class: 'tag closed' }, m.winningOutcome ? m.winningOutcome.toUpperCase() : 'RESOLVED'));
      else if (m.active && !m.closed) meta.appendChild(el('span', { class: 'tag live' }, 'LIVE'));
      body.appendChild(meta);

      if (m.yesPrice !== undefined) {
        const outcomes = el('div', { class: 'outcome-row', style: { marginTop: '8px' } });
        const up = m.outcomes?.[0] || 'Yes';
        const dn = m.outcomes?.[1] || 'No';
        outcomes.appendChild(el('span', { class: 'outcome-pill outcome-up' }, up, el('span', { class: 'price' }, fmt.price(m.yesPrice))));
        outcomes.appendChild(el('span', { class: 'outcome-pill outcome-down' }, dn, el('span', { class: 'price' }, fmt.price(1 - m.yesPrice))));
        body.appendChild(outcomes);
      }
      card.appendChild(body);
      const arrow = el('a', {
        href: '/market/' + m.conditionId,
        class: 'muted market-card-go',
        title: 'Open market page',
        onclick: (e) => e.stopPropagation(),
      }, el('i', { 'data-lucide': 'external-link', width: 14, height: 14 }));
      card.appendChild(arrow);
      list.appendChild(card);
    });
    refreshLucide();
  }

  function renderMarketSwitch() {
    const wrap = document.getElementById('market-switch-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (state.markets.length <= 1) return;
    const opts = state.markets.map((m) => [m.conditionId, shortQuestion(m.question || m.groupItemTitle || '', 40)]);
    wrap.appendChild(el('span', { class: 'filter-label', style: { marginRight: '6px' } }, t('event_switch_market')));
    wrap.appendChild(customSelect(state.selectedCid, opts, (v) => selectMarket(v), { minWidth: '280px' }));
  }

  function shortQuestion(s, max) {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function selectMarket(cid) {
    if (!cid || cid === state.selectedCid) return;
    state.selectedCid = cid;
    // 更新 URL (不触发跳转)
    const url = new URL(location.href);
    url.searchParams.set('market', cid);
    history.replaceState(null, '', url.toString());

    // 高亮卡片
    document.querySelectorAll('.market-card[data-cid]').forEach((c) => {
      c.classList.toggle('selected', c.dataset.cid === cid);
    });
    renderMarketSwitch();

    // 重置并重新加载
    state.activity.offset = 0;
    state.holders.offset = 0;
    state.positions.offset = 0;
    state.bookCache = null;
    renderTimelineBody(document.querySelector('[data-tlt].active')?.dataset.tlt || 'timeline');
    startCountdown();
    loadPrices();
    loadOrderBook();
    if (state.activeBottomTab === 'activity') renderActivity();
    else if (state.activeBottomTab === 'holders') renderHolders();
    else if (state.activeBottomTab === 'positions') renderPositions();
  }

  /* ---------------- Price chart ---------------- */
  async function loadPrices() {
    const cid = state.selectedCid;
    if (!cid) return;
    const headline = document.getElementById('price-headline');
    headline.innerHTML = '';
    document.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('active', b.dataset.range === state.pricesRange));
    try {
      const interval = state.pricesRange === '1d' ? '1h' : (state.pricesRange === '1w' ? '1h' : '1d');
      const data = await PolyAPI.prices({ conditionID: cid, range: state.pricesRange, interval, limit: 100 });
      const points = data.prices || [];
      const labels = points.map((p) => p.bucketStart);
      const values = points.map((p) => parseFloat(p.price));

      if (state.priceChart) { state.priceChart.destroy(); state.priceChart = null; }
      const canvas = document.getElementById('price-chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
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
                label: (c) => fmt.price(c.parsed.y),
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

      // 大标题: xx% chance + UP / DOWN
      const last = values[values.length - 1];
      const market = state.markets.find((m) => m.conditionId === cid) || {};
      const outcomeUp = market.outcomes?.[0] || 'Yes';
      const outcomeDown = market.outcomes?.[1] || 'No';
      if (last !== undefined && !Number.isNaN(last)) {
        headline.appendChild(el('div', { class: 'price-headline-chance' },
          el('span', { class: 'price-headline-pct' }, (last * 100).toFixed(1) + '%'),
          el('span', { class: 'muted', style: { marginLeft: '8px' } }, t('event_chance'))
        ));
        headline.appendChild(el('div', { class: 'price-headline-outcomes' },
          el('span', { class: 'outcome-pill outcome-up' }, outcomeUp, el('span', { class: 'price' }, fmt.price(last))),
          el('span', { class: 'outcome-pill outcome-down' }, outcomeDown, el('span', { class: 'price' }, fmt.price(1 - last)))
        ));
      }
    } catch (err) {
      if (err && err.notConfigured) { showConfigBanner(); return; }
      headline.textContent = t('load_failed') + ': ' + err.message;
    }
  }

  /* ---------------- Order book ---------------- */
  async function loadOrderBook() {
    const cid = state.selectedCid;
    if (!cid) return;
    const content = document.getElementById('book-content');
    setLoading(content, true);
    try {
      state.bookCache = await PolyAPI.orderBook(cid);
      renderOrderBook();
    } catch (err) {
      content.innerHTML = '';
      if (handleApiError(err, content)) return;
      content.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
    }
  }

  let activeOutcomeIdx = 0;
  function renderOrderBook() {
    const tabs = document.getElementById('book-side-tabs');
    const content = document.getElementById('book-content');
    if (!tabs || !content) return;
    tabs.innerHTML = '';
    content.innerHTML = '';
    if (!state.bookCache || !state.bookCache.sides || !state.bookCache.sides.length) {
      content.appendChild(emptyState(t('market_no_book')));
      refreshLucide();
      return;
    }
    if (activeOutcomeIdx >= state.bookCache.sides.length) activeOutcomeIdx = 0;
    state.bookCache.sides.forEach((side, idx) => {
      tabs.appendChild(el('button', {
        class: 'tab-btn ' + (idx === activeOutcomeIdx ? 'active' : ''),
        onclick: () => { activeOutcomeIdx = idx; renderOrderBook(); },
      }, side.outcome || t('ob_outcome_n', { n: idx + 1 })));
    });

    const side = state.bookCache.sides[activeOutcomeIdx];
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

  /* ---------------- Activity ---------------- */
  async function renderActivity() {
    const cid = state.selectedCid;
    const c = document.getElementById('bottom-content');
    if (!c) return;
    if (!cid) { c.innerHTML = ''; c.appendChild(emptyState(t('market_no_activity'))); refreshLucide(); return; }
    setLoading(c, true);
    try {
      const data = await PolyAPI.activity({
        conditionID: cid,
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
        el('th', { style: { width: '90px' } }, t('col_time')),
        el('th', {}, t('col_trader')),
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
        const size = parseFloat(it.size || 0);
        const notional = parseFloat(it.notional || 0);
        const evType = (it.eventType || '').toUpperCase();
        const actionTag = dirTag
          ? el('span', { class: 'tag ' + dirTag }, (it.direction || '').toUpperCase())
          : el('span', { class: 'tag' }, evType);
        tbody.appendChild(el('tr', {},
          el('td', { class: 'muted', title: fmt.dateTime(it.blockTimestamp) }, fmt.ago(it.blockTimestamp)),
          el('td', {}, el('a', { href: '/trader/' + it.userAddress, onclick: (e) => e.stopPropagation() }, traderCell(it.userAddress))),
          el('td', {}, it.outcome ? el('span', { class: 'tag' }, it.outcome) : '—'),
          el('td', {}, actionTag),
          el('td', { class: 'num num-right' }, fmt.number(size, { maxFraction: 2 })),
          el('td', { class: 'num num-right' }, size > 0 ? fmt.price(notional / size) : '—'),
          el('td', { class: 'num num-right' }, '$' + fmt.usd(notional)),
          el('td', { style: { textAlign: 'right' } },
            it.transactionHash
              ? el('a', {
                class: 'muted icon-link',
                href: 'https://polygonscan.com/tx/' + it.transactionHash,
                target: '_blank',
                rel: 'noopener',
                title: t('event_view_tx'),
                onclick: (e) => e.stopPropagation(),
              }, el('i', { 'data-lucide': 'external-link', width: 12, height: 12 }))
              : ''
          )
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

  /* ---------------- Holders ---------------- */
  async function renderHolders() {
    const cid = state.selectedCid;
    const c = document.getElementById('bottom-content');
    if (!c) return;
    if (!cid) { c.innerHTML = ''; c.appendChild(emptyState(t('market_no_holders'))); refreshLucide(); return; }
    setLoading(c, true);
    try {
      const data = await PolyAPI.topHolders(cid, { limit: state.holders.limit });
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

  /* ---------------- Positions ---------------- */
  async function renderPositions() {
    const cid = state.selectedCid;
    const c = document.getElementById('bottom-content');
    if (!c) return;
    if (!cid) { c.innerHTML = ''; c.appendChild(emptyState(t('market_no_positions'))); refreshLucide(); return; }
    setLoading(c, true);
    try {
      const data = await PolyAPI.eventPositions(cid, {
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
        customSelect(state.positions.sortBy, ['pnl', 'value', 'shares'], (v) => { state.positions.sortBy = v; renderPositions(); }),
        customSelect(state.positions.sortOrder, ['desc', 'asc'], (v) => { state.positions.sortOrder = v; renderPositions(); }),
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

  /* ---------------- Timeline / Countdown ---------------- */
  function renderTimelineBody(which) {
    const body = document.getElementById('timeline-body');
    if (!body) return;
    body.innerHTML = '';

    const market = state.markets.find((m) => m.conditionId === state.selectedCid) || state.markets[0] || {};
    const ev = state.ev || {};
    const startDate = market.startTime || ev.startTime;
    const endDate = market.endDate || ev.endDate;

    if (which === 'rules') {
      body.appendChild(el('div', { class: 'timeline-rules' }, ev.description || t('empty')));
      return;
    }

    // 倒计时
    const cd = el('div', { class: 'countdown-wrap' });
    cd.appendChild(el('div', { class: 'countdown-label' }, t('event_close_in')));
    const grid = el('div', { class: 'countdown-grid', id: 'countdown-grid' });
    ['days', 'hours', 'minutes', 'seconds'].forEach((k, idx) => {
      if (idx > 0) grid.appendChild(el('span', { class: 'countdown-sep' }, ':'));
      grid.appendChild(el('div', { class: 'countdown-cell' },
        el('div', { class: 'countdown-num', 'data-cd': k }, '00'),
        el('div', { class: 'countdown-unit' }, t('event_' + k))
      ));
    });
    cd.appendChild(grid);
    body.appendChild(cd);

    // 时间点
    const events = [
      { label: t('event_market_creation'), value: startDate ? fmt.date(startDate) : '—' },
      { label: t('event_market_close'), value: endDate ? fmt.date(endDate) : '—' },
      { label: t('event_market_resolution'), value: market.resolved ? fmt.date(market.resolvedTime || endDate) : t('event_resolution_tbd') },
    ];
    const list = el('ul', { class: 'timeline-list' });
    events.forEach((e) => {
      list.appendChild(el('li', {},
        el('span', { class: 'timeline-dot' }),
        el('span', { class: 'timeline-label' }, e.label),
        el('span', { class: 'timeline-value muted' }, e.value)
      ));
    });
    body.appendChild(list);
  }

  function startCountdown() {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    const market = state.markets.find((m) => m.conditionId === state.selectedCid) || state.markets[0] || {};
    const ev = state.ev || {};
    const endStr = market.endDate || ev.endDate;
    if (!endStr) return;
    const end = new Date(endStr).getTime();

    function tick() {
      const now = Date.now();
      let diff = Math.max(0, Math.floor((end - now) / 1000));
      const days = Math.floor(diff / 86400); diff -= days * 86400;
      const hrs = Math.floor(diff / 3600); diff -= hrs * 3600;
      const mins = Math.floor(diff / 60); diff -= mins * 60;
      const secs = diff;
      const set = (k, v) => {
        const nodes = document.querySelectorAll('[data-cd="' + k + '"]');
        nodes.forEach((n) => { n.textContent = String(v).padStart(2, '0'); });
      };
      set('days', days);
      set('hours', hrs);
      set('minutes', mins);
      set('seconds', secs);
      if (end - now <= 0 && state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
      }
    }
    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  /* ---------------- Top traders (event-level) ---------------- */
  async function loadTopTraders(period, btn) {
    if (btn) document.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
    else document.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === period));
    const container = document.getElementById('top-traders-content');
    const section = document.getElementById('top-traders-section');
    if (!container || !section) return;
    setLoading(container, true);
    try {
      const data = await PolyAPI.topEvents({ period, limit: 20, offset: 0, order: 'desc' });
      const items = (Array.isArray(data) ? data : (data.entries || [])).filter((it) => String(it.eventId) === String(EVENT_ID));
      container.innerHTML = '';
      if (!items.length) {
        // 非热门事件 —— 整段折叠不渲染
        section.style.display = 'none';
        return;
      }
      section.style.display = '';
      const table = el('table', { class: 'data-table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', { style: { width: '60px' } }, t('col_rank')),
        el('th', {}, t('col_trader')),
        el('th', { class: 'num-right' }, t('col_period_pnl')),
        el('th', { class: 'num-right' }, t('col_trades'))
      )));
      const tbody = el('tbody');
      items.forEach((it) => {
        const pnl = parseFloat(it.periodPnl || 0);
        tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/trader/' + it.userAddress },
          el('td', {}, el('span', { class: 'rank-badge ' + (it.rank === 1 ? 'gold' : it.rank === 2 ? 'silver' : it.rank === 3 ? 'bronze' : '') }, it.rank)),
          el('td', {}, traderCell(it.userAddress)),
          el('td', { class: 'num num-right ' + pnlClass(pnl) }, fmt.signed(pnl) + ' USD'),
          el('td', { class: 'num num-right muted' }, fmt.number(it.tradeCount))
        ));
      });
      table.appendChild(tbody);
      container.appendChild(table);
      refreshLucide();
    } catch (err) {
      // 出错时也把整段折叠, 不给用户留一个红字横幅
      section.style.display = 'none';
      if (err && err.notConfigured) showConfigBanner();
    }
  }

  /* ---------------- Helpers ---------------- */
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
    if (state.priceChart) { state.priceChart.destroy(); state.priceChart = null; }
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    renderSkeleton();
    if (state.ev) {
      renderHeader(state.ev);
      renderStats(state.ev, state.markets);
      renderMarkets(state.markets);
      renderMarketSwitch();
      renderTimelineBody('timeline');
      startCountdown();
      if (state.selectedCid) {
        loadPrices();
        renderOrderBook();
        if (state.activeBottomTab === 'holders') renderHolders();
        else if (state.activeBottomTab === 'positions') renderPositions();
        else renderActivity();
      }
    } else {
      loadEvent();
    }
    loadTopTraders(state.topTradersPeriod, null);
  }

  function init() {
    renderSkeleton();
    loadEvent();
    loadTopTraders(state.topTradersPeriod, null);
    document.addEventListener('langchange', rerenderAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
