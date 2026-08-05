
const DATA_URL = "../data/market-data.json";
let payload = null;
let candidates = [];

const $ = selector => document.querySelector(selector);
const fmt = (value, digits=2) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString("it-IT",{minimumFractionDigits:digits,maximumFractionDigits:digits})
  : "—";

function statusIcon(status){return status==="GREEN"?"✓":status==="YELLOW"?"!":"✕"}
function statusLabel(item){
  if(item.status==="GREEN") return "VERDE · ACQUISTO VALUTABILE";
  if(item.status==="YELLOW") return item.pullbackPct >= item.requiredPullbackMin ? "GIALLO · ATTENDI CONFERMA" : "GIALLO · ATTENDI RITRACCIAMENTO";
  return "ROSSO · ESCLUSO ORA";
}
function freshness(){
  if(!payload?.generatedAt) return "Età dati sconosciuta";
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(payload.generatedAt))/60000));
  return minutes<60?`Dati aggiornati ${minutes} min fa`:`Dati aggiornati ${Math.floor(minutes/60)}h ${minutes%60}m fa`;
}

function renderTop(){
  const ranked=[...candidates].sort((a,b)=>b.finalScore-a.finalScore).slice(0,5);
  const lead=ranked[0];
  $("#topArea").innerHTML=`
    <div class="ranking">
      <small>CLASSIFICA OPERATIVA 2-4 MESI</small>
      ${ranked.map((item,index)=>`
        <div class="rank-row" data-ticker="${item.ticker}">
          <span class="rank-num">${index+1}</span>
          <div><strong>${item.name}</strong><small class="ticker">${item.ticker} · ${item.sector||"Settore n.d."}</small></div>
          <span class="status ${item.status}">${statusIcon(item.status)} ${statusLabel(item)}</span>
          <span>Ritr. ${fmt(item.pullbackPct,1)}%</span>
          <span class="score">${fmt(item.finalScore,1)}/10</span>
        </div>`).join("")}
    </div>
    <aside class="lead">
      <small>PRIMA AZIONE DA MONITORARE</small>
      <h3>${lead.name}</h3>
      <span class="status ${lead.status}">${statusIcon(lead.status)} ${statusLabel(lead)}</span>
      <div class="big-score">${fmt(lead.finalScore,1)}<small>/10</small></div>
      <p>${lead.executiveSummary}</p>
      <strong>Zona: ${fmt(lead.entryZoneLow)}–${fmt(lead.entryZoneHigh)} ${lead.currency||""}</strong>
    </aside>`;
  document.querySelectorAll(".rank-row").forEach(row=>row.addEventListener("click",()=>openDetail(row.dataset.ticker)));
}

function card(item){
  return `<article class="card" data-ticker="${item.ticker}" data-status="${item.status}">
    <div class="card-head">
      <div><h3>${item.name}</h3><span class="ticker">${item.ticker} · ${item.sector||"—"}</span></div>
      <div class="card-score">${fmt(item.finalScore,1)}<small>/10</small></div>
    </div>
    <span class="status ${item.status}">${statusIcon(item.status)} ${statusLabel(item)}</span>
    <div class="metrics">
      <div class="metric"><span>Qualità azienda</span><strong>${fmt(item.qualityScore,1)}/10</strong></div>
      <div class="metric"><span>Trend 2-4 mesi</span><strong>${fmt(item.trendScore,1)}/10</strong></div>
      <div class="metric"><span>Ingresso</span><strong>${fmt(item.entryScore,1)}/10</strong></div>
      <div class="metric"><span>Ritracciamento</span><strong>${fmt(item.pullbackPct,1)}%</strong></div>
    </div>
    <div class="zones">
      <div class="zone"><span>Prezzo</span><strong>${fmt(item.currentPrice)} ${item.currency||""}</strong></div>
      <div class="zone"><span>Zona ideale</span><strong>${fmt(item.entryZoneLow)}–${fmt(item.entryZoneHigh)}</strong></div>
      <div class="zone"><span>Invalidazione</span><strong>${fmt(item.invalidation)}</strong></div>
      <div class="zone"><span>Target medio</span><strong>${fmt(item.target2)}</strong></div>
    </div>
    <p class="why">${item.executiveSummary}</p>
    <strong class="open">Apri report dettagliato →</strong>
  </article>`;
}

function renderCards(){
  const filter=$("#statusFilter").value;
  const visible=candidates.filter(item=>filter==="ALL"||item.status===filter).sort((a,b)=>b.finalScore-a.finalScore).slice(0,5);
  $("#cards").innerHTML=visible.map(card).join("");
  document.querySelectorAll(".card").forEach(node=>node.addEventListener("click",()=>openDetail(node.dataset.ticker)));
}

function list(items){return items?.length?`<ul>${items.map(x=>`<li>${x}</li>`).join("")}</ul>`:"<p>Nessun elemento rilevante disponibile.</p>"}
function table(rows){return `<table class="report-table">${rows.map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`}

function openDetail(ticker){
  const item=candidates.find(x=>x.ticker===ticker); if(!item)return;
  $("#detailContent").innerHTML=`<article class="report">
    <small>${item.ticker} · ${item.sector||"—"} · Orizzonte 2-4 mesi</small>
    <h2>${item.name}</h2>
    <span class="status ${item.status}">${statusIcon(item.status)} ${statusLabel(item)}</span>
    <h3>Verdetto del Coach: ${fmt(item.finalScore,1)}/10</h3>
    <p>${item.executiveSummary}</p>

    <div class="report-grid">
      <section class="report-section full"><h3>Perché è stata selezionata</h3><p>${item.selectionReason}</p></section>
      <section class="report-section"><h3>Analisi fondamentale</h3>${table([
        ["Crescita ricavi",fmt(item.fundamentals.revenueGrowthPct,1)+"%"],
        ["Crescita utili",fmt(item.fundamentals.earningsGrowthPct,1)+"%"],
        ["Margine operativo",fmt(item.fundamentals.operatingMarginPct,1)+"%"],
        ["ROE",fmt(item.fundamentals.roePct,1)+"%"],
        ["Debt/Equity",fmt(item.fundamentals.debtToEquity,1)],
        ["Forward P/E",fmt(item.fundamentals.forwardPE,1)],
        ["Free cash flow",item.fundamentals.freeCashFlowLabel||"—"],
        ["Qualità fondamentale",fmt(item.qualityScore,1)+"/10"]
      ])}</section>
      <section class="report-section"><h3>Analisi tecnica</h3>${table([
        ["Trend mensile",item.technical.monthly],
        ["Trend settimanale",item.technical.weekly],
        ["Trend Daily",item.technical.daily],
        ["RSI Daily",fmt(item.technical.rsiDaily,1)],
        ["Forza relativa 3 mesi",fmt(item.technical.relativeStrength3mPct,1)+"%"],
        ["Ritracciamento dal massimo",fmt(item.pullbackPct,1)+"%"],
        ["Supporto principale",fmt(item.technical.support)],
        ["Resistenza principale",fmt(item.technical.resistance)]
      ])}</section>
      <section class="report-section"><h3>Ultima trimestrale e stime</h3><p>${item.earningsCommentary}</p>${table([
        ["Prossima trimestrale",item.nextEarningsDate||"Non disponibile"],
        ["Sorpresa utili",fmt(item.earningsSurprisePct,1)+"%"],
        ["Revisione stime",item.estimateRevision||"Non disponibile"]
      ])}</section>
      <section class="report-section"><h3>Motivo del ritracciamento</h3><p>${item.pullbackDiagnosis}</p><h3>Catalizzatori</h3>${list(item.catalysts)}</section>
      <section class="report-section"><h3>Rischi aziendali e geopolitici</h3>${list(item.risks)}</section>
      <section class="report-section"><h3>Notizie considerate</h3>${list((item.news||[]).map(n=>`${n.title}${n.publisher?` — ${n.publisher}`:""}`))}</section>
      <section class="report-section full"><h3>Piano operativo</h3>${table([
        ["Prezzo attuale",fmt(item.currentPrice)+" "+(item.currency||"")],
        ["Prima zona d'interesse",fmt(item.watchZoneLow)+"–"+fmt(item.watchZoneHigh)],
        ["Zona ideale di acquisto",fmt(item.entryZoneLow)+"–"+fmt(item.entryZoneHigh)],
        ["Invalidazione",fmt(item.invalidation)],
        ["Target 1",fmt(item.target1)],
        ["Target 2",fmt(item.target2)],
        ["Target 3",fmt(item.target3)],
        ["Rapporto rischio/rendimento",item.riskReward||"—"],
        ["Orizzonte previsto","8-16 settimane"]
      ])}</section>
      <section class="report-section full"><h3>Scenari A / B / C</h3>
        <p><strong>Scenario A — ritracciamento ordinato:</strong> ${item.scenarios.A}</p>
        <p><strong>Scenario B — breakout senza ritracciamento:</strong> ${item.scenarios.B}</p>
        <p><strong>Scenario C — deterioramento:</strong> ${item.scenarios.C}</p>
      </section>
      <section class="report-section full"><h3>Cosa manca per il verde</h3>${list(item.conditionsForGreen)}</section>
    </div>
  </article>`;
  $("#detailDialog").showModal();
}

async function load(){
  try{
    const response=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const combinedPayload = await response.json();
    payload = combinedPayload.investment || {};
    candidates = payload.candidates || [];
    $("#screenedCount").textContent = payload.screenedCount || 0;
    $("#candidateCount").textContent=candidates.length;
    $("#greenCount").textContent=candidates.filter(x=>x.status==="GREEN").length;
    $("#yellowCount").textContent=candidates.filter(x=>x.status==="YELLOW").length;
    $("#freshness").textContent=freshness();
    $("#reportBtn").disabled=!candidates.length;
    renderTop(); renderCards();
  }catch(error){
    $("#topArea").innerHTML=`<div class="loading">Dati Investment Coach non ancora disponibili. Esegui il workflow “Update Investment Data”.<br><small>${error.message}</small></div>`;
  }
}

function downloadReport(){
  if(!candidates.length)return;
  const lines=[
    `MARKET COMPASS — INVESTMENT COACH`,
    `Aggiornato: ${payload.generatedAt||"—"}`,
    `Orizzonte: 2-4 mesi`,
    ``,
    ...candidates.slice(0,5).map((x,i)=>`${i+1}. ${x.name} (${x.ticker}) — ${statusLabel(x)} — Setup ${fmt(x.finalScore,1)}/10 — Ritracciamento ${fmt(x.pullbackPct,1)}% — Zona ${fmt(x.entryZoneLow)}-${fmt(x.entryZoneHigh)}\n${x.executiveSummary}`),
    ``,
    `Analisi sperimentale. Non costituisce consulenza finanziaria.`
  ];
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download=`investment-coach-report-${new Date().toISOString().slice(0,10)}.txt`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
$("#refreshBtn").addEventListener("click",load);
$("#reportBtn").addEventListener("click",downloadReport);
$("#statusFilter").addEventListener("change",renderCards);
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
load();
