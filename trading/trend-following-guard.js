(() => {
  "use strict";
  const original = window.TradingEngine?.analyzeMarket;
  if (!original) return;

  const operationalTimeframes = ["1D", "4H", "1H"];
  const contextTimeframes = ["1M", "1W"];

  const structuralSide = detail => {
    if (!detail?.valid || !Number.isFinite(detail.current)) return "WAIT";
    const av = detail.movingAverages || {};
    const current = detail.current;
    const ma50 = av.ma50;
    const ma60 = av.ma60;
    const ma200 = av.ma200;
    const dow = detail.dow?.direction || "WAIT";
    if (![ma50, ma60, ma200].every(Number.isFinite)) return "WAIT";

    const longEma = current > ma50 && current > ma60 && current > ma200 && ma50 > ma200;
    const shortEma = current < ma50 && current < ma60 && current < ma200 && ma50 < ma200;
    if (longEma && dow !== "SHORT") return "LONG";
    if (shortEma && dow !== "LONG") return "SHORT";
    return "WAIT";
  };

  const timingState = (detail, direction) => {
    if (!detail?.valid || !Number.isFinite(detail.current) || direction === "WAIT") return "WAIT";
    const av = detail.movingAverages || {};
    const current = detail.current;
    const ma10 = av.ma10;
    const ma50 = av.ma50;
    const ma200 = av.ma200;
    const nw = detail.nadaraya;
    const score = Number(detail.score || 0);
    const dow = detail.dow?.direction || "WAIT";

    if (direction === "LONG") {
      const structurallyOpposite = Number.isFinite(ma50) && Number.isFinite(ma200) && current < ma50 && current < ma200 && score <= -35 && dow === "SHORT";
      if (structurallyOpposite) return "OPPOSITE";

      // REGOLA CHIAVE: essere in ritracciamento NON è una conferma LONG.
      // Il prezzo deve prima recuperare EMA10 e Nadaraya e il momentum 1H deve tornare positivo.
      const reclaimedFast = Number.isFinite(ma10) && current > ma10;
      const reclaimedNw = !Number.isFinite(nw) || current > nw;
      const momentumBack = score >= 10 && dow !== "SHORT";
      if (reclaimedFast && reclaimedNw && momentumBack) return "READY";
      return "PULLBACK";
    }

    if (direction === "SHORT") {
      const structurallyOpposite = Number.isFinite(ma50) && Number.isFinite(ma200) && current > ma50 && current > ma200 && score >= 35 && dow === "LONG";
      if (structurallyOpposite) return "OPPOSITE";

      const lostFast = Number.isFinite(ma10) && current < ma10;
      const lostNw = !Number.isFinite(nw) || current < nw;
      const momentumBack = score <= -10 && dow !== "LONG";
      if (lostFast && lostNw && momentumBack) return "READY";
      return "PULLBACK";
    }
    return "WAIT";
  };

  window.TradingEngine.analyzeMarket = function guardedAnalyzeMarket(tf, custom = {}) {
    const result = original(tf, custom);
    const displayTimeframes = window.TRADING_CONFIG?.timeframes || [...contextTimeframes, ...operationalTimeframes];
    const structure = {};

    displayTimeframes.forEach(tfName => {
      const detail = result.details?.[tfName];
      const side = structuralSide(detail);
      structure[tfName] = side;
      if (!detail?.valid) return;
      detail.emaTrendDirection = side;
      const role = contextTimeframes.includes(tfName) ? "Contesto superiore" : tfName === "1H" ? "Struttura 1H" : "Trend operativo";
      detail.reasons = [
        `${role}: ${side === "LONG" ? "struttura rialzista confermata da EMA 50/60/200" : side === "SHORT" ? "struttura ribassista confermata da EMA 50/60/200" : "struttura non abbastanza netta per dichiarare LONG o SHORT"}`,
        ...(detail.reasons || [])
      ];
    });

    const daily = structure["1D"];
    const h4 = structure["4H"];
    let trendDirection = "WAIT";
    if (h4 === "LONG" && daily !== "SHORT") trendDirection = "LONG";
    else if (h4 === "SHORT" && daily !== "LONG") trendDirection = "SHORT";

    const timing = timingState(result.details?.["1H"], trendDirection);
    let direction = "WAIT";
    if (trendDirection !== "WAIT" && timing === "READY") direction = trendDirection;

    result.direction = direction;
    result.fastTradeReady = direction !== "WAIT";

    const tfDirections = {};
    displayTimeframes.forEach(tfName => {
      if (tfName === "1H" && trendDirection !== "WAIT") {
        tfDirections[tfName] = timing === "READY" ? trendDirection : "WAIT";
      } else {
        tfDirections[tfName] = structure[tfName] || "WAIT";
      }
    });
    result.timeframeDirections = tfDirections;

    const opDirections = operationalTimeframes.map(tfName => tfDirections[tfName]);
    result.consensus = {
      long: opDirections.filter(x => x === "LONG").length,
      short: opDirections.filter(x => x === "SHORT").length,
      wait: opDirections.filter(x => x === "WAIT").length
    };
    result.alignment = Math.round(Math.max(result.consensus.long, result.consensus.short, result.consensus.wait) / operationalTimeframes.length * 100);

    result.operationalFilter = {
      trendDirection,
      timing,
      daily,
      h4,
      h1Structure: structure["1H"],
      ready: result.fastTradeReady
    };

    result.rules = {
      ...(result.rules || {}),
      entryRetracement: "4H definisce il trend operativo; il ritracciamento da solo NON autorizza l'ingresso. 1H deve recuperare EMA10 + Nadaraya e tornare coerente col trend prima del segnale.",
      logic: "Trend following veloce: 4H guida, 1D fa da guardrail. Durante un pullback si resta WAIT. LONG solo dopo conferma rialzista 1H; SHORT solo dopo conferma ribassista 1H. Vietato mediare contro il movimento in corso."
    };
    return result;
  };
})();
