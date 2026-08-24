(() => {
  "use strict";
  const original = window.TradingEngine?.analyzeMarket;
  if (!original) return;

  const emaSide = detail => {
    if (!detail?.valid || !Number.isFinite(detail.current)) return "WAIT";
    const av = detail.movingAverages || {};
    const emas = [av.ma5, av.ma10, av.ma50, av.ma60, av.ma200].filter(Number.isFinite);
    if (emas.length < 5) return "WAIT";
    if (emas.every(value => detail.current > value)) return "LONG";
    if (emas.every(value => detail.current < value)) return "SHORT";
    return "WAIT";
  };

  window.TradingEngine.analyzeMarket = function guardedAnalyzeMarket(tf, custom = {}) {
    const result = original(tf, custom);
    const timeframes = window.TRADING_CONFIG?.timeframes || ["1M", "1W", "1D", "4H", "1H"];
    const emaDirections = {};

    timeframes.forEach(tfName => {
      const detail = result.details?.[tfName];
      const side = emaSide(detail);
      emaDirections[tfName] = side;
      if (detail?.valid) {
        if (side === "LONG") detail.score = Math.max(25, Math.abs(detail.score || 25));
        else if (side === "SHORT") detail.score = -Math.max(25, Math.abs(detail.score || 25));
        else detail.score = 0;
        detail.emaTrendDirection = side;
        detail.reasons = [
          `Filtro EMA rigido: ${side === "LONG" ? "prezzo sopra EMA 5/10/50/60/200" : side === "SHORT" ? "prezzo sotto EMA 5/10/50/60/200" : "EMA non tutte dalla stessa parte del prezzo"}`,
          ...(detail.reasons || [])
        ];
      }
    });

    const allLong = timeframes.every(tfName => emaDirections[tfName] === "LONG");
    const allShort = timeframes.every(tfName => emaDirections[tfName] === "SHORT");
    result.direction = allLong ? "LONG" : allShort ? "SHORT" : "WAIT";
    result.fastTradeReady = result.direction !== "WAIT";
    result.timeframeDirections = emaDirections;
    result.consensus = {
      long: timeframes.filter(tfName => emaDirections[tfName] === "LONG").length,
      short: timeframes.filter(tfName => emaDirections[tfName] === "SHORT").length,
      wait: timeframes.filter(tfName => emaDirections[tfName] === "WAIT").length
    };
    result.alignment = Math.round(Math.max(result.consensus.long, result.consensus.short, result.consensus.wait) / timeframes.length * 100);
    result.rules = {
      ...(result.rules || {}),
      logic: "Trend following rigido: LONG solo se il prezzo è sopra EMA 5/10/50/60/200 su 1M, 1W, 1D, 4H e 1H; SHORT solo se è sotto tutte le EMA su tutti i timeframe. Qualsiasi disallineamento = WAIT."
    };
    return result;
  };
})();
