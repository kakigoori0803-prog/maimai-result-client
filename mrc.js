(() => {
  // ====== 設定の既定値（localStorage で上書き可） ======
  const DEFAULT_API   = 'https://maimai-result.onrender.com/ingest';
  const DEFAULT_TOKEN = '677212069901c46a68a76e31ad8ba32a';
  const RESULT_URL    = 'https://kakigoori0803-prog.github.io/maimai-result-client/';

  const API_URL = (localStorage.getItem('mrc.apiUrl') || DEFAULT_API).trim();
  const TOKEN   = (localStorage.getItem('mrc.token')  || DEFAULT_TOKEN).trim();

  // ====== 小物 ======
  const $  = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  const css = `
#mrc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center}
#mrc-md{width:min(520px,92vw);background:#0f1418;color:#e8f1f6;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
#mrc-hd{padding:14px 16px 10px;font-weight:700;font-size:18px;border-bottom:1px solid #1f2a33}
#mrc-msg{padding:14px 16px 6px;font-size:14px;line-height:1.6;color:#cfe1eb}
#mrc-bar{height:6px;background:#1b2630;margin:8px 16px 0;border-radius:999px;overflow:hidden}
#mrc-bar>i{display:block;height:100%;width:0;background:#1dd1b9;transition:width .25s}
#mrc-fo{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px 16px}
.mrc-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font-weight:700}
.mrc-gray{background:#2b3742;color:#d7e6ef}
.mrc-green{background:#1dd1b9;color:#00332c}
.mrc-small{opacity:.85;font-size:12px;margin:2px 16px 10px}
  `.replace(/\n/g,'');

  function addStyle(){
    if($('#mrc-style')) return;
    const st=document.createElement('style'); st.id='mrc-style'; st.textContent=css; document.head.appendChild(st);
  }

  function mk(tag,attrs={},html=''){
    const el=document.createElement(tag);
    for(const k in attrs){ el.setAttribute(k,attrs[k]); }
    if(html) el.innerHTML=html;
    return el;
  }

  function openUI(){
    addStyle();
    const ov=mk('div',{id:'mrc-ov',role:'dialog','aria-modal':'true'});
    const md=mk('div',{id:'mrc-md'});
    md.innerHTML = `
      <div id="mrc-hd">maimai Result Client</div>
      <div id="mrc-msg"></div>
      <div id="mrc-bar"><i id="mrc-bar-i"></i></div>
      <div class="mrc-small" id="mrc-sub"></div>
      <div id="mrc-fo">
        <button id="mrc-back" class="mrc-btn mrc-gray">戻る</button>
        <button id="mrc-go"   class="mrc-btn mrc-green">開始</button>
      </div>`;
    ov.appendChild(md);
    document.body.appendChild(ov);
    $('#mrc-back').onclick = closeUI;
  }
  function closeUI(){ const ov=$('#mrc-ov'); if(ov) ov.remove(); }

  function setMsg(html){ $('#mrc-msg').innerHTML = html; }
  function setSub(html){ $('#mrc-sub').innerHTML = html||''; }
  function setBar(p){ $('#mrc-bar-i').style.width = Math.max(0,Math.min(100,p))+'%'; }
  function setButtons(backLbl, goLbl, goHandler, goDisabled=false){
    const b=$('#mrc-back'), g=$('#mrc-go');
    b.textContent = backLbl||'戻る';
    g.textContent = goLbl||'開始';
    g.onclick = goHandler||null;
    g.disabled = !!goDisabled;
  }

  // ====== 詳細URL収集：自動スクロール + href/onclick 両対応 ======
  async function collectDetailUrls(){
    // 自動スクロールで遅延ロードを完了させる
    let last = 0, tries = 0;
    while(document.body.scrollHeight > last && tries < 12){
      last = document.body.scrollHeight;
      window.scrollTo(0, last);
      await new Promise(r=>setTimeout(r, 600)); // 読み込み待ち
      tries++;
    }
    // href から
    const set = new Set();
    $$('a[href*="/maimai-mobile/record/playlogDetail/"]').forEach(a=>{
      try{ set.add(new URL(a.getAttribute('href'), location.href).href); }catch{}
    });
    // onclick から
    $$('[onclick*="/maimai-mobile/record/playlogDetail/"]').forEach(el=>{
      const m=String(el.getAttribute('onclick')).match(/['"](\/maimai-mobile\/record\/playlogDetail\/\?[^'"]+)['"]/);
      if(m){ try{ set.add(new URL(m[1], location.href).href); }catch{} }
    });
    // 直近50件（多すぎると時間がかかるので上限をつける）
    return Array.from(set).slice(0,50);
  }

  // ====== 送信（1件ずつ順次） ======
  async function postOne(url, html){
    const payload = { url, html, ts: Date.now() };
    const res = await fetch(API_URL,{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': 'Bearer '+TOKEN },
      body: JSON.stringify(payload),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return res;
  }

  // ====== 実行本体 ======
  async function main(){
    // ページ判定
    const onRecord = /\/maimai-mobile\/record\//.test(location.pathname);
    openUI();
    if(!onRecord){
      setMsg('このブックマークレットは <b>履歴一覧</b>（/maimai-mobile/record/）で実行してください。');
      setButtons('閉じる','履歴へ移動',()=>{ location.href = '/maimai-mobile/record/'; });
      setBar(0); setSub('');
      return;
    }

    // 事前画面
    setMsg('履歴データを取得・送信します。<br>よろしければ「開始」をタップしてください。');
    setSub(`API: ${API_URL} / Bearer: ${TOKEN.slice(0,6)}…${TOKEN.slice(-4)}`);
    setBar(0);
    setButtons('戻る','開始', start);

    async function start(){
      // 実行中UI
      setMsg('履歴データを取得・送信中…');
      setButtons('戻る','取得中', null, true);

      // 自動スクロール＋リンク収集
      const urls = await collectDetailUrls();
      if(!urls.length){
        setMsg('履歴の詳細リンクが見つかりませんでした。<br>一覧を下まで読み込んでから再実行してください。');
        setButtons('閉じる','再試行', start, false);
        setBar(0);
        return;
      }

      let ok=0, ng=0;
      for(let i=0;i<urls.length;i++){
        const u = urls[i];
        setSub(`進捗: ${i}/${urls.length}　送信成功: ${ok}　失敗: ${ng}`);
        setBar((i/urls.length)*100);

        try{
          const res = await fetch(u,{credentials:'include'});
          const html = await res.text();
          await postOne(u, html);
          ok++;
        }catch(e){ ng++; }
      }
      setBar(100);
      setMsg(`完了: ${ok}/${urls.length} 件送信。失敗: ${ng} 件。`);
      setButtons('戻る','結果ページへ', ()=>{ location.href = RESULT_URL; }, false);
      setSub('');
    }
  }

  try{ main(); }catch(e){ alert('Bookmarklet error: '+(e&&e.message?e.message:e)); }
})();
