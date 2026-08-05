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


function localAtr(candles, period = 14) {
  if (!candles?.length || candles.length < period + 1) return 0;
  const values = candles.map((candle, index) => {
    if (!index) return candle.high - candle.low;
    const previous = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous),
      Math.abs(candle.low - previous)
    );
  });
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function findPivots(candles, timeframe, lookback = 220) {
  const source = (candles || []).slice(-lookback);
  const points = [];
  for (let i = 2; i < source.length - 2; i++) {
    const candle = source[i];
    const high = candle.high > source[i-1].high && candle.high > source[i-2].high
      && candle.high >= source[i+1].high && candle.high >= source[i+2].high;
    const low = candle.low < source[i-1].low && candle.low < source[i-2].low
      && candle.low <= source[i+1].low && candle.low <= source[i+2].low;
    if (high) points.push({ price: candle.high, kind: "resistance", timeframe, recency: i/source.length });
    if (low) points.push({ price: candle.low, kind: "support", timeframe, recency: i/source.length });
  }
  return points;
}

function clusterLevels(points, tolerance) {
  const groups = [];
  [...points].sort((a,b) => a.price-b.price).forEach(point => {
    let group = groups.find(item => Math.abs(item.price-point.price) <= tolerance);
    if (!group) {
      group = { price: point.price, points: [] };
      groups.push(group);
    }
    group.points.push(point);
    group.price = group.points.reduce((sum,item) => sum+item.price,0) / group.points.length;
  });

  const tfWeight = { "1M":4, "1W":3, "1D":2 };
  return groups.map(group => {
    const support = group.points.filter(x => x.kind === "support").length;
    const resistance = group.points.filter(x => x.kind === "resistance").length;
    const kind = support > resistance ? "support" : resistance > support ? "resistance" : "mixed";
    const timeframes = [...new Set(group.points.map(x => x.timeframe))];
    const touches = group.points.length;
    const recency = Math.max(...group.points.map(x => x.recency));
    const weight = Math.max(...timeframes.map(tf => tfWeight[tf] || 1));
    return {
      price: group.price,
      kind,
      timeframes,
      touches,
      strength: Math.min(10, Math.round(touches*1.25 + weight + recency*2))
    };
  }).filter(level => level.touches >= 2 || level.timeframes.includes("1M"));
}

function findOrderBlocks(candles, timeframe, atrValue) {
  const source = (candles || []).slice(-100);
  const blocks = [];
  if (!atrValue) return blocks;
  for (let i=1; i<source.length-3; i++) {
    const base = source[i];
    const end = source[i+3];
    const up = end.close-base.close;
    const down = base.close-end.close;
    if (base.close < base.open && up > atrValue*1.6) {
      blocks.push({ kind:"bullish", timeframe, low:base.low, high:Math.max(base.open,base.close), strength:Math.min(10,Math.round(5+up/atrValue)) });
    }
    if (base.close > base.open && down > atrValue*1.6) {
      blocks.push({ kind:"bearish", timeframe, low:Math.min(base.open,base.close), high:base.high, strength:Math.min(10,Math.round(5+down/atrValue)) });
    }
  }
  return blocks.slice(-4).reverse();
}

function findFvgs(candles, timeframe, atrValue) {
  const source = (candles || []).slice(-120);
  const gaps = [];
  if (!atrValue) return gaps;
  for (let i=2; i<source.length; i++) {
    const a = source[i-2], c = source[i];
    if (a.high < c.low && c.low-a.high >= atrValue*.12) gaps.push({kind:"bullish",timeframe,low:a.high,high:c.low,strength:5});
    if (a.low > c.high && a.low-c.high >= atrValue*.12) gaps.push({kind:"bearish",timeframe,low:c.high,high:a.low,strength:5});
  }
  return gaps.slice(-5).reverse();
}

function findFibonacci(candles, lookback=90) {
  const source = (candles || []).slice(-lookback);
  if (source.length < 20) return null;
  let hi=0, lo=0;
  source.forEach((c,i) => { if(c.high>source[hi].high) hi=i; if(c.low<source[lo].low) lo=i; });
  const high=source[hi].high, low=source[lo].low, range=high-low;
  if (range<=0) return null;
  const bullish = lo < hi;
  const price = ratio => bullish ? high-range*ratio : low+range*ratio;
  return { direction:bullish?"bullish":"bearish", high, low, levels:[.382,.5,.618].map(ratio=>({ratio,price:price(ratio)})) };
}

function zoneDistance(zone, price) {
  if (price < zone.low) return zone.low-price;
  if (price > zone.high) return price-zone.high;
  return 0;
}

function analyzeStructure(data, result, plan) {
  const current = plan.current;
  const dAtr = localAtr(data["1D"]) || result.details["1D"]?.atr || 0;
  const hAtr = localAtr(data["4H"]) || result.details["4H"]?.atr || dAtr;
  const tolerance = Math.max(dAtr*.45,current*.0015);

  const pivots = [
    ...findPivots(data["1M"],"1M",120),
    ...findPivots(data["1W"],"1W",220),
    ...findPivots(data["1D"],"1D",260)
  ];
  const levels = clusterLevels(pivots,tolerance)
    .filter(level => Math.abs(level.price-current) <= Math.max(dAtr*14,current*.2))
    .sort((a,b)=>b.strength-a.strength);

  const supports = levels.filter(x=>x.price<=current).sort((a,b)=>b.price-a.price).slice(0,5);
  const resistances = levels.filter(x=>x.price>=current).sort((a,b)=>a.price-b.price).slice(0,5);
  const demand = supports.slice(0,3).map(x=>({low:x.price-dAtr*.28,high:x.price+dAtr*.28,strength:x.strength,label:`${x.timeframes.join("+")} · ${x.touches} reazioni`}));
  const supply = resistances.slice(0,3).map(x=>({low:x.price-dAtr*.28,high:x.price+dAtr*.28,strength:x.strength,label:`${x.timeframes.join("+")} · ${x.touches} reazioni`}));
  const orderBlocks = [...findOrderBlocks(data["1D"],"1D",dAtr),...findOrderBlocks(data["4H"],"4H",hAtr)];
  const fvgs = [...findFvgs(data["1D"],"1D",dAtr),...findFvgs(data["4H"],"4H",hAtr)];
  const fibonacci = findFibonacci(data["1D"]);
  const entryTolerance = Math.max(hAtr*.55,current*.0015);
  const isLong=result.direction==="LONG", isShort=result.direction==="SHORT";
  const confluences=[];

  const addPoint=(label,price,weight,detail="")=>{
    if(price!=null && Math.abs(price-plan.entry)<=entryTolerance) confluences.push({label,price,weight,detail});
  };

  levels.forEach(level=>{
    const valid = isLong ? level.kind!=="resistance" : isShort ? level.kind!=="support" : true;
    if(valid) addPoint(`${level.kind==="support"?"Supporto":level.kind==="resistance"?"Resistenza":"Livello"} ${level.timeframes.join("+")}`,level.price,1+level.strength*.12,`${level.touches} reazioni`);
  });

  const d1=result.details["1D"], h4=result.details["4H"];
  addPoint("EMA 200 Daily",d1?.movingAverages?.ma200,1.3);
  addPoint("EMA 50 Daily",d1?.movingAverages?.ma50,.8);
  addPoint("Nadaraya Daily",d1?.nadaraya,1);
  addPoint("EMA 200 4H",h4?.movingAverages?.ma200,.8);
  (fibonacci?.levels||[]).forEach(x=>addPoint(`Fibonacci ${(x.ratio*100).toFixed(1)}%`,x.price,x.ratio===.618?1.3:1));

  orderBlocks.forEach(zone=>{
    const valid = isLong ? zone.kind==="bullish" : isShort ? zone.kind==="bearish" : true;
    if(valid && zoneDistance(zone,plan.entry)<=entryTolerance) confluences.push({label:`Order Block ${zone.kind==="bullish"?"rialzista":"ribassista"} ${zone.timeframe}`,price:(zone.low+zone.high)/2,weight:1.2,detail:`${zone.low.toFixed(2)}–${zone.high.toFixed(2)}`});
  });
  fvgs.forEach(zone=>{
    const valid = isLong ? zone.kind==="bullish" : isShort ? zone.kind==="bearish" : true;
    if(valid && zoneDistance(zone,plan.entry)<=entryTolerance) confluences.push({label:`Fair Value Gap ${zone.kind==="bullish"?"rialzista":"ribassista"} ${zone.timeframe}`,price:(zone.low+zone.high)/2,weight:.8,detail:`${zone.low.toFixed(2)}–${zone.high.toFixed(2)}`});
  });

  return {
    levels,supports,resistances,demand,supply,orderBlocks,fvgs,fibonacci,
    nearestSupport:supports[0]||null,
    nearestResistance:resistances[0]||null,
    confluences:confluences.sort((a,b)=>b.weight-a.weight),
    confluenceScore:Math.max(0,Math.min(10,Math.round(confluences.reduce((sum,x)=>sum+x.weight,0))))
  };
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

  let action = "RIMANI FUORI";
  let actionCode = "NO_TRADE";
  let actionReason = "Il mercato non offre ancora un vantaggio abbastanza chiaro: restare fuori protegge il capitale.";
  let timingScore = 0;

  if (result.direction === "WAIT") {
    timingScore = Math.round(result.confidence * 0.35);
  } else if (wrongSideOfEntry) {
    action = "PIANO ANNULLATO";
    actionCode = "INVALID";
    actionReason = "Il vecchio piano non è più valido: il prezzo ha superato il livello che lo annullava.";
    timingScore = 10;
  } else if (alreadyBeyondTarget) {
    action = "NON ENTRARE ADESSO";
    actionCode = "EXTENDED";
    actionReason = "Il movimento è già partito senza di noi e ha raggiunto gran parte dello spazio previsto.";
    timingScore = 20;
  } else if (inEntryZone && lowerTfConfirmed) {
    action = isLong ? "VALUTA UN LONG ORA" : "VALUTA UNO SHORT ORA";
    actionCode = "READY";
    actionReason = "Il prezzo è nella zona prevista e 4H e 1H confermano la direzione.";
    timingScore = 90;
  } else if (inEntryZone) {
    action = "ASPETTA LA CONFERMA 1H";
    actionCode = "CONFIRM";
    actionReason = "Il prezzo è nella zona prevista, ma serve ancora una conferma chiara sull’1H.";
    timingScore = 70;
  } else if (distanceAtr <= 1.25) {
    action = isLong ? "ASPETTA IL RITORNO IN ZONA" : "ASPETTA IL RIMBALZO IN ZONA";
    actionCode = "NEAR";
    actionReason = "La direzione è valida, ma conviene aspettare che il prezzo raggiunga la zona indicata.";
    timingScore = 55;
  } else {
    action = "NON ENTRARE ADESSO";
    actionCode = "EXTENDED";
    actionReason = "Il trend è valido, ma entrare ora significherebbe arrivare tardi e accettare un rischio peggiore.";
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
      const plan = operationalPlan(result);
      const structure = analyzeStructure(data, result, plan);
      plan.confluenceScore = structure.confluenceScore;
      analyses.push({ asset, result, plan, structure, data });
    } catch (error) {
      console.error(`Errore ${asset.symbol}:`, error);
    }
  }

  lastUpdate = MARKET_DATA_PROVIDER.getGeneratedAt() || new Date();
  saveJournalSnapshot();
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
  return item.plan.opportunityScore + actionableBonus + (item.structure?.confluenceScore || 0) * 3;
}

function actionClass(code) {
  if (code === "READY") return "ready";
  if (code === "CONFIRM" || code === "NEAR") return "pending";
  if (code === "INVALID" || code === "EXTENDED") return "blocked";
  return "neutral";
}

function tenScale(value) {
  return Math.max(0, Math.min(10, Math.round(Number(value || 0) / 10)));
}

function opportunityLabel(score) {
  const value = tenScale(score);
  if (value >= 9) return "Occasione eccellente";
  if (value >= 7) return "Occasione buona";
  if (value >= 5) return "Occasione discreta";
  if (value >= 3) return "Occasione debole";
  return "Nessun vantaggio";
}

function trendLabel(result) {
  const value = tenScale(result.confidence);
  if (result.direction === "WAIT") return `Trend non chiaro · ${value}/10`;
  const side = result.direction === "LONG" ? "rialzista" : "ribassista";
  if (value >= 8) return `Trend ${side} molto forte · ${value}/10`;
  if (value >= 6) return `Trend ${side} forte · ${value}/10`;
  if (value >= 4) return `Trend ${side} moderato · ${value}/10`;
  return `Trend ${side} debole · ${value}/10`;
}

function plainActionExplanation(item) {
  const { result, plan } = item;
  if (plan.actionCode === "READY") return "Il prezzo è nella zona prevista e l’1H conferma: il trade può essere valutato.";
  if (plan.actionCode === "CONFIRM") return "Il prezzo è arrivato in zona, ma manca ancora la conferma dell’1H.";
  if (plan.actionCode === "NEAR") {
    return result.direction === "SHORT"
      ? "Aspetta un rimbalzo verso la zona indicata prima di valutare lo short."
      : "Aspetta che il prezzo torni nella zona indicata prima di valutare il long.";
  }
  if (plan.actionCode === "EXTENDED") return "Il movimento è già partito: entrare ora significherebbe arrivare tardi.";
  if (plan.actionCode === "INVALID") return "Il vecchio piano è annullato: serve una nuova struttura.";
  return "Non c’è ancora un vantaggio operativo sufficiente: meglio restare fuori.";
}

function isSetupReady(item) {
  return item.plan.actionCode === "READY";
}

function riskScore(plan) {
  const rr = Number(plan.rr || 0);
  const distanceAtr = Number(plan.distanceAtr || 0);

  let score = 5;
  if (rr >= 3) score += 2;
  else if (rr >= 2) score += 1;
  else if (rr < 1.5) score -= 2;

  if (distanceAtr <= 0.5) score += 2;
  else if (distanceAtr <= 1.25) score += 1;
  else if (distanceAtr >= 2.5) score -= 2;
  else if (distanceAtr >= 1.75) score -= 1;

  return Math.max(0, Math.min(10, Math.round(score)));
}

function finalSetupScore(item) {
  const trend = tenScale(item.result.confidence);
  const entry = tenScale(item.plan.opportunityScore);
  const confluence = item.structure?.confluenceScore || 0;
  const risk = riskScore(item.plan);

  let score =
    trend * 0.25 +
    entry * 0.40 +
    confluence * 0.20 +
    risk * 0.15;

  if (item.plan.actionCode === "READY") score += 1.2;
  if (item.plan.actionCode === "CONFIRM") score += 0.5;
  if (item.plan.actionCode === "NEAR") score += 0.2;
  if (item.plan.actionCode === "EXTENDED") score -= 1.0;
  if (item.plan.actionCode === "INVALID") score -= 2.0;
  if (item.plan.actionCode === "NO_TRADE") score -= 1.0;

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function setupScoreClass(value) {
  if (value >= 8) return "setup-excellent";
  if (value >= 6) return "setup-good";
  if (value >= 4) return "setup-medium";
  return "setup-weak";
}

function setupVerdict(value) {
  if (value >= 8) return "Setup molto interessante";
  if (value >= 6) return "Setup buono";
  if (value >= 4) return "Setup da monitorare";
  return "Setup debole";
}

function operationalStatus(item) {
  const code = item.plan.actionCode;
  const finalScore = finalSetupScore(item);

  if (code === "READY" && finalScore >= 6) {
    return {
      code: "GREEN",
      colorName: "VERDE",
      icon: "✓",
      short: "PRONTO",
      label: "SEMAFORO VERDE · INGRESSO VALUTABILE",
      explanation: "Le condizioni tecniche principali risultano soddisfatte. Verifica il grafico e la size prima di eseguire."
    };
  }

  if (code === "CONFIRM") {
    return {
      code: "YELLOW",
      colorName: "GIALLO",
      icon: "◐",
      short: "QUASI PRONTO",
      label: "SEMAFORO GIALLO · ASPETTA CONFERMA",
      explanation: "Il prezzo è nella zona operativa, ma manca ancora una conferma affidabile sul timeframe 1H."
    };
  }

  if (code === "NEAR") {
    return {
      code: "YELLOW",
      colorName: "GIALLO",
      icon: "◐",
      short: "IN ATTESA",
      label: "SEMAFORO GIALLO · ASPETTA LA ZONA",
      explanation: "La direzione è interessante, ma il prezzo non ha ancora raggiunto l’area prevista per l’ingresso."
    };
  }

  if (code === "INVALID") {
    return {
      code: "RED",
      colorName: "ROSSO",
      icon: "✕",
      short: "ANNULLATO",
      label: "SEMAFORO ROSSO · PIANO ANNULLATO",
      explanation: "Il livello di invalidazione è stato superato: il vecchio piano non deve più essere utilizzato."
    };
  }

  if (code === "EXTENDED") {
    return {
      code: "RED",
      colorName: "ROSSO",
      icon: "✕",
      short: "TARDIVO",
      label: "SEMAFORO ROSSO · NON INSEGUIRE",
      explanation: "La direzione può essere corretta, ma il prezzo è già troppo lontano dalla zona favorevole."
    };
  }

  return {
    code: "RED",
    colorName: "ROSSO",
    icon: "✕",
    short: "RIMANI FUORI",
    label: "SEMAFORO ROSSO · NESSUN INGRESSO",
    explanation: "Non esiste ancora un vantaggio operativo sufficiente per giustificare un ingresso."
  };
}

function checklistState(result, plan) {
  const items = buildChecklist(result, plan);
  const completed = items.filter(item => item.done).length;
  const missing = items.length - completed;

  return {
    items,
    completed,
    missing,
    total: items.length,
    percentage: Math.round((completed / Math.max(1, items.length)) * 100)
  };
}

function missingConditionsText(result, plan) {
  const state = checklistState(result, plan);
  if (state.missing === 0) return "Tutte le condizioni operative sono soddisfatte.";
  if (state.missing === 1) return "Manca 1 condizione prima dell’ingresso.";
  return `Mancano ${state.missing} condizioni prima dell’ingresso.`;
}

function historicalReliabilityText() {
  return "Affidabilità statistica non ancora calibrata: il voto misura la coerenza tecnica del setup, non la probabilità garantita di profitto.";
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


function buildChecklist(result, plan) {
  const h4 = result.details["4H"];
  const h1 = result.details["1H"];
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const inZone = plan.current >= plan.entryLow && plan.current <= plan.entryHigh;

  return [
    {
      label: `Prezzo nella zona ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}`,
      done: inZone
    },
    {
      label: isLong
        ? "4H non più ribassista"
        : isShort
          ? "4H non più rialzista"
          : "4H con direzione definita",
      done: isLong
        ? tfDirection(h4?.score ?? 0) !== "SHORT"
        : isShort
          ? tfDirection(h4?.score ?? 0) !== "LONG"
          : tfDirection(h4?.score ?? 0) !== "WAIT"
    },
    {
      label: isLong
        ? "1H conferma LONG"
        : isShort
          ? "1H conferma SHORT"
          : "1H conferma una direzione",
      done: isLong
        ? tfDirection(h1?.score ?? 0) === "LONG"
        : isShort
          ? tfDirection(h1?.score ?? 0) === "SHORT"
          : tfDirection(h1?.score ?? 0) !== "WAIT"
    },
    {
      label: isLong
        ? "RSI 1H sopra 50 o in recupero"
        : isShort
          ? "RSI 1H sotto 50 o in indebolimento"
          : "RSI 1H coerente con la direzione",
      done: isLong
        ? (h1?.rsi ?? 0) >= 50
        : isShort
          ? (h1?.rsi ?? 100) <= 50
          : false
    },
    {
      label: "Rapporto rischio/rendimento almeno 1:2",
      done: plan.rr >= 2
    }
  ];
}

function buildReasoningLedger(result, plan) {
  const rows = [];

  for (const tf of window.TRADING_CONFIG.timeframes) {
    const score = result.details[tf]?.score ?? 0;
    rows.push({
      label: `${tf} · ${TF_LABELS[tf]}`,
      value: Math.round(score * 0.20),
      note: tfDirection(score)
    });
  }

  rows.push({
    label: "Concordanza timeframe",
    value: Math.round((result.alignment - 50) * 0.30),
    note: `${result.alignment}%`
  });

  rows.push({
    label: "Timing rispetto alla zona d’ingresso",
    value: plan.actionCode === "READY" ? 15
      : plan.actionCode === "CONFIRM" ? 8
      : plan.actionCode === "NEAR" ? 3
      : plan.actionCode === "EXTENDED" ? -12
      : plan.actionCode === "INVALID" ? -20
      : -5,
    note: plan.action
  });

  rows.push({
    label: "Rapporto rischio/rendimento",
    value: plan.rr >= 2.5 ? 10 : plan.rr >= 2 ? 6 : plan.rr >= 1.5 ? 2 : -8,
    note: `1:${number(plan.rr, 2)}`
  });

  return rows;
}

function buildInvalidationText(result, plan) {
  if (result.direction === "LONG") {
    return `Il piano LONG perde validità se il prezzo chiude sotto ${number(plan.stop, 2)} sul 4H. In quel caso il ritracciamento non sarebbe più considerato fisiologico e servirebbe una nuova struttura prima di cercare acquisti.`;
  }
  if (result.direction === "SHORT") {
    return `Il piano SHORT perde validità se il prezzo chiude sopra ${number(plan.stop, 2)} sul 4H. In quel caso il rimbalzo avrebbe superato l’area di invalidazione e servirebbe una nuova struttura prima di cercare vendite.`;
  }
  return "Non esiste ancora un setup direzionale da invalidare. Prima deve formarsi una struttura coerente tra Giornaliero, 4H e 1H.";
}

function buildCoachAnswer(question, asset, result, plan) {
  const narrative = buildNarrative(asset, result, plan);
  const answers = {
    enter: plan.actionCode === "READY"
      ? `Il setup è valutabile adesso perché il prezzo è nella zona ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)} e i timeframe operativi sono concordi. Non significa entrare automaticamente: è meglio evitare una candela già troppo estesa e attendere una conferma 1H pulita.`
      : `Non entrerei adesso. ${narrative.entryExplanation}`,
    retracement: `Aspettare migliora il rapporto rischio/rendimento. Entrando vicino a ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}, lo stop può restare a ${number(plan.stop, 2)} e il TP2 a ${number(plan.tp2, 2)}, con un rapporto stimato di 1:${number(plan.rr, 2)}.`,
    stop: narrative.stopExplanation,
    target: narrative.targetExplanation,
    change: buildInvalidationText(result, plan),
    confidence: `L’occasione vale ${tenScale(plan.opportunityScore)}/10 (${opportunityLabel(plan.opportunityScore).toLowerCase()}). La forza del trend vale ${tenScale(result.confidence)}/10 e la concordanza dei timeframe ${tenScale(result.alignment)}/10. La scala va da 0 a 10: non indica la probabilità garantita di guadagno, ma quanto il setup rispetta le regole del modello.`
  };
  return answers[question] || narrative.overview;
}


function buildCoachMonologue(asset, result, plan) {
  const direction =
    result.direction === "LONG" ? "rialzista" :
    result.direction === "SHORT" ? "ribassista" :
    "incerta";

  const distance = Math.abs(plan.distancePercent);
  const distanceText = distance >= 0.01
    ? `Il prezzo si trova circa il ${number(distance, 2)}% lontano dalla zona operativa.`
    : "Il prezzo è praticamente dentro la zona operativa.";

  if (result.direction === "WAIT") {
    return `Su ${asset.name} non prenderei posizione. Il quadro è ancora ${direction}: i timeframe non sono abbastanza allineati e il vantaggio operativo è insufficiente. Aspetterei una direzione più chiara sul Giornaliero, una conferma sul 4H e infine il timing sull’1H. Finché questo non accade, restare fuori è una decisione operativa, non inattività.`;
  }

  if (plan.actionCode === "READY") {
    return `Su ${asset.name} la direzione prevalente è ${direction}. Il prezzo è arrivato nella zona ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)} e l’1H conferma il movimento. Se fossi io, valuterei il trade adesso, ma solo dopo una chiusura 1H pulita e senza inseguire una candela già estesa. Lo stop resta a ${number(plan.stop, 2)} e il TP2 a ${number(plan.tp2, 2)}, con un rapporto rischio/rendimento di circa 1:${number(plan.rr, 2)}.`;
  }

  if (plan.actionCode === "CONFIRM") {
    return `Su ${asset.name} il trend resta ${direction}, ma non entrerei ancora. Il prezzo è già nella zona ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}, però manca la conferma dell’1H. Aspetterei una candela di reazione, una chiusura nella direzione del trend o un recupero coerente del momentum. Entrare prima significherebbe anticipare il segnale.`;
  }

  if (plan.actionCode === "NEAR") {
    return `Su ${asset.name} la direzione resta ${direction}, ma preferisco aspettare. ${distanceText} Entrare adesso ridurrebbe il margine fino allo stop e peggiorerebbe il rapporto rischio/rendimento. La zona che mi interessa è ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}. Se il prezzo ci arriva e l’1H torna coerente con il trend, il setup diventa molto più interessante.`;
  }

  if (plan.actionCode === "EXTENDED") {
    return `Su ${asset.name} il trend può anche restare ${direction}, ma il prezzo è troppo esteso. ${distanceText} Comprare o vendere ora significherebbe inseguire il movimento dopo che ha già percorso gran parte dello spazio previsto. Aspetterei un ritorno verso ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}. Se il prezzo non ritraccia, preferisco perdere l’occasione piuttosto che accettare un ingresso con rischio sfavorevole.`;
  }

  if (plan.actionCode === "INVALID") {
    return `Il vecchio piano su ${asset.name} non è più valido. Il prezzo ha superato il livello tecnico di invalidazione a ${number(plan.stop, 2)}. Non cercherei di “salvare” il setup: aspetterei una nuova struttura sul 4H e un nuovo punto di ingresso calcolato dal sistema.`;
  }

  return `Su ${asset.name} non vedo ancora un vantaggio operativo sufficiente. La direzione tecnica da sola non basta: servono anche un prezzo corretto, un livello di invalidazione chiaro e un rapporto rischio/rendimento favorevole.`;
}

function buildScenarios(asset, result, plan) {
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const directionWord = isLong ? "LONG" : isShort ? "SHORT" : "direzionale";
  const favorableMove = isLong ? "rialzo" : isShort ? "ribasso" : "movimento";
  const adverseBreak = isLong ? "sotto" : "sopra";

  return [
    {
      title: "Scenario A · Il prezzo continua senza ritracciare",
      action: "NON ENTRARE ADESSO",
      text: `Se ${asset.name} prosegue subito il ${favorableMove} senza tornare nella zona ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}, non apro il trade. Il movimento può continuare, ma l’ingresso sarebbe troppo lontano dallo stop tecnico.`
    },
    {
      title: "Scenario B · Il prezzo torna lentamente verso la zona",
      action: "INIZIA A MONITORARE",
      text: `Se il prezzo rientra verso ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)} senza accelerazioni contrarie, inizio a monitorare il 4H e l’1H. Non entro ancora: preparo il piano e aspetto la conferma.`
    },
    {
      title: "Scenario C · Arrivo in zona e conferma 1H",
      action: `VALUTA ${directionWord}`,
      text: `Se il prezzo entra nella zona operativa e l’1H conferma ${directionWord}, il setup diventa valutabile. L’entrata va confrontata con lo stop a ${number(plan.stop, 2)} e con il TP2 a ${number(plan.tp2, 2)}.`
    },
    {
      title: "Scenario D · Rottura dell’invalidazione",
      action: "PIANO ANNULLATO",
      text: `Se il prezzo chiude ${adverseBreak} ${number(plan.stop, 2)} sul 4H, il piano viene cancellato. Non medio e non sposto lo stop: aspetto una nuova struttura.`
    }
  ];
}

function journalKey(symbol) {
  return `marketCompassJournal:${symbol}`;
}

function loadJournal(symbol) {
  try {
    return JSON.parse(localStorage.getItem(journalKey(symbol)) || "[]");
  } catch {
    return [];
  }
}

function journalText(asset, result, plan) {
  if (plan.actionCode === "READY") {
    return `${asset.name}: prezzo in zona e conferma operativa presente. Setup ${result.direction} valutabile con stop ${number(plan.stop, 2)} e TP2 ${number(plan.tp2, 2)}.`;
  }
  if (plan.actionCode === "CONFIRM") {
    return `${asset.name}: prezzo in zona, ma manca ancora la conferma 1H. Nessun ingresso anticipato.`;
  }
  if (plan.actionCode === "NEAR") {
    return `${asset.name}: direzione ${result.direction}, attendo un ritorno verso ${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}.`;
  }
  if (plan.actionCode === "EXTENDED") {
    return `${asset.name}: movimento troppo esteso. Non inseguo; attendo un nuovo ritracciamento o rimbalzo.`;
  }
  if (plan.actionCode === "INVALID") {
    return `${asset.name}: setup invalidato dal superamento di ${number(plan.stop, 2)}. Serve una nuova struttura.`;
  }
  return `${asset.name}: quadro ancora senza vantaggio operativo sufficiente. Resto fuori.`;
}

function saveJournalSnapshot() {
  const generatedAt = MARKET_DATA_PROVIDER.payload?.generatedAt || new Date().toISOString();

  analyses.forEach(({ asset, result, plan, structure }) => {
    const entries = loadJournal(asset.symbol);
    if (entries.some(entry => entry.generatedAt === generatedAt)) return;

    entries.unshift({
      generatedAt,
      createdAt: new Date().toISOString(),
      direction: result.direction,
      action: plan.action,
      opportunityScore: plan.opportunityScore,
      current: plan.current,
      text: journalText(asset, result, plan)
    });

    localStorage.setItem(journalKey(asset.symbol), JSON.stringify(entries.slice(0, 12)));
  });
}

function formatJournalDate(value) {
  const date = new Date(value);
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function confluenceLabel(score) {
  if(score>=8) return "Confluenza molto forte";
  if(score>=6) return "Confluenza forte";
  if(score>=4) return "Confluenza discreta";
  if(score>=2) return "Confluenza debole";
  return "Nessuna confluenza importante";
}

function structureExplanation(structure) {
  const pieces=[];
  if(structure.nearestSupport) pieces.push(`Supporto più vicino ${number(structure.nearestSupport.price,2)} (${structure.nearestSupport.timeframes.join("+")}, forza ${structure.nearestSupport.strength}/10).`);
  if(structure.nearestResistance) pieces.push(`Resistenza più vicina ${number(structure.nearestResistance.price,2)} (${structure.nearestResistance.timeframes.join("+")}, forza ${structure.nearestResistance.strength}/10).`);
  if(structure.confluences.length) pieces.push(`Nella zona operativa coincidono ${structure.confluences.slice(0,4).map(x=>x.label).join(", ")}.`);
  else pieces.push("La zona operativa non è sostenuta da confluenze strutturali rilevanti.");
  pieces.push(`Indice di confluenza ${structure.confluenceScore}/10.`);
  return pieces.join(" ");
}

function zoneRows(zones,empty) {
  if(!zones.length) return `<p class="empty-structure">${empty}</p>`;
  return zones.slice(0,4).map(zone=>`
    <div class="zone-row">
      <strong>${number(zone.low,2)}–${number(zone.high,2)}</strong>
      <span>Forza ${zone.strength}/10</span>
      <small>${zone.label || `${zone.kind} · ${zone.timeframe}`}</small>
    </div>`).join("");
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
    .sort((a, b) => {
      const statusOrder = { GREEN: 3, YELLOW: 2, RED: 1 };
      const statusDifference =
        statusOrder[operationalStatus(b).code] -
        statusOrder[operationalStatus(a).code];

      if (statusDifference !== 0) return statusDifference;

      const finalDifference = finalSetupScore(b) - finalSetupScore(a);
      if (Math.abs(finalDifference) >= 0.1) return finalDifference;

      return rankingScore(b) - rankingScore(a);
    })
    .slice(0, 3);

  const ready = ranking.find(item => operationalStatus(item).code === "GREEN");
  const lead = ready || ranking[0];
  const leadFinalScore = finalSetupScore(lead);
  const leadStatus = operationalStatus(lead);
  const leadChecklist = checklistState(lead.result, lead.plan);

  banner.innerHTML = `
    <div class="ranking-panel">
      <small>${ready ? "INGRESSO PRONTO DA VERIFICARE" : "NESSUN INGRESSO PRONTO ADESSO"}</small>
      <p class="ranking-explanation">
        La classifica privilegia prima il semaforo operativo, poi il voto finale del setup.
        Colore, simbolo e testo sono sempre mostrati insieme.
      </p>

      <div class="ranking-table">
        <div class="ranking-table-head">
          <span>Asset</span>
          <span>Semaforo</span>
          <span>Direzione</span>
          <span>Azione</span>
          <span>Trend</span>
          <span>Ingresso</span>
          <span>Confluenza</span>
          <span>Setup</span>
        </div>

        ${ranking.map((item, index) => {
          const finalScore = finalSetupScore(item);
          const status = operationalStatus(item);
          const progress = checklistState(item.result, item.plan);

          return `
            <div class="ranking-table-row">
              <div class="ranking-asset">
                <b>${index + 1}</b>
                <strong>${item.asset.name}</strong>
              </div>

              <div>
                <span class="traffic-status traffic-${status.code.toLowerCase()}">
                  <b aria-hidden="true">${status.icon}</b>
                  <span>${status.colorName} · ${status.short}</span>
                </span>
              </div>

              <div><span class="badge ${badgeClass(item.result.direction)}">${item.result.direction}</span></div>
              <div><span class="action-pill ${actionClass(item.plan.actionCode)}">${item.plan.action}</span></div>
              <div class="metric-cell"><small>Trend</small><strong>${tenScale(item.result.confidence)}/10</strong></div>
              <div class="metric-cell"><small>Ingresso</small><strong>${tenScale(item.plan.opportunityScore)}/10</strong></div>
              <div class="metric-cell"><small>Confluenza</small><strong>${item.structure?.confluenceScore || 0}/10</strong></div>
              <div class="final-score-cell ${setupScoreClass(finalScore)}">
                <small>Setup</small>
                <strong>${number(finalScore, 1)}/10</strong>
              </div>

              <div class="ranking-progress">
                <span>${progress.completed}/${progress.total} condizioni</span>
                <span>${missingConditionsText(item.result, item.plan)}</span>
              </div>
              <p class="ranking-row-reason">${status.explanation}</p>
            </div>
          `;
        }).join("")}
      </div>

      <div class="update-meta">
        Aggiornato alle ${formatTime(lastUpdate)}
        <span class="data-source-badge">${MARKET_DATA_PROVIDER.name}</span>
      </div>
    </div>

    <aside class="lead-panel">
      <small>${ready ? "MIGLIORE INGRESSO PRONTO" : "PRIMO CANDIDATO DA MONITORARE"}</small>
      <div class="lead-title-row">
        <strong>${lead.asset.name}</strong>
        <span class="badge ${badgeClass(lead.result.direction)}">${lead.result.direction}</span>
      </div>

      <div class="lead-traffic traffic-${leadStatus.code.toLowerCase()}">
        <b aria-hidden="true">${leadStatus.icon}</b>
        <div>
          <small>${leadStatus.colorName}</small>
          <strong>${leadStatus.short}</strong>
          <span>${leadStatus.label}</span>
        </div>
      </div>

      <div class="lead-score ${setupScoreClass(leadFinalScore)}">
        <span>SETUP FINALE</span>
        <strong>${number(leadFinalScore, 1)}</strong>
        <small>/10</small>
      </div>

      <div class="lead-score-label">${setupVerdict(leadFinalScore)}</div>

      <div class="lead-breakdown">
        <span>Trend <strong>${tenScale(lead.result.confidence)}/10</strong></span>
        <span>Ingresso <strong>${tenScale(lead.plan.opportunityScore)}/10</strong></span>
        <span>Confluenza <strong>${lead.structure?.confluenceScore || 0}/10</strong></span>
        <span>Rischio <strong>${riskScore(lead.plan)}/10</strong></span>
      </div>

      <div class="lead-countdown">
        <strong>${missingConditionsText(lead.result, lead.plan)}</strong>
        <div class="progress-track" aria-label="${leadChecklist.completed} condizioni soddisfatte su ${leadChecklist.total}">
          <span style="width:${leadChecklist.percentage}%"></span>
        </div>
        <small>${leadChecklist.completed}/${leadChecklist.total} condizioni soddisfatte</small>
      </div>

      <p class="lead-explanation">${leadStatus.explanation}</p>
      <p class="reliability-note">${historicalReliabilityText()}</p>
    </aside>
  `;
}

function renderCards() {
  const filter = document.querySelector("#directionFilter").value;

  const visible = analyses
    .filter(x => filter === "ALL" || x.result.direction === filter)
    .sort((a, b) => Math.abs(b.result.score) - Math.abs(a.result.score));

  document.querySelector("#marketGrid").innerHTML = visible.map(({ asset, result, plan, structure }) => `
    <article class="market-card" data-symbol="${asset.symbol}">
      <div class="card-top">
        <div>
          <h3>${asset.name}</h3>
          <div class="symbol">${asset.symbol}</div>
        </div>
        <div class="human-card-score">
          <small>Forza trend</small>
          <strong>${tenScale(result.confidence)}/10</strong>
          <span>${trendLabel(result)}</span>
        </div>
      </div>

      <div class="score-row">
        <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
        <span class="action-pill ${actionClass(plan.actionCode)}">${plan.action}</span>
      </div>

      ${(() => {
        const item = { asset, result, plan, structure };
        const status = operationalStatus(item);
        const progress = checklistState(result, plan);
        return `
          <div class="card-traffic traffic-${status.code.toLowerCase()}">
            <b aria-hidden="true">${status.icon}</b>
            <div>
              <strong>${status.colorName} · ${status.short}</strong>
              <span>${status.label}</span>
            </div>
          </div>
          <div class="card-countdown">
            <div>
              <strong>${missingConditionsText(result, plan)}</strong>
              <span>${progress.completed}/${progress.total} condizioni soddisfatte</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <span style="width:${progress.percentage}%"></span>
            </div>
          </div>
        `;
      })()}
      <div class="quality-row">
        <span>Qualità ingresso · ${opportunityLabel(plan.opportunityScore)}</span>
        <strong>${tenScale(plan.opportunityScore)}/10</strong>
      </div>
      <div class="quality-row confluence-mini">
        <span>Confluenza · ${confluenceLabel(structure.confluenceScore)}</span>
        <strong>${structure.confluenceScore}/10</strong>
      </div>
      <div class="quality-row risk-mini">
        <span>Gestione rischio</span>
        <strong>${riskScore(plan)}/10</strong>
      </div>
      <div class="card-final-score ${setupScoreClass(finalSetupScore({ asset, result, plan, structure }))}">
        <span>SETUP FINALE</span>
        <strong>${number(finalSetupScore({ asset, result, plan, structure }), 1)}/10</strong>
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
        <strong>${plainActionExplanation({ asset, result, plan })}</strong><br>
        R/R 1:${number(plan.rr, 2)} · Concordanza timeframe ${tenScale(result.alignment)}/10<br>
        Distanza entrata: ${number(plan.distancePoints, 2)} (${number(plan.distancePercent, 2)}%)<br>
        Supporto ${number(structure.nearestSupport?.price,2)} · Resistenza ${number(structure.nearestResistance?.price,2)}<br>
        <span class="open-analysis">Apri il piano operativo completo</span>
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

  const { asset, result, plan, structure } = analysis;
  const narrative = buildNarrative(asset, result, plan);
  const checklist = buildChecklist(result, plan);
  const ledger = buildReasoningLedger(result, plan);

  const directionText =
    result.direction === "LONG" ? "rialzista" :
    result.direction === "SHORT" ? "ribassista" :
    "incerta";

  document.querySelector("#dialogContent").innerHTML = `
    <article class="coach-report">
      <header class="coach-report-header">
        <div>
          <p class="eyebrow">${asset.symbol}</p>
          <h2>${asset.name}</h2>
          <div class="coach-badges">
            <span class="badge ${badgeClass(result.direction)}">${result.direction}</span>
            <span class="action-pill ${actionClass(plan.actionCode)}">${plan.action}</span>
          </div>
        </div>
        <div class="coach-scorebox">
          <small>${opportunityLabel(plan.opportunityScore)}</small>
          <strong>${tenScale(plan.opportunityScore)}/10</strong>
          <span>${trendLabel(result)} · Concordanza ${tenScale(result.alignment)}/10</span>
          <span class="confluence-scoreline">Confluenza strutturale ${structure.confluenceScore}/10</span>
          <span class="confluence-scoreline">Rischio ${riskScore(plan)}/10</span>
          <span class="popup-final-score ${setupScoreClass(finalSetupScore({ asset, result, plan, structure }))}">
            Setup finale ${number(finalSetupScore({ asset, result, plan, structure }), 1)}/10
          </span>
        </div>
      </header>

      ${(() => {
        const item = { asset, result, plan, structure };
        const status = operationalStatus(item);
        const progress = checklistState(result, plan);
        return `
          <section class="popup-operational-status traffic-${status.code.toLowerCase()}">
            <div class="popup-traffic-symbol" aria-hidden="true">${status.icon}</div>
            <div>
              <small>SEMAFORO OPERATIVO: ${status.colorName}</small>
              <h3>${status.short}</h3>
              <p>${status.label}</p>
              <strong>${missingConditionsText(result, plan)}</strong>
              <div class="progress-track">
                <span style="width:${progress.percentage}%"></span>
              </div>
              <small>${progress.completed}/${progress.total} condizioni soddisfatte</small>
            </div>
          </section>
        `;
      })()}

      <section class="coach-hero">
        <p class="coach-kicker">SE FOSSI IO, FAREI COSÌ</p>
        <h3>${plan.action}</h3>
        <p>${buildCoachMonologue(asset, result, plan)}</p>
      </section>

      <section class="coach-section coach-scenarios">
        <h3>Come gestirei i prossimi movimenti</h3>
        <div class="scenario-grid">
          ${buildScenarios(asset, result, plan).map(scenario => `
            <article class="scenario-card">
              <small>${scenario.action}</small>
              <h4>${scenario.title}</h4>
              <p>${scenario.text}</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="coach-story">
        <h3>Perché il sistema vede un mercato ${directionText}</h3>
        <p>${narrative.overview}</p>
        <p class="structure-summary">${structureExplanation(structure)}</p>
      </section>

      <section class="coach-plan-grid">
        <div class="coach-plan-card">
          <small>Prezzo attuale</small>
          <strong>${number(plan.current, 2)}</strong>
          <p>Il prezzo da confrontare con la zona operativa.</p>
        </div>
        <div class="coach-plan-card">
          <small>Zona in cui aspettare</small>
          <strong>${number(plan.entryLow, 2)}–${number(plan.entryHigh, 2)}</strong>
          <p>Area costruita sul ritracciamento del 50% con tolleranza ATR.</p>
        </div>
        <div class="coach-plan-card danger">
          <small>Stop tecnico</small>
          <strong>${number(plan.stop, 2)}</strong>
          <p>${number(plan.riskPoints, 2)} punti di rischio, circa ${number(plan.riskPercent, 2)}%.</p>
        </div>
        <div class="coach-plan-card good">
          <small>TP1 / TP2 / TP3</small>
          <strong>${number(plan.tp1, 2)} / ${number(plan.tp2, 2)} / ${number(plan.tp3, 2)}</strong>
          <p>TP2 offre circa ${number(plan.rewardPoints, 2)} punti, con R/R 1:${number(plan.rr, 2)}.</p>
        </div>
      </section>

      <section class="coach-section professional-structure">
        <div class="structure-heading">
          <div>
            <p class="coach-kicker">STRUTTURA PROFESSIONALE</p>
            <h3>Supporti, resistenze e zona di confluenza</h3>
          </div>
          <div class="confluence-badge">
            <strong>${structure.confluenceScore}/10</strong>
            <span>${confluenceLabel(structure.confluenceScore)}</span>
          </div>
        </div>

        <p class="structure-comment">${structureExplanation(structure)}</p>

        <div class="sr-grid">
          <div class="sr-card support">
            <small>Supporto statico più vicino</small>
            <strong>${number(structure.nearestSupport?.price,2)}</strong>
            <span>${structure.nearestSupport ? `${structure.nearestSupport.timeframes.join("+")} · ${structure.nearestSupport.touches} reazioni` : "Non rilevato"}</span>
          </div>
          <div class="sr-card resistance">
            <small>Resistenza statica più vicina</small>
            <strong>${number(structure.nearestResistance?.price,2)}</strong>
            <span>${structure.nearestResistance ? `${structure.nearestResistance.timeframes.join("+")} · ${structure.nearestResistance.touches} reazioni` : "Non rilevata"}</span>
          </div>
        </div>

        <div class="structure-columns">
          <div>
            <h4>Confluenze presenti nella zona</h4>
            <div class="structure-list">
              ${structure.confluences.length ? structure.confluences.slice(0,8).map(item=>`
                <div class="structure-row">
                  <div><strong>${item.label}</strong><small>${item.detail||""}</small></div>
                  <span>${number(item.price,2)}</span>
                </div>`).join("") : `<p class="empty-structure">Nessuna confluenza importante nella zona.</p>`}
            </div>
          </div>
          <div>
            <h4>Zone di domanda</h4>
            <div class="zone-list">${zoneRows(structure.demand,"Nessuna zona di domanda significativa.")}</div>
            <h4 class="supply-title">Zone di offerta</h4>
            <div class="zone-list">${zoneRows(structure.supply,"Nessuna zona di offerta significativa.")}</div>
          </div>
        </div>

        <details class="smart-money-details">
          <summary>Order Block, Fair Value Gap e Fibonacci</summary>
          <div class="smart-money-grid">
            <div><h4>Order Block</h4>${zoneRows(structure.orderBlocks.map(x=>({...x,label:`${x.kind==="bullish"?"Rialzista":"Ribassista"} · ${x.timeframe}`})),"Nessun Order Block recente.")}</div>
            <div><h4>Fair Value Gap</h4>${zoneRows(structure.fvgs.map(x=>({...x,label:`${x.kind==="bullish"?"Rialzista":"Ribassista"} · ${x.timeframe}`})),"Nessun Fair Value Gap significativo.")}</div>
            <div>
              <h4>Fibonacci Daily</h4>
              ${structure.fibonacci ? `<div class="fib-list">${structure.fibonacci.levels.map(x=>`<div><span>${(x.ratio*100).toFixed(1)}%</span><strong>${number(x.price,2)}</strong></div>`).join("")}</div>` : `<p class="empty-structure">Dati insufficienti.</p>`}
            </div>
          </div>
          <p class="heuristic-note">Order Block e Fair Value Gap sono rilevati con regole euristiche sulle candele OHLC e vanno confermati sul grafico.</p>
        </details>
      </section>

      <section class="coach-section">
        <h3>Quando entrerei</h3>
        <div class="checklist-summary">
          <strong>${missingConditionsText(result, plan)}</strong>
          <span>${checklist.filter(item => item.done).length}/${checklist.length} condizioni soddisfatte</span>
        </div>
        <div class="progress-track checklist-progress">
          <span style="width:${Math.round(checklist.filter(item => item.done).length / Math.max(1, checklist.length) * 100)}%"></span>
        </div>
        <div class="trade-checklist">
          ${checklist.map(item => `
            <div class="check-row ${item.done ? "done" : "missing"}">
              <span aria-hidden="true">${item.done ? "✓" : "!"}</span>
              <strong>${item.label}</strong>
              <small>${item.done ? "SODDISFATTA" : "MANCANTE"}</small>
            </div>
          `).join("")}
        </div>
        <p class="coach-note">
          Il setup è considerato pronto soltanto quando il prezzo raggiunge la zona indicata
          e il timeframe 1H conferma la direzione. Un semplice arrivo sul livello non basta.
        </p>
        <div class="statistical-honesty">
          <strong>Affidabilità statistica</strong>
          <p>${historicalReliabilityText()}</p>
          <span>La probabilità reale verrà mostrata soltanto dopo un backtest con un campione sufficiente di setup comparabili.</span>
        </div>
      </section>

      <section class="coach-two-columns">
        <div class="coach-section">
          <h3>Perché lo stop è lì</h3>
          <p>${narrative.stopExplanation}</p>
        </div>
        <div class="coach-section">
          <h3>Perché i target sono lì</h3>
          <p>${narrative.targetExplanation}</p>
        </div>
      </section>

      <section class="coach-section invalidation">
        <h3>Cosa mi farebbe cambiare idea</h3>
        <p>${buildInvalidationText(result, plan)}</p>
      </section>

      <section class="coach-section">
        <h3>Come sono arrivato alla decisione</h3>
        <div class="reasoning-ledger">
          ${ledger.map(row => `
            <div class="ledger-row">
              <span>${row.label}</span>
              <small>${row.note}</small>
              <strong class="${row.value >= 0 ? "reason-plus" : "reason-minus"}">
                ${row.value >= 0 ? "+" : ""}${row.value}
              </strong>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="coach-section">
        <h3>Chiedi al Coach</h3>
        <div class="coach-buttons">
          <button type="button" data-coach="enter">Posso entrare adesso?</button>
          <button type="button" data-coach="retracement">Perché aspettare?</button>
          <button type="button" data-coach="stop">Perché questo stop?</button>
          <button type="button" data-coach="target">Perché questi target?</button>
          <button type="button" data-coach="change">Cosa invalida il setup?</button>
          <button type="button" data-coach="confidence">Quanto è affidabile?</button>
        </div>
        <div id="coachAnswer" class="coach-answer">
          Seleziona una domanda: la risposta verrà costruita sui dati reali di ${asset.name}.
        </div>
      </section>

      <section class="coach-section coach-journal">
        <div class="journal-title">
          <div>
            <h3>Diario del Coach</h3>
            <p>Memoria locale delle ultime analisi generate per questo asset.</p>
          </div>
          <button type="button" id="clearJournalBtn">Cancella diario</button>
        </div>
        <div class="journal-list">
          ${loadJournal(asset.symbol).length
            ? loadJournal(asset.symbol).map(entry => `
                <article class="journal-entry">
                  <div>
                    <strong>${formatJournalDate(entry.generatedAt)}</strong>
                    <span class="badge ${badgeClass(entry.direction)}">${entry.direction}</span>
                    <span class="action-pill ${actionClass(
                      entry.action.includes("ORA") ? "READY" :
                      entry.action.includes("CONFERMA") ? "CONFIRM" :
                      entry.action.includes("RITRACCIAMENTO") || entry.action.includes("RIMBALZO") ? "NEAR" :
                      entry.action.includes("INVALIDATO") ? "INVALID" :
                      entry.action.includes("INSEGUIRE") || entry.action.includes("ESTESO") ? "EXTENDED" :
                      "NO_TRADE"
                    )}">${entry.action}</span>
                  </div>
                  <p>${entry.text}</p>
                </article>
              `).join("")
            : `<p class="empty-journal">Il diario si popolerà dopo i prossimi aggiornamenti dei dati.</p>`}
        </div>
      </section>

      <details class="technical-details">
        <summary>Dati tecnici completi e indicatori</summary>

        <div class="technical-intro">
          <strong>Forza tecnica ${result.confidence}%</strong>
          <span>Score aggregato ${result.score}%</span>
          <span>Concordanza ${result.alignment}%</span>
        </div>

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
              </section>`;
          }).join("")}
        </div>
      </details>
    </article>
  `;

  document.querySelector("#detailDialog").showModal();

  document.querySelectorAll("[data-coach]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelector("#coachAnswer").textContent =
        buildCoachAnswer(button.dataset.coach, asset, result, plan);
    });
  });

  document.querySelector("#clearJournalBtn")?.addEventListener("click", () => {
    localStorage.removeItem(journalKey(asset.symbol));
    openDetails(asset.symbol);
  });
}


function reportDateLabel(date) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function safeReportFilename(date) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = numberValue => String(numberValue).padStart(2, "0");
  return `market-compass-report-${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}.png`;
}

function reportPalette(statusCode) {
  if (statusCode === "GREEN") {
    return { accent: "#35c98b", soft: "#12372e", text: "#b9f5dc" };
  }
  if (statusCode === "YELLOW") {
    return { accent: "#efb34e", soft: "#3a2e18", text: "#ffe4ae" };
  }
  return { accent: "#ef6670", soft: "#3a1d25", text: "#ffc2c8" };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawRoundedRect(context, x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumedWords = lines.join(" ").split(/\s+/).length;
  if (consumedWords < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (context.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }

  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return lines.length * lineHeight;
}

function drawReportMetric(context, x, y, label, value, width = 190) {
  drawRoundedRect(context, x, y, width, 84, 14, "#101e31", "#253a55", 2);
  context.fillStyle = "#8fb3df";
  context.font = "600 21px Arial, sans-serif";
  context.fillText(label, x + 16, y + 27);
  context.fillStyle = "#f5f8ff";
  context.font = "800 32px Arial, sans-serif";
  context.fillText(value, x + 16, y + 65);
}

function drawReportStatus(context, x, y, status, width = 250) {
  const palette = reportPalette(status.code);
  drawRoundedRect(context, x, y, width, 54, 27, palette.soft, palette.accent, 2);
  context.fillStyle = palette.accent;
  context.beginPath();
  context.arc(x + 27, y + 27, 14, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#07111f";
  context.font = "900 20px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(status.icon, x + 27, y + 28);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = palette.text;
  context.font = "800 20px Arial, sans-serif";
  context.fillText(`${status.colorName} · ${status.short}`, x + 51, y + 34);
}

function generateTelegramReport() {
  if (!analyses.length) {
    window.alert("I dati non sono ancora pronti. Attendi il caricamento della dashboard.");
    return;
  }

  const sorted = [...analyses].sort((a, b) => {
    const statusOrder = { GREEN: 3, YELLOW: 2, RED: 1 };
    const statusDifference =
      statusOrder[operationalStatus(b).code] -
      statusOrder[operationalStatus(a).code];

    if (statusDifference !== 0) return statusDifference;
    return finalSetupScore(b) - finalSetupScore(a);
  });

  const lead = sorted[0];
  const leadStatus = operationalStatus(lead);
  const generatedAt = lastUpdate || MARKET_DATA_PROVIDER.getGeneratedAt() || new Date();

  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 2250;
  const context = canvas.getContext("2d");

  context.fillStyle = "#07111f";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const backgroundGradient = context.createLinearGradient(0, 0, 1600, 700);
  backgroundGradient.addColorStop(0, "#0a1628");
  backgroundGradient.addColorStop(1, "#07111f");
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, canvas.width, 700);

  // Header
  context.fillStyle = "#4f8cff";
  context.font = "800 24px Arial, sans-serif";
  context.fillText("MARKET COMPASS", 70, 65);

  context.fillStyle = "#f5f8ff";
  context.font = "900 58px Arial, sans-serif";
  context.fillText("Trading Coach AI", 70, 135);

  context.fillStyle = "#9bb9df";
  context.font = "500 24px Arial, sans-serif";
  context.fillText("Report tecnico multi-timeframe - 1M · 1W · 1D · 4H · 1H", 70, 180);

  context.textAlign = "right";
  context.fillStyle = "#dce8f7";
  context.font = "700 23px Arial, sans-serif";
  context.fillText(reportDateLabel(generatedAt), 1530, 70);
  context.fillStyle = "#7894b8";
  context.font = "500 19px Arial, sans-serif";
  context.fillText(MARKET_DATA_PROVIDER.name, 1530, 104);
  context.textAlign = "left";

  // Summary
  drawReportMetric(context, 70, 225, "Asset analizzati", String(analyses.length), 330);
  drawReportMetric(context, 420, 225, "LONG", String(analyses.filter(x => x.result.direction === "LONG").length), 330);
  drawReportMetric(context, 770, 225, "SHORT", String(analyses.filter(x => x.result.direction === "SHORT").length), 330);
  drawReportMetric(context, 1120, 225, "WAIT", String(analyses.filter(x => x.result.direction === "WAIT").length), 410);

  // Lead candidate
  const leadPalette = reportPalette(leadStatus.code);
  drawRoundedRect(context, 70, 340, 1460, 300, 22, "#0d1b2e", leadPalette.accent, 3);

  context.fillStyle = "#8fb3df";
  context.font = "700 22px Arial, sans-serif";
  context.fillText(
    leadStatus.code === "GREEN" ? "MIGLIORE INGRESSO PRONTO" : "PRIMO CANDIDATO DA MONITORARE",
    100,
    385
  );

  context.fillStyle = "#f7f9ff";
  context.font = "900 46px Arial, sans-serif";
  context.fillText(lead.asset.name, 100, 445);

  drawReportStatus(context, 100, 475, leadStatus, 340);

  context.fillStyle = leadPalette.accent;
  context.font = "900 68px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText(`${number(finalSetupScore(lead), 1)}/10`, 1490, 450);
  context.fillStyle = "#9bb1ce";
  context.font = "700 21px Arial, sans-serif";
  context.fillText("SETUP FINALE", 1490, 485);
  context.textAlign = "left";

  context.fillStyle = "#dce8f7";
  context.font = "600 23px Arial, sans-serif";
  const leadText = `${leadStatus.explanation} ${missingConditionsText(lead.result, lead.plan)}`;
  wrapCanvasText(context, leadText, 100, 570, 1370, 32, 2);

  // Table header
  const tableTop = 690;
  drawRoundedRect(context, 70, tableTop, 1460, 58, 12, "#13243a");
  const columns = [
    { x: 95, label: "ASSET" },
    { x: 385, label: "SEMAFORO" },
    { x: 700, label: "DIREZIONE" },
    { x: 865, label: "TREND" },
    { x: 1005, label: "INGRESSO" },
    { x: 1165, label: "CONFL." },
    { x: 1305, label: "SETUP" }
  ];
  context.fillStyle = "#8fb3df";
  context.font = "800 19px Arial, sans-serif";
  columns.forEach(column => context.fillText(column.label, column.x, tableTop + 37));

  let rowY = tableTop + 75;
  sorted.forEach((item, index) => {
    const status = operationalStatus(item);
    const palette = reportPalette(status.code);
    const setup = finalSetupScore(item);
    const rowHeight = 154;

    drawRoundedRect(
      context,
      70,
      rowY,
      1460,
      rowHeight,
      14,
      index % 2 === 0 ? "#0c192a" : "#0a1727",
      "#1e324c",
      1
    );

    context.fillStyle = "#24456e";
    context.beginPath();
    context.arc(105, rowY + 43, 22, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#dceaff";
    context.font = "800 20px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), 105, rowY + 44);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    context.fillStyle = "#f4f7ff";
    context.font = "900 27px Arial, sans-serif";
    context.fillText(item.asset.name, 145, rowY + 51);

    context.fillStyle = "#7797bd";
    context.font = "600 18px Arial, sans-serif";
    context.fillText(item.asset.symbol, 145, rowY + 82);

    drawReportStatus(context, 375, rowY + 20, status, 285);

    context.fillStyle = item.result.direction === "LONG"
      ? "#35c98b"
      : item.result.direction === "SHORT"
        ? "#ef6670"
        : "#efb34e";
    context.font = "900 23px Arial, sans-serif";
    context.fillText(item.result.direction, 700, rowY + 52);

    context.fillStyle = "#f4f7ff";
    context.font = "900 27px Arial, sans-serif";
    context.fillText(`${tenScale(item.result.confidence)}/10`, 865, rowY + 52);
    context.fillText(`${tenScale(item.plan.opportunityScore)}/10`, 1005, rowY + 52);
    context.fillText(`${item.structure?.confluenceScore || 0}/10`, 1165, rowY + 52);

    context.fillStyle = palette.accent;
    context.font = "900 31px Arial, sans-serif";
    context.fillText(`${number(setup, 1)}/10`, 1305, rowY + 52);

    context.fillStyle = "#b6c7dd";
    context.font = "600 18px Arial, sans-serif";
    wrapCanvasText(context, status.explanation, 145, rowY + 118, 1000, 25, 2);

    context.fillStyle = "#8098b8";
    context.font = "600 17px Arial, sans-serif";
    context.textAlign = "right";
    context.fillText(missingConditionsText(item.result, item.plan), 1490, rowY + 118);
    context.textAlign = "left";

    rowY += rowHeight + 12;
  });

  // Footer
  const footerY = 2135;
  context.fillStyle = "#1b3049";
  context.fillRect(70, footerY, 1460, 2);

  context.fillStyle = "#8aa2c1";
  context.font = "600 18px Arial, sans-serif";
  context.fillText(
    "Analisi tecnica sperimentale. Il voto misura la coerenza del setup e non garantisce risultati futuri.",
    70,
    footerY + 42
  );
  context.fillText(
    "Il report non contiene link al sito né dati personali.",
    70,
    footerY + 76
  );

  canvas.toBlob(blob => {
    if (!blob) {
      window.alert("Non è stato possibile creare il report.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeReportFilename(generatedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png", 0.95);
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
  document.querySelector("#reportBtn").disabled = analyses.length === 0;
}

document.querySelector("#refreshBtn").addEventListener("click", refreshDashboard);
document.querySelector("#reportBtn").addEventListener("click", generateTelegramReport);
document.querySelector("#directionFilter").addEventListener("change", renderCards);
document.querySelector("#closeDialog").addEventListener("click", () => {
  document.querySelector("#detailDialog").close();
});

(async () => {
  try {
    await analyzeAll();
    renderSummary();
    renderCards();
    document.querySelector("#reportBtn").disabled = analyses.length === 0;
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
