(() => {
  "use strict";

  const avg = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

  function sma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    return avg(values.slice(-period));
  }

  function emaSeries(values, period) {
    if (!Array.isArray(values) || values.length < period) return [];
    const multiplier = 2 / (period + 1);
    const output = [];
    let previous = avg(values.slice(0, period));
    for (let i = 0; i < period - 1; i++) output.push(null);
    output.push(previous);
    for (let i = period; i < values.length; i++) {
      previous = (values[i] - previous) * multiplier + previous;
      output.push(previous);
    }
    return output;
  }

  function ema(values, period) {
    const series = emaSeries(values, period);
    return series.length ? series.at(-1) : null;
  }

  function trueRanges(candles) {
    return candles.map((candle, index) => {
      if (index === 0) return candle.high - candle.low;
      const previousClose = candles[index - 1].close;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose)
      );
    });
  }

  function atr(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < period + 1) return null;
    return avg(trueRanges(candles).slice(-period));
  }

  function rsi(values, period = 14) {
    if (!Array.isArray(values) || values.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  function stochastic(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < period) return null;
    const window = candles.slice(-period);
    const highest = Math.max(...window.map(c => c.high));
    const lowest = Math.min(...window.map(c => c.low));
    const close = candles.at(-1).close;
    if (highest === lowest) return 50;
    return ((close - lowest) / (highest - lowest)) * 100;
  }

  function nadarayaWatson(values, bandwidth = 8) {
    if (!Array.isArray(values) || values.length < 3) return null;
    const target = values.length - 1;
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      const distance = (target - index) / bandwidth;
      const weight = Math.exp(-0.5 * distance * distance);
      numerator += weight * value;
      denominator += weight;
    });
    return denominator ? numerator / denominator : null;
  }

  function recentSwing(candles, lookback = 20) {
    const window = candles.slice(-lookback);
    if (window.length < 3) return null;
    const low = Math.min(...window.map(c => c.low));
    const high = Math.max(...window.map(c => c.high));
    return { low, high, midpoint: low + (high - low) * 0.5 };
  }

  function detectDoubleTopBottom(candles, tolerancePercent = 1.2) {
    if (!Array.isArray(candles) || candles.length < 12) return { type: "none", score: 0 };
    const points = candles.slice(-30);
    const highs = points.map((c, i) => ({ value: c.high, i }))
      .sort((a, b) => b.value - a.value).slice(0, 4).sort((a, b) => a.i - b.i);
    const lows = points.map((c, i) => ({ value: c.low, i }))
      .sort((a, b) => a.value - b.value).slice(0, 4).sort((a, b) => a.i - b.i);

    const comparable = (a, b) =>
      Math.abs(a.value - b.value) / ((a.value + b.value) / 2) * 100 <= tolerancePercent
      && Math.abs(a.i - b.i) >= 4;

    for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        if (comparable(highs[i], highs[j])) return { type: "double-top", score: -1 };
      }
    }
    for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        if (comparable(lows[i], lows[j])) return { type: "double-bottom", score: 1 };
      }
    }
    return { type: "none", score: 0 };
  }

  function detectHeadAndShoulders(candles, tolerancePercent = 3) {
    if (!Array.isArray(candles) || candles.length < 15) return { type: "none", score: 0 };
    const points = candles.slice(-25);
    const pivots = [];
    for (let i = 2; i < points.length - 2; i++) {
      const current = points[i];
      const isHigh = current.high > points[i-1].high && current.high > points[i-2].high
        && current.high > points[i+1].high && current.high > points[i+2].high;
      const isLow = current.low < points[i-1].low && current.low < points[i-2].low
        && current.low < points[i+1].low && current.low < points[i+2].low;
      if (isHigh) pivots.push({ type: "high", value: current.high, i });
      if (isLow) pivots.push({ type: "low", value: current.low, i });
    }
    const highs = pivots.filter(p => p.type === "high").slice(-3);
    if (highs.length === 3) {
      const [left, head, right] = highs;
      const shouldersClose = Math.abs(left.value - right.value) / ((left.value + right.value) / 2) * 100 <= tolerancePercent;
      if (head.value > left.value && head.value > right.value && shouldersClose) {
        return { type: "head-and-shoulders", score: -1 };
      }
    }
    const lows = pivots.filter(p => p.type === "low").slice(-3);
    if (lows.length === 3) {
      const [left, head, right] = lows;
      const shouldersClose = Math.abs(left.value - right.value) / ((left.value + right.value) / 2) * 100 <= tolerancePercent;
      if (head.value < left.value && head.value < right.value && shouldersClose) {
        return { type: "inverse-head-and-shoulders", score: 1 };
      }
    }
    return { type: "none", score: 0 };
  }

  function trendScore(candles) {
    const closes = candles.map(c => c.close);
    const current = closes.at(-1);
    const ma5 = ema(closes, 5);
    const ma10 = ema(closes, 10);
    const ma50 = ema(closes, 50);
    const ma60 = ema(closes, 60);
    const ma200 = ema(closes, 200);

    const available = [ma5, ma10, ma50, ma60, ma200].filter(v => v !== null);
    if (!available.length) return { score: 0, averages: { ma5, ma10, ma50, ma60, ma200 } };

    let score = 0;
    if (ma5 !== null) score += current > ma5 ? 1 : -1;
    if (ma10 !== null) score += current > ma10 ? 1 : -1;
    if (ma50 !== null) score += current > ma50 ? 1 : -1;
    if (ma60 !== null) score += current > ma60 ? 1 : -1;
    if (ma200 !== null) score += current > ma200 ? 2 : -2;
    if (ma5 !== null && ma10 !== null) score += ma5 > ma10 ? 1 : -1;
    if (ma50 !== null && ma200 !== null) score += ma50 > ma200 ? 2 : -2;

    const max = 10;
    return {
      score: Math.max(-1, Math.min(1, score / max)),
      averages: { ma5, ma10, ma50, ma60, ma200 }
    };
  }

  function analyzeTimeframe(candles, config) {
    if (!Array.isArray(candles) || candles.length < 20) {
      return { valid: false, score: 0, reasons: ["Dati insufficienti"] };
    }

    const closes = candles.map(c => c.close);
    const current = closes.at(-1);
    const trend = trendScore(candles);
    const currentAtr = atr(candles, config.indicators.atrPeriod);
    const currentRsi = rsi(closes, config.indicators.rsiPeriod);
    const currentStoch = stochastic(candles, config.indicators.stochasticPeriod);
    const nw = nadarayaWatson(closes, config.indicators.nadarayaBandwidth);
    const swing = recentSwing(candles);
    const doublePattern = detectDoubleTopBottom(candles);
    const hsPattern = detectHeadAndShoulders(candles);

    let momentum = 0;
    if (currentRsi !== null) {
      if (currentRsi >= 55 && currentRsi <= 72) momentum += 0.6;
      else if (currentRsi <= 45 && currentRsi >= 28) momentum -= 0.6;
      else if (currentRsi > 78) momentum -= 0.25;
      else if (currentRsi < 22) momentum += 0.25;
    }
    if (currentStoch !== null) {
      if (currentStoch > 55 && currentStoch < 85) momentum += 0.4;
      else if (currentStoch < 45 && currentStoch > 15) momentum -= 0.4;
    }
    momentum = Math.max(-1, Math.min(1, momentum));

    const nadarayaScore = nw === null ? 0 : current > nw ? 1 : -1;
    const patternScore = Math.max(-1, Math.min(1, doublePattern.score + hsPattern.score));

    let retracementScore = 0;
    let retracementDistance = null;
    if (swing && currentAtr) {
      retracementDistance = Math.abs(current - swing.midpoint);
      const tolerance = currentAtr * config.entry.toleranceAtr;
      if (retracementDistance <= tolerance) {
        retracementScore = trend.score >= 0 ? 1 : -1;
      }
    }

    const raw = (
      trend.score * 0.35 +
      momentum * 0.20 +
      nadarayaScore * 0.15 +
      patternScore * 0.10 +
      retracementScore * 0.20
    );

    const reasons = [];
    reasons.push(trend.score > 0.25 ? "Trend rialzista" : trend.score < -0.25 ? "Trend ribassista" : "Trend neutrale");
    if (nw !== null) reasons.push(current > nw ? "Prezzo sopra Nadaraya" : "Prezzo sotto Nadaraya");
    if (retracementScore !== 0) reasons.push("Prezzo vicino al ritracciamento del 50%");
    if (doublePattern.type !== "none") reasons.push(doublePattern.type);
    if (hsPattern.type !== "none") reasons.push(hsPattern.type);

    return {
      valid: true,
      score: Math.round(raw * 100),
      current,
      atr: currentAtr,
      rsi: currentRsi,
      stochastic: currentStoch,
      nadaraya: nw,
      swing,
      retracementDistance,
      movingAverages: trend.averages,
      patterns: [doublePattern.type, hsPattern.type].filter(x => x !== "none"),
      reasons
    };
  }

  function analyzeMarket(timeframeCandles, customConfig = {}) {
    const config = {
      ...window.TRADING_CONFIG,
      ...customConfig,
      indicators: { ...window.TRADING_CONFIG.indicators, ...(customConfig.indicators || {}) },
      entry: { ...window.TRADING_CONFIG.entry, ...(customConfig.entry || {}) }
    };

    const details = {};
    let weightedScore = 0;
    let totalWeight = 0;

    for (const timeframe of config.timeframes) {
      const result = analyzeTimeframe(timeframeCandles[timeframe], config);
      details[timeframe] = result;
      if (result.valid) {
        const weight = config.weights.timeframeTrend[timeframe] || 0;
        weightedScore += result.score * weight;
        totalWeight += weight;
      }
    }

    const score = totalWeight ? Math.round(weightedScore / totalWeight) : 0;

    const timeframeDirections = config.timeframes.map(timeframe => {
      const timeframeScore = details[timeframe]?.score ?? 0;
      if (timeframeScore >= 25) return "LONG";
      if (timeframeScore <= -25) return "SHORT";
      return "WAIT";
    });

    const longCount = timeframeDirections.filter(value => value === "LONG").length;
    const shortCount = timeframeDirections.filter(value => value === "SHORT").length;
    const waitCount = timeframeDirections.filter(value => value === "WAIT").length;

    let direction = "WAIT";
    if (
      score >= config.thresholds.long ||
      (score >= 20 && longCount >= 3 && longCount > shortCount)
    ) {
      direction = "LONG";
    } else if (
      score <= config.thresholds.short ||
      (score <= -20 && shortCount >= 3 && shortCount > longCount)
    ) {
      direction = "SHORT";
    }

    const alignment = Math.round(
      (Math.max(longCount, shortCount, waitCount) / config.timeframes.length) * 100
    );
    const strength = Math.min(
      100,
      Math.round(Math.abs(score) * 0.72 + alignment * 0.28)
    );

    return {
      direction,
      score,
      confidence: strength,
      alignment,
      consensus: { long: longCount, short: shortCount, wait: waitCount },
      details,
      rules: {
        entryRetracement: "50%",
        timeframes: config.timeframes,
        movingAverages: config.movingAverages
      }
    };
  }

  window.TradingEngine = {
    analyzeMarket,
    analyzeTimeframe,
    indicators: { sma, ema, atr, rsi, stochastic, nadarayaWatson },
    patterns: { detectDoubleTopBottom, detectHeadAndShoulders }
  };
})();
