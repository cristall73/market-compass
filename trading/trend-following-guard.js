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

    if (![ma50, ma60, ma200].every(Number.isFinite)) return "WAIT";

    // Il trend operativo non richiede più che il prezzo sia dalla stessa parte
    // di TUTTE le EMA veloci. 50/60/200 definiscono la struttura di fondo.
    const longStructure = current > ma50 && current > ma60 && current > ma200 && ma50 > ma200;
    const shortStructure = current < ma50 && current < ma60 && current < ma200 && ma50 < ma200;
    if (longStructure) return "LONG";
    if (shortStructure) return "SHORT";
    return "WAIT";
  };

  const timingState = (detail, direction) => {
    if (!detail?.valid || !Number.isFinite(detail.current)) return "WAIT";
    const av = detail.movingAverages || {};
    const current = detail.current;
    const ma10 = av.ma10;
    const ma50 = av.ma50;
    const text = (detail.reasons || []).join(" ");
    const onRetracement = /Ritracciamento nel trend/i.test(text);
    const score = Number(detail.score || 0);

    if (direction === "LONG") {
      // 1H serve al timing: un piccolo ritracciamento sotto EMA10 è ammesso.
      // Si blocca soltanto se il breve è realmente diventato contrario.
      if (Number.isFinite(ma50) && current < ma50 && score <= -25) return "OPPOSITE";
      if (onRetracement || (Number.isFinite(ma10) && current >= ma10) || score >= 0) return "READY";
      return "WAIT";
    }

    if (direction === "SHORT") {
      if (Number.isFinite(ma50) && current > ma50 && score >= 25) return "OPPOSITE";
      if (onRetracement || (Number.isFinite(ma10) && current <= ma10) || score <= 0) return "READY";
      return "WAIT";
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
      const role = contextTimeframes.includes(tfName) ? "Contesto superiore" : tfName === "1H" ? "Timing 1H" : "Trend operativo";
      detail.reasons = [
        `${role}: ${side === "LONG" ? "struttura rialzista su EMA 50/60/200" : side === "SHORT" ? "struttura ribassista su EMA 50/60/200" : "struttura non ancora netta su EMA 50/60/200"}`,
        ...(detail.reasons || [])
      ];
    });

    // Daily + 4H governano la direzione. Devono essere concordi.
    const daily = structure["1D"];
    const h4 = structure["4H"];
    const trendDirection = daily === h4 && (daily === "LONG" || daily === "SHORT") ? daily : "WAIT";
    const timing = timingState(result.details?.["1H"], trendDirection);

    // 1H non deve più essere perfettamente allineato con tutte le EMA:
    // può essere in ritracciamento, purché non sia diventato chiaramente opposto.
    let direction = "WAIT";
    if (trendDirection !== "WAIT" && timing === "READY") direction = trendDirection;

    result.direction = direction;
    result.fastTradeReady = direction !== "WAIT";

    const tfDirections = {};
    displayTimeframes.forEach(tfName => {
      if (tfName === "1H" && trendDirection !== "WAIT") {
        tfDirections[tfName] = timing === "OPPOSITE" ? (trendDirection === "LONG" ? "SHORT" : "LONG") : timing === "READY" ? trendDirection : "WAIT";
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

    // Espone il motivo del WAIT per la UI e per il diario dei segnali.
    result.operationalFilter = {
      trendDirection,
      timing,
      daily,
      h4,
      ready: result.fastTradeReady
    };

    result.rules = {
      ...(result.rules || {}),
      entryRetracement: "Trend 1D + 4H concorde; 1H usato come timing del ritracciamento verso EMA10/EMA50/Nadaraya o 50% swing.",
      logic: "Trading veloce trend following: 1D e 4H definiscono la direzione tramite la struttura EMA 50/60/200. 1H serve al timing e può essere temporaneamente in ritracciamento; blocca il trade solo se diventa chiaramente opposto. 1W e 1M restano contesto e non bloccano da soli l'ingresso."
    };

    return result;
  };
})();
