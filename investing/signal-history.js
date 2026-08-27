(() => {
  "use strict";

  const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
  const pct=(v)=>Number.isFinite(Number(v))?`${Number(v)>=0?"+":""}${fmt(v,1)}%`:"—";

  function ensureHost(){
    let host=document.getElementById("confirmedSignalHistory");
    if(host)return host;
    const stats=document.querySelector(".stats");
    if(!stats)return null;
    host=document.createElement("section");
    host.id="confirmedSignalHistory";
    host.className="history-panel";
    stats.insertAdjacentElement("afterend",host);
    return host;
  }

  function render(rows,candidates){
    const host=ensureHost();
    if(!host)return;
    if(!rows.length){
      host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>ACQUISTI CONFERMATI — STORICO</small><h3>Segnali verdi definitivi</h3></div><div class="history-summary"><span>0 segnali registrati</span></div></div><p class="history-exit">Ogni futuro VERDE definitivo verrà salvato qui e non sparirà quando cambia la classifica.</p></div>`;
      return;
    }

    const currentByTicker=new Map((candidates||[]).map(c=>[c.ticker,c]));
    host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>ACQUISTI CONFERMATI — STORICO</small><h3>Cosa il sistema ha realmente confermato da comprare</h3></div><div class="history-summary"><span>${rows.length} segnali registrati</span></div></div><div class="history-current">${rows.slice(0,40).map((r,n)=>{
      const dt=new Date(r.signalDate);
      const date=Number.isNaN(dt.getTime())?"—":dt.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
      const current=currentByTicker.get(r.ticker);
      const currentPrice=Number(current?.currentPrice);
      const signalPrice=Number(r.signalPrice);
      const performance=Number.isFinite(currentPrice)&&Number.isFinite(signalPrice)&&signalPrice!==0?((currentPrice/signalPrice)-1)*100:null;
      const currency=current?.currency||"";
      return `<div class="history-row"><div><strong>${n+1}. ${r.name||r.ticker}</strong><small>${r.ticker||""} · VERDE definitivo il ${date}</small></div><div><span>Prezzo segnale ${fmt(r.signalPrice)} ${currency}</span><span>Prezzo attuale ${Number.isFinite(currentPrice)?fmt(currentPrice):"—"} ${currency}</span><span>Da segnale ${performance===null?"—":pct(performance)}</span><span>Voto ${fmt(r.finalScore,1)}/10</span><span>Zona ${fmt(r.entryZoneLow)}–${fmt(r.entryZoneHigh)}</span></div></div>`;
    }).join("")}</div><p class="history-exit">Archivio permanente: l'uscita dalla Top 5 non cancella il vecchio segnale. Se il titolo è ancora tra le candidate, viene mostrato anche il rendimento dal prezzo del segnale.</p></div>`;
  }

  async function run(){
    try{
      const response=await fetch(`../data/market-data.json?history=${Date.now()}`,{cache:"no-store"});
      const root=await response.json();
      render(root?.investment?.confirmedPurchaseHistory||[],root?.investment?.candidates||[]);
    }catch(_){
      render([],[]);
    }
  }

  window.addEventListener("load",()=>setTimeout(run,300));
})();
