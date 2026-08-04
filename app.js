const ASSETS = [
  { name: "Nasdaq 100", symbol: "USATEC", bias: 0.10, volatility: 1.35 },
  { name: "DAX 40", symbol: "GER40", bias: 0.04, volatility: 1.10 },
  { name: "S&P 500", symbol: "US500", bias: 0.07, volatility: 0.95 },
  { name: "Gold", symbol: "XAUUSD", bias: 0.05, volatility: 0.90 },
  { name: "Silver", symbol: "XAGUSD", bias: 0.02, volatility: 1.30 },
  { name: "Petrolio WTI", symbol: "WTI", bias: -0.02, volatility: 1.20 },
  { name: "EUR/USD", symbol: "EURUSD", bias: 0.01, volatility: 0.65 },
  { name: "USD/JPY", symbol: "USDJPY", bias: -0.01, volatility: 0.70 }
];

const TIMEFRAME_LENGTHS = {
  "1M": 240,
  "1W": 240,
  "1D": 260,
  "4H": 260,
  "1H": 260
};

let analyses = [];

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function hashString(text) {
  return [...text].reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
}

function generateCandles(asset, timeframe, refreshSeed = 0) {
  const seed = Math.abs(hashString(asset.symbol + timeframe)) + refreshSeed * 7919;
  const random = seededRandom(seed);
  const length = TIMEFRAME_LENGTHS[timeframe];
  const tfFactor = { "1M": 1.8, "1W": 1.35, "1D": 1, "4H": .75, "1H": .55 }[timeframe];
  let price = 100 + random() * 40;
  const candles = [];

  for (let i = 0; i < length; i++) {
    const cycle = Math.sin(i / 16) * 0.18 + Math.sin(i / 41) * 0.12;
    const drift = asset.bias * tfFactor + cycle;
    const shock = (random() - .5) * asset.volatility * tfFactor;
    const open = price;
    const close = Math.max(1, open * (1 + (drift + shock) / 100));
    const range = Math.abs(close - open) + open * (0.002 + random() * 0.006) * asset.volatility;
    const high = Math.max(open, close) + range * random();
    const low = Math.max(0.1, Math.min(open, close) - range * random());
    candles.push({ open, high, low, close });
    price = close;
  }

  return candles;
}

function analyzeAll(refreshSeed = 0) {
  analyses = ASSETS.map(asset => {
    const data = {};
    window.TRADING_CONFIG.timeframes.forEach(tf => {
      data[tf] = generateCandles(asset, tf, refreshSeed);
    });
    return {
      asset,
      result: window.TradingEngine.analyzeMarket(data)
    };
  });
}

function badgeClass(direction) {
  return direction.toLowerCase();
}

function tfClass(score) {
  if (score > 20) return "positive";
  if (score < -20) return "negative";
  return "";
}

function renderSummary() {
  document.querySelector("#assetCount").textContent = analyses.length;
  document.querySelector("#longCount").textContent = analyses.filter(x => x.result.direction === "LONG").length;
  document.querySelector("#shortCount").textContent = analyses.filter(x => x.result.direction === "SHORT").length;
  document.querySelector("#waitCount").textContent = analyses.filter(x => x.result.direction === "WAIT").length;
}

function renderCards() {
  const filter = document.querySelector("#directionFilter").value;
  const visible = analyses
    .filter(x => filter === "ALL" || x.result.direction === filter)
    .sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score));

  document.querySelector("#marketGrid").innerHTML = visible.map(({ asset, result }) => {
    const firstReason = result.details["1D"]?.reasons?.[0] || "Analisi disponibile";
    return `
      <article class="market-card" data-symbol="${asset.symbol}">
        <div class="card-top">
          <div>
            <h3>${asset.name}</h3>
            <div class="symbol">${asset.symbol}</div>
          </div>
          <div class="score">${result.score}</div>
        </div>

        <div class="score-row">
          <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
          <span>Affidabilità ${result.confidence}%</span>
        </div>

        <div class="timeframes">
          ${window.TRADING_CONFIG.timeframes.map(tf => {
            const score = result.details[tf]?.score ?? 0;
            return `
              <div class="tf-chip ${tfClass(score)}">
                <small>${tf}</small>
                <strong>${score}</strong>
              </div>`;
          }).join("")}
        </div>

        <div class="card-footer">
          ${firstReason} · ingresso preferito su ritracciamento del 50%
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".market-card").forEach(card => {
    card.addEventListener("click", () => openDetails(card.dataset.symbol));
  });
}

function number(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function openDetails(symbol) {
  const analysis = analyses.find(x => x.asset.symbol === symbol);
  if (!analysis) return;

  const { asset, result } = analysis;

  document.querySelector("#dialogContent").innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${asset.symbol}</p>
        <h2>${asset.name}</h2>
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
      </div>
      <div>
        <div class="score">${result.score}</div>
        <div class="symbol">Score aggregato</div>
      </div>
    </div>

    <div class="detail-grid">
      ${window.TRADING_CONFIG.timeframes.map(tf => {
        const detail = result.details[tf];
        return `
          <section class="tf-card">
            <h3>${tf}</h3>
            <div class="tf-score">${detail?.score ?? 0}</div>
            <div class="metric"><span>RSI</span><strong>${number(detail?.rsi, 1)}</strong></div>
            <div class="metric"><span>Stocastico</span><strong>${number(detail?.stochastic, 1)}</strong></div>
            <div class="metric"><span>ATR</span><strong>${number(detail?.atr, 3)}</strong></div>
            <div class="metric"><span>Nadaraya</span><strong>${number(detail?.nadaraya, 2)}</strong></div>
            <div class="metric"><span>50% swing</span><strong>${number(detail?.swing?.midpoint, 2)}</strong></div>
            <div class="metric"><span>EMA 200</span><strong>${number(detail?.movingAverages?.ma200, 2)}</strong></div>
            <ul class="reasons">
              ${(detail?.reasons || []).map(reason => `<li>${reason}</li>`).join("")}
            </ul>
          </section>`;
      }).join("")}
    </div>
  `;

  document.querySelector("#detailDialog").showModal();
}

let refreshSeed = 0;

document.querySelector("#refreshBtn").addEventListener("click", () => {
  refreshSeed += 1;
  analyzeAll(refreshSeed);
  renderSummary();
  renderCards();
});

document.querySelector("#directionFilter").addEventListener("change", renderCards);
document.querySelector("#closeDialog").addEventListener("click", () => {
  document.querySelector("#detailDialog").close();
});

analyzeAll();
renderSummary();
renderCards();
