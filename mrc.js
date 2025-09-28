/* mrc.js — auto register + auto scroll + robust link finder + fetch detail + ingest */
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
.mrc-note{font-size:12px;opacity:.8;margin-top:8px}
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

  // ========= helpers =========
  async function autoScroll() {
    let last = -1, same = 0;
    for (let i=0;i<40;i++){
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(500);
      const h = document.body.scrollHeight;
      if (h===last){ if(++same>=2) break; } else { same=0; last=h; }
    }
  }
  function collectLinksRobust() {
    const set = new Set();

    // 1) 直接 href
    $$('a[href*="playlogDetail"]').forEach(a=>{
      try{
        const href = a.getAttribute('href');
        if (!href) return;
        const u = new URL(href, location.href);
        if (/playlogDetail/.test(u.pathname)) set.add(u.toString());
      }catch{}
    });

    // 2) どんな要素でも onclick に playlogDetail
    $$('[onclick*="playlogDetail"]').forEach(el=>{
      try{
        const m = String(el.getAttribute('onclick')||"").match(/playlogDetail\(['"]([^'"]+)['"]/);
        if (m && m[1]) set.add(new URL(m[1], location.href).toString());
      }catch{}
    });

    // 3) HTML 全体を正規表現でスキャン（最後の砦）
    const html = document.documentElement.innerHTML;

    // href="...playlogDetail..."
    (html.match(/href=["']([^"']*playlogDetail[^"']*)["']/g) || []).forEach(h=>{
      const m = h.match(/href=["']([^"']+)["']/);
      if (m && m[1]) { try{ set.add(new URL(m[1], location.href).toString()); }catch{} }
    });

    // playlogDetail('...')
    for (const m of html.matchAll(/playlogDetail\(['"]([^'"]+)['"]\)/g)) {
      try{ set.add(new URL(m[1], location.href).toString()); }catch{}
    }

    const arr = Array.from(set);
    // 50件に揃える（新しい方が上に来るので末尾からも良いが、ここはそのまま）
    return arr.slice(0,50);
  }
  function diagCounts(){
    const c1 = $$('a[href*="playlogDetail"]').length;
    const c2 = $$('[onclick*="playlogDetail"]').length;
    const html = document.documentElement.innerHTML;
    const c3 = (html.match(/playlogDetail\(/g)||[]).length;
    return {c1,c2,c3};
  }

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
    // 0) register
    let env;
    try { env = await getOrRegister(); }
    catch(e){
      open(`初期設定の自動取得に失敗しました（/register NG）<div class="mrc-note">${String(e)}</div>`,[
        {label:"閉じる", cls:"gray", onClick:close}
      ]);
      return;
    }

    // 1) 事前確認
    open(`履歴データを取得・送信します。`,[
      {label:"やめる", cls:"gray", onClick:close},
      {label:"開始", cls:"green", onClick: async()=>{
        // 自動で最下部まで読み込み
        await autoScroll();
        let urls = collectLinksRobust();

        if (!urls.length){
          const d = diagCounts();
          open(`履歴の詳細リンクが見つかりませんでした。<br>
               一度ページを一番下まで表示してから再実行してください。<div class="mrc-note">
               検出内訳: href=${d.c1}, onclick=${d.c2}, regex=${d.c3}</div>`,[
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"再試行", cls:"green", onClick:()=>location.reload()}
          ]);
          return;
        }

        // 進捗表示
        const bar = document.createElement("div"); bar.className="mrc-bar";
        open(`履歴データ（${urls.length}件）を取得・送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,[
          {label:"閉じる", cls:"gray", onClick:close},
          {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
        $("#mrc-bar")?.replaceWith(bar);

        // 2) 取得→送信
        let ok=0, ng=0;
        for (let i=0;i<urls.length;i++){
          try{
            const html = await fetchDetailHtml(urls[i]);          // ← 詳細ページを取得
            const sent = await postDetail(env.api, env.token, urls[i], html);
            sent ? ok++ : ng++;
          }catch{ ng++; }
          bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
          await sleep(120); // サイト負荷とUIのために少し待つ
        }

        // 3) 完了
        open(`完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,[
          {label:"閉じる", cls:"gray", onClick:close},
          {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
      }}
    ]);
  })();
})();
