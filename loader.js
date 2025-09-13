(()=>{
// ====== 設定（必要に応じて編集） ======
const API_URL  = 'https://maimai-result.onrender.com/ingest';
const TOKEN    = '677212069901c46a68a76e31ad8ba32a';          // 公開用トークン
const CLIENT_URL = 'https://kakigoori0803-prog.github.io/maimai-result-client/';
// localStorage.MAI_TOKEN があればそちらを優先します（配布時に個別差し替え不要）

// ====== ユーティリティ ======
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
let overlay;
function show(msg){
  if(!overlay){
    overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;'+
      'background:rgba(0,0,0,.8);color:#fff;padding:12px 14px;border-radius:12px;'+
      'font:14px/1.5 -apple-system,system-ui,Segoe UI,Roboto;white-space:pre-wrap;'+
      'backdrop-filter:saturate(1.1) blur(4px)';
    document.body.appendChild(overlay);
  }
  overlay.textContent = msg;
}
function done(){ if(overlay) setTimeout(()=>overlay.remove(), 2000); }

async function sendToApi(html, url){
  const res = await fetch(API_URL, {
    method: 'POST', mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (localStorage.MAI_TOKEN || TOKEN)
    },
    body: JSON.stringify({ html, sourceUrl: url })
  });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json().catch(()=>({}));
}

function collectDetailLinks(){
  const S = new Set();

  // aタグ
  document.querySelectorAll('a[href*="playlogDetail"]').forEach(a=>{
    try{ S.add(new URL(a.getAttribute('href'), location.href).href); }catch{}
  });

  // onclickにURLが埋め込み
  document.querySelectorAll('[onclick*="playlogDetail"]').forEach(el=>{
    const m = (el.getAttribute('onclick')||'').match(/['"]((?:https?:\/\/|\/)[^'"]*playlogDetail[^'"]*)['"]/);
    if(m){ try{ S.add(new URL(m[1], location.href).href); }catch{} }
  });

  // form + hidden params
  document.querySelectorAll('form[action*="playlogDetail"]').forEach(f=>{
    try{
      const act = new URL(f.getAttribute('action'), location.href);
      const qs  = new URLSearchParams(new FormData(f)).toString();
      S.add(act.href + (qs ? (act.search?'&':'?') + qs : ''));
    }catch{}
  });

  return [...S];
}

// ====== モード別処理 ======
async function runListMode(){
  const links = collectDetailLinks();
  if(!links.length){ alert('詳細リンクが見つかりませんでした。履歴一覧で実行してください。'); return; }

  const est = Math.max(Math.round(links.length*0.6),1);
  if(!confirm(`履歴データ（${links.length}件）を取得しAPIへ送信します。\n目安 ${est}秒。実行しますか？`)) return;

  let ok=0, dup=0, fail=0;

  for(let i=0;i<links.length;i++){
    const u = links[i];
    show(`取得中 ${i+1}/${links.length}\n${u}`);
    try{
      const r = await fetch(u,{ credentials:'include' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const html = await r.text();

      show(`送信中 ${i+1}/${links.length}`);
      const j = await sendToApi(html, u);
      if(j && j.inserted===1){ ok++; } else { dup++; }
    }catch(e){
      fail++;
      console.warn('fail', u, e);
    }
    await sleep(120); // サーバ負荷/ブロック回避のため少し待つ
  }

  show(`完了：取り込み ${ok}／重複(推定) ${dup}／失敗 ${fail}`);
  done();
}

async function runDetailMode(){
  show('この1件を送信中…');
  try{
    const html = document.documentElement.outerHTML;
    const j = await sendToApi(html, location.href);
    show(`送信完了：${j.inserted===1?'新規1件':'重複/更新なし'}`);
  }catch(e){
    alert('送信失敗: '+e.message);
  }
  done();
}

function runHomeMode(){
  // 必要ならクライアントを開く／案内表示
  window.open(CLIENT_URL, '_blank');
  alert('クライアントを別タブで開きました。\n履歴一覧で実行すると一括送信します。');
}

// ====== ルーター ======
try{
  const p = location.pathname;
  if (/\/maimai-mobile\/record\/playlogDetail\//.test(p))      runDetailMode();
  else if (/\/maimai-mobile\/record\/?/.test(p))                runListMode();
  else if (/\/maimai-mobile\/?/.test(p))                        runHomeMode();
  else alert('maimai のページで実行してください。');
}catch(e){
  alert('Error: '+(e&&e.message?e.message:e));
  done();
}
})();
