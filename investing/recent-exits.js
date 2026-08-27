(() => {
  "use strict";

  const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";

  function ensureHost(){
    let host=document.getElementById("recentExitedPanel");
    if(host)return host;
    const historyPanel=document.getElementById("historyPanel");
    if(!historyPanel)return null;
    host=document.createElement("section");
    host.id="recentExitedPanel";
    host.className="history-panel";
    historyPanel.insertAdjacentElement("afterend",host);
    return host;
  }

  function render(rows, retentionDays){
    const host=ensureHost();
    if(!host)return;
    const days=Number(retentionDays)||14;
    if(!rows.length){
      host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>USCITE RECENTI DALLA GRADUATORIA</small><h3>Titoli sotto osservazione dopo l'uscita</h3></div><div class="history-summary"><span>0 uscite negli ultimi ${days} giorni</span></div></div><p class="history-exit">Quando un titolo uscirà dalla Top 5 resterà qui per ${days} giorni, così potrai verificare cosa succede dopo l'esclusione senza perdere lo storico.</p></div>`;
      return;
    }

    host.innerHTML=`<div class="history-box"><div class="history-head"><div><small>USCITE RECENTI DALLA GRADUATORIA</small><h3>Restano visibili per ${days} giorni</h3></div><div class="history-summary"><span>${rows.length} titoli sotto verifica</span></div></div><div class="history-current">${rows.map((r,n)=>{
      const dt=new Date(r.exitDate);
      const date=Number.isNaN(dt.getTime())?"—":dt.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
      const perf=Number(r.returnSinceExitPct);
      const perfText=Number.isFinite(perf)?`${perf>=0?"+":""}${fmt(perf,1)}%`:"—";
      return `<div class="history-row"><div><strong>${n+1}. ${r.name||r.ticker}</strong><small>${r.ticker||""} · uscita il ${date}${r.replacementTicker?` · sostituita da ${r.replacementTicker}`:""}</small><small>${r.reason||"Uscita dalla Top 5"}</small></div><div><span>Prezzo uscita ${fmt(r.exitPrice)} ${r.currency||""}</span><span>Prezzo attuale ${fmt(r.currentPrice)} ${r.currency||""}</span><span>Da uscita ${perfText}</span><span>Voto uscita ${fmt(r.exitScore,1)}/10</span></div></div>`;
    }).join("")}</div><p class="history-exit">Questa sezione serve per il controllo a posteriori: i titoli usciti non spariscono subito e possono essere confrontati con quelli entrati al loro posto.</p></div>`;
  }

  async function run(){
    try{
      const response=await fetch(`../data/market-data.json?recentExits=${Date.now()}`,{cache:"no-store"});
      const root=await response.json();
      const inv=root?.investment||{};
      render(inv.recentExitedCandidates||[],inv.recentExitedRetentionDays||14);
    }catch(_){
      render([],14);
    }
  }

  window.addEventListener("load",()=>setTimeout(run,550));
})();
