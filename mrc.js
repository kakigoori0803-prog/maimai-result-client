/* mrc.js — auto register + ingest (detail HTML fetch版) */
(() => {
  const API_BASE = "https://maimai-result.onrender.com";
  const INGEST   = API_BASE + "/ingest";
  const REGISTER = API_BASE + "/register";
  const VIEW     = API_BASE + "/view";

  const LS = { api:"MRC_API_URL", token:"MRC_TOKEN", uid:"MRC_USER_ID" };

  // ---------- utils ----------
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () =>
    (crypto && crypto.randomUUID) ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c==="x" ? r : (r&0x3|0x8); return v.toString(16);
    });

  // overlay
  const ov = document.createElement("div");
  ov.id = "mrc-ov";
  const css = document.createElement("style");
  css.textContent = `
#${ov.id}{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:99999}
.mrc-card{width:min(92vw,560px);background:#111;border-radius:14px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.4);overflow:hidden}
.mrc-h{padding:16px 20px;font-weight:700;border-bottom:1px solid #2a2a2a}
.mrc-b{padding:18px 20px;line-height:1.6}
.mrc-p{height:6px;background:#2b2b2b;border-radius:4px;overflow:hidden;margin-top:8px}
.mrc-bar{height:100%;width:0%;background:#22c55e;transition:width .2s}
.mrc-row{display:flex;gap:12px;justify-content:flex-end;padding:16px 20px;border-top:1px solid #2a2a2a;background:#0e0e0e}
.mrc-btn{appearance:none;border:0;border-radius:10px;padding:12px 16px;font-weight:700}
.mrc-btn.gray{background:#3a3a3a;color:#fff}
.mrc-btn.green{background:#10b981;color:#00150e}
`;
  document.head.appendChild(css);

  const open = (title, body, buttons=[]) => {
    ov.innerHTML = `
      <div class="mrc-card">
        <div class="mrc-h">maimai Result Client</div>
        <div class="mrc-b">${body}</div>
        <div class="mrc-row">
          ${buttons.map((b,i)=>`<button class="mrc-btn ${b.cls||'gray'}" data-i="${i}">${b.label}</button>`).join("")}
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll("button[data-i]").forEach(btn=>{
      btn.addEventListener("click", e=>{
        const i = +btn.dataset.i; buttons[i]?.onClick?.();
      }, {once:false});
    });
  };
  const close = () => ov.remove();

  // ---------- auto register ----------
  const getOrRegister = async () => {
    let api   = localStorage.getItem(LS.api);
    let token = localStorage.getItem(LS.token);
    let uid   = localStorage.getItem(LS.uid);
    if (api && token && uid) return { api, token, uid };

    uid = uid || uuid();
    localStorage.setItem(LS.uid, uid);

    try {
      const res = await fetch(REGISTER, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ user_id: uid, ua: navigator.userAgent, platform: navigator.platform||"" })
      });
      if (!res.ok) throw new Error("register failed: " + res.status);
      const j = await res.json();
      if (!j.ok || !j.token) throw new Error("register invalid response");
      api   = INGEST;
      token = j.token;

      localStorage.setItem(LS.api, api);
      localStorage.setItem(LS.token, token);
      return { api, token, uid };
    } catch (e) {
      open("MRC",
        `初期設定の自動取得に失敗しました（/register NG）<br><small>${String(e)}</small>`,
        [{label:"閉じる", cls:"gray", onClick:close}]);
      throw e;
    }
  };

  // ---------- link discovery ----------
  const extractLinksOnce = () => {
    // playlogDetail を含む href / onclick を拾う
    const urls = new Set();

    $$('a[href*="playlogDetail"]').forEach(a=>{
      const href = a.getAttribute("href")||"";
      try {
        const u = new URL(href, location.href);
        if (/playlogDetail/.test(u.href)) urls.add(u.href);
      } catch {}
    });

    $$('a[onclick*="playlogDetail"]').forEach(a=>{
      const oc = String(a.getAttribute("onclick")||"");
      const m  = oc.match(/playlogDetail\(['"]([^'"]+)['"]/);
      if (m) { try {
        const u = new URL(m[1], location.href);
        if (/playlogDetail/.test(u.href)) urls.add(u.href);
      } catch {} }
    });

    return Array.from(urls);
  };

  // 自動スクロールで下まで読み込み→再探索
  const collectLinks = async () => {
    let links = extractLinksOnce();
    // 既に十分ならそのまま
    if (links.length >= 50) return links.slice(0,50);

    let lastH = -1;
    for (let i=0;i<8;i++){          // 最大8回スクロール
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      const h = document.body.scrollHeight;
      links = extractLinksOnce();
      if (links.length >= 50) break;
      if (h === lastH) break;       // もう増えない
      lastH = h;
    }
    return links.slice(0,50);
  };

  // ---------- ingest (detail HTML を取得して送る) ----------
  const postDetail = async (api, token, url) => {
    // 同一オリジンなので fetch 可。詳細ページのHTMLを取得。
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) return false;
    const html = await r.text();

    const res = await fetch(api, {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":"Bearer "+token
      },
      body: JSON.stringify({
        url, html,
        sourceUrl: location.href,
        ingestedAt: new Date().toISOString().slice(0,19).replace("T"," ")
      })
    });
    return res.ok;
  };

  // ---------- main ----------
  (async () => {
    let env;
    try { env = await getOrRegister(); } catch { return; }

    // 1) 事前確認
    open("MRC",
      `履歴データを取得・送信します。<br>準備ができたら「開始」を押してください。`,
      [
        {label:"戻る",  cls:"gray",  onClick:close},
        {label:"開始",  cls:"green", onClick: async () => {
          // ボタン二重押し防止
          const me = event.currentTarget; me.disabled = true;

          // 進捗UI
          const bar = document.createElement("div");
          bar.className = "mrc-bar";
          ov.querySelector(".mrc-b").innerHTML =
            `履歴リンクを探索中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`;
          $("#mrc-bar")?.replaceWith(bar);

          // リンク収集（自動スクロール込み）
          const urls = await collectLinks();
          if (!urls.length) {
            open("MRC",
              `履歴の詳細リンクが見つかりませんでした。<br>一度 <b>最下部までスクロール</b>してから再実行してください。`,
              [
                {label:"閉じる", cls:"gray", onClick:close},
                {label:"結果ページへ", cls:"green", onClick:()=>location.href = `${VIEW}?user_id=${localStorage.getItem(LS.uid)||''}`}
              ]);
            return;
          }

          // 2) 送信
          let ok=0, ng=0;
          ov.querySelector(".mrc-b").innerHTML =
            `履歴データ（${urls.length}件）を取得・送信します。<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`;
          $("#mrc-bar")?.replaceWith(bar);

          for (let i=0;i<urls.length;i++){
            try {
              (await postDetail(env.api, env.token, urls[i])) ? ok++ : ng++;
            } catch { ng++; }
            bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
            await sleep(50);
          }

          // 3) 完了
          open("MRC",
            `完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,
            [
              {label:"戻る", cls:"gray", onClick:close},
              {label:"結果ページへ", cls:"green", onClick:()=>location.href = `${VIEW}?user_id=${localStorage.getItem(LS.uid)||''}`}
            ]);
        }}
      ]);
  })();
})();
