/* mrc.js — auto register + ingest */
(() => {
  const API_BASE = "https://maimai-result.onrender.com";
  const INGEST = API_BASE + "/ingest";
  const REGISTER = API_BASE + "/register";
  const VIEW = API_BASE + "/view";

  const LS = {
    api: "MRC_API_URL",
    token: "MRC_TOKEN",
    uid: "MRC_USER_ID",
  };

  // ---------- small utils ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid = () =>
    (crypto && crypto.randomUUID) ? crypto.randomUUID() :
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });

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

  const open = (title, body, buttons = []) => {
    ov.innerHTML = `
      <div class="mrc-card">
        <div class="mrc-h">maimai Result Client</div>
        <div class="mrc-b">${body}</div>
        <div class="mrc-row">${buttons.map((b,i)=>`<button class="mrc-btn ${b.cls||'gray'}" data-i="${i}">${b.label}</button>`).join("")}</div>
      </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => {
      const i = e.target && e.target.dataset ? e.target.dataset.i : null;
      if (i != null) buttons[+i].onClick?.();
    };
  };
  const close = () => ov.remove();

  // ---------- auto register ----------
  const getOrRegister = async () => {
    let api = localStorage.getItem(LS.api);
    let token = localStorage.getItem(LS.token);
    let uid = localStorage.getItem(LS.uid);

    if (api && token && uid) return { api, token, uid };

    uid = uid || uuid();
    try {
      const res = await fetch(REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, ua: navigator.userAgent, platform: navigator.platform || "" })
      });
      if (!res.ok) throw new Error("register failed: " + res.status);
      const j = await res.json();
      if (!j.ok || !j.token) throw new Error("register invalid");
      api = INGEST;
      token = j.token;

      localStorage.setItem(LS.api, api);
      localStorage.setItem(LS.token, token);
      localStorage.setItem(LS.uid, uid);
      return { api, token, uid };
    } catch (e) {
      open("MRC", `
        初期設定の自動取得に失敗しました（/register NG）<br>
        <small>${String(e)}</small>`,
        [{label:"閉じる", cls:"gray", onClick:close}]);
      throw e;
    }
  };

  // ---------- collect links (履歴 50件) ----------
  const collectLinks = () => {
    // playlogDetail への a[href], onclick のどちらにも対応
    const anchors = $$('a[href*="playlogDetail"]');
    const onclicks = $$('a[onclick*="playlogDetail"]');
    const urls = [];

    anchors.forEach(a => {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        if (/playlogDetail/.test(u.pathname)) urls.push(u.toString());
      } catch {}
    });

    onclicks.forEach(a => {
      try {
        const m = String(a.getAttribute("onclick") || "").match(/playlogDetail\(['"]([^'"]+)['"]/);
        if (m) urls.push(new URL(m[1], location.href).toString());
      } catch {}
    });

    // だいたい 50 を上限に揃える
    return urls.slice(0, 50);
  };

  // ---------- ingest ----------
  const postHtml = async (api, token, url) => {
    const html = document.documentElement.outerHTML;
    const res = await fetch(api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
      },
      body: JSON.stringify({ url, html })
    });
    return res.ok;
  };

  (async () => {
    // 0) セットアップ＆登録
    let env;
    try {
      env = await getOrRegister();
    } catch { return; }

    // 1) 事前ダイアログ
    const urls = collectLinks();
    if (!urls.length) {
      open("MRC", `履歴の詳細リンクが見つかりませんでした。<br>一度 <b>最下部までスクロール</b>してから再実行してください。`, [
        {label:"閉じる", cls:"gray", onClick:close},
        {label:"結果ページへ", cls:"green", onClick:()=>location.href = `${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
      ]);
      return;
    }

    let ok = 0, ng = 0;
    const bar = document.createElement("div");
    bar.className = "mrc-bar";

    open("MRC",
      `履歴データ（${urls.length}件）を取得・送信します。<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,
      [
        { label:"戻る", cls:"gray", onClick:close },
        { label:"取得中…", cls:"green", onClick:()=>{} }
      ]);
    $("#mrc-bar").replaceWith(bar);

    // 2) 送信
    for (let i=0;i<urls.length;i++){
      try{
        const ok1 = await postHtml(env.api, env.token, urls[i]);
        ok1 ? ok++ : ng++;
      }catch{ ng++; }
      bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
      await sleep(60); // UI 進捗のため少し待つ
    }

    // 3) 完了ダイアログ
    open("MRC",
      `完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,
      [
        {label:"戻る", cls:"gray", onClick:close},
        {label:"結果ページへ", cls:"green", onClick:()=>location.href = `${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
      ]);
  })();
})();
