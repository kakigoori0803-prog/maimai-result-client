// loader.js — 履歴一覧/詳細をワンポチ収集 + 進捗UI + API送信（強化版）
(() => {
  if (window.__maiClientRunning) return;
  window.__maiClientRunning = true;

  // ==== 設定 ====
  const API_URL   = 'https://maimai-result.onrender.com/ingest';
  const API_TOKEN = '677212069901c46a68a76e31ad8ba32a'; // 公開用

  // ==== ページ判定 ====
  const isListPage   = () => /\/maimai-mobile\/record\/?(?:\?|$)/.test(location.pathname);
  const isDetailPage = () => /\/maimai-mobile\/record\/playlogDetail\/?/.test(location.pathname);

  // ==== 進捗UI ====
  const ui = (() => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.35);backdrop-filter:blur(2px);
      font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
      width:min(92vw,520px);background:#111;color:#fff;border-radius:12px;
      box-shadow:0 8px 24px rgba(0,0,0,.45);padding:16px 18px;
    `;
    const h = document.createElement('div');
    h.textContent = 'maimai Result Client';
    h.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:8px;';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;line-height:1.5;white-space:pre-wrap;min-height:3em;';
    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'height:8px;background:#333;border-radius:999px;overflow:hidden;margin-top:10px;';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:100%;width:0%;background:#1dd1a1;transition:width .2s;';
    barWrap.appendChild(bar);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = '中止';
    btnCancel.style.cssText = 'padding:8px 12px;border:0;border-radius:8px;background:#444;color:#fff;';
    const btnClose = document.createElement('button');
    btnClose.textContent = '閉じる';
    btnClose.style.cssText = 'padding:8px 12px;border:0;border-radius:8px;background:#666;color:#fff;display:none;';
    row.appendChild(btnCancel); row.appendChild(btnClose);
    box.append(h,msg,barWrap,row); wrap.appendChild(box);

    let onCancel = null;
    btnCancel.onclick = () => onCancel && onCancel();
    btnClose.onclick = () => document.body.contains(wrap) && document.body.removeChild(wrap);

    return {
      mount(){ document.body.appendChild(wrap); },
      setText(t){ msg.textContent = t; },
      setProgress(cur,total){
        const pct = total? Math.round(cur/total*100):0;
        bar.style.width = pct+'%';
      },
      askConfirm(total,sec){
        return new Promise(res=>{
          msg.textContent = `履歴データ（${total}件）を取得します。\n概算 ${Math.ceil(sec)} 秒かかります。\n実行しますか？`;
          const btnRun = document.createElement('button');
          btnRun.textContent = '実行';
          btnRun.style.cssText = 'padding:8px 12px;border:0;border-radius:8px;background:#1dd1a1;color:#000;font-weight:700;';
          row.insertBefore(btnRun, btnCancel);
          btnRun.onclick=()=>{btnRun.remove();res(true);};
          btnCancel.onclick=()=>res(false);
        });
      },
      onCancel(fn){ onCancel = fn; },
      showClose(){ btnCancel.style.display='none'; btnClose.style.display='inline-block'; },
      destroy(){ try{document.body.removeChild(wrap);}catch{} }
    };
  })();

  // ==== ヘルパ ====
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  async function fetchText(url){
    const r = await fetch(url, {credentials:'same-origin'});
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.text();
  }
  async function postIngest({html, sourceUrl, userId}){
    const r = await fetch(API_URL, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({html, sourceUrl, userId})
    });
    if(!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error(`API ${r.status}: ${t}`);
    }
    return await r.json().catch(()=> ({}));
  }
  function userId(){
    const K='__mai_user_id__';
    let v=localStorage.getItem(K);
    if(!v){ v=(crypto.randomUUID?.()||Date.now()+Math.random().toString(16).slice(2)); localStorage.setItem(K,v); }
    return v;
  }

  // ==== 詳細URLを抜く（<a>, <form>, onclick ぜんぶ対応）====
  function collectDetailUrls(){
    const origin = location.origin;
    const urls = new Set();

    // 1) a要素
    document.querySelectorAll('a[href*="/maimai-mobile/record/playlogDetail"]').forEach(a=>{
      try{
        const href = a.getAttribute('href');
        if(!href) return;
        urls.add(new URL(href, origin).href);
      }catch{}
    });

    // 2) form要素（action + hidden idx）
    document.querySelectorAll('form').forEach(f=>{
      try{
        const action = f.getAttribute('action')||'';
        if(!/\/maimai-mobile\/record\/playlogDetail/.test(action)) return;
        const u = new URL(action, origin);
        // hidden idx
        const idx = (f.querySelector('input[name="idx"]')||{}).value;
        if(idx) u.searchParams.set('idx', idx);
        urls.add(u.href);
      }catch{}
    });

    // 3) onclick（文字列中の idx= を拾う）
    const rxIdx = /playlogDetail\/?\S*?idx=([^'"\s&]+)/i;
    document.querySelectorAll('[onclick]').forEach(el=>{
      try{
        const s = String(el.getAttribute('onclick')||'');
        const m = s.match(rxIdx);
        if(m && m[1]){
          const v = decodeURIComponent(m[1]);
          const u = new URL('/maimai-mobile/record/playlogDetail/', origin);
          u.searchParams.set('idx', v);
          urls.add(u.href);
        }
      }catch{}
    });

    // 4) HTMLテキスト内に相対リンクが埋まってる場合（保険）
    try{
      const html = document.documentElement.innerHTML;
      const rxHref = /href\s*=\s*["']([^"']*playlogDetail\/?[^"']*)["']/gi;
      let m;
      while((m = rxHref.exec(html))){
        const u = new URL(m[1], origin).href;
        urls.add(u);
      }
    }catch{}

    return Array.from(urls);
  }

  // ==== メイン ====
  (async()=>{
    ui.mount();

    if (isDetailPage()) {
      ui.setText('詳細ページを検出。1件を送信します…');
      ui.setProgress(0,1);
      try{
        await postIngest({
          html: document.documentElement.outerHTML,
          sourceUrl: location.href,
          userId: userId()
        });
        ui.setProgress(1,1);
        ui.setText('送信完了（1/1）');
      }catch(e){
        ui.setText('送信失敗：'+e.message);
      }
      ui.showClose(); return;
    }

    if (isListPage()) {
      const list = collectDetailUrls();
      if (!list.length) {
        ui.setText('詳細へのリンクが見つかりませんでした。\n履歴「一覧」で実行してください。');
        ui.showClose(); return;
      }
      // 重複はSetで排除済み
      const total = list.length;
      const estSec = total * 0.9; // だいたい
      const ok = await ui.askConfirm(total, estSec);
      if (!ok){ ui.destroy(); return; }

      let canceled=false; ui.onCancel(()=> canceled=true);
      const uid = userId();
      let done=0, fail=0;

      for (const url of list){
        if (canceled) break;
        try{
          ui.setText(`取得中 ${done}/${total}\n${url}`);
          const html = await fetchText(url);               // 画面遷移せずに詳細HTML取得
          await postIngest({ html, sourceUrl:url, userId:uid });
          done++;
        }catch(e){
          fail++;
          console.warn('detail fetch/post failed:', url, e);
        }
        ui.setProgress(done, total);
        await sleep(350); // 少し間隔を空ける
      }

      ui.setText(`完了: ${done}/${total} 件送信。失敗: ${fail} 件。`);
      ui.showClose(); return;
    }

    ui.setText('このブックマークは「履歴一覧」または「詳細」ページで実行してください。\nホーム→プレイ履歴→一覧 で再実行。');
    ui.showClose();
  })().catch(e=>{
    alert('Bookmarklet error: '+(e&&e.message?e.message:e));
    ui.destroy();
  });
})();
