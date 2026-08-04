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
  const swing = h4?.swing ?? h1?.swing ?? d1?.swing;
  const midpoint = swing?.midpoint ?? current;

  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const directionSign = isShort ? -1 : 1;

  // Zona d'ingresso: ritracciamento del 50% con tolleranza ATR.
  const entry = midpoint;
  const entryTolerance = atr * 0.30;
  const entryLow = entry - entryTolerance;
  const entryHigh = entry + entryTolerance;

  // Livelli tecnici costruiti sul rischio ATR.
  const stopDistance = Math.max(atr * 1.25, Math.abs(current - entry) * 0.20);
  const tp1Distance = stopDistance * 1.00;
  const tp2Distance = stopDistance * 2.20;
  const tp3Distance = stopDistance * 3.20;
  const stop = entry - directionSign * stopDistance;
  const tp1 = entry + directionSign * tp1Distance;
  const tp2 = entry + directionSign * tp2Distance;
  const tp3 = entry + directionSign * tp3Distance;
  const target = tp2;
  const rr = stopDistance > 0 ? tp2Distance / stopDistance : 0;

  const distancePoints = current - entry;
  const distancePercent = entry ? (distancePoints / entry) * 100 : 0;
  const distanceAtr = atr ? Math.abs(distancePoints) / atr : 0;

  const h4Direction = tfDirection(h4?.score ?? 0);
  const h1Direction = tfDirection(h1?.score ?? 0);
  const lowerTfConfirmed =
    (isLong && h4Direction !== "SHORT" && h1Direction === "LONG") ||
    (isShort && h4Direction !== "LONG" && h1Direction === "SHORT");

  const inEntryZone = current >= entryLow && current <= entryHigh;
  const alreadyBeyondTarget = isLong ? current >= target : isShort ? current <= target : false;
  const wrongSideOfEntry = isLong ? current < stop : isShort ? current > stop : false;

  let action = "NESSUN TRADE";
  let actionCode = "NO_TRADE";
  let actionReason = "Direzione tecnica non abbastanza chiara.";
  let timingScore = 0;

  if (result.direction === "WAIT") {
    timingScore = Math.round(result.confidence * 0.35);
  } else if (wrongSideOfEntry) {
    action = "SETUP INVALIDATO";
    actionCode = "INVALID";
    actionReason = "Il prezzo ha già superato il livello di invalidazione tecnica.";
    timingScore = 10;
  } else if (alreadyBeyondTarget) {
    action = "NON INSEGUIRE";
    actionCode = "EXTENDED";
    actionReason = "Il movimento ha già raggiunto o superato il target calcolato.";
    timingScore = 20;
  } else if (inEntryZone && lowerTfConfirmed) {
    action = isLong ? "VALUTA LONG ORA" : "VALUTA SHORT ORA";
    actionCode = "READY";
    actionReason = "Prezzo nella zona ideale e timeframe operativi concordi.";
    timingScore = 90;
  } else if (inEntryZone) {
    action = "ATTENDI CONFERMA 1H";
    actionCode = "CONFIRM";
    actionReason = "Prezzo nella zona ideale, ma manca la conferma del timeframe 1H.";
    timingScore = 70;
  } else if (distanceAtr <= 1.25) {
    action = isLong ? "ATTENDI RITRACCIAMENTO" : "ATTENDI RIMBALZO";
    actionCode = "NEAR";
    actionReason = "Direzione valida, prezzo ancora vicino alla zona operativa.";
    timingScore = 55;
  } else {
    action = "TROPPO ESTESO";
    actionCode = "EXTENDED";
    actionReason = "Direzione valida, ma il prezzo è troppo distante dall'entrata ideale.";
    timingScore = 30;
  }

  const opportunityScore = Math.min(
    100,
    Math.round(result.confidence * 0.65 + timingScore * 0.35)
  );

  return {
    current,
    entry,
    entryLow,
    entryHigh,
    stop,
    target,
    tp1,
    tp2,
    tp3,
    rr,
    riskPoints: stopDistance,
    rewardPoints: tp2Distance,
    riskPercent: entry ? (stopDistance / entry) * 100 : 0,
    rewardPercent: entry ? (tp2Distance / entry) * 100 : 0,
    distancePoints,
    distancePercent,
    distanceAtr,
    action,
    actionCode,
    actionReason,
    opportunityScore,
    lowerTfConfirmed
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
  if (score >= 25) return "LONG";
  if (score <= -25) return "SHORT";
  return "WAIT";
}

function stars(confidence) {
  const filled = Math.max(1, Math.min(5, Math.ceil(confidence / 20)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function strengthLabel(result) {
  if (result.direction === "LONG") return `Forza LONG ${result.confidence}%`;
  if (result.direction === "SHORT") return `Forza SHORT ${result.confidence}%`;
  return `Segnale neutrale ${result.confidence}%`;
}

function rankingScore(item) {
  const actionableBonus = item.plan.actionCode === "READY" ? 22
    : item.plan.actionCode === "CONFIRM" ? 14
    : item.plan.actionCode === "NEAR" ? 8
    : 0;
  return item.plan.opportunityScore + actionableBonus;
}

function actionClass(code) {
  if (code === "READY") return "ready";
  if (code === "CONFIRM" || code === "NEAR") return "pending";
  if (code === "INVALID" || code === "EXTENDED") return "blocked";
  return "neutral";
}

function number(value, digits = 2) {
  return value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(digits);
}

function formatTime(date) {
  return date ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

function timeframeSentence(tf, detail) {
  const direction = tfDirection(detail?.score ?? 0);
  const label = TF_LABELS[tf].toLowerCase();
  if (direction === "LONG") return `${tf}: ${label} rialzista`;
  if (direction === "SHORT") return `${tf}: ${label} ribassista`;
  return `${tf}: ${label} neutrale o in transizione`;
}

function buildNarrative(asset, result, plan) {
  const d1 = result.details["1D"];
  const h4 = result.details["4H"];
  const h1 = result.details["1H"];
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";

  const timeframeStory = window.TRADING_CONFIG.timeframes
    .map(tf => timeframeSentence(tf, result.details[tf]))
    .join(". ") + ".";

  let overview;
  if (result.direction === "WAIT") {
    overview = `Su ${asset.name} i timeframe non danno ancora una direzione abbastanza coerente. La scelta prudente è non anticipare il mercato e attendere che almeno il Giornaliero, il 4H e l’1H si allineino.`;
  } else {
    overview = `Su ${asset.name} la direzione prevalente è ${result.direction}. La concordanza tra timeframe è del ${result.alignment}% e la forza tecnica interna è del ${result.confidence}%. ${timeframeStory}`;
  }

  let entryExplanation;
  if (plan.actionCode === "READY") {
    entryExplanation = `Il prezzo è già dentro la zona operativa ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)} e il timeframe 1H conferma la direzione. Il setup può essere valutato adesso, evitando comunque ingressi impulsivi durante candele molto estese.`;
  } else if (plan.actionCode === "CONFIRM") {
    entryExplanation = `Il prezzo è arrivato nella zona operativa ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}, ma manca ancora una conferma sull’1H. Conviene aspettare una chiusura 1H nella direzione del trend, una candela di reazione oppure il recupero del momentum.`;
  } else if (plan.actionCode === "NEAR") {
    const move = isLong ? "ritracciamento" : isShort ? "rimbalzo" : "movimento";
    entryExplanation = `Il trend è valido, ma il prezzo è ancora fuori dalla zona migliore. È preferibile attendere un ${move} verso ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}: entrare prima ridurrebbe il rapporto rischio/rendimento.`;
  } else if (plan.actionCode === "EXTENDED") {
    entryExplanation = `Il prezzo è troppo lontano dall’area di ingresso. Inseguire il movimento ora significherebbe accettare uno stop più ampio e un rendimento potenziale inferiore. Meglio aspettare un ritorno verso ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}.`;
  } else if (plan.actionCode === "INVALID") {
    entryExplanation = `Il prezzo ha oltrepassato il livello che invalidava il setup. Non è più corretto usare questo piano: serve una nuova struttura prima di valutare un ingresso.`;
  } else {
    entryExplanation = `Non è presente un vantaggio operativo sufficiente. Meglio restare fuori finché direzione e timing non diventano più chiari.`;
  }

  const confirmationRules = [];
  if (isLong) {
    confirmationRules.push("chiusura 1H sopra il massimo della candela di reazione");
    confirmationRules.push("RSI 1H sopra 50 o in recupero");
    confirmationRules.push("assenza di una rottura netta sotto la zona d’ingresso");
  } else if (isShort) {
    confirmationRules.push("chiusura 1H sotto il minimo della candela di reazione");
    confirmationRules.push("RSI 1H sotto 50 o in indebolimento");
    confirmationRules.push("assenza di una rottura netta sopra la zona d’ingresso");
  } else {
    confirmationRules.push("allineamento di Giornaliero, 4H e 1H");
    confirmationRules.push("rottura confermata di un supporto o di una resistenza");
    confirmationRules.push("momentum coerente con la nuova direzione");
  }

  const stopExplanation = result.direction === "WAIT"
    ? `Non viene suggerito uno stop operativo perché non esiste ancora un setup direzionale valido.`
    : `Lo stop tecnico è a ${number(plan.stop, 2)}. Dalla zona centrale d’ingresso rappresenta circa ${number(plan.riskPoints, 2)} punti, pari al ${number(plan.riskPercent, 2)}%. Se viene colpito, il movimento atteso non si sta sviluppando come previsto e il setup va considerato invalidato.`;

  const targetExplanation = result.direction === "WAIT"
    ? `I target restano indicativi finché non emerge una direzione valida.`
    : `TP1 è a ${number(plan.tp1, 2)}: equivale a circa 1R e può servire per proteggere l’operazione. TP2 è a ${number(plan.tp2, 2)}: rappresenta circa ${number(plan.rewardPoints, 2)} punti, cioè ${number(plan.rewardPercent, 2)}% dalla zona centrale d’ingresso, con un rapporto rischio/rendimento di 1:${number(plan.rr, 2)}. TP3 a ${number(plan.tp3, 2)} è un’estensione da considerare solo se il trend resta forte.`;

  const indicatorNotes = [];
  if (d1?.movingAverages?.ma200 && d1?.current) {
    indicatorNotes.push(d1.current > d1.movingAverages.ma200
      ? "il prezzo giornaliero è sopra EMA 200, quindi la struttura di lungo periodo resta favorevole"
      : "il prezzo giornaliero è sotto EMA 200, quindi la struttura di lungo periodo resta debole");
  }
  if (d1?.nadaraya != null && d1?.current != null) {
    indicatorNotes.push(d1.current > d1.nadaraya
      ? "il prezzo è sopra Nadaraya sul Giornaliero"
      : "il prezzo è sotto Nadaraya sul Giornaliero");
  }
  if (h4?.rsi != null) {
    indicatorNotes.push(`RSI 4H a ${number(h4.rsi, 1)}`);
  }
  if (h1?.rsi != null) {
    indicatorNotes.push(`RSI 1H a ${number(h1.rsi, 1)}`);
  }

  return {
    overview,
    entryExplanation,
    confirmationRules,
    stopExplanation,
    targetExplanation,
    indicatorNotes
  };
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

  const ranking = [...analyses]
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .slice(0, 3);

  banner.innerHTML = `
    <div>
      <small>CLASSIFICA OPERATIVA REALE</small>
      ${ranking.map((item, index) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)">
          <strong style="font-size:1rem">${index + 1}. ${item.asset.name}</strong>
          <span class="badge ${badgeClass(item.result.direction)}">${item.result.direction}</span>
          <span class="action-pill ${actionClass(item.plan.actionCode)}">${item.plan.action}</span>
          <span>${item.plan.opportunityScore}%</span>
        </div>
      `).join("")}
      <div class="update-meta">
        Aggiornato alle ${formatTime(lastUpdate)}
        <span class="data-source-badge">${MARKET_DATA_PROVIDER.name}</span>
      </div>
    </div>
    <div>
      <small>MIGLIORE ASSET</small>
      <strong>${ranking[0].asset.name}</strong>
      <div class="stars">${stars(ranking[0].plan.opportunityScore)}</div>
      <div class="action-pill ${actionClass(ranking[0].plan.actionCode)}">${ranking[0].plan.action}</div>
      <div class="symbol">Qualità opportunità ${ranking[0].plan.opportunityScore}%</div>
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
        <div><div class="score ${scoreClass(result.score)}">${result.score}%</div><div class="symbol">${strengthLabel(result)}</div></div>
      </div>

      <div class="score-row">
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
        <span class="action-pill ${actionClass(plan.actionCode)}">${plan.action}</span>
      </div>
      <div class="quality-row">
        <span>Qualità opportunità</span>
        <strong>${plan.opportunityScore}%</strong>
      </div>

      <div class="card-prices">
        <div class="card-price">
          <small>Prezzo attuale</small>
          <strong>${number(plan.current, 2)}</strong>
        </div>
        <div class="card-price">
          <small>Zona entrata</small>
          <strong>${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}</strong>
        </div>
        <div class="card-price">
          <small>Stop / Target</small>
          <strong>${number(plan.stop, 2)} / ${number(plan.target, 2)}</strong>
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
        <strong>${plan.actionReason}</strong><br>
        R/R 1:${number(plan.rr, 2)} · Concordanza ${result.alignment}%<br>
        Distanza entrata: ${number(plan.distancePoints, 2)} (${number(plan.distancePercent, 2)}%)<br>
        <span class="open-analysis">Apri la scheda per il ragionamento completo</span>
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
        <div><div class="score ${scoreClass(result.score)}">${result.score}%</div><div class="symbol">${strengthLabel(result)}</div></div>
        <div class="symbol">${strengthLabel(result)} · Concordanza ${result.alignment}%</div>
      </div>
    </div>

    <section class="operation-panel">
      <h3>DECISIONE OPERATIVA</h3>
      <div class="decision-line">
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
        <span class="action-pill ${actionClass(plan.actionCode)}">${plan.action}</span>
        <strong>Qualità ${plan.opportunityScore}%</strong>
      </div>
      <p>${plan.actionReason}</p>

      <div class="operation-grid">
        <div class="operation-item">
          <small>Prezzo attuale</small>
          <strong>${number(plan.current, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Zona entrata 50%</small>
          <strong>${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>Stop tecnico</small>
          <strong>${number(plan.stop, 2)}</strong>
        </div>
        <div class="operation-item">
          <small>TP1 / TP2 / TP3</small>
          <strong>${number(plan.tp1, 2)} / ${number(plan.tp2, 2)} / ${number(plan.tp3, 2)}</strong>
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

    ${(() => {
      const narrative = buildNarrative(asset, result, plan);
      return `
        <section class="explanation-panel">
          <h3>RAGIONAMENTO OPERATIVO</h3>

          <div class="explanation-block">
            <h4>1. Lettura del mercato</h4>
            <p>${narrative.overview}</p>
          </div>

          <div class="explanation-block">
            <h4>2. Quando entrare</h4>
            <p>${narrative.entryExplanation}</p>
          </div>

          <div class="explanation-block">
            <h4>3. Conferme da aspettare</h4>
            <ul>
              ${narrative.confirmationRules.map(rule => `<li>${rule}</li>`).join("")}
            </ul>
          </div>

          <div class="explanation-grid">
            <div class="explanation-block">
              <h4>4. Significato dello stop</h4>
              <p>${narrative.stopExplanation}</p>
            </div>
            <div class="explanation-block">
              <h4>5. Significato dei target</h4>
              <p>${narrative.targetExplanation}</p>
            </div>
          </div>

          <div class="explanation-block">
            <h4>6. Elementi tecnici principali</h4>
            <ul>
              ${narrative.indicatorNotes.map(note => `<li>${note}</li>`).join("")}
            </ul>
          </div>
        </section>
      `;
    })()}

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
