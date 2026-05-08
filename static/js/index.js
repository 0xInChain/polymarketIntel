/* eslint-disable no-undef */
/* index.js - 主页逻辑 (中英双语) */

(function () {
  const t = (k, vars) => (window.i18n ? window.i18n.t(k, vars) : k);

  const TABS = ['events', 'leaderboard', 'activity', 'markets'];
  // 分类标签（参考 arkm.com/predictions 布局）
  // 空字符串 = 热门 / 全部
  const CATEGORIES = [
    { value: '', labelZh: '热门', labelEn: 'HOT' },
    { value: 'politics', labelZh: '政治', labelEn: 'POLITICS' },
    { value: 'sports', labelZh: '体育', labelEn: 'SPORTS' },
    { value: 'crypto', labelZh: '加密', labelEn: 'CRYPTO' },
    { value: 'finance', labelZh: '金融', labelEn: 'FINANCE' },
    { value: 'geopolitics', labelZh: '地缘政治', labelEn: 'GEOPOLITICS' },
    { value: 'tech', labelZh: '科技', labelEn: 'TECH' },
    { value: 'culture', labelZh: '文化', labelEn: 'CULTURE' },
    { value: 'world', labelZh: '世界', labelEn: 'WORLD' },
    { value: 'economy', labelZh: '经济', labelEn: 'ECONOMY' },
    { value: 'climate', labelZh: '气候', labelEn: 'CLIMATE' },
  ];
  const state = {
    activeTab: 'events',
    category: '',
    events: { period: '1d', order: 'desc', limit: 50, offset: 0, items: null },
    leaderboard: { period: '1d', order: 'desc', limit: 50, offset: 0, items: null },
    activity: { eventType: 'trade', minUsd: '', sortBy: 'time', sortOrder: 'desc', limit: 50, offset: 0, items: null },
    markets: { search: '', active: 'true', sortBy: 'volume', order: 'desc', limit: 50, offset: 0, items: null },
  };

  function categoryBar() {
    const bar = el('div', { class: 'category-bar' });
    CATEGORIES.forEach((c) => {
      const label = window.i18n && window.i18n.lang === 'zh' ? c.labelZh : c.labelEn;
      const btn = el('button', {
        class: 'category-btn ' + (state.category === c.value ? 'active' : ''),
        'data-cat': c.value,
        onclick: () => {
          if (state.category === c.value) return;
          state.category = c.value;
          // 重置各 tab 的 offset
          state.events.offset = 0;
          state.activity.offset = 0;
          state.markets.offset = 0;
          renderTab();
        },
      }, label);
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ---------- Stats ---------- */
  async function loadStats() {
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      grid.appendChild(
        el('div', { class: 'stat-card' },
          el('div', { class: 'stat-label' }, ' '),
          el('div', { class: 'skeleton', style: { width: '80%', height: '24px' } })
        )
      );
    }
    try {
      const data = await PolyAPI.stats();
      const cards = [
        { labelKey: 'stat_total_volume', value: '$' + fmt.usd(data.totalVolume) },
        { labelKey: 'stat_volume_24h', value: '$' + fmt.usd(data.volume24h) },
        { labelKey: 'stat_total_traders', value: fmt.usd(data.totalTraders) },
        { labelKey: 'stat_active_markets', value: fmt.number(data.activeMarkets) },
        { labelKey: 'stat_total_trades', value: fmt.usd(data.totalTrades) },
      ];
      grid.innerHTML = '';
      for (const c of cards) {
        grid.appendChild(
          el('div', { class: 'stat-card' },
            el('div', { class: 'stat-label', 'data-i18n': c.labelKey }, t(c.labelKey)),
            el('div', { class: 'stat-value' }, c.value)
          )
        );
      }
    } catch (err) {
      grid.innerHTML = '';
      if (handleApiError(err, grid)) return;
      grid.appendChild(el('div', { class: 'stat-card' }, el('div', { class: 'muted' }, t('load_failed') + ': ' + err.message)));
    }
  }

  /* ---------- Tab switch ---------- */
  function setActiveTab(tab) {
    if (!TABS.includes(tab)) tab = 'events';
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const url = new URL(location.href);
    if (tab === 'events') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.toString());
    renderTab();
  }

  function renderTab() {
    const container = document.getElementById('tab-content');
    container.innerHTML = '';
    const tab = state.activeTab;
    if (tab === 'events') return renderTopEvents(container);
    if (tab === 'leaderboard') return renderLeaderboard(container);
    if (tab === 'activity') return renderActivity(container);
    if (tab === 'markets') return renderMarkets(container);
  }

  /* ---------- Top Events ---------- */
  function renderTopEvents(container) {
    const s = state.events;
    const filterBar = el('div', { class: 'filter-bar' },
      el('span', { class: 'filter-label' }, t('filter_period')),
      selectField(s.period, ['1d', '1w', '1m', 'all'], (v) => { s.period = v; s.offset = 0; loadAndRender(); }),
      el('span', { class: 'filter-label' }, t('filter_sort')),
      selectField(s.order, [['desc', t('sort_top_desc')], ['asc', t('sort_top_asc')]], (v) => { s.order = v; s.offset = 0; loadAndRender(); }),
      el('button', { class: 'btn btn-icon', onclick: loadAndRender, title: t('refresh') }, el('i', { 'data-lucide': 'refresh-cw', width: 14, height: 14 }))
    );

    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'section-title' }, t('sec_top_events_title')),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, t('sec_top_events_desc'))
    ));
    const body = el('div', { class: 'section-body' });
    section.appendChild(body);

    container.appendChild(categoryBar());
    container.appendChild(filterBar);
    container.appendChild(section);
    refreshLucide();

    async function loadAndRender() {
      setLoading(body, true);
      try {
        const data = await PolyAPI.topEvents({ period: s.period, order: s.order, limit: s.limit, offset: s.offset, tag: state.category || undefined });
        const items = Array.isArray(data) ? data : (data.entries || data.items || []);
        s.items = items;
        body.innerHTML = '';
        if (!items.length) { body.appendChild(emptyState()); refreshLucide(); return; }
        const table = el('table', { class: 'data-table' });
        const thead = el('thead', {}, el('tr', {},
          el('th', { style: { width: '60px' } }, t('col_rank')),
          el('th', {}, t('col_trader')),
          el('th', {}, t('col_event')),
          el('th', { class: 'num-right' }, t('col_period_pnl')),
          el('th', { class: 'num-right' }, t('col_trades'))
        ));
        const tbody = el('tbody');
        items.forEach((it) => {
          const rank = it.rank ?? '-';
          const pnl = parseFloat(it.periodPnl || 0);
          tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/trader/' + it.userAddress },
            el('td', {}, rankBadge(rank)),
            el('td', {}, traderCell(it.userAddress)),
            el('td', {}, eventCell(it.eventTitle, it.imageUrl, it.eventId)),
            el('td', { class: `num num-right ${pnlClass(pnl)}` }, fmt.signed(pnl) + ' USD'),
            el('td', { class: 'num num-right muted' }, fmt.number(it.tradeCount))
          ));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        body.appendChild(table);
        body.appendChild(paginationBar(s, loadAndRender));
        refreshLucide();
      } catch (err) {
        body.innerHTML = '';
        if (handleApiError(err, body)) return;
        body.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
      }
    }
    loadAndRender();
  }

  /* ---------- Leaderboard ---------- */
  function renderLeaderboard(container) {
    const s = state.leaderboard;
    const filterBar = el('div', { class: 'filter-bar' },
      el('span', { class: 'filter-label' }, t('filter_period')),
      selectField(s.period, ['1d', '1w', '1m', 'all'], (v) => { s.period = v; s.offset = 0; loadAndRender(); }),
      el('span', { class: 'filter-label' }, t('filter_sort')),
      selectField(s.order, [['desc', t('sort_pnl_desc')], ['asc', t('sort_pnl_asc')]], (v) => { s.order = v; s.offset = 0; loadAndRender(); }),
      el('button', { class: 'btn btn-icon', onclick: loadAndRender, title: t('refresh') }, el('i', { 'data-lucide': 'refresh-cw', width: 14, height: 14 }))
    );

    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'section-title' }, t('sec_leaderboard_title')),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, t('sec_leaderboard_desc'))
    ));
    const body = el('div', { class: 'section-body' });
    section.appendChild(body);
    container.appendChild(filterBar);
    container.appendChild(section);
    refreshLucide();

    async function loadAndRender() {
      setLoading(body, true);
      try {
        const data = await PolyAPI.leaderboard({ period: s.period, order: s.order, limit: s.limit, offset: s.offset });
        const items = data.entries || [];
        s.items = items;
        body.innerHTML = '';
        if (!items.length) { body.appendChild(emptyState()); refreshLucide(); return; }
        const table = el('table', { class: 'data-table' });
        const thead = el('thead', {}, el('tr', {},
          el('th', { style: { width: '60px' } }, t('col_rank')),
          el('th', {}, t('col_trader')),
          el('th', { class: 'num-right' }, t('col_period_pnl')),
          el('th', { class: 'num-right' }, t('col_trades')),
          el('th', { class: 'num-right' }, t('col_tokens_won_total'))
        ));
        const tbody = el('tbody');
        items.forEach((it) => {
          const pnl = parseFloat(it.periodPnl || 0);
          const winRate = it.tokensTotal > 0 ? (it.tokensWon / it.tokensTotal) : null;
          tbody.appendChild(el('tr', { class: 'clickable', onclick: () => location.href = '/trader/' + it.userAddress },
            el('td', {}, rankBadge(it.rank)),
            el('td', {}, traderCell(it.userAddress)),
            el('td', { class: `num num-right ${pnlClass(pnl)}` }, fmt.signed(pnl) + ' USD'),
            el('td', { class: 'num num-right muted' }, fmt.number(it.tradeCount)),
            el('td', { class: 'num num-right muted' },
              fmt.number(it.tokensWon) + ' / ' + fmt.number(it.tokensTotal),
              winRate !== null ? el('span', { class: 'dim', style: { marginLeft: '8px' } }, '(' + fmt.pct(winRate, 0) + ')') : null
            )
          ));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        body.appendChild(table);
        body.appendChild(paginationBar(s, loadAndRender));
        refreshLucide();
      } catch (err) {
        body.innerHTML = '';
        if (handleApiError(err, body)) return;
        body.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
      }
    }
    loadAndRender();
  }

  /* ---------- Live Activity ---------- */
  let activityRefreshTimer = null;
  function renderActivity(container) {
    const s = state.activity;

    const filterBar = el('div', { class: 'filter-bar' },
      el('span', { class: 'filter-label' }, t('filter_event_type')),
      selectField(s.eventType, [['', t('apply') === 'Apply' ? 'all' : '全部'], 'trade', 'split', 'merge', 'convert'],
        (v) => { s.eventType = v; s.offset = 0; loadAndRender(); }),
      el('span', { class: 'filter-label' }, t('filter_min_usd')),
      el('input', {
        type: 'number', min: 0, value: s.minUsd, placeholder: t('filter_min_usd_placeholder'), style: { width: '110px' },
        oninput: (e) => { s.minUsd = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { s.offset = 0; loadAndRender(); } }
      }),
      el('span', { class: 'filter-label' }, t('filter_sort')),
      selectField(s.sortBy, ['time', 'usd', 'price', 'size'], (v) => { s.sortBy = v; loadAndRender(); }),
      selectField(s.sortOrder, ['desc', 'asc'], (v) => { s.sortOrder = v; loadAndRender(); }),
      el('button', { class: 'btn', onclick: () => { s.offset = 0; loadAndRender(); } }, t('apply')),
      el('label', { class: 'row', style: { color: 'var(--text-muted)', fontSize: '12px' } },
        el('input', { type: 'checkbox', onchange: (e) => toggleAutoRefresh(e.target.checked) }),
        t('filter_auto_refresh')
      )
    );

    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'section-title' }, t('sec_activity_title')),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, t('sec_activity_desc'))
    ));
    const body = el('div', { class: 'section-body' });
    section.appendChild(body);
    container.appendChild(categoryBar());
    container.appendChild(filterBar);
    container.appendChild(section);
    refreshLucide();

    function toggleAutoRefresh(on) {
      if (activityRefreshTimer) { clearInterval(activityRefreshTimer); activityRefreshTimer = null; }
      if (on) activityRefreshTimer = setInterval(() => { if (state.activeTab === 'activity') loadAndRender(true); }, 5000);
    }

    async function loadAndRender(silent = false) {
      if (!silent) setLoading(body, true);
      try {
        const data = await PolyAPI.activity({
          eventType: s.eventType || undefined,
          minUsd: s.minUsd || undefined,
          sortBy: s.sortBy,
          sortOrder: s.sortOrder,
          limit: s.limit,
          offset: s.offset,
          tag: state.category || undefined,
        });
        const items = data.events || [];
        s.items = items;
        body.innerHTML = '';
        if (!items.length) { body.appendChild(emptyState()); refreshLucide(); return; }
        const table = el('table', { class: 'data-table' });
        const thead = el('thead', {}, el('tr', {},
          el('th', { style: { width: '110px' } }, t('col_time')),
          el('th', {}, t('col_trader')),
          el('th', {}, t('col_event')),
          el('th', {}, t('col_outcome')),
          el('th', {}, t('col_action')),
          el('th', { class: 'num-right' }, t('col_size')),
          el('th', { class: 'num-right' }, t('col_notional'))
        ));
        const tbody = el('tbody');
        items.forEach((it) => {
          const dirTag = it.direction === 'buy' ? 'buy' : (it.direction === 'sell' ? 'sell' : '');
          const eventTypeLabel = it.eventType !== 'trade' ? it.eventType : it.direction;
          tbody.appendChild(el('tr', {},
            el('td', { class: 'muted', title: fmt.dateTime(it.blockTimestamp) }, fmt.ago(it.blockTimestamp)),
            el('td', {},
              el('a', { href: '/trader/' + it.userAddress, onclick: (e) => e.stopPropagation() }, traderCell(it.userAddress))
            ),
            el('td', {}, eventCell(it.question, it.imageUrl, it.eventId)),
            el('td', {}, it.outcome ? el('span', { class: 'tag' }, it.outcome) : '—'),
            el('td', {}, dirTag ? el('span', { class: 'tag ' + dirTag }, eventTypeLabel) : el('span', { class: 'tag' }, it.eventType)),
            el('td', { class: 'num num-right' }, fmt.number(parseFloat(it.size || 0), { maxFraction: 2 })),
            el('td', { class: 'num num-right' }, '$' + fmt.usd(it.notional))
          ));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        body.appendChild(table);
        body.appendChild(paginationBar(s, loadAndRender));
        refreshLucide();
      } catch (err) {
        body.innerHTML = '';
        if (handleApiError(err, body)) return;
        body.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
      }
    }
    loadAndRender();
  }

  /* ---------- Markets / Events ---------- */
  function renderMarkets(container) {
    const s = state.markets;
    const filterBar = el('div', { class: 'filter-bar' },
      el('input', {
        type: 'text', placeholder: t('filter_keyword_placeholder'), value: s.search, style: { width: '220px' },
        oninput: (e) => { s.search = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { s.offset = 0; loadAndRender(); } }
      }),
      el('span', { class: 'filter-label' }, t('filter_active_only')),
      selectField(s.active, [['true', t('yes')], ['false', t('no')]], (v) => { s.active = v; s.offset = 0; loadAndRender(); }),
      el('span', { class: 'filter-label' }, t('filter_sort')),
      selectField(s.sortBy, ['volume', 'endDate', 'createdAt'], (v) => { s.sortBy = v; loadAndRender(); }),
      selectField(s.order, ['desc', 'asc'], (v) => { s.order = v; loadAndRender(); }),
      el('button', { class: 'btn', onclick: () => { s.offset = 0; loadAndRender(); } }, t('apply'))
    );

    const section = el('div', { class: 'section' });
    section.appendChild(el('div', { class: 'section-header' },
      el('div', { class: 'section-title' }, t('sec_markets_title')),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, t('sec_markets_desc'))
    ));
    const body = el('div', { class: 'section-body' });
    section.appendChild(body);
    container.appendChild(categoryBar());
    container.appendChild(filterBar);
    container.appendChild(section);
    refreshLucide();

    async function loadAndRender() {
      setLoading(body, true);
      try {
        const data = await PolyAPI.events({
          tag: state.category || undefined,
          search: s.search || undefined,
          active: s.active,
          sortBy: s.sortBy,
          order: s.order,
          limit: s.limit,
          offset: s.offset,
        });
        const items = Array.isArray(data) ? data : (data.events || data.items || []);
        body.innerHTML = '';
        if (!items.length) { body.appendChild(emptyState()); refreshLucide(); return; }
        items.forEach((ev) => body.appendChild(marketCard(ev)));
        body.appendChild(paginationBar(s, loadAndRender));
        refreshLucide();
      } catch (err) {
        body.innerHTML = '';
        if (handleApiError(err, body)) return;
        body.appendChild(el('div', { class: 'empty-state' }, t('load_failed') + ': ' + err.message));
      }
    }
    loadAndRender();
  }

  function marketCard(ev) {
    const previews = (ev.marketPreviews || []).slice(0, 4);
    const titleNode = el('div', { class: 'market-card-title' }, ev.title || ev.eventTitle || '(no title)');
    const meta = el('div', { class: 'market-card-meta' });
    if (ev.endDate) meta.appendChild(el('span', {}, (window.i18n.lang === 'zh' ? '截止 ' : 'Ends ') + fmt.date(ev.endDate)));
    if (ev.volume24hUsdc) meta.appendChild(el('span', {}, '24h $' + fmt.usd(ev.volume24hUsdc)));
    if (ev.marketCount) meta.appendChild(el('span', {}, t('event_markets_count', { n: ev.marketCount })));
    if (ev.live) meta.appendChild(el('span', { class: 'tag live' }, 'LIVE'));
    if (ev.closed) meta.appendChild(el('span', { class: 'tag closed' }, 'CLOSED'));

    const outcomes = el('div', { class: 'outcome-row', style: { marginTop: '8px' } });
    previews.forEach((m) => {
      const label = m.groupItemTitle || m.question || '';
      outcomes.appendChild(el('span', { class: 'outcome-pill' },
        label.length > 24 ? label.slice(0, 22) + '…' : label,
        m.yesPrice !== undefined ? el('span', { class: 'price' }, fmt.price(m.yesPrice)) : null
      ));
    });

    const card = el('div', { class: 'market-card', onclick: () => { if (ev.eventId) location.href = '/event/' + ev.eventId; } });
    if (ev.imageUrl) card.appendChild(el('img', { class: 'event-img', src: ev.imageUrl, alt: '', onerror: function () { this.style.display = 'none'; } }));
    const bodyCol = el('div', { class: 'market-card-body' }, titleNode, meta, previews.length ? outcomes : null);
    card.appendChild(bodyCol);
    return card;
  }

  /* ---------- Helpers ---------- */
  function rankBadge(rank) {
    const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    return el('span', { class: 'rank-badge ' + cls }, rank);
  }

  function eventCell(title, img, eventId) {
    const wrap = el('div', { class: 'event-cell' });
    if (img) wrap.appendChild(el('img', { class: 'event-img', src: img, alt: '', onerror: function () { this.style.display = 'none'; } }));
    const titleEl = el('div', { class: 'event-title' }, title || '');
    if (eventId) {
      titleEl.style.cursor = 'pointer';
      titleEl.addEventListener('click', (e) => { e.stopPropagation(); location.href = '/event/' + eventId; });
    }
    wrap.appendChild(titleEl);
    return wrap;
  }

  function selectField(current, opts, onChange) {
    return customSelect(current, opts, onChange);
  }

  function paginationBar(s, reload) {
    const wrap = el('div', { class: 'pagination' });
    const info = el('div', {}, t('page_x_of', { page: Math.floor(s.offset / s.limit) + 1, size: s.limit }));
    const ctrl = el('div', { class: 'pagination-controls' },
      el('button', { class: 'btn', disabled: s.offset === 0, onclick: () => { s.offset = Math.max(0, s.offset - s.limit); reload(); } }, t('prev_page')),
      el('button', { class: 'btn', disabled: !(s.items && s.items.length >= s.limit), onclick: () => { s.offset += s.limit; reload(); } }, t('next_page'))
    );
    wrap.appendChild(info);
    wrap.appendChild(ctrl);
    return wrap;
  }

  /* ---------- Init ---------- */
  function init() {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') || 'events';
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    setActiveTab(tab);
    loadStats();

    // 切换语言时刷新当前 Tab 视图 + Stats
    document.addEventListener('langchange', () => {
      loadStats();
      renderTab();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
