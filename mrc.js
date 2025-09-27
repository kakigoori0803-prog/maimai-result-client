/* mrc.js — auto register + auto scroll + parse items -> ingest */
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

  // ---------- overlay UI ----------
  const ov = document.createElement("div");
  ov.id = "mrc-ov";
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

  // ---------- server warmup ----------
  async function waitAlive(base) {
    for (let i=0;i<25;i++){
      try { const r = await fetch(base+"/health",{cache:"no-store"}); if (r.ok) return; } catch{}
      await sleep(i<10?1500:3000);
    }
    throw new Error("server not responding");
  }

  // ---------- /register（2系統に対応） ----------
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

  // ---------- auto scroll to bottom ----------
  async function autoScroll() {
    let last = -1, same = 0;
    for (let i=0;i<30;i++){
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      const h = document.body.scrollHeight;
      if (h === last) { if (++same >= 2) break; } else { same = 0; last = h; }
    }
  }

  // ---------- helpers ----------
  const pick = (el, sel) => {
    const n = el.querySelector(sel);
    if (!n) return "";
    return (n.value ?? n.textContent ?? "").toString().trim();
  };
  const findDate = (txt) => {
    const m = txt.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
    return m ? m[1] : "";
  };
  const findRate = (txt) => {
    const m = txt.replace(/,/g,"").match(/(\d{2,3}\.\d{2,5})\s*%/);
    return m ? m[1] : "";
  };
  const findLevel = (txt) => {
    const m = txt.match(/LEVEL\s*([0-9]+[+]*)/i);
    return m ? m[1] : "";
  };

  // ---------- collect 50 items from the list page ----------
  function collectItems() {
    // 「詳細」ボタン（href or onclick）を基準に、同じカードDOMから情報を抜く
    const anchors = [
      ...$$('a[href*="playlogDetail"]'),
      ...$$('a[onclick*="playlogDetail"]')
    ];
    const items = [];
    for (const a of anchors) {
      // カードっぽい大きめのコンテナまで遡る（3〜6階層程度で十分）
      let card = a;
      for (let i=0;i<6 && card && card.parentElement;i++){
        card = card.parentElement;
        if (card.querySelector('input') && /ACHIEVEMENT/i.test(card.textContent)) break;
      }
      if (!card) continue;

      const title = pick(card, 'input') || pick(card, '.music_name') || pick(card, '.title') || "";
      const txt   = card.textContent || "";
      const playedAt = findDate(txt);
      const rate     = findRate(txt);
      const level    = findLevel(txt);
      const imgEl    = card.querySelector('img');
      const imageUrl = imgEl ? (imgEl.currentSrc || imgEl.src || "") : "";

      if (!title || !playedAt || !rate) continue; // 必須3つが揃わないものは捨てる

      items.push({
        title, playedAt, rate, level, imageUrl,
        difficulty: "" // リスト面では拾いづらいので空（サーバー側は空でも表示可）
      });
      if (items.length >= 50) break;
    }
    return items;
  }

  // ---------- send items to /ingest ----------
  async function postItems(api, token, items) {
    const body = {
      items,
      sourceUrl: location.href,
      ingestedAt: new Date().toISOString().replace('T',' ').slice(0,19) // "YYYY-MM-DD HH:MM:SS"
    };
    const res = await fetch(api, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("ingest failed: "+res.status);
    return true;
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

    // 1) 事前ダイアログ
    open(`履歴データを取得・送信します。`,[
      {label:"やめる", cls:"gray", onClick:close},
      {label:"開始",  cls:"green", onClick: async()=>{
        await autoScroll();                 // 末尾まで読み込む
        const items = collectItems();       // 50件まで抽出
        if (!items.length){
          open(`履歴の詳細リンクが見つかりませんでした。<br>画面を一番下まで表示してから再実行してください。`,[
            {label:"閉じる", cls:"gray", onClick:close},
            {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
          ]);
          return;
        }

        // 進捗UI
        const bar = document.createElement("div"); bar.className="mrc-bar";
        open(`履歴データ（${items.length}件）を送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,[
          {label:"閉じる", cls:"gray", onClick:close},
          {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
        $("#mrc-bar")?.replaceWith(bar);

        // 2) まとめて送信（/ingest は配列対応）
        let ok=0, ng=0;
        try {
          await postItems(env.api, env.token, items);
          ok = items.length;
        } catch {
          ng = items.length;
        }
        bar.style.width = "100%";

        // 3) 完了
        open(`完了：<b>${ok}/${items.length}</b>　失敗：${ng} 件`,[
          {label:"閉じる", cls:"gray", onClick:close},
          {label:"結果ページへ", cls:"green", onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
      }}
    ]);
  })();
})();
