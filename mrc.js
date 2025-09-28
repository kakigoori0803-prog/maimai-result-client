/* mrc.js — auto register + auto scroll + robust link finder + ingest */
(() => {
  const API_BASE = "https://maimai-result.onrender.com";
  const REGISTER = API_BASE + "/register";
  const VIEW     = API_BASE + "/view";

  const LS = { api:"MRC_API_URL", token:"MRC_TOKEN", uid:"MRC_USER_ID" };

  // ---------- utils ----------
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid  = () =>
    (crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
        const r=Math.random()*16|0, v=c==="x"?r:(r&0x3|0x8); return v.toString(16);
      });

  function getAllDocs(rootDoc){
    const list=[rootDoc];
    rootDoc.querySelectorAll('iframe,frame').forEach(f=>{
      try{ if (f.contentDocument) list.push(f.contentDocument); }catch{}
    });
    return list;
  }

  // ---------- overlay ----------
  const ov = document.createElement("div");
  const css = document.createElement("style");
  ov.id = "mrc-ov";
  css.textContent = `
#${ov.id}{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999}
.mrc-card{width:min(92vw,560px);background:#111;border-radius:14px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.4);overflow:hidden}
.mrc-h{padding:16px 20px;font-weight:700;border-bottom:1px solid #2a2a2a}
.mrc-b{padding:18px 20px;line-height:1.6}
.mrc-row{display:flex;gap:12px;justify-content:flex-end;padding:16px 20px;border-top:1px solid #2a2a2a;background:#0e0e0e}
.mrc-btn{appearance:none;border:0;border-radius:10px;padding:12px 16px;font-weight:700}
.mrc-btn.gray{background:#3a3a3a;color:#fff}
.mrc-btn.green{background:#10b981;color:#00150e}
.mrc-p{height:6px;background:#2b2b2b;border-radius:4px;overflow:hidden;margin-top:8px}
.mrc-bar{height:100%;width:0%;background:#22c55e;transition:width .2s}
`;
  document.head.appendChild(css);
  const open = (body, btns=[]) => {
    ov.innerHTML = `
      <div class="mrc-card">
        <div class="mrc-h">maimai Result Client</div>
        <div class="mrc-b">${body}</div>
        <div class="mrc-row">${btns.map((b,i)=>`<button class="mrc-btn ${b.cls||'gray'}" data-i="${i}">${b.label}</button>`).join("")}</div>
      </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => {
      const i = e.target && e.target.dataset ? e.target.dataset.i : null;
      if (i != null) btns[+i].onClick?.();
    };
  };
  const close = () => ov.remove();

  // ---------- server warmup & register ----------
  async function waitAlive() {
    for (let i=0;i<25;i++) {
      try {
        const r = await fetch(API_BASE+"/health", {cache:"no-store"});
        if (r.ok) return;
      } catch{}
      await sleep(i<10 ? 1500 : 3000);
    }
    throw new Error("server not responding");
  }

  async function getOrRegister() {
    let api   = localStorage.getItem(LS.api);
    let token = localStorage.getItem(LS.token);
    let uid   = localStorage.getItem(LS.uid);
    if (api && token && uid) return { api, token, uid };

    await waitAlive();
    uid = uid || uuid();

    const res = await fetch(REGISTER, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ user_id: uid, ua: navigator.userAgent, platform: navigator.platform||"" })
    });
    if (!res.ok) throw new Error("register failed: "+(await res.text()));
    const j = await res.json().catch(()=> ({}));

    const _token = j.token ?? j.bearer;
    let   _api   = j.api_url ?? j.ingest_url ?? "/ingest";
    if (!_token) throw new Error("register invalid response");
    if (!_api.startsWith("http")) _api = API_BASE + _api;

    api = _api; token = _token; uid = j.user_id || uid;
    localStorage.setItem(LS.api, api);
    localStorage.setItem(LS.token, token);
    localStorage.setItem(LS.uid, uid);
    return { api, token, uid };
  }

  // ---------- auto scroll ----------
  async function autoScroll(rounds=30, delay=700) {
    let last = -1, same = 0;
    for (let i=0;i<rounds;i++){
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(delay);
      const h = document.body.scrollHeight;
      if (h === last) { if (++same >= 2) break; } else { same = 0; last = h; }
    }
  }

  // ---------- robust link finder ----------
  function collectLinksRobust() {
    const set = new Set();
    const docs = getAllDocs(document);
    let cHref=0, cOnclick=0, cRegex=0, cIdx=0, cText=0;

    // 便利: idx からURLを作る
    const makeByIdx = (v) => new URL(
      `/maimai-mobile/record/playlogDetail/?idx=${encodeURIComponent(v)}`,
      location.origin
    ).toString();

    for (const d of docs) {
      // a / button / input などひと通り走査
      const els = Array.from(d.querySelectorAll('a,button,input[type=button],input[type=submit]'));
      for (const el of els) {
        const tag   = el.tagName;
        const href  = (tag === 'A') ? (el.href || el.getAttribute('href') || '') : '';
        const label = (el.textContent || el.value || '').replace(/\s+/g, '');

        // 1) a[href] に playlogDetail（? の前でも後でも拾えるように \b）
        if (href && /\/playlogdetail\b/i.test(href)) { set.add(href); cHref++; continue; }

        // 2) data-href
        const dataHref = (el.dataset && el.dataset.href) || el.getAttribute?.('data-href');
        if (dataHref && /\/playlogdetail\b/i.test(dataHref)) {
          try { set.add(new URL(dataHref, location.href).toString()); cHref++; continue; } catch {}
        }

        // 3) 「詳細」テキストで普通の href（念のため）
        if (/詳細|Detail/i.test(label) && href && !/^javascript:|^#/.test(href)) {
          set.add(href); cText++; continue;
        }

        // 4) onclick="playlogDetail('…')" 形式
        const oc = el.getAttribute && (el.getAttribute('onclick') || '');
        const m1 = oc.match(/playlogdetail\(['"]([^'"]+)['"]\)/i);
        if (m1 && m1[1]) {
          const v = m1[1];
          try {
            // 引数が URL ならそのまま、idx のみなら合成
            set.add(/playlogdetail/i.test(v) || /idx=/.test(v) ? new URL(v, location.href).toString() : makeByIdx(v));
            cOnclick++;
            continue;
          } catch {}
        }

        // 5) data-idx / idx 属性
        const dIdx = (el.dataset && el.dataset.idx) || el.getAttribute?.('data-idx');
        if (dIdx) { try{ set.add(makeByIdx(dIdx)); cIdx++; continue; }catch{} }
      }

      // 6) form + hidden input name=idx
      d.querySelectorAll('form').forEach(f=>{
        try{
          const act = f.getAttribute('action') || '';
          const idxInput = f.querySelector('input[name="idx"]');
          const v = idxInput && (idxInput.value || idxInput.getAttribute('value'));
          if (v) { set.add(makeByIdx(v)); cIdx++; }
        }catch{}
      });

      // 7) input[name=idx] 直取り（フォーム外にあっても拾う）
      d.querySelectorAll('input[name="idx"]').forEach(i=>{
        const v = i.value || i.getAttribute('value');
        if (v) { try{ set.add(makeByIdx(v)); cIdx++; }catch{} }
      });

      // 8) HTML 正規表現（最後の砦）
      const html = d.documentElement?.innerHTML || '';
      for (const m of html.matchAll(/href=["']([^"']*\/playlogdetail[^"']*)["']/ig)) {
        try { set.add(new URL(m[1], location.href).toString()); cRegex++; } catch {}
      }
      for (const m of html.matchAll(/playlogdetail\(['"]([^'"]+)['"]\)/ig)) {
        try {
          const v = m[1];
          set.add(/playlogdetail/i.test(v) || /idx=/.test(v) ? new URL(v, location.href).toString() : makeByIdx(v));
          cRegex++;
        } catch {}
      }
      for (const m of html.matchAll(/\/maimai-mobile\/record\/playlogDetail\/\?idx=([0-9,%]+)/ig)) {
        try { set.add(new URL(m[0], location.origin).toString()); cRegex++; } catch {}
      }
    }

    window.__MRC_LAST_COUNTS__ = { href:cHref, onclick:cOnclick, regex:cRegex, idx:cIdx, text:cText };
    return Array.from(set).slice(0, 50);
  }

  // ---------- ingest ----------
  async function postHtml(api, token, url) {
    const html = document.documentElement.outerHTML;
    const res = await fetch(api, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify({ url, html })
    });
    return res.ok;
  }

  // ---------- main ----------
  (async () => {
    // 0) register
    let env;
    try { env = await getOrRegister(); }
    catch(e){
      open(`初期設定の自動取得に失敗しました（/register NG）<br><small>${String(e)}</small>`,[
        {label:"閉じる", cls:"gray", onClick:close}
      ]);
      return;
    }

    // 1) 開始ダイアログ
    open(`履歴データを取得・送信します。`,[
      {label:"やめる", cls:"gray", onClick:close},
      {label:"開始",  cls:"green", onClick: async()=>{
        // 自動スクロールで末尾までロード
        await autoScroll(36, 700);

        let urls = collectLinksRobust();
        if (!urls.length){
          const c = (window.__MRC_LAST_COUNTS__||{});
          open(`履歴の詳細リンクが見つかりませんでした。<br>
          一度 <b>最下部までスクロール</b>してから再実行してください。<br>
          <small>検出内訳: href=${c.href||0}, onclick=${c.onclick||0}, idx=${c.idx||0}, regex=${c.regex||0}, text=${c.text||0}</small>`,[
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"再試行", cls:"green", onClick: async()=>{
              await autoScroll(50, 800);
              const u2 = collectLinksRobust();
              if (!u2.length){
                const cc=(window.__MRC_LAST_COUNTS__||{});
                open(`まだ見つかりませんでした。<br>
                  Safariの「共有」→「デスクトップ用Webサイトを表示」を試し、<br>
                  もう一度最下部までスクロール後に再実行してください。<br>
                  <small>検出内訳: href=${cc.href||0}, onclick=${cc.onclick||0}, idx=${cc.idx||0}, regex=${cc.regex||0}, text=${cc.text||0}</small>`,
                  [{label:"閉じる", cls:"gray", onClick:close}]);
              } else {
                startIngest(u2);
              }
            }]
          ]);
          return;
        }

        startIngest(urls);
      }}
    ]);

    async function startIngest(urls){
      // 進捗UI
      const bar = document.createElement("div"); bar.className="mrc-bar";
      open(`履歴データ（${urls.length}件）を送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,[
        {label:"閉じる", cls:"gray", onClick:close},
        {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
      ]);
      $("#mrc-bar")?.replaceWith(bar);

      // 送信
      let ok=0, ng=0;
      for (let i=0;i<urls.length;i++){
        try{ (await postHtml(env.api, env.token, urls[i])) ? ok++ : ng++; }
        catch{ ng++; }
        bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
        await sleep(60);
      }

      // 完了
      open(`完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,[
        {label:"閉じる", cls:"gray", onClick:close},
        {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
      ]);
    }
  })();
})();
