// mrc.js — maimai Result Client (v3 wide-scan)
(() => {
  if (window.__MRC_RUNNING__) return;
  window.__MRC_RUNNING__ = true;

  /* ====== 設定 ====== */
  const MAX_ITEMS = 50; // 履歴は50件まで表示なので固定
  const RESULT_URL = "https://kakigoori0803-prog.github.io/maimai-result-client/";
  const API_URL   = "https://maimai-result.onrender.com/ingest";
  const BEARER    = "677212069901c46a68a76e31ad8ba32a";

  /* ====== util ====== */
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const $  = (q,root=document)=>root.querySelector(q);
  const $$ = (q,root=document)=>Array.from(root.querySelectorAll(q));
  const uniq = (arr)=>Array.from(new Set(arr));
  const fullUrl = (p)=> p.startsWith("http") ? p : (location.origin + p);

  /* ====== UI ====== */
  const st = document.createElement("style");
  st.textContent = `
  #mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999999}
  #mrc-box{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(92vw,560px);background:#121212;color:#fff;border-radius:18px;
    box-shadow:0 8px 28px rgba(0,0,0,.45);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial}
  #mrc-hd{padding:18px 22px;font-weight:700;border-bottom:1px solid rgba(255,255,255,.08);font-size:20px}
  #mrc-bd{padding:18px 22px;font-size:16px;line-height:1.6}
  #mrc-note{opacity:.75;font-size:13px;margin-top:8px;word-break:break-all;white-space:pre-line}
  #mrc-bar{height:8px;border-radius:999px;background:#2a2a2a;overflow:hidden;margin:12px 0;display:none}
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
        <div id="mrc-bar"><i></i></div>
        <div id="mrc-note"></div>
      </div>
      <div id="mrc-ft">
        <button id="mrc-cancel" class="mrc-btn mrc-ghost">戻る</button>
        <button id="mrc-go" class="mrc-btn mrc-pri">開始</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const msg = $("#mrc-msg"), bar = $("#mrc-bar"), fill = $("#mrc-bar>i"), note = $("#mrc-note");
  const btnBack = $("#mrc-cancel"), btnGo = $("#mrc-go");
  const close = ()=>{ ov.remove(); st.remove(); window.__MRC_RUNNING__ = false; };

  btnBack.addEventListener("click", close);

  const atRecordList = () => /\/maimai-mobile\/record\//.test(location.pathname);

  const autoScrollToBottom = async (maxSteps=30) => {
    let lastH = 0, sameCnt = 0;
    for (let i=0;i<maxSteps;i++){
      window.scrollTo({top: document.body.scrollHeight, behavior:"instant"});
      await sleep(350);
      const h = document.body.scrollHeight;
      if (h === lastH) sameCnt++; else sameCnt = 0;
      lastH = h;
      if (sameCnt >= 3) break;
    }
    await sleep(500);
  };

  /* ====== リンク抽出（強化版） ====== */
  function extractLinksWithBreakdown(){
    const found = [];
    const cnt = {a:0, onclickHref:0, onclickIdx:0, form:0, data:0, htmlHref:0, htmlIdx:0};

    // 1) 直リンク
    $$('a[href*="/maimai-mobile/record/playlogDetail/"]').forEach(a=>{
      const href=a.getAttribute("href"); if(!href) return;
      cnt.a++; found.push(fullUrl(href));
    });

    // 2) onclick 内 href 直書き or playlogDetail('idx')
    $$('[onclick]').forEach(el=>{
      const s = el.getAttribute("onclick") || "";
      let m = s.match(/['"](\/maimai-mobile\/record\/playlogDetail\/\?idx=[^'"]+)['"]/);
      if (m){ cnt.onclickHref++; found.push(fullUrl(m[1])); return; }
      m = s.match(/playlogDetail\((['"])([^'"]+)\1\)/);
      if (m){ cnt.onclickIdx++; found.push(fullUrl('/maimai-mobile/record/playlogDetail/?idx='+encodeURIComponent(m[2]))); }
    });

    // 3) form + hidden idx
    $$('form[action*="/maimai-mobile/record/playlogDetail"]').forEach(f=>{
      const idx = (f.querySelector('input[name="idx"]')||{}).value;
      if (!idx) return;
      const act = f.getAttribute('action') || '/maimai-mobile/record/playlogDetail/';
      const url = act + (act.includes('?') ? '&' : '?') + 'idx=' + encodeURIComponent(idx);
      cnt.form++; found.push(fullUrl(url));
    });

    // 4) data-idx
    $$('[data-idx]').forEach(el=>{
      const idx = el.getAttribute('data-idx'); if(!idx) return;
      cnt.data++; found.push(fullUrl('/maimai-mobile/record/playlogDetail/?idx='+encodeURIComponent(idx)));
    });

    // 5) HTML全文（保険）
    let html=""; try{ html = document.documentElement.outerHTML; }catch{}
    if (html){
      const reHref = /\/maimai-mobile\/record\/playlogDetail\/\?idx=[^"' <]+/g;
      const reIdx  = /playlogDetail\((['"])([^'"]+)\1\)/g;
      for (const m of html.matchAll(reHref)){ cnt.htmlHref++; found.push(fullUrl(m[0])); }
      for (const m of html.matchAll(reIdx)){  cnt.htmlIdx++;  found.push(fullUrl('/maimai-mobile/record/playlogDetail/?idx='+encodeURIComponent(m[2]))); }
    }

    return {urls: uniq(found).slice(0, MAX_ITEMS), cnt};
  }

  /* ====== 送信 ====== */
  const postOne = async (detailUrl) => {
    const res = await fetch(detailUrl, { credentials: "include" });
    if (!res.ok) throw new Error("detail fetch " + res.status);
    const html = await res.text();
    const body = JSON.stringify({ html, sourceUrl: detailUrl });
    const apiRes = await fetch(API_URL, {
      method: "POST",
      headers: {"Content-Type":"application/json","Authorization":`Bearer ${BEARER}`},
      body
    });
    if (!apiRes.ok) throw new Error("api " + apiRes.status);
    return true;
  };

  async function run(){
    if (!atRecordList()){
      msg.textContent = "履歴一覧ページで実行してください。";
      note.textContent = location.origin + "/maimai-mobile/record/";
      btnGo.textContent = "開く";
      btnGo.disabled = false;
      btnGo.onclick = ()=>{ location.href = "/maimai-mobile/record/"; };
      return;
    }

    msg.textContent = "リンクを解析中…";
    btnGo.textContent = "取得中…"; btnGo.disabled = true;
    bar.style.display = "block";

    let {urls, cnt} = extractLinksWithBreakdown();

    if (urls.length === 0){
      note.textContent = "最下部まで自動スクロールして読み込みます…";
      await autoScrollToBottom();
      ({urls, cnt} = extractLinksWithBreakdown());
    }

    if (urls.length === 0){
      msg.textContent = "履歴の詳細リンクが見つかりませんでした。";
      note.textContent =
        "一度 手動で最下部までスクロールしてから再試行してください。\n" +
        `検出内訳 a:${cnt.a} onclickHref:${cnt.onclickHref} onclickIdx:${cnt.onclickIdx} form:${cnt.form} data:${cnt.data} htmlHref:${cnt.htmlHref} htmlIdx:${cnt.htmlIdx}\n` +
        `API: ${API_URL} / Bearer: ${BEARER.slice(0,6)}…${BEARER.slice(-4)}`;
      btnGo.textContent = "再試行"; btnGo.disabled = false;
      btnGo.onclick = ()=>{ msg.textContent="再試行します…"; run(); };
      return;
    }

    const total = urls.length;
    msg.textContent = `履歴データ（${total}件）を取得・送信します。`;
    note.textContent = `API: ${API_URL} / Bearer: ${BEARER.slice(0,6)}…${BEARER.slice(-4)}`;

    let ok=0, ng=0;
    for (let i=0;i<total;i++){
      try{ await postOne(urls[i]); ok++; }catch{ ng++; }
      fill.style.width = `${Math.round(((i+1)/total)*100)}%`;
      note.textContent = `進捗: ${i+1}/${total}　成功: ${ok}　失敗: ${ng}`;
      await sleep(80);
    }

    msg.textContent = `完了: ${ok}/${total}　失敗: ${ng} 件`;
    btnBack.textContent = "戻る";
    btnGo.textContent = "結果ページへ"; btnGo.disabled = false;
    btnGo.onclick = ()=>{ window.open(RESULT_URL, "_blank"); close(); };
  }

  // 初期表示：確認→開始
  btnGo.addEventListener("click", run);
})();
