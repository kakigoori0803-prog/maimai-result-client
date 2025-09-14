(()=>{
// ---------- 設定 ----------
const DEFAULT_API='https://maimai-result.onrender.com/ingest';
const DEFAULT_TOKEN='677212069901c46a68a76e31ad8ba32a';
const RESULT_URL='https://kakigoori0803-prog.github.io/maimai-result-client/';
const API_URL=(localStorage.getItem('mrc.apiUrl')||DEFAULT_API).trim();
const TOKEN=(localStorage.getItem('mrc.token')||DEFAULT_TOKEN).trim();

// ---------- util ----------
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const css=`
#mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center}
#mrc-md{width:min(520px,92vw);background:#0f1418;color:#e8f1f6;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
#mrc-hd{padding:14px 16px 10px;font-weight:700;font-size:18px;border-bottom:1px solid #1f2a33}
#mrc-msg{padding:14px 16px 6px;font-size:14px;line-height:1.6;color:#cfe1eb}
#mrc-bar{height:6px;background:#1b2630;margin:8px 16px 0;border-radius:999px;overflow:hidden}
#mrc-bar>i{display:block;height:100%;width:0;background:#1dd1b9;transition:width .25s}
#mrc-fo{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px 16px}
.mrc-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font-weight:700}
.mrc-gray{background:#2b3742;color:#d7e6ef}.mrc-green{background:#1dd1b9;color:#00332c}
.mrc-small{opacity:.85;font-size:12px;margin:2px 16px 10px}
`;
function ensureStyle(){if($('#mrc-style'))return;const s=document.createElement('style');s.id='mrc-style';s.textContent=css;document.head.appendChild(s)}
function mk(t,a={},h=''){const e=document.createElement(t);for(const k in a)e.setAttribute(k,a[k]);if(h)e.innerHTML=h;return e}
function openUI(){ensureStyle();const ov=mk('div',{id:'mrc-ov',role:'dialog','aria-modal':'true'});const md=mk('div',{id:'mrc-md'});
 md.innerHTML=`<div id="mrc-hd">maimai Result Client</div>
 <div id="mrc-msg"></div><div id="mrc-bar"><i id="mrc-bar-i"></i></div>
 <div class="mrc-small" id="mrc-sub"></div>
 <div id="mrc-fo"><button id="mrc-back" class="mrc-btn mrc-gray">戻る</button>
 <button id="mrc-go" class="mrc-btn mrc-green">開始</button></div>`;
 ov.appendChild(md);document.body.appendChild(ov);$('#mrc-back').onclick=closeUI;}
function closeUI(){const ov=$('#mrc-ov');if(ov)ov.remove()}
function setMsg(h){$('#mrc-msg').innerHTML=h}
function setSub(h){$('#mrc-sub').innerHTML=h||''}
function setBar(p){$('#mrc-bar-i').style.width=Math.max(0,Math.min(100,p))+'%'}
function setBtns(bl,gl,fn,dis=false){const b=$('#mrc-back'),g=$('#mrc-go');b.textContent=bl||'戻る';g.textContent=gl||'開始';g.onclick=fn||null;g.disabled=!!dis}

// ---------- 自動スクロール ----------
async function loadAllList(){
  let prev=0, stable=0;
  for(let i=0;i<50;i++){
    window.scrollTo(0,document.body.scrollHeight);
    // 「さらに/もっと」系のボタンがあれば叩く
    const more = $$('a,button').find(el=>/さらに|もっと|読み込/i.test(el.textContent||''));
    if(more){ try{ more.click(); }catch{} }
    await wait(800);
    const h=document.body.scrollHeight;
    if(h===prev){ stable++; if(stable>=2) break; } else { stable=0; prev=h; }
  }
}

// ---------- 詳細URL収集 ----------
function collectDetailUrlsFromDOM(){
  const set=new Set();

  // a[href] 直リンク
  $$('a[href*="/maimai-mobile/record/playlogDetail/"],a[href*="playlogDetail/"]').forEach(a=>{
    const raw=a.getAttribute('href')||'';
    addUrl(set,raw);
  });

  // onclick に埋め込み
  $$('[onclick]').forEach(el=>{
    const s=String(el.getAttribute('onclick')||'');
    const m=s.match(/['"]((?:\.?\/)?maimai-mobile\/record\/playlogDetail\/\?[^'"]+)['"]/)
          ||s.match(/['"]((?:\.?\/)?playlogDetail\/\?[^'"]+)['"]/)
          ||s.match(/location\.href\s*=\s*['"]([^'"]*playlogDetail\/\?[^'"]+)['"]/);
    if(m) addUrl(set,m[1]);
  });

  // data-* に埋め込み
  $$('[data-href],[data-url]').forEach(el=>{
    const raw=el.getAttribute('data-href')||el.getAttribute('data-url');
    if(raw && /playlogDetail/.test(raw)) addUrl(set,raw);
  });

  return Array.from(set);
}

function collectDetailUrlsFromHTML(){
  const set=new Set();
  const html=document.documentElement.innerHTML;

  // 1) そのままの相対/絶対パス
  const re1=/((?:https?:\/\/[^"'<>]+)?\/?maimai-mobile\/record\/playlogDetail\/\?[^"'<> \t\n\r]+)/g;
  let m; while((m=re1.exec(html))){ addUrl(set,m[1]); }

  // 2) ./playlogDetail/?idx=... など
  const re2=/(['"])(?:\.?\/)?playlogDetail\/\?([^"'<> ]+)\1/g;
  while((m=re2.exec(html))){ addUrl(set,'/maimai-mobile/record/playlogDetail/?'+m[2]); }

  // 3) idx=xxx%2Cyyy だけ見つかった場合の組み立て
  const re3=/idx=([0-9]+%2C[0-9]+)/g;
  while((m=re3.exec(html))){ addUrl(set,'/maimai-mobile/record/playlogDetail/?idx='+m[1]); }

  return Array.from(set);
}

function addUrl(set,raw){
  try{
    const abs = raw.startsWith('http') ? raw :
      new URL(raw.replace(/^\.\//,'').startsWith('playlogDetail')
                 ? '/maimai-mobile/record/'+raw.replace(/^\.\//,'')
                 : raw, location.href).href;
    if(/playlogDetail/.test(abs)) set.add(abs);
  }catch{}
}

// ---------- 送信 ----------
async function postOne(url,html){
  const body={url,html,ts:Date.now()};
  const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},body:JSON.stringify(body)});
  if(!res.ok) throw new Error('HTTP '+res.status);
}

// ---------- メイン ----------
async function main(){
  const onRecord=/\/maimai-mobile\/record\/?/.test(location.pathname);
  openUI();

  if(!onRecord){
    setMsg('このブックマークレットは <b>履歴一覧</b>（/maimai-mobile/record/）で実行してください。');
    setBtns('閉じる','履歴へ移動',()=>{location.href='/maimai-mobile/record/';});
    setBar(0);setSub(''); return;
  }

  // 実行前の確認
  setMsg('履歴データを取得・送信します。準備ができたら「開始」。');
  setSub(`API: ${API_URL} / Bearer: ${TOKEN.slice(0,6)}…${TOKEN.slice(-4)}`);
  setBar(0); setBtns('戻る','開始',start);

  async function start(){
    setMsg('一覧を読み込み中…'); setBtns('戻る','取得中',null,true);
    await loadAllList();

    let urls = collectDetailUrlsFromDOM();
    if(!urls.length) urls = collectDetailUrlsFromHTML();
    urls = urls.slice(0,50);

    if(!urls.length){
      setMsg('履歴の詳細リンクが見つかりませんでした。<br>一度最下部までスクロール後、もう一度お試しください。');
      setSub(`API: ${API_URL} / Bearer: ${TOKEN.slice(0,6)}…${TOKEN.slice(-4)}`);
      setBar(0); setBtns('閉じる','再試行',start,false);
      return;
    }

    setMsg('履歴データを取得・送信中…');
    let ok=0, ng=0;
    for(let i=0;i<urls.length;i++){
      setBar((i/urls.length)*100);
      setSub(`進捗: ${i}/${urls.length}　成功:${ok}　失敗:${ng}`);
      try{
        const res=await fetch(urls[i],{credentials:'include'});
        const html=await res.text();
        await postOne(urls[i],html);
        ok++;
      }catch(e){ ng++; }
    }
    setBar(100); setSub('');
    setMsg(`完了: ${ok}/${urls.length} 件送信。失敗: ${ng} 件。`);
    setBtns('戻る','結果ページへ',()=>{ location.href=RESULT_URL; },false);
  }
}

try{ main(); }catch(e){ alert('Bookmarklet error: '+(e&&e.message?e.message:e)); }
})();
