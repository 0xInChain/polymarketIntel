# Polymarket Intel

> A self-hosted, open-source intelligence dashboard for **Polymarket** prediction markets, powered by an in-house on-chain data service.
>
> 一套自部署、开源的 **Polymarket** 预测市场情报看板，由自研链上数据服务驱动。

[English](#english) · [中文](#中文)

---

## English

A clean, dark-themed dashboard that turns Polymarket on-chain activity into something actually readable. Global stats, featured events with mini charts, four high-density tabs (**Top Events** / **Leaderboard** / **Live Activity** / **Markets**), category filtering, smart search, and full-fledged detail pages for every trader, market, and event. Wallet addresses are auto-resolved into human-friendly account names. Bilingual (中 / EN) with one-click switching.

### Highlights

- **Global overview** – total volume, 24h volume, traders, active markets, total trades on the home hero.
- **Featured Events** – live mini price-charts at a glance, click straight through to detail.
- **Four data tabs**, every list filterable, sortable, and paginated:
  - *Top Events* — best trader / event PnL combos by period (1d / 1w / 1m / all)
  - *Leaderboard* — cumulative trader PnL ranking with win-rate inline
  - *Live Activity* — chronological trade stream, filter by event type / min USD, optional auto-refresh
  - *Markets* — full searchable market list (active / closed, sort by volume / liquidity / created)
- **Category bar** – Politics / Sports / Crypto / Finance / Geopolitics / Tech / Culture / World / Economy / Climate, each with its own top-event ranking.
- **Trader page** – account summary cards, PnL chart with period tabs, full activity log, position list with PnL.
- **Market page** – price history chart, Yes / No order book, Top Holders, position PnL leaderboard, recent trades.
- **Event page** – metadata + sub-market selector with URL deep-linking (`?market=…`), big price headline with Yes / No outcome pills, price chart with 1D / 1W / 1M / ALL ranges, timeline & resolution countdown, order book, activity / holders / positions tabs, optional Top Traders block (auto-hidden for long-tail events).
- **Smart search** – paste an address, conditionId, or `0x…` and jump straight to the right detail page.
- **Wallet name resolution** – `Polymarket Proxy Wallet`, `"bossoskil1" Polymarket Account`, etc., batched and cached client-side.
- **Polished dark theme** – themed scrollbars, custom select dropdowns, Lucide icons, responsive grids down to 1024 px.
- **Bilingual UI** (中 / EN), persisted in `localStorage`, instant in-place re-render.
- **Web-based settings** – no env vars, no restart. Browse to `/settings`, save, done.

### Stack

- **Backend** – Python 3.9+ / Flask. A single `app.py` (~250 lines) hosts the page routes, the data API gateway, and a localhost-only settings endpoint.
- **Frontend** – zero-build. Vanilla JS modules, Chart.js for charts, Lucide for icons. No React, no npm, no webpack.
- **Storage** – a single `config.json` (gitignored) plus `localStorage` for UI state. No database.
- **Auth** – data API requests are signed with the access token configured via `/settings`.

### Quick start

```bash
# 1. install
pip install -r requirements.txt

# 2. run
python app.py

# 3. open http://localhost:5000/settings
#    paste your data API endpoint and access token, click Save
```

The first launch creates an empty `config.json`. Open `/settings` (gear icon in the top-right of the nav bar) to fill in the data API endpoint and the access token. Configuration is persisted only inside the local `config.json` and **never leaves your machine**.

> The `/settings` page and `/api/config` endpoint refuse any request whose remote address is not `127.0.0.1` / `::1` / `localhost`. You can safely bind the server to `0.0.0.0` for LAN access without leaking credentials.

### Configuration (`config.json`)

```jsonc
{
  "upstream":  "https://api.example.com",   // data API endpoint
  "token":     "your_token",                 // data API access token
  "host":      "127.0.0.1",                  // bind host
  "port":      5000,                          // bind port
  "verifyTls": false,                         // verify TLS cert of the data API
  "lang":      "zh"                           // default UI language: zh / en
}
```

Optional environment variables (override `config.json` at startup, useful for Docker / CI):

| Var               | Effect                              |
| :---------------- | :---------------------------------- |
| `POLY_TOKEN`      | Override `token`                    |
| `POLY_UPSTREAM`   | Override `upstream` (API endpoint)  |
| `POLY_VERIFY_TLS` | `1` to verify TLS, `0` to skip      |

### Project layout

```
polymarket/
├── app.py                   # Flask app: page routes + data API gateway + settings
├── probe.py                 # CLI script to sanity-check the data API
├── config.example.json      # config schema (copy / customize)
├── config.json              # your live config (gitignored)
├── requirements.txt
├── templates/
│   ├── base.html            # nav, footer, search box, language toggle
│   ├── index.html           # home (stats + featured + 4 tabs + category bar)
│   ├── settings.html        # /settings web form
│   ├── trader.html          # trader detail
│   ├── market.html          # market detail
│   └── event.html           # event detail
└── static/
    ├── css/style.css        # full stylesheet (dark theme, themed scrollbars, custom selects)
    └── js/
        ├── api.js           # data API client + NameCache + format helpers
        ├── i18n.js          # zh / en dictionary + setLang()
        ├── settings.js      # /settings page logic
        ├── index.js         # home tabs + category bar + filters
        ├── trader.js        # trader page
        ├── market.js        # market page
        └── event.js         # event page (charts, timeline, order book, tabs)
```

### How it works

1. The Flask app exposes `GET /api/<path>` and routes whitelisted paths into the data API, attaching the saved access token. Anything outside the allow-list returns 403 — the dashboard cannot be turned into an open relay.
2. The settings page reads / writes `config.json` via `/api/config`. Both endpoints reject any non-localhost request.
3. The frontend is fully static. `i18n.js` keeps zh / en dictionaries; calling `setLang('en' | 'zh')` re-renders the active page in place without a reload.
4. Wallet name resolution is batched and cached client-side (`NameCache`) so the same address never triggers a duplicate request.

### License

MIT. This is an open-source visualization layer; **nothing here is investment advice.**

---

## 中文

一套自部署的 Polymarket 链上预测市场情报看板，深色主题，零构建。把链上数据归集成可读的页面：全局统计、Featured Events 走势卡、四大 Tab（**Top Events** / **Leaderboard** / **Live Activity** / **Markets**）、分类筛选、智能搜索，加上每个交易者、市场、事件的独立详情页。所有钱包地址自动解析为可读账户名。中英双语，导航栏一键切换。

### 功能亮点

- **全局看板** – 首页头部展示总成交量、24h 成交量、交易者数、活跃市场数、总笔数。
- **Featured Events** – 一排带迷你走势图的热门事件，点击直达详情。
- **四个数据 Tab**，每张表都可筛选、排序、分页：
  - *Top Events* — 按区间（1d / 1w / 1m / all）排出"交易者-事件"PnL 最高组合
  - *Leaderboard* — 累计 PnL 排行，附胜率
  - *Live Activity* — 实时成交流，按事件类型 / 最小金额过滤，可开自动刷新
  - *Markets* — 全市场可搜索列表，支持成交量 / 流动性 / 创建时间排序
- **分类栏** – 政治 / 体育 / 加密 / 金融 / 地缘政治 / 科技 / 文化 / 世界 / 经济 / 气候，每个分类有独立的热门事件榜。
- **Trader 详情页** – 账户概要卡、PnL 走势（24h / 7d / 30d / all）、完整 Activity / Positions 列表。
- **Market 详情页** – 价格走势、Yes / No 双向订单簿、Top Holders、持仓 PnL 排行、最新成交。
- **Event 详情页** – 元数据 + 子市场切换器（URL 深链 `?market=…`），大标题概率 + Yes / No 胶囊，1D / 1W / 1M / ALL 走势，时间线和到期倒计时，订单簿，最新成交 / 主要持有者 / 持仓 PnL 三 Tab，以及可选的 Top Traders 模块（长尾事件自动隐藏）。
- **智能搜索** – 粘贴地址、conditionId 或 `0x…`，直接跳到对应详情页。
- **钱包名称解析** – `Polymarket Proxy Wallet`、`"bossoskil1" Polymarket Account` 等，前端批量请求 + 缓存，同地址不重复查询。
- **打磨过的深色主题** – 主题化滚动条、自定义下拉、Lucide 图标，1024 px 宽度仍保持齐整。
- **中英双语**，本地化偏好持久化在 `localStorage`，切换不重载。
- **网页设置** – 不设环境变量、不重启进程，浏览器打开 `/settings` 保存即生效。

### 技术栈

- **后端** – Python 3.9+ / Flask。单文件 `app.py`（~250 行），承载页面路由、数据 API 接入层、本机限定的设置接口。
- **前端** – 零构建。原生 JS + Chart.js（图表）+ Lucide（图标）。无 React、无 npm、无 webpack。
- **存储** – 一份 `config.json`（已 gitignore）+ `localStorage` 保存 UI 状态。无数据库。
- **鉴权** – 数据 API 请求带上 `/settings` 中保存的访问令牌。

### 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动
python app.py

# 3. 浏览器打开 http://localhost:5000/settings
#    填入数据 API 地址与访问令牌，点保存
```

首次运行 `app.py` 会自动生成一份空的 `config.json`。打开 `/settings`（导航栏右上角齿轮图标）填入数据 API 地址与访问令牌即可。配置只保存在本机 `config.json`，**不会发送到任何外部位置**。

> `/settings` 与 `/api/config` 只接受来自 `127.0.0.1` / `::1` / `localhost` 的请求。即便把服务监听在 `0.0.0.0` 供局域网访问，配置也不会被外部读到。

### 配置项

```jsonc
{
  "upstream":  "https://api.example.com",   // 数据 API 地址
  "token":     "your_token",                 // 数据 API 访问令牌
  "host":      "127.0.0.1",                  // 监听地址
  "port":      5000,                          // 监听端口
  "verifyTls": false,                         // 是否校验数据 API 的 TLS 证书
  "lang":      "zh"                           // 默认 UI 语言: zh / en
}
```

环境变量（可选，启动时覆盖 `config.json`，方便 Docker / CI）：

| 变量               | 作用                                |
| :----------------- | :---------------------------------- |
| `POLY_TOKEN`       | 覆盖 `token`                        |
| `POLY_UPSTREAM`    | 覆盖 `upstream`（API 地址）         |
| `POLY_VERIFY_TLS`  | `1` 校验 TLS，`0` 跳过              |

### 项目结构

```
polymarket/
├── app.py                   # Flask 应用: 页面路由 + 数据 API 接入层 + 设置接口
├── probe.py                 # 命令行脚本, 自检数据 API 可达性
├── config.example.json      # 配置模板
├── config.json              # 你的实际配置 (gitignored)
├── requirements.txt
├── templates/
│   ├── base.html            # 导航 / 页脚 / 搜索 / 语言切换
│   ├── index.html           # 首页 (Stats + Featured + 四大 Tab + 分类栏)
│   ├── settings.html        # /settings 网页表单
│   ├── trader.html          # 交易者详情
│   ├── market.html          # 市场详情
│   └── event.html           # 事件详情
└── static/
    ├── css/style.css        # 全部样式 (深色 + 主题滚动条 + 自定义下拉)
    └── js/
        ├── api.js           # 数据 API 客户端 + NameCache + 格式化工具
        ├── i18n.js          # 中英字典 + setLang()
        ├── settings.js      # 设置页逻辑
        ├── index.js         # 首页 Tab + 分类栏 + 筛选
        ├── trader.js        # 交易者页
        ├── market.js        # 市场页
        └── event.js         # 事件页（图表 / 时间线 / 订单簿 / Tab）
```

### 工作原理

1. Flask 把 `GET /api/<path>` 路由到数据 API，自动附带保存的访问令牌；白名单外的路径返回 403，避免被滥用为开放代理。
2. 设置页通过 `/api/config` 读写 `config.json`，所有非本机请求一律拒绝。
3. 前端完全静态。`i18n.js` 维护中英字典，调用 `setLang('en' | 'zh')` 即重渲染当前页，无刷新。
4. 钱包名称解析在前端批量请求并缓存（`NameCache`），同地址不会重复触发请求。

### License

MIT。本项目是开源的可视化层，**不构成任何投资建议**。
