const opportunities = [
  {
    name: "NVIDIA", ticker: "NVDA", sector: "Semiconduttori", score: 88,
    status: "Acquisto", entry: "171–176 $", target: "+13,2%", stop: "-6,5%",
    horizon: "45–75 giorni", rr: "2,03", price: "174,20 $",
    reasons: ["Trend Weekly rialzista", "Forza relativa elevata", "Crescita utili positiva"],
    risks: ["Valutazione elevata", "Volatilità sopra la media"],
    components: { Trend: 23, Momentum: 17, Fondamentali: 18, Catalizzatori: 13, Ingresso: 9, Rischio: 8 }
  },
  {
    name: "ASML", ticker: "ASML", sector: "Semiconduttori", score: 84,
    status: "Acquisto", entry: "690–708 €", target: "+11,8%", stop: "-5,9%",
    horizon: "50–90 giorni", rr: "2,00", price: "701,40 €",
    reasons: ["Supporto tecnico vicino", "Leadership tecnologica", "Momentum in recupero"],
    risks: ["Ciclo semiconduttori", "Esposizione geopolitica"],
    components: { Trend: 21, Momentum: 16, Fondamentali: 19, Catalizzatori: 12, Ingresso: 9, Rischio: 7 }
  },
  {
    name: "Ferrari", ticker: "RACE", sector: "Lusso", score: 79,
    status: "Watchlist", entry: "405–414 €", target: "+10,6%", stop: "-5,2%",
    horizon: "40–80 giorni", rr: "2,04", price: "418,70 €",
    reasons: ["Brand e margini solidi", "Trend primario intatto", "Serve un ritracciamento"],
    risks: ["Prezzo sopra l'area ideale", "Multipli elevati"],
    components: { Trend: 21, Momentum: 15, Fondamentali: 18, Catalizzatori: 10, Ingresso: 7, Rischio: 8 }
  },
  {
    name: "Visa", ticker: "V", sector: "Finanza", score: 76,
    status: "Mantieni", entry: "336–342 $", target: "+10,2%", stop: "-4,8%",
    horizon: "55–90 giorni", rr: "2,12", price: "349,10 $",
    reasons: ["Business resiliente", "Trend ordinato", "Volatilità contenuta"],
    risks: ["Target meno esplosivo", "Ingresso non ottimale"],
    components: { Trend: 20, Momentum: 14, Fondamentali: 18, Catalizzatori: 9, Ingresso: 7, Rischio: 8 }
  },
  {
    name: "Rheinmetall", ticker: "RHM", sector: "Difesa", score: 82,
    status: "Acquisto", entry: "1.720–1.770 €", target: "+14,1%", stop: "-7,0%",
    horizon: "35–70 giorni", rr: "2,01", price: "1.755 €",
    reasons: ["Trend settoriale forte", "Portafoglio ordini robusto", "Momentum positivo"],
    risks: ["Volatilità elevata", "Titolo già molto apprezzato"],
    components: { Trend: 23, Momentum: 18, Fondamentali: 15, Catalizzatori: 13, Ingresso: 7, Rischio: 6 }
  }
];

const tradingSignals = [
  { asset: "Nasdaq 100", direction: "LONG", score: 81, setup: "Ritracciamento", horizon: "1–3 giorni", invalidation: "Sotto supporto H4" },
  { asset: "DAX", direction: "WAIT", score: 58, setup: "Nessun vantaggio", horizon: "—", invalidation: "—" },
  { asset: "Gold", direction: "LONG", score: 74, setup: "Breakout + retest", horizon: "1–2 giorni", invalidation: "Rientro sotto breakout" },
  { asset: "EUR/USD", direction: "SHORT", score: 69, setup: "Pullback su resistenza", horizon: "1–3 giorni", invalidation: "Chiusura H4 sopra resistenza" }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function badgeClass(status) {
  if (status === "Acquisto") return "buy";
  if (status === "Watchlist") return "watch";
  return "hold";
}

function populateFilters() {
  const sectors = [...new Set(opportunities.map(item => item.sector))].sort();
  $("#sectorFilter").innerHTML += sectors.map(s => `<option value="${s}">${s}</option>`).join("");
}

function renderOpportunities() {
  const sector = $("#sectorFilter").value;
  const status = $("#statusFilter").value;
  const filtered = opportunities
    .filter(x => sector === "all" || x.sector === sector)
    .filter(x => status === "all" || x.status === status)
    .sort((a, b) => b.score - a.score);

  $("#opportunityGrid").innerHTML = filtered.map(item => `
    <article class="card" data-ticker="${item.ticker}">
      <div class="card-top">
        <div>
          <h3>${item.name}</h3>
          <div class="ticker">${item.ticker} · ${item.sector}</div>
        </div>
        <div class="score">${item.score}</div>
      </div>
      <p><span class="badge ${badgeClass(item.status)}">${item.status}</span></p>
      <div class="metric-grid">
        <div class="metric"><small>Prezzo</small><strong>${item.price}</strong></div>
        <div class="metric"><small>Target</small><strong>${item.target}</strong></div>
        <div class="metric"><small>Ingresso</small><strong>${item.entry}</strong></div>
        <div class="metric"><small>Orizzonte</small><strong>${item.horizon}</strong></div>
      </div>
      <div class="reasons">${item.reasons.slice(0, 2).join(" · ")}</div>
    </article>
  `).join("");

  $$(".card").forEach(card => card.addEventListener("click", () => openDetails(card.dataset.ticker)));
}

function openDetails(ticker) {
  const item = opportunities.find(x => x.ticker === ticker);
  const componentMax = { Trend: 25, Momentum: 20, Fondamentali: 20, Catalizzatori: 15, Ingresso: 10, Rischio: 10 };

  $("#dialogContent").innerHTML = `
    <p class="eyebrow">${item.ticker} · ${item.sector}</p>
    <h2>${item.name}</h2>
    <p><span class="badge ${badgeClass(item.status)}">${item.status}</span> · Score ${item.score}/100</p>

    <div class="detail-list">
      <div class="detail-box"><small>Prezzo rilevato</small><h3>${item.price}</h3></div>
      <div class="detail-box"><small>Area d'ingresso</small><h3>${item.entry}</h3></div>
      <div class="detail-box"><small>Target indicativo</small><h3>${item.target}</h3></div>
      <div class="detail-box"><small>Stop tecnico</small><h3>${item.stop}</h3></div>
      <div class="detail-box"><small>Orizzonte</small><h3>${item.horizon}</h3></div>
      <div class="detail-box"><small>Rapporto R/R</small><h3>${item.rr}</h3></div>
    </div>

    <h3>Composizione score</h3>
    ${Object.entries(item.components).map(([key, value]) => `
      <div>
        <div class="metric-row"><span>${key}</span><strong>${value}/${componentMax[key]}</strong></div>
        <div class="progress"><span style="width:${(value/componentMax[key])*100}%"></span></div>
      </div>
    `).join("")}

    <h3 style="margin-top:22px">Motivazioni</h3>
    <ul>${item.reasons.map(x => `<li>${x}</li>`).join("")}</ul>
    <h3>Rischi principali</h3>
    <ul>${item.risks.map(x => `<li>${x}</li>`).join("")}</ul>
    <button class="primary" id="saveSignalBtn">Salva nello storico</button>
  `;

  $("#detailDialog").showModal();
  $("#saveSignalBtn").addEventListener("click", () => saveSignal(item));
}

function saveSignal(item) {
  const history = JSON.parse(localStorage.getItem("marketCompassHistory") || "[]");
  history.unshift({
    date: new Date().toLocaleString("it-IT"),
    ticker: item.ticker,
    name: item.name,
    score: item.score,
    status: item.status,
    price: item.price,
    target: item.target
  });
  localStorage.setItem("marketCompassHistory", JSON.stringify(history.slice(0, 100)));
  renderHistory();
  $("#detailDialog").close();
}

function renderTrading() {
  $("#tradingTable").innerHTML = `
    <table>
      <thead><tr><th>Asset</th><th>Direzione</th><th>Score</th><th>Setup</th><th>Orizzonte</th><th>Invalidazione</th></tr></thead>
      <tbody>
        ${tradingSignals.map(x => `
          <tr><td>${x.asset}</td><td>${x.direction}</td><td>${x.score}/100</td><td>${x.setup}</td><td>${x.horizon}</td><td>${x.invalidation}</td></tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("marketCompassHistory") || "[]");
  $("#historyTable").innerHTML = history.length ? `
    <table>
      <thead><tr><th>Data</th><th>Titolo</th><th>Score</th><th>Stato</th><th>Prezzo</th><th>Target</th></tr></thead>
      <tbody>${history.map(x => `
        <tr><td>${x.date}</td><td>${x.name} (${x.ticker})</td><td>${x.score}</td><td>${x.status}</td><td>${x.price}</td><td>${x.target}</td></tr>
      `).join("")}</tbody>
    </table>` : `<div class="notice">Nessun segnale salvato.</div>`;
}

function simulateRefresh() {
  opportunities.forEach(item => {
    const variation = Math.floor(Math.random() * 5) - 2;
    item.score = Math.max(50, Math.min(95, item.score + variation));
  });
  renderOpportunities();
}

$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.remove("active"));
  $$(".panel").forEach(x => x.classList.remove("active"));
  tab.classList.add("active");
  document.getElementById(tab.dataset.tab).classList.add("active");
}));

$("#sectorFilter").addEventListener("change", renderOpportunities);
$("#statusFilter").addEventListener("change", renderOpportunities);
$("#refreshBtn").addEventListener("click", simulateRefresh);
$("#closeDialog").addEventListener("click", () => $("#detailDialog").close());
$("#clearHistoryBtn").addEventListener("click", () => {
  localStorage.removeItem("marketCompassHistory");
  renderHistory();
});

populateFilters();
renderOpportunities();
renderTrading();
renderHistory();
