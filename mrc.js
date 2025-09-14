// mrc.js  — maimai Result Client bookmarklet core
(() => {
  if (window.__MRC_RUNNING__) return;
  window.__MRC_RUNNING__ = true;

  /* === 設定（必要なら書き換え）=== */
  const MAX_ITEMS = 50; // 取得上限
  const RESULT_URL = "https://kakigoori0803-prog.github.io/maimai-result-client/";
  const API_URL   = "https://maimai-result.onrender.com/ingest";
  const BEARER    = "677212069901c46a68a76e31ad8ba32a"; // 公開トークン

  /* === 便利関数 === */
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const $ = (q,root=document)=>root.querySelector(q);
  const $$ = (q,root=document)=>Array.from(root.querySelectorAll(q));
  const uniq = (arr)=>Array.from(new Set(arr));

  /* === UI === */
  const st = document.createElement("style");
  st.textContent = `
  #mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999999}
  #mrc-box{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(92vw,560px);background:#121212;color:#fff;border-radius:18px;
    box-shadow:0 8px 28px rgba(0,0,0,.45);font-family:system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;}
  #mrc-hd{padding:18px 22px;font-weight:700;border-bottom:1px solid rgba(255,255,255,.08);font-size:20px}
  #mrc-bd{padding:18px 22px;font-size:16px;line-height:1.6}
  #mrc-note{opacity:.75;font-size:13px;margin-top:8px;word-break:break-all}
  #mrc-bar{height:8px;border-radius:999px;background:#2a2a2a;overflow:hidden;margin:12px 0}
  #mrc-bar>i{display:block;height:100%;width:0%;background:#1ad1a5;transition:width .15s}
  #mrc-ft{display:flex;gap:12px;justify-content:flex-end;padding:18px 22px;border-top:1px solid rgba(255,255,255,.08)}
  .mrc-btn{appearance:none;border:0;border-radius:12px;padding:12px 18px;font-weight:600;font-size:16px}
  .mrc-ghost{background:#2b2b2b;color:#fff}
  .mrc-pri{background:#18c79b;color:#032d25}
  .mrc-btn[disabled]{opacity:.5}
  `;
  document.documentElement.appendChild(st);

  const ov = document.createElement("div");
  ov.id = "mrc-ov";
  ov.innerHTML = `
    <div id="mrc-box" role="dialog" aria-modal="true">
      <div id="mrc-hd">maimai Result Client</div>
      <div id="mrc-bd">
        <div id="mrc-msg">履歴データ（最大${MAX_ITEMS}件）を取得・送信します。開始しますか？</div>
        <div id="mrc-bar" aria-hidden="true" style="display:none"><i></i></div>
        <div id="mrc-note" aria-live="polite"></div>
      </div>
      <div id="mrc-ft">
        <button id="mrc-cancel" class="mrc-btn mrc-ghost">戻る</button>
        <button id="mrc-go" class="mrc-btn mrc-pri">開始</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const msg = $("#mrc-msg"), bar = $("#mrc-bar"), fill = $("#mrc-bar>i"), note = $("#mrc-note");
  const btnBack = $("#mrc-cancel"), btnGo = $("#mrc-go");

  const setBtns = (leftText, rightText, rightEnabled=true) => {
    btnBack.textContent = leftText;
    btnGo.textContent = rightText;
    btnGo.disabled = !rightEnabled;
  };
  const close = ()=>{ ov.remove(); st.remove(); window.__MRC_RUNNING__ = false; };

  btnBack.addEventListener("click", close);

  /* === リンク抽出 === */
  const fullUrl = (p)=> p.startsWith("http") ? p : (location.origin + p);
  const extractLinks = () => {
    // a[href*="playlogDetail"]
    const a1 = $$('a[href*="/maimai-mobile/record/playlogDetail/"]')
      .map(a => fullUrl(a.getAttribute("href")));

    // onclick 内の文字列
    const a2 = $$("[onclick]").map(el=>{
      const js = el.getAttribute("onclick") || "";
      const m = js.match(/['"](\/maimai-mobile\/record\/playlogDetail\/\?idx=[^'"]+)['"]/);
      return m ? fullUrl(m[1]) : null;
    }).filter(Boolean);

    // HTML中（保険）
    let a3 = [];
    try{
      const html = document.documentElement.innerHTML;
      const re = /\/maimai-mobile\/record\/playlogDetail\/\?idx=[^"' <]+/g;
      a3 = uniq(Array.from(html.matchAll(re)).map(m=>fullUrl(m[0])));
    }catch{}

    return uniq([...a1, ...a2, ...a3]).slice(0, MAX_ITEMS);
  };

  const atRecordList = () => /\/maimai-mobile\/record\//.test(location.pathname);

  const autoScrollToBottom = async (maxSteps=30) => {
    let lastH = 0, sameCnt = 0;
    for (let i=0;i<maxSteps;i++){
      window.scrollTo({top: document.body.scrollHeight, behavior:"instant"});
      await sleep(350);
      const h = document.body.scrollHeight;
      if (h === lastH) sameCnt++; else sameCnt = 0;
      lastH = h;
      if (sameCnt >= 3) break; // しばらく増えなければ打ち切り
    }
    await sleep(500); // 余韻
  };

  /* === 送信 === */
  const postOne = async (detailUrl) => {
    // 詳細ページのHTMLを同一オリジンで取得
    const res = await fetch(detailUrl, { credentials: "include" });
    if (!res.ok) throw new Error("detail fetch " + res.status);
    const html = await res.text();

    const body = JSON.stringify({ html, sourceUrl: detailUrl });
    const apiRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BEARER}`
      },
      body
    });
    if (!apiRes.ok) throw new Error("api " + apiRes.status);
    return true;
  };

  const run = async () => {
    // ガード
    if (!atRecordList()){
      msg.textContent = "履歴一覧ページで実行してください。";
      note.textContent = location.origin + "/maimai-mobile/record/";
      setBtns("戻る", "開く");
      btnGo.onclick = ()=>{ location.href = "/maimai-mobile/record/"; };
      return;
    }

    // まず抽出。ゼロなら自動で下までスクロールして再抽出
    msg.textContent = "リンクを解析中…";
    setBtns("戻る", "取得中…", false);
    bar.style.display = "block";

    let urls = extractLinks();
    if (urls.length === 0){
      note.textContent = "最下部まで自動スクロールして読み込みます…";
      await autoScrollToBottom();
      urls = extractLinks();
    }

    if (urls.length === 0){
      msg.textContent = "履歴の詳細リンクが見つかりませんでした。";
      note.textContent = "ページを下までスクロールしてから、もう一度お試しください。";
      setBtns("閉じる", "再試行");
      btnGo.disabled = false;
      btnGo.onclick = ()=>{ msg.textContent="再試行します…"; run(); };
      return;
    }

    const total = Math.min(urls.length, MAX_ITEMS);
    msg.textContent = `履歴データ（${total}件）を取得・送信します。`;
    note.textContent = `API: ${API_URL} / Bearer: ${BEARER.slice(0,6)}…${BEARER.slice(-4)}`;

    let ok=0, ng=0;
    btnGo.disabled = true;

    for (let i=0;i<total;i++){
      try{
        await postOne(urls[i]);
        ok++;
      }catch(e){ ng++; }
      fill.style.width = `${Math.round(((i+1)/total)*100)}%`;
      note.textContent = `進捗: ${i+1}/${total}　成功: ${ok}　失敗: ${ng}`;
      await sleep(80); // 負荷軽減
    }

    msg.textContent = `完了: ${ok}/${total}　失敗: ${ng} 件`;
    setBtns("戻る", "結果ページへ", true);
    btnGo.onclick = ()=>{ window.open(RESULT_URL, "_blank"); close(); };
    btnBack.onclick = close;
    btnGo.disabled = false;
  };

  // 初期状態：確認 → 開始
  btnGo.addEventListener("click", ()=>{
    msg.textContent = `履歴データ（最大${MAX_ITEMS}件）を取得・送信します。`;
    run();
  });
})();
