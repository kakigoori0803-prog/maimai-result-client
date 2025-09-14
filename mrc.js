(()=>{"use strict";
/* ========= 基本設定（localStorageに無ければ対話で設定） ========= */
const getCfg=()=>({
  api:(localStorage.mrc_api||"https://maimai-result.onrender.com/ingest").replace(/\/+$/,""),
  token:(localStorage.mrc_token||"").trim(),
  uid:(localStorage.mrc_uid||(localStorage.mrc_uid=(self.crypto?.randomUUID?.()||("uid-"+Date.now()))))
});
const cfg=getCfg();
const VIEW_URL=cfg.api.replace(/\/ingest$/,"/view")+"?user_id="+encodeURIComponent(cfg.uid);

/* ========= UI（オーバーレイ） ========= */
const css=`
#_mrc_ov{position:fixed;inset:0;z-index:999999;background:rgb(0 0 0 / .55);display:flex;align-items:center;justify-content:center}
#_mrc_box{width:min(92vw,560px);background:#111827;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgb(0 0 0 /.4);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;}
#_mrc_hd{padding:14px 18px;font-weight:700;font-size:18px;border-bottom:1px solid #1f2937}
#_mrc_bd{padding:18px}
#_mrc_msg{line-height:1.6;white-space:pre-line}
#_mrc_api{margin-top:10px;font-size:12px;color:#9ca3af}
#_mrc_bar{height:8px;background:#1f2937;border-radius:999px;overflow:hidden;margin:14px 0 4px}
#_mrc_bar i{display:block;height:100%;width:0;background:#10b981;transition:width .2s}
#_mrc_ft{display:flex;gap:10px;padding:14px 18px;border-top:1px solid #1f2937}
._mrc_btn{flex:1;padding:12px 16px;border-radius:10px;border:0;font-weight:700}
._mrc_gray{background:#374151;color:#e5e7eb}
._mrc_green{background:#10b981;color:#022c22}
._mrc_btn:disabled{opacity:.6}
`;
const st=document.createElement("style"); st.textContent=css;
const ov=document.createElement("div");
ov.id="_mrc_ov"; ov.innerHTML=`
 <div id="_mrc_box">
  <div id="_mrc_hd">maimai Result Client</div>
  <div id="_mrc_bd">
    <div id="_mrc_msg"></div>
    <div id="_mrc_bar"><i></i></div>
    <div id="_mrc_api"></div>
  </div>
  <div id="_mrc_ft">
    <button id="_mrc_cancel" class="_mrc_btn _mrc_gray">戻る</button>
    <button id="_mrc_go" class="_mrc_btn _mrc_green">開始</button>
  </div>
 </div>`;
const $,set=(()=>{const $=id=>document.getElementById(id); return [$, (id,t)=>{$(id).textContent=t}];})();
const [gid, txt]= $;

const mount=()=>{document.body.appendChild(st); document.body.appendChild(ov);};
const unmount=()=>{ov.remove(); st.remove();};
const setBar=v=>{gid("_mrc_bar").firstElementChild.style.width=(Math.max(0,Math.min(1,v))*100).toFixed(1)+"%";};

const toConfirm=()=>{
  txt("_mrc_msg","履歴データを取得・送信します（最大50件）。\nページ最下部までスクロール済みだと取りこぼしが減ります。");
  setBar(0);
  txt("_mrc_api",`API: ${cfg.api} / Bearer: ${cfg.token?cfg.token.slice(0,6)+"…": "（未設定）"} / UID: ${cfg.uid.slice(0,8)}`);
  const go=gid("_mrc_go"); go.disabled=false; go.textContent="開始";
  go.onclick=start; gid("_mrc_cancel").onclick=unmount;
};
const toRetry=()=>{
  txt("_mrc_msg","履歴の詳細リンクが見つかりませんでした。\n一度「最下部までスクロール」してから『再試行』を押してください。");
  setBar(0);
  const go=gid("_mrc_go"); go.disabled=false; go.textContent="再試行";
  go.onclick=start; gid("_mrc_cancel").onclick=unmount;
};
const toRunning=(total)=>{ 
  txt("_mrc_msg",`履歴データ（${total}件）を取得・送信します。`);
  const go=gid("_mrc_go"); go.disabled=true; go.textContent="取得中…";
  gid("_mrc_cancel").onclick=unmount;
};
const toDone=(ok,total,ng)=>{
  txt("_mrc_msg",`完了：${ok}/${total}　失敗：${ng} 件 🎉`);
  setBar(1);
  const go=gid("_mrc_go"); go.disabled=false; go.textContent="結果ページへ";
  go.onclick=()=>location.href = VIEW_URL;
  gid("_mrc_cancel").onclick=unmount;
};
const needConfig=()=>{
  txt("_mrc_msg","API設定（URL / Bearer Token）が見つかりません。\n設定ページで保存してから再度お試しください。");
  const go=gid("_mrc_go"); go.disabled=false; go.textContent="設定ページを開く";
  go.onclick=()=>open("https://kakigoori0803-prog.github.io/","_blank");
  gid("_mrc_cancel").onclick=unmount;
};

/* ========= リンク抽出 ========= */
const abs=u=>new URL(u,location.origin).href;
const uniq=(arr)=>{const s=new Set(), out=[]; for(const x of arr){if(!s.has(x)){s.add(x); out.push(x);} } return out;};

function findDetailLinks(limit=50){
  const urls=[];
  // 1) a[href]
  document.querySelectorAll('a[href*="/maimai-mobile/record/playlogDetail/"],a[href*="playlogDetail("]').forEach(a=>{
    const h=a.getAttribute("href")||"";
    let m=h.match(/\/maimai-mobile\/record\/playlogDetail\/\?idx=[^"'&\s)]+/);
    if(m) urls.push(abs(m[0]));
    else{
      m=h.match(/playlogDetail\(['"]([^'"]+)['"]\)/);
      if(m) urls.push(abs(m[1]));
    }
  });
  // 2) onclick
  document.querySelectorAll('[onclick*="playlogDetail"]').forEach(el=>{
    const on=el.getAttribute("onclick")||"";
    const m=on.match(/playlogDetail\(['"]([^'"]+)['"]\)/);
    if(m) urls.push(abs(m[1]));
  });
  // 3) form[action]
  document.querySelectorAll('form[action*="/maimai-mobile/record/playlogDetail/"]').forEach(f=>{
    const a=f.getAttribute("action"); if(a) urls.push(abs(a));
  });
  // 4) HTML内文字列
  document.querySelectorAll('.music,.w_600,.w_300,.p_10,div').forEach(el=>{
    const h=el.innerHTML||""; if(h.includes("playlogDetail")){
      const m=h.match(/\/maimai-mobile\/record\/playlogDetail\/\?idx=[^"'&<)\s]+/g);
      if(m) m.forEach(u=>urls.push(abs(u)));
    }
  });
  return uniq(urls).slice(0,limit);
}

/* ========= 実行本体 ========= */
async function start(){
  // 設定チェック
  if(!cfg.api || !cfg.api.endsWith("/ingest") || !cfg.token){ return needConfig(); }

  // 自動で一度だけ最下部へスクロール（遅延読み込み対策）
  window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
  await new Promise(r=>setTimeout(r,400));

  const urls=findDetailLinks(50);
  if(!urls.length){ return toRetry(); }

  toRunning(urls.length);

  let ok=0, ng=0, i=0;
  for(const url of urls){
    try{
      // 1) 詳細HTML取得（クッキー送信）
      const res=await fetch(url,{credentials:"include"});
      if(!res.ok) throw new Error("detail "+res.status);
      const html=await res.text();

      // 2) APIへ送信
      const body=JSON.stringify({user_id:cfg.uid, url, html});
      const r=await fetch(cfg.api,{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+cfg.token },
        body
      });
      if(!r.ok) throw new Error("api "+r.status);

      ok++;
    }catch(e){ ng++; }
    i++;
    setBar(i/urls.length);
    txt("_mrc_api",`進捗：${i}/${urls.length}　OK:${ok} NG:${ng} / UID:${cfg.uid.slice(0,8)}`);
  }
  toDone(ok,urls.length,ng);
}

/* ========= エントリーポイント ========= */
try{
  mount();
  // 実行ページチェック
  const onRecord=/\/maimai-mobile\/record\//.test(location.pathname);
  if(!onRecord){
    txt("_mrc_msg","履歴ページで実行してください。\n（プレイ履歴タブを開いてからもう一度）");
    const go=gid("_mrc_go"); go.textContent="閉じる"; go.onclick=unmount;
    gid("_mrc_cancel").style.display="none";
    return;
  }
  toConfirm();
}catch(e){
  alert("Bookmarklet error: "+(e?.message||e));
  try{unmount();}catch(_){}
}
})();
