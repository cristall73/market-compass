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

const TIMEFRAME_LENGTHS = { "1M": 240, "1W": 240, "1D": 260, "4H": 260, "1H": 260 };
const TF_LABELS = { "1M": "Trend di fondo", "1W": "Conferma primaria", "1D": "Struttura operativa", "4H": "Timing", "1H": "Ingresso" };

const MARKET_DATA_PROVIDER = {
  name: "Caricamento dati...",
  mode: "real",
  payload: null,
  loadPromise: null,

  async load() {
    if (this.payload) return this.payload;
    if (!this.loadPromise) {
      this.loadPromise = fetch(`data/market-data.json?ts=${Date.now()}`, { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(payload => {
          if (!Array.isArray(payload.assets) || payload.assets.length === 0) {
            throw new Error("Il file dati reali non è stato ancora generato");
          }
          this.payload = payload;
          this.name = payload.provider || "Dati reali";
          return payload;
        });
    }
    return this.loadPromise;
  },

  async getCandles(asset, timeframe) {
    const payload = await this.load();
    const market = payload.assets.find(item => item.symbol === asset.symbol);
    const candles = market?.timeframes?.[timeframe];

    if (!Array.isArray(candles) || candles.length < 20) {
      throw new Error(`Dati insufficienti per ${asset.symbol} ${timeframe}`);
    }

    return candles.map(candle => ({
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      time: candle.time
    }));
  },

  getGeneratedAt() {
    return this.payload?.generatedAt ? new Date(this.payload.generatedAt) : null;
  }
};

let analyses = [];
let refreshSeed = 0;
let lastUpdate = null;

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function hashString(text) {
  return [...text].reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
}

function generateCandles(asset, timeframe, seedOffset = 0) {
  const seed = Math.abs(hashString(asset.symbol + timeframe)) + seedOffset * 7919;
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

function operationalPlan(result) {
  const d1 = result.details["1D"];
  const h4 = result.details["4H"];
  const h1 = result.details["1H"];
  const current = h1?.current ?? h4?.current ?? d1?.current ?? 0;
  const atr = h1?.atr ?? h4?.atr ?? d1?.atr ?? 0;
  const swing = h1?.swing ?? h4?.swing ?? d1?.swing;
  const midpoint = swing?.midpoint ?? current;

  const trendDirection = result.score >= 0 ? 1 : -1;
  const entry = midpoint;
  const stop = trendDirection > 0 ? entry - atr * 1.2 : entry + atr * 1.2;
  const target = trendDirection > 0 ? entry + atr * 2.4 : entry - atr * 2.4;
  const rr = atr > 0 ? Math.abs(target - entry) / Math.abs(entry - stop) : 0;
  const distancePoints = current - entry;
  const distancePercent = entry ? (distancePoints / entry) * 100 : 0;

  let action = "ATTENDI";
  let actionReason = "Nessun vantaggio operativo sufficiente.";

  if (result.direction === "LONG") {
    const closeEnough = Math.abs(current - entry) <= atr * 0.45;
    action = closeEnough ? "VALUTA LONG" : "ATTENDI RITRACCIAMENTO";
    actionReason = closeEnough
      ? "Trend rialzista e prezzo vicino alla zona di ingresso."
      : "Trend rialzista, ma il prezzo non è ancora nella zona ideale del 50%.";
  } else if (result.direction === "SHORT") {
    const closeEnough = Math.abs(current - entry) <= atr * 0.45;
    action = closeEnough ? "VALUTA SHORT" : "ATTENDI RIMBALZO";
    actionReason = closeEnough
      ? "Trend ribassista e prezzo vicino alla zona di ingresso."
      : "Trend ribassista, ma serve un ritorno verso la zona ideale.";
  }

  return {
    current, entry, stop, target, rr,
    distancePoints, distancePercent,
    action, actionReason
  };
}

function weightedReasons(result) {
  const reasons = [];
  const tfWeights = { "1M": 18, "1W": 22, "1D": 25, "4H": 20, "1H": 15 };

  for (const tf of window.TRADING_CONFIG.timeframes) {
    const detail = result.details[tf];
    if (!detail?.valid) continue;
    reasons.push({
      label: `${tf} · ${TF_LABELS[tf]}`,
      value: Math.round((detail.score / 100) * tfWeights[tf])
    });
  }

  const d1 = result.details["1D"];

  if (d1?.movingAverages?.ma200 && d1?.current) {
    reasons.push({
      label: "Prezzo rispetto a EMA 200",
      value: d1.current > d1.movingAverages.ma200 ? 8 : -8
    });
  }

  if (d1?.rsi != null) {
    let value = 0;
    if (d1.rsi >= 55 && d1.rsi <= 72) value = 5;
    else if (d1.rsi <= 45 && d1.rsi >= 28) value = -5;
    reasons.push({ label: `RSI giornaliero ${d1.rsi.toFixed(1)}`, value });
  }

  if (d1?.nadaraya != null && d1?.current != null) {
    reasons.push({
      label: "Nadaraya giornaliero",
      value: d1.current > d1.nadaraya ? 7 : -7
    });
  }

  if (d1?.patterns?.length) {
    const bearish = d1.patterns.some(p => p.includes("top") || p === "head-and-shoulders");
    const bullish = d1.patterns.some(p => p.includes("bottom") || p.includes("inverse"));
    reasons.push({
      label: `Pattern: ${d1.patterns.join(", ")}`,
      value: bullish ? 10 : bearish ? -10 : 0
    });
  }

  return reasons.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

async function analyzeAll() {
  analyses = [];
  await MARKET_DATA_PROVIDER.load();

  for (const asset of ASSETS) {
    try {
      const data = {};
      for (const tf of window.TRADING_CONFIG.timeframes) {
        data[tf] = await MARKET_DATA_PROVIDER.getCandles(asset, tf);
      }
      const result = window.TradingEngine.analyzeMarket(data);
      analyses.push({ asset, result, plan: operationalPlan(result) });
    } catch (error) {
      console.error(`Errore ${asset.symbol}:`, error);
    }
  }

  lastUpdate = MARKET_DATA_PROVIDER.getGeneratedAt() || new Date();
}

function badgeClass(direction) {
  return direction.toLowerCase();
}

function scoreClass(score) {
  if (score >= 35) return "score-positive";
  if (score <= -35) return "score-negative";
  return "score-neutral";
}

function tfClass(score) {
  if (score > 20) return "positive";
  if (score < -20) return "negative";
  return "";
}

function tfDirection(score) {
  if (score >= 35) return "LONG";
  if (score <= -35) return "SHORT";
  return "WAIT";
}

function stars(confidence) {
  const filled = Math.max(1, Math.min(5, Math.ceil(confidence / 20)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function number(value, digits = 2) {
  return value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(digits);
}

function formatTime(date) {
  return date ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

function renderSummary() {
  document.querySelector("#assetCount").textContent = analyses.length;
  document.querySelector("#longCount").textContent = analyses.filter(x => x.result.direction === "LONG").length;
  document.querySelector("#shortCount").textContent = analyses.filter(x => x.result.direction === "SHORT").length;
  document.querySelector("#waitCount").textContent = analyses.filter(x => x.result.direction === "WAIT").length;

  let banner = document.querySelector(".opportunity-banner");
  if (!banner) {
    banner = document.createElement("section");
    banner.className = "opportunity-banner";
    document.querySelector("main").insertBefore(banner, document.querySelector(".notice"));
  }

  const best = [...analyses].sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score))[0];

  banner.innerHTML = `
    <div>
      <small>MIGLIORE CONFIGURAZIONE REALE</small>
      <strong>${best.asset.name} · ${best.result.direction}</strong>
      <div class="stars">${stars(best.result.confidence)}</div>
      <div class="update-meta">
        Aggiornato alle ${formatTime(lastUpdate)}
        <span class="data-source-badge">${MARKET_DATA_PROVIDER.name}</span>
      </div>
    </div>
    <div>
      <small>SCORE</small>
      <strong class="${scoreClass(best.result.score)}">${best.result.score}%</strong>
      <div>${best.plan.action}</div>
    </div>
  `;
}

function renderCards() {
  const filter = document.querySelector("#directionFilter").value;

  const visible = analyses
    .filter(x => filter === "ALL" || x.result.direction === filter)
    .sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score));

  document.querySelector("#marketGrid").innerHTML = visible.map(({ asset, result, plan }) => `
    <article class="market-card" data-symbol="${asset.symbol}">
      <div class="card-top">
        <div>
          <h3>${asset.name}</h3>
          <div class="symbol">${asset.symbol}</div>
        </div>
        <div class="score ${scoreClass(result.score)}">${result.score}%</div>
      </div>

      <div class="score-row">
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
        <span class="stars">${stars(result.confidence)}</span>
      </div>

      <div class="card-prices">
        <div class="card-price">
          <small>Prezzo attuale</small>
          <strong>${number(plan.current, 2)}</strong>
        </div>
        <div class="card-price">
          <small>Entrata ideale</small>
          <strong>${number(plan.entry, 2)}</strong>
        </div>
        <div class="card-price">
          <small>Target</small>
          <strong>${number(plan.target, 2)}</strong>
        </div>
      </div>

      <div class="timeframes">
        ${window.TRADING_CONFIG.timeframes.map(tf => {
          const score = result.details[tf]?.score ?? 0;
          return `
            <div class="tf-chip ${tfClass(score)}">
              <small>${tf}</small>
              <strong>${tfDirection(score)}</strong>
            </div>`;
        }).join("")}
      </div>

      <div class="card-footer">
        <strong>${plan.action}</strong><br>
        Distanza entrata: ${number(plan.distancePoints, 2)} (${number(plan.distancePercent, 2)}%)
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".market-card").forEach(card => {
    card.addEventListener("click", () => openDetails(card.dataset.symbol));
  });
}

function openDetails(symbol) {
  const analysis = analyses.find(x => x.asset.symbol === symbol);
  if (!analysis) return;

  const { asset, result, plan } = analysis;
  const reasons = weightedReasons(result);

  document.querySelector("#dialogContent").innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${asset.symbol}</p>
        <h2>${asset.name}</h2>
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
        <div class="stars">${stars(result.confidence)}</div>
      </div>
      <div>
        <div class="score ${scoreClass(result.score)}">${result.score}%</div>
        <div class="symbol">Score aggregato</div>
      </div>
    </div>

    <section class="operation-panel">
      <h3>OPERAZIONE · ${plan.action}</h3>
      <p>${plan.actionReason}</p>

      <div class="operation-grid">
        <div class="operation-item">
          <small>Prezzo attuale</small>
          <strong>${number(plan.current, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Entrata ideale 50%</small>
          <strong>${number(plan.entry, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Stop tecnico</small>
          <strong>${number(plan.stop, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Target</small>
          <strong>${number(plan.target, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Risk / Reward</small>
          <strong>1 : ${number(plan.rr, 2)}</strong>
        </div>
      </div>

      <div class="distance-line">
        Distanza dal punto d'ingresso:
        <strong>${number(plan.distancePoints, 2)}</strong>
        (${number(plan.distancePercent, 2)}%)
      </div>
    </section>

    <h3 style="margin-top:22px">Contributi allo score</h3>
    <table class="reason-table">
      <tbody>
        ${reasons.map(reason => `
          <tr>
            <td>${reason.label}</td>
            <td class="${reason.value >= 0 ? "reason-plus" : "reason-minus"}">
              ${reason.value >= 0 ? "+" : ""}${reason.value}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <h3 style="margin-top:22px">Analisi per timeframe</h3>
    <div class="detail-grid">
      ${window.TRADING_CONFIG.timeframes.map(tf => {
        const detail = result.details[tf];
        const direction = tfDirection(detail?.score ?? 0);
        return `
          <section class="tf-card">
            <h3>${tf}</h3>
            <span class="tf-state ${direction.toLowerCase()}">${direction}</span>
            <div class="symbol">${TF_LABELS[tf]}</div>
            <div class="tf-score ${scoreClass(detail?.score ?? 0)}">${detail?.score ?? 0}%</div>
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

async function refreshDashboard() {
  const button = document.querySelector("#refreshBtn");
  button.disabled = true;
  button.textContent = "Aggiornamento...";

  MARKET_DATA_PROVIDER.payload = null;
  MARKET_DATA_PROVIDER.loadPromise = null;
  await analyzeAll();
  renderSummary();
  renderCards();

  button.disabled = false;
  button.textContent = "Aggiorna dati";
}

document.querySelector("#refreshBtn").addEventListener("click", refreshDashboard);
document.querySelector("#directionFilter").addEventListener("change", renderCards);
document.querySelector("#closeDialog").addEventListener("click", () => {
  document.querySelector("#detailDialog").close();
});

(async () => {
  try {
    await analyzeAll();
    renderSummary();
    renderCards();
  } catch (error) {
    console.error(error);
    document.querySelector("#marketGrid").innerHTML = `
      <div class="notice">
        <strong>Dati reali non ancora disponibili.</strong><br>
        Esegui una volta il workflow “Aggiorna dati di mercato” nella sezione Actions di GitHub.
      </div>`;
    document.querySelector("#refreshBtn").disabled = true;
  }
})();
