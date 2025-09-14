// loader.js  — maimai Result Client (送信ランチャー・一覧のform対応版)
(() => {
  const CLIENT_URL = 'https://kakigoori0803-prog.github.io/maimai-result-client/';
  const LS = { apiUrl:'mrc_api_url', apiTok:'mrc_api_token', summary:'mrc:lastIngestSummary' };
  const DEFAULT_API_URL = 'https://maimai-result.onrender.com/ingest';
  const DEFAULT_BEARER  = '677212069901c46a68a76e31ad8ba32a';

  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const qs = (sel,root=document)=>root.querySelector(sel);
  const qsa = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  function getApiConfig(){
    return {
      url: localStorage.getItem(LS.apiUrl) || DEFAULT_API_URL,
      token: localStorage.getItem(LS.apiTok) || DEFAULT_BEARER,
    };
  }

  function makeOverlay(){
    const wrap=document.createElement('div');
    wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
    const dlg=document.createElement('div');
    dlg.style.cssText='width:min(92vw,520px);background:#111;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:18px 18px 12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;';
    dlg.innerHTML=`
      <div style="font-weight:700;font-size:18px;margin-bottom:8px;">maimai Result Client</div>
      <div id="mrc-msg" style="opacity:.9;margin-bottom:10px;font-size:14px;">準備中…</div>
      <div style="height:8px;background:#333;border-radius:999px;overflow:hidden;margin:6px 0 12px;">
        <div id="mrc-bar" style="height:100%;width:0;background:#24d1b5;transition:width .15s;"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="mrc-go" style="display:none;padding:8px 10px;border-radius:8px;border:0;background:#1f6feb;color:#fff">結果ページへ</button>
        <button id="mrc-close" style="padding:8px 10px;border-radius:8px;border:0;background:#444;color:#fff">閉じる</button>
      </div>`;
    wrap.appendChild(dlg); document.body.appendChild(wrap);
    return {
      wrap,
      setMsg:(t)=> qs('#mrc-msg',dlg).textContent=t,
      setBar:(p)=> qs('#mrc-bar',dlg).style.width=`${Math.max(0,Math.min(100,p))}%`,
      showGoto:(url)=>{const b=qs('#mrc-go',dlg); b.style.display='inline-block'; b.onclick=()=>location.href=url;},
      onClose:(fn)=> qs('#mrc-close',dlg).onclick=fn||(()=>wrap.remove()),
    };
  }

  // ★ ここを強化：aタグだけでなく form(action=.../playlogDetail/) と hidden idx も見る
  function collectDetailLinksFromRecordList(root=document){
    const set = new Set();

    // aタグ
    qsa('a[href*="/maimai-mobile/record/playlogDetail/"]', root).forEach(a=>{
      const u=new URL(a.getAttribute('href'), location.href);
      set.add(u.href);
    });

    // form + hidden idx
    qsa('form[action*="/maimai-mobile/record/playlogDetail/"]', root).forEach(f=>{
      try{
        const act=new URL(f.getAttribute('action'), location.href);
        // idx の取り方いろいろ
        const idxInput = f.querySelector('input[name="idx"]');
        let idx = idxInput && idxInput.value;
        if(!idx){
          const sub = f.querySelector('[data-idx],input[type="hidden"][name="IDX"],button,input[type="submit"]');
          idx = (sub && (sub.getAttribute('data-idx') || sub.value)) || '';
        }
        if(idx){
          const u=new URL(act, location.href);
          u.searchParams.set('idx', idx);
          set.add(u.href);
        }
      }catch(_){}
    });

    // onclick=... に埋まってる場合
    qsa('[onclick*="playlogDetail"]', root).forEach(el=>{
      const m=(el.getAttribute('onclick')||'').match(/playlogDetail\/\?idx=([^"'&]+)/);
      if(m){
        const u=new URL('/maimai-mobile/record/playlogDetail/?idx='+m[1], location.origin);
        set.add(u.href);
      }
    });

    // 安全のため最大50件
    return Array.from(set).slice(0,50);
  }

  async function fetchHtml(url){
    const res=await fetch(url,{credentials:'include'});
    if(!res.ok) throw new Error(`GET ${res.status}`);
    return await res.text();
  }
  async function postToApi(api,token,payload){
    const res=await fetch(api,{
      method:'POST',mode:'cors',
      headers:{'content-type':'application/json',...(token?{'authorization':`Bearer ${token}`}:{})},
      body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(`API ${res.status}`);
    return await res.json().catch(()=>({}));
  }
  function finalizeAndMaybeGo({ok,fail,total}){
    try{ localStorage.setItem(LS.summary, JSON.stringify({ok,fail,total,ts:Date.now()})); }catch(_){}
    const to = `${CLIENT_URL}?done=1`;
    if(fail===0 && ok>0){ setTimeout(()=>location.href=to,1500); return {auto:true,url:to}; }
    return {auto:false,url:to};
  }

  (async ()=>{
    const overlay=makeOverlay(); overlay.onClose(()=>overlay.wrap.remove());
    const {url:API_URL, token:TOKEN}=getApiConfig();

    const here=location.href;
    const isDetail=/\/maimai-mobile\/record\/playlogDetail\//.test(here);
    const isRecord=/\/maimai-mobile\/record\//.test(here);

    let targets=[];
    if(isDetail){
      targets=[here];
    }else if(isRecord){
      targets=collectDetailLinksFromRecordList();
      if(!targets.length){
        alert('詳細へのリンクが見つかりませんでした。履歴一覧で実行してください。');
        overlay.wrap.remove(); return;
      }
      const okRun=confirm(`履歴データ（${targets.length}件）を取得して送信します。\nサーバー状況により少し時間がかかることがあります。実行しますか？`);
      if(!okRun){ overlay.wrap.remove(); return; }
    }else{
      alert('このページでは実行できません。履歴一覧または詳細ページで実行してください。');
      overlay.wrap.remove(); return;
    }

    const total=targets.length; let ok=0,fail=0,done=0;
    overlay.setMsg(`開始します… 0/${total}`); overlay.setBar(1);

    for(const link of targets){
      try{
        overlay.setMsg(`取得中… ${done}/${total}`);
        const html = (isDetail && total===1) ? document.documentElement.outerHTML : await fetchHtml(link);
        overlay.setMsg(`送信中… ${done}/${total}`);
        await postToApi(API_URL, TOKEN, { html, sourceUrl: link });
        ok++;
      }catch(e){ console.log('[MRC] error:',e); fail++; }
      finally{
        done++; overlay.setMsg(`進行中… ${done}/${total}（成功: ${ok} / 失敗: ${fail}）`);
        overlay.setBar(Math.round(done/total*100)); await sleep(120);
      }
    }
    overlay.setMsg(`完了: ${ok}/${total} 件送信。失敗: ${fail} 件。`); overlay.setBar(100);
    const {auto,url}=finalizeAndMaybeGo({ok,fail,total}); if(!auto) overlay.showGoto(url);
  })();
})();
