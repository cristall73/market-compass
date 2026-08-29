const ETF_LONG_TERM_DATA='../data/etf-data.json';
let strategicTickers=[];
const originalPick5=typeof pick5==='function'?pick5:null;

// La composizione mostrata dal Coach arriva dal portafoglio persistente calcolato
// dal motore. In assenza di storico (prima esecuzione) resta il vecchio fallback.
if(typeof pick5==='function'){
  pick5=function(a){
    if(strategicTickers.length){
      const by=new Map(a.map(x=>[x.ticker,x]));
      const fixed=strategicTickers.map(t=>by.get(t)).filter(Boolean);
      if(fixed.length)return fixed;
    }
    return originalPick5?originalPick5(a):a.slice(0,5);
  };
}

function ltFmt(v,d=1){return Number.isFinite(Number(v))?Number(v).toLocaleString('it-IT',{maximumFractionDigits:d}):'—'}
function ltPrice(v,c){if(!Number.isFinite(Number(v)))return'—';if(c==='GBp')return `${ltFmt(v,2)} GBp`;if(c==='GBP')return `£${ltFmt(v,2)}`;if(c==='EUR')return `€${ltFmt(v,2)}`;if(c==='USD')return `$${ltFmt(v,2)}`;return `${ltFmt(v,2)} ${c||''}`.trim()}
function regimeBadge(v){const s=(v||'YELLOW').toUpperCase();const label=s==='GREEN'?'OK':s==='RED'?'KO':'ATTESA';return `<span class="lt-badge ${s}">${label}</span>`}
function safeLink(url){return /^https?:\/\//i.test(url||'')?url:'#'}

function renderLongTermPanel(root){
  const host=document.getElementById('strategyPanel');if(!host)return;
  const p=root.portfolio||{},hs=p.holdings||[],ex=(p.exitHistory||[]).slice().reverse().slice(0,5),news=root.portfolioNews||{};
  strategicTickers=hs.map(x=>x.ticker).filter(Boolean);
  const rows=hs.map(h=>`<div class="lt-row"><div><strong>${h.ticker}</strong><small>${h.name||''}</small></div><div><small>Mensile</small>${regimeBadge(h.monthlyRegime)}</div><div><small>Settimanale</small>${regimeBadge(h.weeklyRegime)}</div><div><small>Ingresso</small><strong>${ltPrice(h.entryPrice,h.entryCurrency)}</strong></div><div><small>Da ingresso</small><strong class="${Number(h.returnSinceEntryPct)>=0?'pos':'neg'}">${Number(h.returnSinceEntryPct)>=0?'+':''}${ltFmt(h.returnSinceEntryPct)}%</strong></div><div><small>Permanenza</small><strong>${h.heldMonths||0} mesi</strong></div></div>`).join('');
  const exits=ex.length?ex.map(x=>`<div class="lt-exit"><span><strong>${x.ticker}</strong> · ${x.exitDate||'—'}</span><span>${ltPrice(x.entryPrice,x.currency)} → ${ltPrice(x.exitPrice,x.currency)}</span><small>${x.reason||''}</small></div>`).join(''):'<p>Nessuna uscita registrata: lo storico inizierà a popolarsi solo quando il motore chiuderà davvero una posizione ETF.</p>';
  const newsRows=hs.map(h=>{
    const n=(news[h.ticker]||[])[0];
    if(!n)return `<div class="lt-news"><strong>${h.ticker}</strong><span>Nessuna notizia recente affidabile disponibile.</span></div>`;
    const href=safeLink(n.url);return `<div class="lt-news"><strong>${h.ticker}</strong><span>${n.title||'Notizia recente'}</span>${href!=='#'?`<a href="${href}" target="_blank" rel="noopener">Apri fonte →</a>`:''}</div>`;
  }).join('');
  host.innerHTML=`<div class="section-title"><div><small>CONTROLLO STRATEGICO MENSILE</small><h2>Portafoglio ETF: pochi segnali, tracciati nel tempo</h2></div><p>Decisioni su 1M + 1W. Il Daily non viene usato. Orizzonte preferito: almeno ${p.minPreferredHoldingMonths||12} mesi.</p></div><div class="lt-review"><span>Ultima revisione: <strong>${p.lastReviewDate||'—'}</strong></span><span>${p.reviewResult||'Nessun cambio richiesto'}</span></div><div class="lt-table">${rows||'<p>Portafoglio in inizializzazione.</p>'}</div><details class="lt-details"><summary>Storico entrate/uscite</summary><div>${exits}</div></details><details class="lt-details"><summary>Notizie essenziali sugli ETF in portafoglio</summary><div>${newsRows}</div></details>`;
}

fetch(ETF_LONG_TERM_DATA,{cache:'no-store'}).then(r=>r.json()).then(root=>{
  renderLongTermPanel(root);
  // Dopo aver ricevuto la composizione persistente riallineiamo i blocchi già
  // esistenti. La calcolatrice resta quella originale e usa gli stessi dati reali.
  try{if(typeof renderBuilder==='function')renderBuilder();}catch(e){}
  try{if(typeof renderCards==='function')renderCards();}catch(e){}
}).catch(()=>{});
