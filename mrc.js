<script>
// == maimai Result Client bookmarklet payload ==
// 完全版。履歴一覧で実行→詳細50件までを取得→API送信→結果ページへ。
// kakigoori0803-prog.github.io / Render の既定値を内蔵しつつ、
// localStorage("MRC_API","MRC_TOKEN") があればそれを優先。

(() => {
  const CLIENT = 'https://kakigoori0803-prog.github.io/maimai-result-client/';
  const DEF_API = 'https://maimai-result.onrender.com/ingest';
  const DEF_TOKEN = '677212069901c46a68a76e31ad8ba32a';

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const api   = localStorage.getItem('MRC_API')   || localStorage.getItem('mrc.api')   || DEF_API;
  const token = localStorage.getItem('MRC_TOKEN') || localStorage.getItem('mrc.token') || DEF_TOKEN;

  // ---------- UI ----------
  const st = document.createElement('style');
  st.textContent = `
  #mrc-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
  #mrc-box{width:min(92vw,560px);background:#111;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.4);color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  #mrc-hd{padding:18px 20px 8px;font-weight:700;font-size:20px}
  #mrc-msg{padding:6px 20px 0 20px;line-height:1.6;font-size:16px}
  #mrc-sub{padding:2px 20px 0 20px;opacity:.8;font-size:13px}
  #mrc-bar{height:6px;background:#333;margin:14px 20px 0;border-radius:999px;overflow:hidden}
  #mrc-fill{height:100%;width:0;background:#2dd4bf;transition:width .25s}
  #mrc-btns{display:flex;gap:10px;justify-content:flex-end;padding:16px 16px 16px}
  .mrc-btn{appearance:none;border:0;border-radius:10px;padding:10px 16px;font-weight:700}
  #mrc-cancel{background:#2f2f2f;color:#eee}
  #mrc-go{background:#22c55e;color:#072; color:#072; color:#fff}
  `;
  const ov = document.createElement('div');
  ov.id = 'mrc-ov';
  ov.innerHTML = `
   <div id="mrc-box" role="dialog" aria-modal="true" aria-labelledby="mrc-hd">
     <div id="mrc-hd">maimai Result Client</div>
     <div id="mrc-msg">履歴データを取得・送信します。</div>
     <div id="mrc-sub">開始を押すと処理がはじまります。</div>
     <div id="mrc-bar"><div id="mrc-fill"></div></div>
     <div id="mrc-btns">
       <button id="mrc-cancel" class="mrc-btn">戻る</button>
       <button id="mrc-go" class="mrc-btn">開始</button>
     </div>
   </div>`;
  document.head.appendChild(st);
  document.body.appendChild(ov);

  const msg  = $('#mrc-msg');
  const sub  = $('#mrc-sub');
  const fill = $('#mrc-fill');
  const go   = $('#mrc-go');
  const back = $('#mrc-cancel');

  const close = () => ov.remove();

  const setButtons = (leftText, leftHandler, rightText, rightHandler) => {
    back.textContent = leftText;
    go.textContent   = rightText;
    back.onclick = leftHandler;
    go.onclick   = rightHandler;
  };

  // ---------- 事前チェック ----------
  const onRecord = /\/maimai-mobile\/record\//.test(location.href);
  if (!onRecord) {
    msg.textContent = '履歴一覧ページで実行してください。';
    sub.textContent = 'ページ上部の「プレイ履歴」から履歴一覧へ移動して再度実行してください。';
    $('#mrc-bar').style.display = 'none';
    setButtons('閉じる', close, '履歴へ移動', () => location.href = '/maimai-mobile/record/');
    return;
  }

  // 収集対象リンク
  const urls = Array.from(new Set(
    $$('a[href*="playlogDetail"]').map(a => (new URL(a.getAttribute('href'), location.href)).href)
  )).slice(0, 50);

  if (!urls.length) {
    msg.textContent = '履歴の詳細リンクが見つかりませんでした。';
    sub.textContent = '履歴一覧を下まで読み込んでから再度実行してください。';
    $('#mrc-bar').style.display = 'none';
    setButtons('閉じる', close, 'OK', close);
    return;
  }

  // 初期表示（確認）
  msg.textContent = `履歴データ（${urls.length}件）を取得・送信します。`;
  sub.textContent = '開始を押すと処理がはじまります。アプリは閉じないでください。';
  fill.style.width = '0%';

  setButtons('戻る', close, '開始', start);

  // ---------- メイン処理 ----------
  async function start() {
    go.disabled = true;
    back.disabled = true;

    let ok = 0, ng = 0;
    const post = async (html, src) => {
      const headers = {'Content-Type': 'application/json'};
      if (token) headers.Authorization = 'Bearer ' + token;
      const body = JSON.stringify({ html, sourceUrl: src });
      const r = await fetch(api, {method:'POST', headers, body}).catch(()=>({ok:false}));
      return r && r.ok;
    };

    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      msg.textContent = `取得・送信中… ${i+1}/${urls.length}`;
      sub.textContent = u;
      fill.style.width = `${Math.round(((i)/urls.length)*100)}%`;

      try {
        const r = await fetch(u, {credentials:'include', cache:'no-store'});
        const html = await r.text();
        const posted = await post(html, u);
        posted ? ok++ : ng++;
      } catch {
        ng++;
      }
    }

    fill.style.width = '100%';
    msg.textContent = `完了：${ok}/${urls.length}　失敗：${ng} 件`;
    sub.textContent = `API: ${api}`;
    go.disabled = false; back.disabled = false;

    setButtons('戻る', close, '結果ページへ', () => {
      try { window.open(CLIENT, '_blank'); } catch { location.href = CLIENT; }
    });
  }
})();
</script>
