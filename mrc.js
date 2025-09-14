/* maimai Result Client – bookmarklet runner
 * - 履歴一覧ページで実行 → 自動で最下部まで読み込み → 詳細リンクを収集(最大50)
 * - 各詳細ページHTMLをAPIへ順次送信
 * - 進捗ダイアログ / 前確認 / 完了後「結果ページへ」ボタン
 * - API URL / Bearer は埋め込み既定値 + localStorage 上書き可
 */
(() => {
  // ====== 設定（配布向け）======
  // ★ 配布時に埋め込みたい既定値（ここを書き換えれば、初回入力なしですぐ使えます）
  const EMBED_API_URL   = 'https://maimai-result.onrender.com/ingest';
  const EMBED_BEARER    = '';  // 共有トークンを埋め込むならここに。空なら初回のみ設定UIを出します
  const MAX_ITEMS       = 50;  // 取得件数上限（maimai側表示50件に合わせ）
  const AUTOSCROLL_MS   = 1200; // 自動スクロール後に待つ時間(ms)

  // ====== 内部キーなど =======
  const CONF_KEY = 'mrc_conf_v1';
  const UUID_KEY = 'mrc_uuid_v1';

  // 小物
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (sel) => document.querySelector(sel);
  const QA = (sel) => Array.from(document.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  // UUID（結果ページ遷移用）。端末毎に固定でOK
  const getUUID = () => {
    let u = localStorage.getItem(UUID_KEY);
    if (!u) {
      u = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
      localStorage.setItem(UUID_KEY, u);
    }
    return u;
  };

  // 設定ロード / セーブ
  const loadConf = () => {
    try {
      const j = JSON.parse(localStorage.getItem(CONF_KEY) || '{}');
      // 埋め込み既定で初期化
      if (!j.apiUrl) j.apiUrl = EMBED_API_URL || '';
      if (!j.bearer && EMBED_BEARER) j.bearer = EMBED_BEARER;
      return j;
    } catch {
      return { apiUrl: EMBED_API_URL || '', bearer: EMBED_BEARER || '' };
    }
  };
  const saveConf = (c) => localStorage.setItem(CONF_KEY, JSON.stringify(c));

  // -------- UI（モーダル）--------
  const style = document.createElement('style');
  style.textContent = `
  #mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999999;display:flex;align-items:center;justify-content:center;}
  #mrc-box{width:min(92vw,660px);background:#101214;color:#e6e8eb;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.4);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans JP',sans-serif}
  #mrc-hd{padding:16px 20px;border-bottom:1px solid #22262c;font-size:18px;font-weight:700;letter-spacing:.2px}
  #mrc-ct{padding:18px 20px 8px;line-height:1.6}
  #mrc-msg{white-space:pre-line}
  #mrc-barwrap{height:8px;background:#1b2027;border-radius:99px;overflow:hidden;margin-top:12px}
  #mrc-bar{height:100%;width:0;background:#18c29c;transition:width .25s}
  #mrc-foot{display:flex;gap:12px;padding:14px 20px 20px}
  .mrc-btn{flex:1;appearance:none;border:0;border-radius:12px;padding:12px 14px;font-size:16px;font-weight:700}
  #mrc-cancel{background:#2a3039;color:#e6e8eb}
  #mrc-go{background:#18c29c;color:#0b1116}
  #mrc-go[disabled]{opacity:.6}
  .mrc-row{display:flex;gap:8px;margin-top:10px}
  .mrc-input{flex:1;background:#0b0f14;border:1px solid #22262c;border-radius:10px;padding:10px 12px;color:#e6e8eb;font-size:14px}
  .mrc-help{opacity:.7;font-size:13px;margin-top:6px}
  `;
  document.head.appendChild(style);

  const ov = document.createElement('div');
  ov.id = 'mrc-ov';
  ov.innerHTML = `
    <div id="mrc-box">
      <div id="mrc-hd">maimai Result Client</div>
      <div id="mrc-ct">
        <div id="mrc-msg">履歴データを取得・送信します。</div>
        <div id="mrc-barwrap" style="display:none"><div id="mrc-bar"></div></div>
        <div id="mrc-set" style="display:none">
          <div class="mrc-row"><input id="mrc-api" class="mrc-input" placeholder="API URL (例 https://.../ingest)"></div>
          <div class="mrc-row"><input id="mrc-bearer" class="mrc-input" placeholder="Bearer Token (例 xxxxx)" ></div>
          <div class="mrc-help">※ 入力は端末ローカルに保存され、次回以降は自動で使われます。</div>
        </div>
      </div>
      <div id="mrc-foot">
        <button id="mrc-cancel" class="mrc-btn">戻る</button>
        <button id="mrc-go" class="mrc-btn">開始</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  const msg = byId('mrc-msg');
  const barWrap = byId('mrc-barwrap');
  const bar = byId('mrc-bar');
  const btnCancel = byId('mrc-cancel');
  const btnGo = byId('mrc-go');
  const setWrap = byId('mrc-set');
  const inApi = byId('mrc-api');
  const inBearer = byId('mrc-bearer');

  const close = () => ov.remove();
  btnCancel.addEventListener('click', close);

  // -------- 画面：前確認 / 設定 --------
  const conf = loadConf();
  const needSetup = !(conf.apiUrl && conf.bearer);

  const setStateConfirm = () => {
    byId('mrc-hd').textContent = 'maimai Result Client';
    msg.textContent = '履歴データを取得・送信します。';
    barWrap.style.display = 'none';
    setWrap.style.display = 'none';
    btnGo.textContent = '開始';
    btnGo.disabled = false;
  };

  const setStateSetup = () => {
    byId('mrc-hd').textContent = 'API設定が見つかりません';
    msg.textContent = 'API URL / Bearer Token を入力し、保存して開始してください。';
    barWrap.style.display = 'none';
    setWrap.style.display = '';
    inApi.value = conf.apiUrl || '';
    inBearer.value = conf.bearer || '';
    btnGo.textContent = '保存して開始';
    btnGo.disabled = false;
  };

  const setStateRunning = (total) => {
    byId('mrc-hd').textContent = 'maimai Result Client';
    msg.textContent = `履歴データ（${total}件）を取得・送信します。`;
    barWrap.style.display = '';
    setWrap.style.display = 'none';
    btnGo.textContent = '取得中…';
    btnGo.disabled = true;
  };

  const setStateNoneFound = (apiUrl, bearer) => {
    byId('mrc-hd').textContent = 'maimai Result Client';
    const tail = `\n\nAPI: ${apiUrl.replace(/\/ingest.*$/,'/ingest')} / Bearer: ${bearer ? '********' : '(未設定)'}`;
    msg.textContent = '履歴の詳細リンクが見つかりませんでした。\n一度 最下部までスクロールしてから「再試行」を押してください。' + tail;
    barWrap.style.display = '';
    bar.style.width = '0%';
    setWrap.style.display = 'none';
    btnGo.textContent = '再試行';
    btnGo.disabled = false;
  };

  const setStateDone = (ok, total, ng, resultUrl) => {
    msg.textContent = `完了：${ok}/${total}　失敗：${ng} 件 🎉`;
    bar.style.width = '100%';
    btnGo.textContent = '結果ページへ';
    btnGo.disabled = false;
    // 右ボタン = 結果ページへ、左 = ダイアログを閉じる
    btnGo.onclick = () => {
      window.open(resultUrl, '_blank');
    };
    btnCancel.onclick = close;
  };

  // -------- ユーティリティ：リンク収集 --------
  const toAbs = (u) => new URL(u, location.href).href;

  const collectDetailLinks = () => {
    const set = new Set();

    // 1) 通常の <a href=...playlogDetail...>
    QA('a[href*="playlogDetail"]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) set.add(toAbs(href));
    });

    // 2) onclick 内に playlogDetail を持つボタン等
    QA('[onclick*="playlogDetail"]').forEach(el => {
      const oc = el.getAttribute('onclick') || '';
      const m = oc.match(/playlogDetail[^"']*["']([^"']+)["']/);
      if (m && m[1]) set.add(toAbs(m[1]));
    });

    // 3) 外側HTMLに埋まっているパターンの拾い上げ（保険）
    QA('.main, body, #wrap, .wrapper').forEach(el => {
      const html = el.outerHTML || '';
      const rgx = /href\s*=\s*["']([^"']*playlogDetail[^"']*)["']/gi;
      let m;
      while ((m = rgx.exec(html)) !== null) {
        set.add(toAbs(m[1]));
      }
    });

    // 4) クエリ型 ?idx=… のアンカ
    QA('a[href*="idx="]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.includes('playlogDetail')) set.add(toAbs(href));
    });

    // ディープコピー & 整理
    const arr = Array.from(set);
    // 最新側が上に来ることが多いので、上から MAX_ITEMS 件に
    return arr.slice(0, MAX_ITEMS);
  };

  // 自動で最下部までスクロール（lazyロード対策）
  const autoScrollToBottom = async () => {
    const before = document.body.scrollHeight;
    window.scrollTo({ top: before, behavior: 'smooth' });
    await sleep(AUTOSCROLL_MS);
  };

  // -------- 送信（post）--------
  const makeBase = (apiUrl) => {
    try {
      const u = new URL(apiUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  };

  const postOne = async (apiUrl, bearer, url, html, userId) => {
    const body = { url, html, ts: new Date().toISOString(), user_id: userId };
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`
      },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => ({}));
  };

  // -------- 実行本体 --------
  const run = async () => {
    // 設定が無ければ設定画面
    if (needSetup && (!inApi.value || !inBearer.value)) {
      setStateSetup();
      btnGo.onclick = () => {
        const apiUrl = inApi.value.trim();
        const bearer = inBearer.value.trim();
        if (!apiUrl || !bearer) { alert('API URL と Bearer を入力してください'); return; }
        saveConf({ apiUrl, bearer });
        Object.assign(conf, { apiUrl, bearer });
        setStateConfirm();
      };
      return;
    }
    if (needSetup && (inApi.value || inBearer.value)) {
      // 保存して開始（設定UIから来た場合）
      const apiUrl = inApi.value.trim();
      const bearer = inBearer.value.trim();
      if (!apiUrl || !bearer) { alert('API URL と Bearer を入力してください'); return; }
      saveConf({ apiUrl, bearer });
      Object.assign(conf, { apiUrl, bearer });
    }

    // まずはリンク収集（なければ自動スクロールして再取得）
    let urls = collectDetailLinks();
    if (!urls.length) {
      await autoScrollToBottom();
      urls = collectDetailLinks();
    }

    if (!urls.length) {
      setStateNoneFound(conf.apiUrl || EMBED_API_URL, conf.bearer || EMBED_BEARER);
      // 「再試行」＝もう一度 run
      btnGo.onclick = () => { btnGo.disabled = true; run(); };
      return;
    }

    // 送信スタート
    const total = urls.length;
    setStateRunning(total);

    let ok = 0, ng = 0;
    const userId = getUUID();

    const setProgress = () => {
      const done = ok + ng;
      const ratio = Math.max(0, Math.min(1, done / total));
      bar.style.width = `${Math.round(ratio * 100)}%`;
      msg.textContent = `進捗：${done}/${total}`;
    };
    setProgress();

    // 1件ずつ fetch → API へ
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      try {
        const r = await fetch(u, { credentials: 'include' });
        const html = await r.text();
        await postOne(conf.apiUrl || EMBED_API_URL, conf.bearer || EMBED_BEARER, u, html, userId);
        ok++;
      } catch (e) {
        ng++;
      }
      setProgress();
    }

    // 完了：結果ページへ
    const base = makeBase(conf.apiUrl || EMBED_API_URL);
    const resultUrl = base ? `${base}/view?user_id=${encodeURIComponent(userId)}` : '';
    setStateDone(ok, total, ng, resultUrl || base || '/');
  };

  // 初期画面：設定が揃っていれば「開始」、無ければ設定UI
  if (conf.apiUrl && conf.bearer) {
    setStateConfirm();
  } else if (EMBED_API_URL && EMBED_BEARER) {
    // 埋め込みが両方あるなら即開始でもOK（ただし一度確認は出す）
    setStateConfirm();
  } else {
    setStateSetup();
  }

  btnGo.onclick = () => {
    if (setWrap.style.display !== 'none') {
      // 設定保存 → 実行
      const apiUrl = inApi.value.trim();
      const bearer = inBearer.value.trim();
      if (!apiUrl || !bearer) { alert('API URL と Bearer を入力してください'); return; }
      saveConf({ apiUrl, bearer });
      Object.assign(conf, { apiUrl, bearer });
    }
    run();
  };

})();
