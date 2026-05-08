/**
 * Settings 页 - 读写 /api/config, 提供测试连接.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const status = $('settings-status');
  const upstream = $('cfg-upstream');
  const token = $('cfg-token');
  const verify = $('cfg-verify');
  const langHost = $('cfg-lang');
  const form = $('settings-form');
  const tokenToggle = $('cfg-token-toggle');

  // 自定义下拉: 默认语言. 将当前选中值挂在闭包 + dataset.value 上.
  let langValue = 'zh';
  function mountLangSelect() {
    langHost.innerHTML = '';
    langHost.appendChild(customSelect(langValue, [['zh', '中文'], ['en', 'English']], (v) => {
      langValue = v;
      langHost.dataset.value = v;
    }, { minWidth: '160px' }));
    langHost.dataset.value = langValue;
  }
  mountLangSelect();

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = 'settings-status ' + (kind || '');
  }

  async function load() {
    try {
      const cfg = await fetch('/api/config').then((r) => {
        if (!r.ok) throw new Error('GET /api/config -> ' + r.status);
        return r.json();
      });
      upstream.value = cfg.upstream || '';
      token.value = cfg.token || '';
      verify.checked = !!cfg.verifyTls;
      langValue = cfg.lang || 'zh';
      mountLangSelect();
      setStatus(
        cfg.configured ? window.i18n.t('settings_status_ready') : window.i18n.t('settings_status_pending'),
        cfg.configured ? 'ok' : 'warn'
      );
    } catch (err) {
      setStatus(window.i18n.t('load_failed') + ': ' + err.message, 'err');
    }
  }

  async function save(e) {
    if (e) e.preventDefault();
    const payload = {
      upstream: upstream.value.trim(),
      token: token.value.trim(),
      verifyTls: !!verify.checked,
      lang: langValue,
    };
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('POST /api/config -> ' + r.status);
      const data = await r.json();
      setStatus(
        window.i18n.t('settings_saved') + ' · ' +
        (data.configured ? window.i18n.t('settings_status_ready') : window.i18n.t('settings_status_pending')),
        data.configured ? 'ok' : 'warn'
      );
      // 同步 UI 语言到当前页面
      if (window.i18n.lang !== payload.lang) {
        window.i18n.setLang(payload.lang);
        if (typeof window.applyI18n === 'function') window.applyI18n();
      }
    } catch (err) {
      setStatus(window.i18n.t('load_failed') + ': ' + err.message, 'err');
    }
  }

  async function test() {
    setStatus(window.i18n.t('loading'), '');
    try {
      // 先保存一次, 再调一个轻量的数据 API 接口
      await save();
      const r = await fetch('/api/chaindata/polymarket/stats');
      if (!r.ok) {
        const detail = await r.text();
        throw new Error('HTTP ' + r.status + ' ' + detail.slice(0, 120));
      }
      await r.json();
      setStatus(window.i18n.t('settings_test_ok'), 'ok');
    } catch (err) {
      setStatus(window.i18n.t('settings_test_fail') + ': ' + err.message, 'err');
    }
  }

  tokenToggle.addEventListener('click', () => {
    token.type = token.type === 'password' ? 'text' : 'password';
  });
  form.addEventListener('submit', save);
  document.getElementById('cfg-test').addEventListener('click', test);

  document.addEventListener('langchange', () => {
    // 重新刷新状态文案
    const isOk = status.classList.contains('ok');
    setStatus(isOk ? window.i18n.t('settings_status_ready') : window.i18n.t('settings_status_pending'), isOk ? 'ok' : 'warn');
  });

  load();
})();
