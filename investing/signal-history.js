(() => {
  "use strict";

  const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";

  function ensureHost(){
    let host=document.getElementById("confirmedSignalHistory");
    if(host)return host;
    const historyPanel=document.getElementById("historyPanel");
    if(!historyPanel)return null;
    host=document.createElement("section");
    host.id="confirmedSignalHistory";
    host.className="history-panel";
    historyPanel.insertAdjacentElement("afterend",host);
    return host;
  }

  function render(rows){
    const host=ensureHost();
    if(!host)return;
    if(!rows.length){
      host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>STORICO SEGNALI DEFINITIVI</small><h3>Acquisti confermati nel tempo</h3></div><div class="history-summary"><span>0 segnali registrati</span></div></div><p class="history-exit">Da ora ogni VERDE definitivo viene salvato e non sparisce quando cambia la classifica. Qui potrai verificare cosa era stato segnalato un mese o più tempo fa.</p></div>`;
      return;
    }
    host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>STORICO SEGNALI DEFINITIVI</small><h3>Acquisti confermati nel tempo</h3></div><div class="history-summary"><span>${rows.length} segnali registrati</span></div></div><div class="history-current">${rows.slice(0,40).map((r,n)=>{const dt=new Date(r.signalDate);const date=Number.isNaN(dt.getTime())?"—":dt.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});return `<div class="history-row"><div><strong>${n+1}. ${r.name||r.ticker}</strong><small>${r.ticker||""} · VERDE definitivo il ${date}</small></div><div><span>Prezzo ${fmt(r.signalPrice)}</span><span>Voto ${fmt(r.finalScore,1)}/10</span><span>Ritraccio ${fmt(r.pullbackPct,1)}%</span></div></div>`}).join("")}</div><p class="history-exit">Questo archivio è permanente: un titolo può uscire dalla selezione attuale senza cancellare il vecchio segnale.</p></div>`;
  }

  async function run(){
    try{
      const response=await fetch(`../data/market-data.json?history=${Date.now()}`,{cache:"no-store"});
      const root=await response.json();
      render(root?.investment?.confirmedPurchaseHistory||[]);
    }catch(_){
      render([]);
    }
  }

  window.addEventListener("load",()=>setTimeout(run,450));
})();
