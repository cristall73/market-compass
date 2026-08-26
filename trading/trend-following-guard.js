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

    // La direzione strutturale non viene decisa dal momentum dell'ultima candela.
    // EMA 50/60/200 + struttura Dow devono raccontare la stessa storia oppure si resta WAIT.
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
    const text = (detail.reasons || []).join(" ");
    const onRetracement = /Ritracciamento nel trend/i.test(text);
    const score = Number(detail.score || 0);
    const dow = detail.dow?.direction || "WAIT";

    if (direction === "LONG") {
      // Un ritracciamento 1H non diventa SHORT solo perché RSI/Stoch o le ultime candele scendono.
      // Si considera realmente opposto solo con deterioramento strutturale più ampio.
      const structurallyOpposite = Number.isFinite(ma50) && Number.isFinite(ma200) && current < ma50 && current < ma200 && score <= -35 && dow === "SHORT";
      if (structurallyOpposite) return "OPPOSITE";
      if (onRetracement || (Number.isFinite(ma10) && current >= ma10) || score >= -20) return "READY";
      return "PULLBACK";
    }

    if (direction === "SHORT") {
      const structurallyOpposite = Number.isFinite(ma50) && Number.isFinite(ma200) && current > ma50 && current > ma200 && score >= 35 && dow === "LONG";
      if (structurallyOpposite) return "OPPOSITE";
      if (onRetracement || (Number.isFinite(ma10) && current <= ma10) || score <= 20) return "READY";
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

    // Per trading veloce il 4H guida la direzione; il Daily è un guardrail, non deve per forza essere già concorde.
    // Questo evita di perdere setup intraday mentre il Daily è ancora neutrale.
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
        // IMPORTANTISSIMO: il rimbalzo/pullback 1H contro il 4H non viene etichettato come nuovo trend opposto.
        // Finché non c'è una vera inversione strutturale, l'1H resta nella direzione del trend operativo oppure WAIT.
        tfDirections[tfName] = timing === "OPPOSITE" ? "WAIT" : trendDirection;
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
      entryRetracement: "4H definisce il trend operativo; 1D fa da guardrail. 1H cerca il timing del ritracciamento verso EMA10/EMA50/Nadaraya o 50% swing senza scambiare il pullback per inversione.",
      logic: "Trading veloce trend following: 4H guida la direzione, 1D blocca solo se chiaramente opposto. 1H separa trend e momentum: un rimbalzo controtrend viene trattato come pullback e non come nuovo LONG/SHORT finché non compare una vera inversione strutturale. 1W e 1M restano contesto."
    };

    return result;
  };
})();
