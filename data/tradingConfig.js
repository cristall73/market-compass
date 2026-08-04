window.TRADING_CONFIG = {
  timeframes: ["1M", "1W", "1D", "4H", "1H"],
  movingAverages: [200, 60, 50, 10, 5],
  indicators: {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    stochasticSmoothK: 3,
    stochasticSmoothD: 3,
    atrPeriod: 14,
    nadarayaBandwidth: 8
  },
  entry: {
    retracementPercent: 50,
    toleranceAtr: 0.35
  },
  weights: {
    timeframeTrend: {
      "1M": 18,
      "1W": 22,
      "1D": 25,
      "4H": 20,
      "1H": 15
    },
    movingAverages: 25,
    supportResistance: 15,
    classicalPatterns: 15,
    momentum: 15,
    nadaraya: 10,
    retracementEntry: 20
  },
  thresholds: {
    long: 68,
    short: -68,
    waitBand: 35
  }
};
