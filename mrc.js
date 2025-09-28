/* mrc.js — page guard + auto register + auto scroll (window & iframes) + robust link finder + fetch detail + ingest */
(() => {
  const API_BASE = "https://maimai-result.onrender.com";
  const REGISTER = API_BASE + "/register";
  const VIEW     = API_BASE + "/view";

  const LS = { api:"MRC_API_URL", token:"MRC_TOKEN", uid:"MRC_USER_ID" };
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid  = () =>
    (crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
        const r=Math.random()*16|0, v=c==="x"?r:(r&0x3|0x8); return v.toString(16);
      });

  // ========= UI =========
  const ov = document.createElement("div"); ov.id = "mrc-ov";
  const css = document.createElement("style");
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
.mrc-note{font-size:12px;opacity:.8;margin-top:8px;word-break:break-all}
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

  // ========= page guard (ここが重要) =========
  const onRecordPage = () => /\/maimai-mobile\/record\//.test(location.pathname);
  if (!onRecordPage()) {
    open(
      `いまの画面では履歴リンクを拾えません。<br>
       下のボタンで <b>プレイ履歴</b> を開いてから実行してください。<div class="mrc-note">${location.href}</div>`,
      [
        {label:"閉じる", cls:"gray", onClick:close},
        {label:"プレイ履歴へ", cls:"green", onClick:()=>{ location.href="/maimai-mobile/record/"; }}
      ]
    );
    return;
  }

  // ========= server =========
  async function waitAlive() {
    for (let i=0;i<20;i++) {
      try { const r = await fetch(API_BASE+"/health",{cache:"no-store"}); if (r.ok) return; } catch{}
      await sleep(i<8?1000:2500);
    }
    throw new Error("server not responding");
  }
  async function getOrRegister() {
    let api=localStorage.getItem(LS.api), token=localStorage.getItem(LS.token), uid=localStorage.getItem(LS.uid);
    if (api && token && uid) return {api,token,uid};
    await waitAlive();
    uid = uid || uuid();
    const res = await fetch(REGISTER, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ user_id: uid, ua: navigator.userAgent, platform: navigator.platform||"" })
    });
    if (!res.ok) throw new Error("register failed: "+res.status);
    const j = await res.json().catch(()=> ({}));
    const _token = j.token ?? j.bearer;
    let   _api   = j.api_url ?? j.ingest_url ?? "/ingest";
    if (!_token) throw new Error("register invalid response");
    if (!_api.startsWith("http")) _api = API_BASE + _api;
    api=_api; token=_token; uid=j.user_id || uid;
    localStorage.setItem(LS.api, api);
    localStorage.setItem(LS.token, token);
    localStorage.setItem(LS.uid, uid);
    return {api,token,uid};
  }

  // ========= document + iframe 走査 =========
  function getAllDocs(rootDoc) {
    const docs = [];
    const stack = [rootDoc||document];
    while (stack.length) {
      const d = stack.pop();
      docs.push(d);
      const iframes = Array.from(d.querySelectorAll("iframe"));
      for (const f of iframes) {
        try { if (f.contentDocument) stack.push(f.contentDocument); } catch {}
      }
    }
    return docs;
  }
  async function autoScrollAll() {
    const docs = getAllDocs(document);
    for (let step=0; step<40; step++){
      for (const d of docs) {
        try {
          const el = d.scrollingElement || d.documentElement || d.body;
          el.scrollTo(0, el.scrollHeight);
        } catch {}
      }
      await sleep(500);
    }
  }

  // ========= robust link finder =========
  function collectLinksRobust() {
    const set = new Set();
    const docs = getAllDocs(document);
    let cHref=0, cOnclk=0, cRegex=0;

    for (const d of docs) {
      // a.href ですべて
      const as = Array.from(d.getElementsByTagName("a"));
      for (const a of as) {
        try {
          const href = a.href || a.getAttribute("href") || "";
          if (href && /\/playlogdetail\//i.test(href)) { set.add(href); cHref++; }
        } catch {}
      }
      // onclick 中の playlogDetail(...)
      const onEls = Array.from(d.querySelectorAll("[onclick]"));
      for (const el of onEls) {
        const txt = String(el.getAttribute("onclick")||"");
        const m = txt.match(/playlogdetail\(['"]([^'"]+)['"]/i);
        if (m && m[1]) { try{ set.add(new URL(m[1], location.href).toString()); cOnclk++; }catch{} }
      }
      // HTMLを正規表現で（最後の砦）
      const html = d.documentElement ? d.documentElement.innerHTML : "";
      (html.match(/href=["']([^"']*playlogdetail[^"']*)["']/ig) || []).forEach(h=>{
        const m = h.match(/href=["']([^"']+)["']/i);
        if (m && m[1]) { try{ set.add(new URL(m[1], location.href).toString()); cRegex++; }catch{} }
      });
      for (const m of html.matchAll(/playlogdetail\(['"]([^'"]+)['"]\)/ig)) {
        try{ set.add(new URL(m[1], location.href).toString()); cRegex++; }catch{}
      }
    }
    window.__MRC_LAST_COUNTS__ = {href:cHref, onclick:cOnclk, regex:cRegex};
    return Array.from(set).slice(0,50);
  }
  function diagCounts(){ return window.__MRC_LAST_COUNTS__ || {href:0,onclick:0,regex:0}; }

  // ========= 詳細を取得して送信 =========
  async function fetchDetailHtml(url) {
    const r = await fetch(url, { credentials:"include", cache:"no-store" });
    if (!r.ok) throw new Error("detail fetch "+r.status);
    return await r.text();
  }
  async function postDetail(api, token, url, html) {
    const r = await fetch(api, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify({ url, html })
    });
    return r.ok;
  }

  // ========= main =========
  (async () => {
    let env;
    try { env = await getOrRegister(); }
    catch(e){
      open(`初期設定の自動取得に失敗しました（/register NG）<div class="mrc-note">${String(e)}</div>`,
        [{label:"閉じる", cls:"gray", onClick:close}]);
      return;
    }

    open(`履歴データを取得・送信します。`,[
      {label:"やめる", cls:"gray", onClick:close},
      {label:"開始", cls:"green", onClick: async()=>{
        await autoScrollAll();

        const urls = collectLinksRobust();
        if (!urls.length){
          const d = diagCounts();
          open(`履歴の詳細リンクが見つかりませんでした。<br>
               一度ページを一番下まで表示してから再実行してください。<div class="mrc-note">
               検出内訳: href=${d.href}, onclick=${d.onclick}, regex=${d.regex}<br>${location.href}</div>`,
            [
              {label:"閉じる", cls:"gray", onClick:close},
              {label:"再試行", cls:"green", onClick:()=>location.reload()}
            ]);
          return;
        }

        const bar = document.createElement("div"); bar.className="mrc-bar";
        open(`履歴データ（${urls.length}件）を取得・送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,
          [
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
          ]);
        $("#mrc-bar")?.replaceWith(bar);

        let ok=0, ng=0;
        for (let i=0;i<urls.length;i++){
          try{
            const html = await fetchDetailHtml(urls[i]);
            const sent = await postDetail(env.api, env.token, urls[i], html);
            sent ? ok++ : ng++;
          }catch{ ng++; }
          bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
          await sleep(120);
        }

        open(`完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,
          [
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
          ]);
      }}
    ]);
  })();
})();
