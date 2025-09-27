/* mrc.js — auto register + auto scroll + ingest */
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

  // ===== overlay ui =====
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

  // ===== server warmup =====
  async function waitAlive(base) {
    for (let i=0;i<25;i++) {
      try {
        const r = await fetch(base+"/health", {cache:"no-store"});
        if (r.ok) return;
      } catch{}
      await sleep(i<10 ? 1500 : 3000);
    }
    throw new Error("server not responding");
  }

  // ===== /register （返り値2系統に対応）=====
  async function getOrRegister() {
    let api   = localStorage.getItem(LS.api);
    let token = localStorage.getItem(LS.token);
    let uid   = localStorage.getItem(LS.uid);
    if (api && token && uid) return { api, token, uid };

    await waitAlive(API_BASE);
    uid = uid || uuid();

    const res = await fetch(REGISTER, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ user_id: uid, ua: navigator.userAgent, platform: navigator.platform||"" })
    });
    if (!res.ok) throw new Error("register failed: "+(await res.text()));
    const j = await res.json().catch(()=> ({}));

    // {token, api_url} または {bearer, ingest_url}
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

  // ===== auto scroll to bottom (ページ末までロード) =====
  async function autoScroll() {
    let last = -1, sameCount = 0;
    for (let i=0;i<30;i++){
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      const h = document.body.scrollHeight;
      if (h === last) { if (++sameCount >= 2) break; } else { sameCount = 0; last = h; }
    }
  }

  // ===== collect 50 links =====
  function collectLinks() {
    const urls = [];
    // href 版
    $$('a[href*="playlogDetail"]').forEach(a=>{
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        if (/playlogDetail/.test(u.pathname)) urls.push(u.toString());
      } catch {}
    });
    // onclick 版
    $$('a[onclick*="playlogDetail"]').forEach(a=>{
      const m = String(a.getAttribute("onclick")||"").match(/playlogDetail\(['"]([^'"]+)['"]/);
      if (m) try { urls.push(new URL(m[1], location.href).toString()); } catch {}
    });
    return Array.from(new Set(urls)).slice(0,50);
  }

  // ===== send html to /ingest =====
  async function postHtml(api, token, url) {
    const html = document.documentElement.outerHTML;
    const res = await fetch(api, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify({ url, html })
    });
    return res.ok;
  }

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

    // 1) 事前ダイアログ
    open(`履歴データを取得・送信します。`,[
      {label:"やめる", cls:"gray", onClick:close},
      {label:"開始",  cls:"green", onClick: async()=>{
        // 自動スクロールで末尾まで読み込み
        await autoScroll();
        let urls = collectLinks();
        if (!urls.length){
          open(`履歴の詳細リンクが見つかりませんでした。<br>画面を一番下まで表示してから再実行してください。`,[
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
          ]);
          return;
        }

        // 進捗
        const bar = document.createElement("div"); bar.className="mrc-bar";
        open(`履歴データ（${urls.length}件）を送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,[
          {label:"閉じる", cls:"gray", onClick:close},
          {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
        $("#mrc-bar")?.replaceWith(bar);

        // 2) 送信
        let ok=0, ng=0;
        for (let i=0;i<urls.length;i++){
          try{ (await postHtml(env.api, env.token, urls[i])) ? ok++ : ng++; }
          catch{ ng++; }
          bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
          await sleep(60);
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
