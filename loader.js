// ---- maimai Result Client loader.js ----
// 設定（必要ならindex側と同じURL/TOKENに調整）
const CFG_API   = 'https://maimai-result.onrender.com/ingest';
const CFG_TOKEN = '677212069901c46a68a76e31ad8ba32a';
const RESULT_URL = 'https://kakigoori0803-prog.github.io/maimai-result-client/';

// 小さめUUID（Safariでも安定）
function makeUID(){
  return 'u'+Math.random().toString(16).slice(2)+Date.now().toString(16);
}
const USER_ID = localStorage.getItem('mrc_uid') || (()=>{
  const u = makeUID(); localStorage.setItem('mrc_uid', u); return u;
})();

// UI
function el(t,css,txt){const e=document.createElement(t); if(css) e.style.cssText=css; if(txt!=null) e.textContent=txt; return e;}
function makeModal(){
  const ov = el('div','position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);z-index:2147483647;display:flex;align-items:center;justify-content:center');
  const box = el('div','width:min(560px,90vw);background:#0f1014;color:#e9fffb;border:1px solid #26303a;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.45);padding:16px');
  const title = el('div','font-weight:800;font-size:18px;margin-bottom:6px','maimai Result Client');
  const msg = el('div','font-size:14px;line-height:1.6;margin-bottom:8px','初期化中…');
  const bar = el('div','height:8px;background:#1c2229;border-radius:99px;overflow:hidden;margin:10px 0 6px');
  const cur = el('div','height:100%;width:0;background:#1dd3b0;transition:width .15s');
  bar.appendChild(cur);
  const sub = el('div','color:#9fb0ba;font-size:13px;margin-bottom:12px','');
  const btns = el('div','display:flex;gap:8px;justify-content:flex-end');
  const back = el('button','padding:10px 14px;border-radius:12px;border:none;background:#2b2f36;color:#e7ecef;font-weight:700','戻る');
  const go   = el('button','padding:10px 14px;border-radius:12px;border:none;background:#1dd3b0;color:#062a28;font-weight:900','結果ページへ');
  go.disabled = true; go.style.opacity=.6;
  btns.appendChild(back); btns.appendChild(go);
  [title,msg,bar,sub,btns].forEach(x=>box.appendChild(x)); ov.appendChild(box); document.body.appendChild(ov);
  back.onclick = ()=> ov.remove();
  return {ov,msg,cur,sub,go};
}
function abs(u){ try{ return new URL(u,location.href).href }catch(_){ return u } }
function qsa(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)) }
function uniq(a){ return Array.from(new Set(a)) }

// 取得ロジック（フォーム/属性/生HTML 全部なめる）
function findFromForms(){
  const out=[];
  qsa("form[action*='playlogDetail']").forEach(f=>{
    const act=f.getAttribute('action')||'';
    const idx=(f.querySelector("[name=idx]")||{}).value;
    if(idx){
      out.push(abs(act+(act.includes('?')?'&':'?')+'idx='+encodeURIComponent(idx)));
    }
  });
  return out;
}
function findFromAttrs(){
  const out=[];
  const re=/playlogDetail[^'"]*/i;
  qsa('[href],[onclick],[formaction]').forEach(e=>{
    ['href','onclick','formaction'].forEach(a=>{
      const v=e.getAttribute(a); if(!v) return;
      const m=String(v).match(/['"]([^'"]*playlogDetail[^'"]*)['"]/i);
      if(m) out.push(abs(m[1]));
      else if(re.test(v)) out.push(abs(v));
    });
  });
  return out;
}
function findFromHTML(){
  const html=document.documentElement.innerHTML;
  const m1 = html.match(/\/maimai-mobile\/record\/playlogDetail\/\?[^"'<> )]+/g)||[];
  // form action + hidden idx を正規表現で拾う
  const m2=[];
  const re2=/action=["']\/maimai-mobile\/record\/playlogDetail\/["'][\s\S]*?name=["']idx["'][^>]*value=["']([^"']+)["']/g;
  let mm; while((mm=re2.exec(html))!==null){ m2.push('/maimai-mobile/record/playlogDetail/?idx='+encodeURIComponent(mm[1])) }
  return m1.concat(m2).map(u=>abs(u));
}
function findDetails(){
  return uniq([].concat(findFromForms(),findFromAttrs(),findFromHTML()))
    .filter(u=>/playlogDetail/.test(u)).slice(0,50);
}

// ネットワーク
function fetchText(url){
  return fetch(url,{credentials:'include'}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); });
}
function sendOne(payload){
  return fetch(CFG_API,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+CFG_TOKEN,
      'X-User-ID': USER_ID
    },
    body: JSON.stringify(payload)
  }).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json().catch(()=>({})) });
}

// 実行本体
(function run(){
  // 画面判定
  const onDetail = /playlogDetail/.test(location.href);
  const onList   = /\/maimai-mobile\/record\//.test(location.pathname);

  // UI
  const ui = makeModal();

  // URL集め
  let urls=[];
  if(onDetail){ urls=[location.href]; }
  else if(onList){ urls=findDetails(); }
  else { alert('履歴一覧 または 詳細ページで実行してください'); ui.ov.remove(); return; }

  if(urls.length===0){
    alert('履歴の詳細リンクが見つかりませんでした。履歴一覧で実行してください');
    ui.ov.remove(); return;
  }

  const n = urls.length;
  ui.msg.textContent = '履歴データ（'+n+'件）を取得・送信します';
  ui.sub.textContent = '進捗: 0/'+n;

  let ok=0, ng=0, i=0;
  const CONCURRENCY = 3;

  function step(){
    if(i>=n) return;
    const k = i++;
    const url = urls[k];

    Promise.resolve()
      .then(()=> onDetail ? Promise.resolve(document.documentElement.outerHTML) : fetchText(url))
      .then(html => sendOne({html, sourceUrl: url}))
      .then(()=> ok++)
      .catch(()=> ng++)
      .finally(()=>{
        ui.cur.style.width = (Math.floor((ok+ng)/n*1000)/10)+'%';
        ui.sub.textContent = '進捗: '+(ok+ng)+'/'+n+'　成功:'+ok+' 失敗:'+ng;
        if(ok+ng < n) step();
        else {
          ui.msg.textContent = '完了: '+ok+'/'+n+' 件送信。 失敗: '+ng+' 件。';
          if(!ng) ui.sub.textContent += '　🎉';
          ui.go.disabled=false; ui.go.style.opacity=1;
          ui.go.onclick = ()=> { location.href = RESULT_URL+'#sent='+ok+'&fail='+ng+'&total='+n; };
        }
      });
  }
  for(let c=0;c<CONCURRENCY;c++) step();
})();
