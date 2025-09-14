// mrc.js  — maimai Result Client (inline settings + progress + view jump)
(() => {
  const LS = { API: 'mrc_api_url', TOK: 'mrc_token', UUID: 'mrc_uuid' };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const get = k => localStorage.getItem(k);
  const set = (k, v) => localStorage.setItem(k, v);
  const uid = () => get(LS.UUID) || (() => {
    const u = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('u' + Math.random().toString(36).slice(2));
    set(LS.UUID, u);
    return u;
  })();
  const apiURL = () => get(LS.API) || '';
  const token = () => get(LS.TOK) || '';
  const needSettings = () => !apiURL() || !token();
  const onRecord = () => /\/maimai\-mobile\/record\/?$/.test(location.pathname);

  const css = `
#mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999999}
#mrc{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,560px);background:#101114;color:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Hiragino Kaku Gothic Pro",Meiryo,sans-serif;z-index:1000000}
#mrc h1{font-size:18px;margin:16px 18px}
#mrc .body{padding:0 18px 16px 18px;font-size:15px;line-height:1.5}
#mrc .sub{opacity:.8;font-size:13px;margin-top:4px}
#mrc .bar{height:6px;background:#2b2d31;border-radius:99px;overflow:hidden;margin:10px 0 4px}
#mrc .bar>i{display:block;height:100%;width:0;background:#19cda1;transition:width .2s}
#mrc .row{display:flex;gap:10px;margin-top:12px}
#mrc .btn{flex:1;appearance:none;border:0;border-radius:10px;padding:12px 14px;font-weight:600}
#mrc .btn.gray{background:#2b2d31;color:#fff}
#mrc .btn.green{background:#19cda1;color:#002b23}
#mrc .btn:disabled{opacity:.6}
#mrc label{display:block;font-size:12px;opacity:.85;margin-top:10px}
#mrc input{width:100%;box-sizing:border-box;background:#0f1115;color:#fff;border:1px solid #30343a;border-radius:8px;padding:10px 12px;font-size:14px}
`;

  function ui() {
    if ($('#mrc-ov')) return $('#mrc-ov');
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'mrc-ov';
    ov.innerHTML = `
<div id="mrc">
  <h1>maimai Result Client</h1>
  <div class="body">
    <div id="mrc-msg">準備中…</div>
    <div class="sub" id="mrc-sub"></div>
    <div class="bar"><i id="mrc-pg"></i></div>
    <div id="mrc-form" style="display:none">
      <label>API URL</label>
      <input id="mrc-api" placeholder="https://maimai-result.onrender.com/ingest">
      <label>Bearer Token</label>
      <input id="mrc-tok" placeholder="xxxxxxxx">
    </div>
    <div class="row">
      <button id="mrc-back" class="btn gray">戻る</button>
      <button id="mrc-go" class="btn green">開始</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(ov);
    $('#mrc-back').onclick = () => ov.remove();
    return ov;
  }

  const ov = ui();
  const E = {
    msg: $('#mrc-msg'), sub: $('#mrc-sub'), pg: $('#mrc-pg'),
    go: $('#mrc-go'), back: $('#mrc-back'),
    form: $('#mrc-form'), api: $('#mrc-api'), tok: $('#mrc-tok')
  };
  const setMsg = (m, s = '') => { E.msg.textContent = m; E.sub.textContent = s; };
  const setPg = (n, t) => { E.pg.style.width = (t ? Math.floor(n / t * 100) : 0) + '%'; };
  const openView = () => {
    const base = (apiURL() || '').replace(/\/ingest\/?$/, '');
    location.href = `${base}/view?user_id=${encodeURIComponent(uid())}`;
  };

  const showSettings = (autoNext = false) => {
    E.form.style.display = 'block';
    E.api.value = apiURL() || 'https://maimai-result.onrender.com/ingest';
    E.tok.value = token() || '';
    E.go.textContent = '保存して開始';
    setMsg('API設定が見つかりません。', 'API URL / Bearer Token を入力し、保存してください');
    E.go.disabled = false;
    E.go.onclick = () => {
      const a = E.api.value.trim(), t = E.tok.value.trim();
      if (!/^https?:\/\//.test(a)) { alert('API URL が不正です'); return; }
      if (!t) { alert('Bearer Token を入力してください'); return; }
      set(LS.API, a); set(LS.TOK, t);
      E.form.style.display = 'none';
      if (autoNext) start(); else setMsg('保存しました。もう一度ブックマークを実行してください。');
    };
  };

  const collectLinks = () => {
    const els = $$('a[href*="/playlogDetail/"]');
    const hrefs = [...new Set(els.map(a => a.getAttribute('href')).filter(Boolean))];
    return hrefs;
  };

  async function ensureLinksLoaded(limit = 50) {
    let list = collectLinks().slice(0, limit);
    let tries = 0, last = 0;
    while (list.length < limit && tries < 20) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 400));
      list = collectLinks().slice(0, limit);
      if (list.length === last) tries++; else { tries = 0; last = list.length; }
    }
    return list;
  }

  const post = async (url, html) => {
    const r = await fetch(apiURL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ user_id: uid(), url, html, ts: new Date().toISOString(), ua: navigator.userAgent, from: 'bookmarklet' })
    });
    if (!r.ok) throw new Error('POST ' + r.status);
    return r.json();
  };

  async function start() {
    try {
      if (needSettings()) { showSettings(true); return; }
      if (!onRecord()) {
        setMsg('履歴一覧で実行してください。', '/maimai-mobile/record/ を開いて実行');
        E.go.textContent = '閉じる'; E.go.onclick = () => ov.remove(); return;
      }
      E.go.disabled = true; E.go.textContent = '取得中…';
      setMsg('履歴リンクを収集中…'); setPg(0, 1);

      const links = await ensureLinksLoaded(50);
      if (links.length === 0) {
        setMsg('履歴の詳細リンクが見つかりませんでした。', '一度 最下部までスクロールしてから再実行してください。');
        E.go.disabled = false; E.go.textContent = '再試行'; E.go.onclick = start; return;
      }

      setMsg(`履歴データ（${links.length}件）を取得・送信します。`, 'このままお待ちください');

      let ok = 0, ng = 0, i = 0;
      for (const href of links) {
        i++; setPg(i, links.length);
        try {
          const abs = new URL(href, location.href).href;
          const html = await (await fetch(abs, { credentials: 'include' })).text();
          await post(abs, html);
          ok++;
        } catch (e) { ng++; }
        E.sub.textContent = `進捗: ${i}/${links.length}　成功: ${ok}　失敗: ${ng}`;
      }
      setPg(1, 1);
      setMsg(`完了: ${ok}/${links.length}　失敗: ${ng}`, `ユーザーID: ${uid()}`);
      E.go.disabled = false; E.go.textContent = '結果ページへ'; E.go.onclick = openView;
      E.back.textContent = '閉じる';
    } catch (e) {
      alert('Bookmarklet error: ' + e.message);
      ov.remove();
    }
  }

  if (needSettings()) {
    showSettings(true);
  } else {
    E.go.onclick = start;
    E.go.textContent = '開始';
    setMsg('履歴データを取得・送信します。', '開始をタップすると実行します');
  }
})();
