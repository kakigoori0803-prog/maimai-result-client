// ====== 設定のロード/保存 ======
const els = {
  apiUrl: document.getElementById('apiUrl'),
  apiToken: document.getElementById('apiToken'),
  saveSettings: document.getElementById('saveSettings'),
  htmlInput: document.getElementById('htmlInput'),
  parseBtn: document.getElementById('parseBtn'),
  clearBtn: document.getElementById('clearBtn'),
  resultInfo: document.getElementById('resultInfo'),
  resultTable: document.getElementById('resultTable'),
  tbody: document.querySelector('#resultTable tbody'),
  sendBtn: document.getElementById('sendBtn'),
  sendStatus: document.getElementById('sendStatus'),
  copyBM: document.getElementById('copyBM'),
  bmSource: document.getElementById('bmSource'),
};

(function loadSettings(){
  els.apiUrl.value   = localStorage.getItem('mr_apiUrl')   || 'https://maimai-result.onrender.com/ingest';
  els.apiToken.value = localStorage.getItem('mr_apiToken') || '';
})();
els.saveSettings.onclick = () => {
  localStorage.setItem('mr_apiUrl', els.apiUrl.value.trim());
  localStorage.setItem('mr_apiToken', els.apiToken.value.trim());
  alert('保存しました');
};

// ====== HTML解析（貼り付け方式） ======
function parseHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 「カード（1曲分）」の候補コンテナを広めに拾う
  const candidates = [
    '.music', '.playlog', '.m_', '.p_',
    '.mymusic', '.playlog_data', '.playlog_list', '.record', '.play_history'
  ];
  let cards = [];
  for (const sel of candidates) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 5) { cards = found; break; } // それっぽく大量に拾えたら採用
    if (!cards.length) cards = found;               // 無ければ最初に見つかった群
  }
  if (!cards.length) cards = [doc.body]; // 単一ページ想定のフォールバック

  const getText = (el) => el?.textContent?.trim() || null;
  const pick = (root, selectors) => {
    for (const s of selectors) {
      const x = root.querySelector(s);
      if (x && getText(x)) return getText(x);
    }
    return null;
  };

  const titleSel   = ['.music_name','.m_name','.title','.musicTitle','h3','.name'];
  const rateSel    = ['.h_ach1','.achieve','.rate','.achievement','.percent'];
  const playedSel  = ['.play_dat .date','.date','.playedAt','.time'];

  const items = [];
  for (const c of cards) {
    const title = pick(c, titleSel);
    const rateRaw = pick(c, rateSel);
    const playedAt = pick(c, playedSel);
    if (!title && !rateRaw && !playedAt) continue; // ノイズ除外

    // "98.0497%" → "98.0497"
    const rate = rateRaw ? (rateRaw.match(/[\d.]+/)?.[0] ?? null) : null;

    items.push({ title, rate, playedAt });
  }
  return items;
}

// ====== テーブル描画 ======
let lastItems = [];
function render(items){
  lastItems = items;
  els.tbody.innerHTML = '';
  if (!items.length) {
    els.resultInfo.textContent = '解析できませんでした（クラス名が変わった可能性）';
    els.resultTable.classList.add('hidden');
    els.sendBtn.disabled = true;
    return;
  }
  els.resultInfo.textContent = `${items.length} 件解析しました`;
  els.resultTable.classList.remove('hidden');
  els.sendBtn.disabled = false;

  items.forEach((it, i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${it.title ?? ''}</td><td>${it.rate ?? ''}</td><td>${it.playedAt ?? ''}</td>`;
    els.tbody.appendChild(tr);
  });
}

els.parseBtn.onclick = () => {
  els.sendStatus.textContent = '';
  const html = els.htmlInput.value.trim();
  if (!html) { alert('HTMLを貼り付けてください'); return; }
  try {
    const items = parseHtml(html);
    render(items);
  } catch (e) {
    console.error(e);
    alert('解析エラー: ' + e.message);
  }
};

els.clearBtn.onclick = () => {
  els.htmlInput.value = '';
  render([]);
};

// ====== API送信（任意） ======
async function sendToApi(items){
  const apiUrl = els.apiUrl.value.trim();
  if (!apiUrl) { alert('API URL が未設定です'); return; }
  const body = {
    sourceUrl: 'pasted-html', // 貼り付け由来なので識別用
    items
  };
  const headers = {'Content-Type':'application/json'};
  const token = els.apiToken.value.trim();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  els.sendStatus.textContent = '送信中...';
  const res = await fetch(apiUrl, { method:'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(()=> ({}));
  els.sendStatus.textContent = '結果: ' + JSON.stringify(json);
}
els.sendBtn.onclick = ()=> sendToApi(lastItems);

// ====== ブックマークレット生成 ======
const bookmarkletCore = `
(()=>{try{
  let API = localStorage.getItem('mr_api') || prompt('API URL? (例: https://maimai-result.onrender.com/ingest)');
  if(!API){ alert('API未設定'); return; }
  localStorage.setItem('mr_api', API);
  let token = localStorage.getItem('mr_tok') || prompt('Bearer Token（あれば）');
  if(token) localStorage.setItem('mr_tok', token);

  const Q = (c)=>document.querySelector(c);
  const pick = (root, sels)=>{ for(const s of sels){ const el=root.querySelector(s); if(el && el.innerText.trim()) return el.innerText.trim(); } return null; };

  const cards = Array.from(document.querySelectorAll('.playlog,.playlog_list,.record,.music,.mymusic,.playlog_data'));
  const roots = cards.length ? cards : [document.body];

  const titleSel  = ['.music_name','.m_name','.title','.musicTitle','h3','.name'];
  const rateSel   = ['.h_ach1','.achieve','.rate','.achievement','.percent'];
  const dateSel   = ['.play_dat .date','.date','.playedAt','.time'];

  const items=[];
  for(const r of roots){
    const title = pick(r,titleSel);
    const rateRaw = pick(r,rateSel);
    const playedAt = pick(r,dateSel);
    if(!title && !rateRaw && !playedAt) continue;
    const rate = rateRaw ? (rateRaw.match(/[\\d.]+/)?.[0] ?? null) : null;
    items.push({title,rate,playedAt});
  }
  if(!items.length){ alert('抽出0件でした（ページ構造が変わったかも）'); return; }

  const headers={'Content-Type':'application/json'};
  if(token) headers['Authorization']='Bearer '+token;

  fetch(API,{method:'POST',headers,body:JSON.stringify({sourceUrl:location.href,items})})
    .then(r=>r.json()).then(j=>alert('送信OK: '+JSON.stringify(j)))
    .catch(e=>alert('送信失敗: '+e));
}catch(e){ alert('エラー: '+e.message); }})();
`;
const bookmarklet = 'javascript:' + encodeURIComponent(bookmarkletCore);
els.bmSource.textContent = bookmarkletCore.trim();
els.copyBM.onclick = async () => {
  await navigator.clipboard.writeText(bookmarklet);
  alert('コピーしました。ブックマークのURL欄に貼り付けてください。');
};
