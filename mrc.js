/* mrc.js — auto register + auto scroll + strong link finder (form対応) + fetch detail */
(() => {
  const API_BASE = "https://maimai-result.onrender.com";
  const REGISTER = API_BASE + "/register";
  const VIEW     = API_BASE + "/view";

  const LS = { api:"MRC_API_URL", token:"MRC_TOKEN", uid:"MRC_USER_ID" };
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uuid  = () => (crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==="x"?r:(r&0x3|0x8);return v.toString(16);
  }));

  // ---------- UI ----------
  const ov=document.createElement("div"), css=document.createElement("style");
  ov.id="mrc-ov"; css.textContent=`
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
`; document.head.appendChild(css);
  const open=(body,btns=[])=>{ov.innerHTML=`
  <div class="mrc-card"><div class="mrc-h">maimai Result Client</div>
  <div class="mrc-b">${body}</div>
  <div class="mrc-row">${btns.map((b,i)=>`<button class="mrc-btn ${b.cls||'gray'}" data-i="${i}">${b.label}</button>`).join("")}</div>
  </div>`; document.body.appendChild(ov);
    ov.onclick=e=>{const i=e.target?.dataset?.i; if(i!=null) btns[+i].onClick?.();};};
  const close=()=>ov.remove();

  // ---------- server warmup & register ----------
  async function waitAlive(){for(let i=0;i<25;i++){try{const r=await fetch(API_BASE+"/health",{cache:"no-store"});if(r.ok)break;}catch{} await sleep(i<10?1200:2500);}}
  async function getOrRegister(){
    let api=localStorage.getItem(LS.api), token=localStorage.getItem(LS.token), uid=localStorage.getItem(LS.uid);
    if(api&&token&&uid) return {api,token,uid};
    await waitAlive(); uid=uid||uuid();
    const res=await fetch(REGISTER,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user_id:uid,ua:navigator.userAgent,platform:navigator.platform||""})});
    if(!res.ok) throw new Error("register failed: "+(await res.text()));
    const j=await res.json().catch(()=>({}));
    const _token=j.token ?? j.bearer; let _api=j.api_url ?? j.ingest_url ?? "/ingest";
    if(!_token) throw new Error("register invalid response"); if(!_api.startsWith("http")) _api=API_BASE+_api;
    api=_api; token=_token; uid=j.user_id||uid;
    localStorage.setItem(LS.api,api); localStorage.setItem(LS.token,token); localStorage.setItem(LS.uid,uid);
    return {api,token,uid};
  }

  // ---------- auto scroll ----------
  async function autoScroll(){
    let last=-1, same=0;
    for(let i=0;i<40;i++){ window.scrollTo(0,document.body.scrollHeight); await sleep(650);
      const h=document.body.scrollHeight; if(h===last){ if(++same>=2) break; } else { same=0; last=h; }}
  }

  // ---------- link collector (a/onclick/form + HTML fallback) ----------
  function collectLinks(){
    const set=new Set();

    // a[href*="playlogDetail"]
    document.querySelectorAll('a[href]').forEach(a=>{
      const href=a.getAttribute("href")||"";
      if(/playlogDetail/.test(href)){ try{ set.add(new URL(href,location.href).toString()); }catch{} }
    });

    // [onclick*="playlogDetail('...')"]
    document.querySelectorAll('[onclick]').forEach(el=>{
      const s=String(el.getAttribute('onclick')||'');
      const m=s.match(/playlogDetail\(['"]([^'"]+)['"]/);
      if(m){ try{ set.add(new URL(m[1],location.href).toString()); }catch{} }
    });

    // form[action*="playlogDetail"] + hidden idx
    document.querySelectorAll('form[action*="playlogDetail"]').forEach(f=>{
      const action=f.getAttribute('action')||'';
      const idxEl = f.querySelector('input[name="idx"]') || f.querySelector('input[name="idx[]"]') ||
                    f.querySelector('input[name="IDX"]') || f.querySelector('input[name="index"]');
      const url = new URL(action, location.href);
      if(idxEl && idxEl.value!=null){ url.searchParams.set('idx', idxEl.value); set.add(url.toString()); }
      else { set.add(url.toString()); }
    });

    // フォールバック：生HTMLから抽出
    const html=document.documentElement.innerHTML;
    const re=/["'](\/[^"' >]*playlogDetail[^"' >]*)["']/g; let m;
    while((m=re.exec(html)) && set.size<50){ try{ set.add(new URL(m[1],location.href).toString()); }catch{} }

    return Array.from(set).slice(0,50);
  }

  // ---------- fetch detail & ingest ----------
  async function fetchDetailHtml(url){
    const r=await fetch(url,{credentials:'include',cache:'no-store'});
    if(!r.ok) return null;
    return await r.text();
  }
  async function postOne(api, token, url){
    const html=await fetchDetailHtml(url);
    if(!html) return false;
    const res=await fetch(api,{method:"POST",headers:{
      "Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({url, html})});
    return res.ok;
  }

  // ---------- main ----------
  (async ()=>{
    let env;
    try{ env=await getOrRegister(); }
    catch(e){ open(`初期設定の自動取得に失敗しました（/register NG）<br><small>${String(e)}</small>`,[{label:"閉じる",cls:"gray",onClick:close}]); return; }

    open(`履歴データを取得・送信します。`,[
      {label:"やめる",cls:"gray",onClick:close},
      {label:"開始",cls:"green",onClick:async()=>{
        await autoScroll();
        const urls=collectLinks();
        if(!urls.length){
          open(`履歴の詳細リンクが見つかりませんでした。<br>画面を一番下まで表示してから再実行してください。`,[
            {label:"閉じる",cls:"gray",onClick:close},
            {label:"結果ページへ",cls:"green",onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
          ]); return;
        }
        const bar=document.createElement("div"); bar.className="mrc-bar";
        open(`履歴データ（最大50件）を送信中…<div class="mrc-p"><div class="mrc-bar" id="mrc-bar"></div></div>`,[
          {label:"閉じる",cls:"gray",onClick:close},
          {label:"結果ページへ",cls:"green",onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
        $("#mrc-bar")?.replaceWith(bar);

        let ok=0, ng=0;
        for(let i=0;i<urls.length;i++){
          try{ (await postOne(env.api, env.token, urls[i])) ? ok++ : ng++; }
          catch{ ng++; }
          bar.style.width = Math.round(((i+1)/urls.length)*100) + "%";
          await sleep(120); // サーバ負荷/UI用の少し待ち
        }

        open(`完了：<b>${ok}/${urls.length}</b>　失敗：${ng} 件`,[
          {label:"閉じる",cls:"gray",onClick:close},
          {label:"結果ページへ",cls:"green",onClick:()=>location.href=`${VIEW}?user_id=${localStorage.getItem(LS.uid)}`}
        ]);
      }}]);
  })();
})();
