(()=>{ "use strict";
/* ===== 設定 ===== */
const API_URL   = "https://maimai-result.onrender.com/ingest";
const BEARER    = "677212069901c46a68a76e31ad8ba32a";   // 公開用トークン
const RESULT_URL= "https://kakigoori0803-prog.github.io/maimai-result-client/";
const MAX_ITEMS = 50;                                     // 取得上限を50件に固定
const TIMEOUT_MS= 20000;

/* ===== 便利関数 ===== */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const abs = u => (new URL(u, location.href)).href;

function withTimeout(p, ms=TIMEOUT_MS){
  return Promise.race([
    p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), ms))
  ]);
}

/* ===== オーバーレイUI ===== */
const style = document.createElement("style");
style.textContent = `
#mrc-ov{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2147483647;background:rgba(0,0,0,.35)}
#mrc-box{width:min(92vw,560px);background:#101215;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45);overflow:hidden;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans JP", sans-serif}
#mrc-hd{padding:16px 18px;border-bottom:1px solid #1f2327;font-weight:700;font-size:18px}
#mrc-bd{padding:18px}
#mrc-msg{line-height:1.6;white-space:pre-line}
#mrc-pr{height:6px;background:#22282e;border-radius:4px;margin-top:14px;overflow:hidden}
#mrc-bar{height:100%;width:0%;background:#19c27e;transition:width .2s}
#mrc-ft{display:flex;gap:12px;justify-content:flex-end;padding:16px 18px;background:#0c0e11;border-top:1px solid #1f2327}
.mrc-btn{appearance:none;border:0;border-radius:10px;padding:12px 18px;font-size:16px;font-weight:600}
#mrc-cancel{background:#2d333b;color:#cdd9e5}
#mrc-go{background:#19c27e;color:#0b1220}
.mrc-btn[disabled]{opacity:.6;pointer-events:none}
`;
document.head.appendChild(style);

const ov  = document.createElement("div"); ov.id="mrc-ov";
ov.innerHTML = `
  <div id="mrc-box" role="dialog" aria-modal="true">
    <div id="mrc-hd">maimai Result Client</div>
    <div id="mrc-bd">
      <div id="mrc-msg">履歴データを取得・送信します。</div>
      <div id="mrc-pr"><div id="mrc-bar"></div></div>
    </div>
    <div id="mrc-ft">
      <button id="mrc-cancel" class="mrc-btn">戻る</button>
      <button id="mrc-go"     class="mrc-btn">開始</button>
    </div>
  </div>
`;
document.body.appendChild(ov);

const msg = $("#mrc-msg");
const bar = $("#mrc-bar");
const btnCancel = $("#mrc-cancel");
const btnGo     = $("#mrc-go");

const close = ()=>{ ov.remove(); style.remove(); };

btnCancel.addEventListener("click", close);

/* ===== リンク収集（50件固定） ===== */
function collectLinks(){
  // 画面にある playlogDetail のリンクを集める（相対→絶対化、重複除去）
  const raw = $$('a[href*="playlogDetail"]');
  let urls = [...new Set(raw.map(a => abs(a.getAttribute("href"))))];
  urls = urls.slice(0, MAX_ITEMS);          // ★ 50件に固定
  return urls;
}

/* ===== 事前チェック表示（開始前） ===== */
async function showReady(){
  // 「履歴」一覧ページでの実行を想定（/maimai-mobile/record/）
  // 一応どこでも動くようにはしておく
  // 先に一番下までスクロールしてから収集（低速端末対策）
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(400);

  let urls = collectLinks();
  const cnt = urls.length;

  if(cnt===0){
    msg.textContent = "履歴の詳細リンクが見つかりませんでした。\n一覧を下まで読み込んでから再試行してください。\n\nAPI: "+API_URL+" / Bearer: "+BEARER.slice(0,6)+"…"+BEARER.slice(-4);
    btnGo.textContent = "再試行";
    btnGo.onclick = async ()=>{ btnGo.disabled=true; await sleep(300); btnGo.disabled=false; showReady(); };
    return;
  }

  msg.textContent = `履歴データ（${cnt}件）を取得・送信します。`;
  btnGo.textContent = "開始";
  btnGo.onclick = ()=>run(urls);
}

/* ===== 送信処理 ===== */
async function postOne(html, sourceUrl){
  const body = { html, sourceUrl };
  const res  = await withTimeout(fetch(API_URL,{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+BEARER },
    body: JSON.stringify(body),
    credentials: "include",
  }));
  if(!res.ok) throw new Error("api "+res.status);
}

async function run(urls){
  const total = urls.length;
  let ok=0, ng=0;

  btnGo.disabled = true;
  btnCancel.textContent = "戻る";
  msg.textContent = `履歴データ（${total}件）を取得・送信中…`;

  for(let i=0;i<total;i++){
    const u = urls[i];
    try{
      const html = await withTimeout(fetch(u,{credentials:"include"}).then(r=>r.text()));
      await postOne(html, u);
      ok++;
    }catch(e){
      ng++;
    }
    const pct = Math.round(((i+1)/total)*100);
    bar.style.width = pct+"%";
  }

  // 完了
  msg.textContent = `完了: ${ok}/${total}　失敗: ${ng} 件`;
  btnGo.disabled  = false;
  btnGo.textContent = "結果ページへ";
  btnGo.onclick  = ()=>{ location.href = RESULT_URL; };

  // クリックが取りこぼされるケース用にフォールバックも用意
  btnCancel.onclick = close;
}

/* 初期表示 */
showReady();

})();
